import dns from 'node:dns/promises';
import net from 'node:net';
import he from 'he';
import {
  normalizeStoryFingerprint,
  STORY_CONCEPT_TYPES,
} from '../src/js/monitoring-concepts.js';

const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_ARTICLE_TEXT_LENGTH = 12_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;

const WATCH_SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    watchTitle: { type: 'string', minLength: 1, maxLength: 100 },
    watchingFor: { type: 'string', minLength: 1, maxLength: 300 },
    storyFingerprint: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 40 },
          type: { type: 'string', enum: STORY_CONCEPT_TYPES },
        },
        required: ['label', 'type'],
      },
    },
    description: { type: 'string', minLength: 1, maxLength: 300 },
  },
  required: ['watchTitle', 'watchingFor', 'storyFingerprint', 'description'],
};

const cleanTitle = (value) => he
  .decode(String(value || '').replace(/<[^>]*>/g, ''))
  .replace(/\s+/g, ' ')
  .trim();

const cleanPageText = (value) => he
  .decode(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
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

const findJsonLdArticle = (value) => {
  if (Array.isArray(value)) {
    return value.map(findJsonLdArticle).find(Boolean) || null;
  }
  if (!value || typeof value !== 'object') return null;
  if (typeof value.articleBody === 'string') return value;
  return Object.values(value).map(findJsonLdArticle).find(Boolean) || null;
};

export const extractPageMetadata = (html, sourceUrl = '') => {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = html.slice(0, headEnd >= 0 ? headEnd : MAX_PAGE_BYTES);
  const metaTags = head.match(/<meta\b[^>]*>/gi) || [];
  const metadata = metaTags.map(getTagAttributes);
  const findMetaContent = (names) => metadata.find((attributes) => (
    names.includes((attributes.property || attributes.name || '').toLowerCase())
    && attributes.content
  ))?.content;
  const openGraphTitle = findMetaContent(['og:title', 'twitter:title']);
  const description = cleanPageText(findMetaContent([
    'og:description',
    'description',
    'twitter:description',
  ]));
  const metadataAuthor = cleanPageText(findMetaContent(['author', 'article:author']));
  const htmlTitle = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const jsonLdArticle = (html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi) || [])
    .map((script) => script.replace(/^.*?>|<\/script\s*>$/gis, ''))
    .map((json) => {
      try {
        return findJsonLdArticle(JSON.parse(json));
      } catch {
        return null;
      }
    })
    .find(Boolean);
  const articleHtml = html.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i)?.[1] || '';
  const articleText = cleanPageText(jsonLdArticle?.articleBody || articleHtml)
    .slice(0, MAX_ARTICLE_TEXT_LENGTH);
  const title = cleanTitle(openGraphTitle || htmlTitle || jsonLdArticle?.headline);
  const structuredAuthor = cleanPageText(jsonLdArticle?.author?.name);
  const author = [metadataAuthor, structuredAuthor]
    .find((value) => value && !/^https?:\/\//i.test(value)) || '';

  return {
    title,
    description: description || cleanPageText(jsonLdArticle?.description),
    articleText,
    author,
    sourceUrl,
  };
};

export const extractPageTitle = (html) => extractPageMetadata(html).title;

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

const readPageHtml = async (response) => {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let html = '';
  let byteCount = 0;
  while (byteCount < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    byteCount += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  await reader.cancel();
  return html;
};

export const fetchPageMetadata = async (input, fetchImpl = fetch) => {
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

    const metadata = extractPageMetadata(await readPageHtml(response), url.href);
    if (!metadata.title) throw new Error('No page title was found.');
    return metadata;
  }

  throw new Error('The page title could not be fetched.');
};

export const fetchPageTitle = async (input, fetchImpl = fetch) => (
  (await fetchPageMetadata(input, fetchImpl)).title
);

const extractResponseText = (response) => response.output
  ?.flatMap((item) => item.content || [])
  .find((content) => content.type === 'output_text')?.text;

const validateSuggestion = (suggestion) => {
  const storyFingerprint = normalizeStoryFingerprint(
    suggestion?.storyFingerprint
      || suggestion?.keywords?.map((label) => ({ label, type: 'supporting' })),
    8,
  );
  const keywords = storyFingerprint.map(({ label }) => label);
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
    || keywords.length < 1
    || keywords.length > 8
    || !watchingFor
    || !description
    || sentenceCount > 2
  ) {
    throw new Error('The AI returned an invalid Watch suggestion.');
  }
  return {
    watchTitle: suggestion.watchTitle.trim(),
    watchingFor,
    storyFingerprint,
    keywords,
    description,
  };
};

export const generateWatchSuggestion = async ({
  title,
  description = '',
  articleText = '',
  author = '',
  slug = '',
  apiKey,
  model,
  fetchImpl = fetch,
}) => {
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const source = {
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    articleText: String(articleText || '').trim(),
    author: String(author || '').trim(),
    slug: String(slug || '').trim(),
  };
  const sourceFields = Object.entries(source)
    .filter(([, value]) => value)
    .map(([field]) => field);
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[Story Fingerprint] AI source fields: ${sourceFields.join(', ') || 'none'}`);
    if (!source.description && !source.articleText) {
      console.info('[Story Fingerprint] Limited source: using title/slug only.');
    }
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
      instructions: `Build a Story Fingerprint from the supplied page title, alongside a concise Watch title, a natural one-sentence monitoring instruction named watchingFor, and a short explanation of no more than two sentences.

Return normally 3 to 8 typed Story Fingerprint concepts in this exact priority: people, organizations, precise locations, the main event, then genuinely identifying supporting concepts. A named person central to the story should almost always be included and their complete name must remain one concept. Do not treat byline authors, photographers, or publishers as story concepts unless they are themselves central to the event. Preserve complete organization and location names. Express events as semantic noun phrases that can match later reporting even when wording changes, for example "Search operation", "Court ruling", or "Product launch", but only when the supplied title supports that meaning.

Use source fields in this order: title, description, articleText, then slug only as a fallback. The author field is extracted page metadata and may support a person concept. Do not merely select frequent or long words. Exclude articles, conjunctions, prepositions, pronouns, filler, generic geography, and generic news terms. Never return isolated fragments when a stronger phrase exists. Deduplicate concepts and omit weaker concepts contained in stronger ones. Return fewer concepts rather than weak ones when fewer than 3 are reliable. Base every field only on the supplied source content, preserve its intent, and never invent a person, organization, location, event, or detail absent from or unsupported by it.`,
      input: JSON.stringify(source),
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
        const metadata = await fetchPageMetadata(url.href);
        const sourceFields = ['title', 'description', 'articleText', 'author']
          .filter((field) => metadata[field]);
        if (process.env.NODE_ENV !== 'production') {
          console.info(`[Story Fingerprint] Retrieved source fields: ${sourceFields.join(', ')}`);
        }
        sendJson(response, 200, { ...metadata, conceptSourceFields: sourceFields });
        return;
      }

      const title = String(body.title || '').trim();
      if (!title) throw new Error('A page title is required.');
      const suggestion = await generateWatchSuggestion({
        title,
        description: body.description,
        articleText: body.articleText,
        author: body.author,
        slug: body.slug,
        apiKey,
        model,
      });
      sendJson(response, 200, suggestion);
    } catch (error) {
      console.error('URL Watch prototype request failed:', error);
      sendJson(response, error.statusCode || 502, { error: error.message || 'The request failed.' });
    }
  }
);
