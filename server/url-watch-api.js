import dns from 'node:dns/promises';
import net from 'node:net';
import he from 'he';

const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_HEAD_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;

const WATCH_SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    watchTitle: { type: 'string', minLength: 1, maxLength: 100 },
    watchingFor: { type: 'string', minLength: 1, maxLength: 300 },
    keywords: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 40 },
    },
    description: { type: 'string', minLength: 1, maxLength: 300 },
  },
  required: ['watchTitle', 'watchingFor', 'keywords', 'description'],
};

const cleanTitle = (value) => he
  .decode(String(value || '').replace(/<[^>]*>/g, ''))
  .replace(/\s+/g, ' ')
  .trim();

const getTagAttributes = (tag) => {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match = pattern.exec(tag);
  while (match) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    match = pattern.exec(tag);
  }
  return attributes;
};

export const extractPageTitle = (html) => {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = html.slice(0, headEnd >= 0 ? headEnd : MAX_HEAD_BYTES);
  const metaTags = head.match(/<meta\b[^>]*>/gi) || [];
  const openGraphTitle = metaTags
    .map(getTagAttributes)
    .find((attributes) => (
      (attributes.property || attributes.name || '').toLowerCase() === 'og:title'
      && attributes.content
    ))?.content;
  const htmlTitle = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  return cleanTitle(openGraphTitle || htmlTitle);
};

const isPublicIpAddress = (address) => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      return isPublicIpAddress(normalized.slice(7));
    }
    return !(
      normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized)
    );
  }

  return false;
};

const validatePublicUrl = async (value) => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }
  if (url.username || url.password || url.hostname.toLowerCase() === 'localhost') {
    throw new Error('This URL cannot be fetched.');
  }

  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('This URL cannot be fetched.');
  }
  return url;
};

const readHeadHtml = async (response) => {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let html = '';
  let byteCount = 0;
  while (byteCount < MAX_HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    byteCount += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (/<\/head\s*>/i.test(html)) break;
  }
  await reader.cancel();
  return html;
};

export const fetchPageTitle = async (input, fetchImpl = fetch) => {
  let url = await validatePublicUrl(input);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'WatchAssistantPrototype/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error('The page redirected too many times.');
      }
      await response.body?.cancel();
      url = await validatePublicUrl(new URL(location, url).href);
      continue;
    }

    if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error('The URL did not return an HTML page.');
    }

    const title = extractPageTitle(await readHeadHtml(response));
    if (!title) throw new Error('No page title was found.');
    return title;
  }

  throw new Error('The page title could not be fetched.');
};

const extractResponseText = (response) => response.output
  ?.flatMap((item) => item.content || [])
  .find((content) => content.type === 'output_text')?.text;

const validateSuggestion = (suggestion) => {
  const keywords = Array.isArray(suggestion?.keywords)
    ? [...new Set(suggestion.keywords.map((keyword) => String(keyword).trim()).filter(Boolean))]
    : [];
  const description = typeof suggestion?.description === 'string'
    ? suggestion.description.trim()
    : '';
  const sentenceCount = description.match(/[.!?](?:\s|$)/g)?.length || (description ? 1 : 0);
  const watchingFor = typeof suggestion?.watchingFor === 'string'
    ? suggestion.watchingFor.trim()
    : '';
  if (
    typeof suggestion?.watchTitle !== 'string'
    || !suggestion.watchTitle.trim()
    || keywords.length < 4
    || keywords.length > 6
    || !watchingFor
    || !description
    || sentenceCount > 2
  ) {
    throw new Error('The AI returned an invalid Watch suggestion.');
  }
  return {
    watchTitle: suggestion.watchTitle.trim(),
    watchingFor,
    keywords,
    description,
  };
};

export const generateWatchSuggestion = async ({ title, apiKey, model, fetchImpl = fetch }) => {
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: 'From the supplied page title, generate a concise Watch title, a natural one-sentence monitoring instruction named watchingFor, 4 to 6 monitoring keywords, and a short explanation of no more than two sentences. Base every field only on the supplied page title. Do not infer or mention article-body details.',
      input: title,
      reasoning: { effort: 'low' },
      max_output_tokens: 300,
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'watch_suggestion',
          strict: true,
          schema: WATCH_SUGGESTION_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || 'The AI request failed.');
  }
  const outputText = extractResponseText(result);
  if (!outputText) throw new Error('The AI response did not contain a suggestion.');
  return validateSuggestion(JSON.parse(outputText));
};

const readJsonBody = (request) => new Promise((resolve, reject) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      reject(new Error('Request body is too large.'));
      request.destroy();
    }
  });
  request.on('end', () => {
    try {
      resolve(JSON.parse(body || '{}'));
    } catch {
      reject(new Error('Request body must be valid JSON.'));
    }
  });
  request.on('error', reject);
});

const sendJson = (response, status, value) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
};

export const createUrlWatchMiddleware = ({ apiKey, model = 'gpt-5.6-luna' } = {}) => (
  async (request, response, next) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const isTitleRequest = pathname === '/api/page-title';
    const isSuggestionRequest = pathname === '/api/watch-suggestion';
    if (!isTitleRequest && !isSuggestionRequest) {
      next();
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      if (isTitleRequest) {
        const input = String(body.url || '').trim();
        const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
        const title = await fetchPageTitle(url.href);
        sendJson(response, 200, { title, sourceUrl: url.href });
        return;
      }

      const title = String(body.title || '').trim();
      if (!title) throw new Error('A page title is required.');
      const suggestion = await generateWatchSuggestion({ title, apiKey, model });
      sendJson(response, 200, suggestion);
    } catch (error) {
      console.error('URL Watch prototype request failed:', error);
      sendJson(response, error.statusCode || 502, { error: error.message || 'The request failed.' });
    }
  }
);
