import he from 'he';
import { randomUUID } from 'node:crypto';
import { PublicUrlError, validatePublicUrl } from './public-url-security.js';
import {
  normalizeStoryFingerprint,
  STORY_CONCEPT_TYPES,
} from '../src/js/monitoring-concepts.js';
import { cleanArticleContentForAnalysis } from '../src/js/article-content.js';

const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;
export const MAX_ARTICLE_TEXT_LENGTH = 12_000;
const MIN_MULTI_ENTRY_TEXT_LENGTH = 240;
const ARTICLE_BODY_SEPARATOR = '\n\n';
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;

export class ArticleAnalysisError extends Error {
  constructor(code, statusCode = 502) {
    super('AI article analysis was unavailable.');
    this.name = 'ArticleAnalysisError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const isTimeoutError = (error) => ['AbortError', 'TimeoutError'].includes(error?.name);

const validatePageUrl = async (value) => {
  try {
    return await validatePublicUrl(value);
  } catch (error) {
    if (!(error instanceof PublicUrlError)) throw error;
    if (error.code === 'INVALID_URL' && error.cause) throw error.cause;
    if (error.code === 'INVALID_PROTOCOL') {
      throw new Error('Only HTTP and HTTPS URLs are supported.');
    }
    if (error.code === 'DNS_FAILURE' && error.cause) throw error.cause;
    throw new Error('This URL cannot be fetched.');
  }
};

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
    storyProfile: {
      type: 'object',
      additionalProperties: false,
      properties: {
        primaryPeople: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 80 } },
        otherPeople: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 80 } },
        peopleRoles: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 80 },
              role: { type: 'string', minLength: 1, maxLength: 100 },
            },
            required: ['name', 'role'],
          },
        },
        locations: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 100 } },
        organizations: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 100 } },
        eventTypes: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 100 } },
        distinctiveFacts: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 180 } },
        aliases: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 100 } },
        uncertaintyPhrases: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 240 } },
        storySummary: { type: 'string', minLength: 20, maxLength: 360 },
      },
      required: [
        'primaryPeople', 'otherPeople', 'peopleRoles', 'locations', 'organizations', 'eventTypes',
        'distinctiveFacts', 'aliases', 'uncertaintyPhrases', 'storySummary',
      ],
    },
    description: { type: 'string', minLength: 1, maxLength: 300 },
  },
  required: ['watchTitle', 'watchingFor', 'storyFingerprint', 'storyProfile', 'description'],
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

const FEED_MIME_PRIORITY = new Map([
  ['application/rss+xml', 0],
  ['application/atom+xml', 1],
]);

export const extractFeedCandidates = (html, sourceUrl) => {
  let baseUrl;
  try {
    baseUrl = new URL(sourceUrl);
  } catch {
    return [];
  }
  return (String(html).match(/<link\b[^>]*>/gi) || [])
    .map((tag, index) => ({ attributes: getTagAttributes(tag), index }))
    .filter(({ attributes }) => (
      (attributes.rel || '').toLowerCase().split(/\s+/).includes('alternate')
      && FEED_MIME_PRIORITY.has((attributes.type || '').toLowerCase().split(';')[0].trim())
      && attributes.href
    ))
    .map(({ attributes, index }) => {
      try {
        const type = attributes.type.toLowerCase().split(';')[0].trim();
        return {
          url: new URL(attributes.href, baseUrl).href,
          type,
          title: cleanPageText(attributes.title),
          index,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((first, second) => (
      FEED_MIME_PRIORITY.get(first.type) - FEED_MIME_PRIORITY.get(second.type)
      || first.index - second.index
    ))
    .slice(0, 10);
};

export const discoverMonitoringSource = async (
  html,
  sourceUrl,
  { validateUrl = validatePublicUrl } = {},
) => {
  const candidates = extractFeedCandidates(html, sourceUrl);
  for (const candidate of candidates) {
    try {
      const validated = await validateUrl(candidate.url);
      return {
        url: validated.href,
        type: candidate.type === 'application/atom+xml' ? 'atom' : 'rss',
        title: candidate.title || null,
        discovery: 'html-alternate',
      };
    } catch {
      // A forbidden candidate is ignored; the next deterministic candidate may still be usable.
    }
  }
  return null;
};

const isArticleLikeEntity = (value) => {
  const types = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']];
  const declaredTypes = types.filter((type) => typeof type === 'string' && type.trim());
  return declaredTypes.length === 0
    || declaredTypes.some((type) => /(?:Article|Posting)$/i.test(type.trim()));
};

const collectJsonLdArticles = (value, articles = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdArticles(item, articles));
    return articles;
  }
  if (!value || typeof value !== 'object') return articles;
  if (typeof value.articleBody === 'string' && isArticleLikeEntity(value)) {
    articles.push(value);
  }
  Object.values(value).forEach((item) => collectJsonLdArticles(item, articles));
  return articles;
};

const getJsonLdArticles = (html) => (
  [...String(html).matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )]
    .flatMap((match) => {
      try {
        return collectJsonLdArticles(JSON.parse(match[1]));
      } catch {
        return [];
      }
    })
);

const normalizedBodyKey = (value) => value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const getDistinctArticleBodies = (articles) => {
  const seen = new Set();
  return articles
    .map((article) => cleanPageText(article?.articleBody))
    .filter((body) => {
      const key = normalizedBodyKey(body);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getHtmlArticleBodies = (html) => getDistinctArticleBodies(
  [...String(html).matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)]
    .map((match) => ({ articleBody: match[1] })),
);

const selectEvenlySpacedBodies = (bodies, limit) => {
  if (bodies.length <= limit) return bodies;
  if (limit <= 1) return bodies.slice(0, 1);
  const selectedIndexes = new Set(Array.from(
    { length: limit },
    (_, index) => Math.round((index * (bodies.length - 1)) / (limit - 1)),
  ));
  return bodies.filter((_, index) => selectedIndexes.has(index));
};

const truncateAtWordBoundary = (value, limit) => {
  if (value.length <= limit) return value;
  if (limit < 2) return value.slice(0, limit);
  const candidate = value.slice(0, limit - 1).trimEnd();
  const boundary = candidate.lastIndexOf(' ');
  const truncated = boundary > 0 ? candidate.slice(0, boundary) : candidate;
  return `${truncated}…`;
};

const createBoundedArticleText = (bodies) => {
  if (!bodies.length) return { articleText: '', includedArticleBodyCount: 0 };
  const maximumBodies = Math.max(1, Math.floor(
    (MAX_ARTICLE_TEXT_LENGTH + ARTICLE_BODY_SEPARATOR.length)
      / (MIN_MULTI_ENTRY_TEXT_LENGTH + ARTICLE_BODY_SEPARATOR.length),
  ));
  const selectedBodies = selectEvenlySpacedBodies(bodies, maximumBodies);
  const separatorLength = ARTICLE_BODY_SEPARATOR.length * (selectedBodies.length - 1);
  let remainingCharacters = MAX_ARTICLE_TEXT_LENGTH - separatorLength;
  let pendingIndexes = selectedBodies.map((_, index) => index);
  const allocations = Array(selectedBodies.length).fill(0);

  while (pendingIndexes.length) {
    const fairShare = Math.floor(remainingCharacters / pendingIndexes.length);
    const completeIndexes = pendingIndexes.filter((index) => (
      selectedBodies[index].length <= fairShare
    ));
    if (!completeIndexes.length) {
      pendingIndexes.forEach((index, position) => {
        allocations[index] = fairShare + (position < remainingCharacters % pendingIndexes.length ? 1 : 0);
      });
      break;
    }
    completeIndexes.forEach((index) => {
      allocations[index] = selectedBodies[index].length;
      remainingCharacters -= allocations[index];
    });
    const completed = new Set(completeIndexes);
    pendingIndexes = pendingIndexes.filter((index) => !completed.has(index));
  }

  const includedBodies = selectedBodies
    .map((body, index) => truncateAtWordBoundary(body, allocations[index]))
    .filter(Boolean);
  return {
    articleText: includedBodies.join(ARTICLE_BODY_SEPARATOR),
    includedArticleBodyCount: includedBodies.length,
  };
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
  const siteName = cleanPageText(findMetaContent(['og:site_name', 'application-name']));
  const publishedAt = cleanPageText(findMetaContent([
    'article:published_time',
    'datepublished',
    'date',
  ]));
  const htmlTitle = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const jsonLdArticles = getJsonLdArticles(html);
  const jsonLdBodies = getDistinctArticleBodies(jsonLdArticles);
  const articleBodies = jsonLdBodies.length ? jsonLdBodies : getHtmlArticleBodies(html);
  const { articleText, includedArticleBodyCount } = createBoundedArticleText(articleBodies);
  const jsonLdArticle = jsonLdArticles[0] || null;
  const title = cleanTitle(openGraphTitle || htmlTitle || jsonLdArticle?.headline);
  const structuredAuthor = cleanPageText(jsonLdArticle?.author?.name);
  const author = [metadataAuthor, structuredAuthor]
    .find((value) => value && !/^https?:\/\//i.test(value)) || '';

  return {
    title,
    description: description || cleanPageText(jsonLdArticle?.description),
    articleText,
    articleBodyCount: articleBodies.length,
    includedArticleBodyCount,
    author,
    siteName: siteName || cleanPageText(jsonLdArticle?.publisher?.name),
    publishedAt: publishedAt || cleanPageText(jsonLdArticle?.datePublished),
    sourceUrl,
  };
};

export const extractPageTitle = (html) => extractPageMetadata(html).title;

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
  let url = await validatePageUrl(input);

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
      url = await validatePageUrl(new URL(location, url).href);
      continue;
    }

    if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error('The URL did not return an HTML page.');
    }

    const html = await readPageHtml(response);
    const metadata = extractPageMetadata(html, url.href);
    if (!metadata.title) throw new Error('No page title was found.');
    return {
      ...metadata,
      monitoringSource: await discoverMonitoringSource(html, url.href),
    };
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
  if (!suggestion || typeof suggestion !== 'object' || Array.isArray(suggestion)) {
    throw new ArticleAnalysisError('schema_validation_failed');
  }
  const suppliedFingerprint = suggestion.storyFingerprint
    || suggestion.keywords?.map((label) => ({ label, type: 'supporting' }));
  const storyFingerprint = normalizeStoryFingerprint(
    suppliedFingerprint,
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
  const storySummary = typeof suggestion?.storyProfile?.storySummary === 'string'
    ? suggestion.storyProfile.storySummary.replace(/\s+/g, ' ').trim()
    : '';
  if (
    typeof suggestion?.watchTitle !== 'string'
    || !suggestion.watchTitle.trim()
    || keywords.length < 1
    || keywords.length > 8
    || !watchingFor
    || storySummary.length < 20
    || !description
    || sentenceCount > 2
  ) {
    const hadSuppliedConcepts = Array.isArray(suppliedFingerprint) && suppliedFingerprint.length > 0;
    throw new ArticleAnalysisError(
      hadSuppliedConcepts && storyFingerprint.length === 0
        ? 'normalization_rejected'
        : 'schema_validation_failed',
    );
  }
  return {
    watchTitle: suggestion.watchTitle.trim(),
    watchingFor,
    storyFingerprint,
    keywords,
    storyProfile: { ...suggestion.storyProfile, storySummary },
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
  diagnosticId = randomUUID(),
}) => {
  if (!apiKey) {
    throw new ArticleAnalysisError('missing_api_key', 503);
  }

  const source = {
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    articleText: cleanArticleContentForAnalysis(articleText),
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

  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
      model,
      store: false,
      instructions: `Build a Story Fingerprint and structured story profile from the complete supplied article content, alongside a concise Watch title, a natural one-sentence monitoring instruction named watchingFor, and a short explanation of no more than two sentences.

Return normally 3 to 8 typed Story Fingerprint concepts in this exact priority: people, organizations, precise locations, the main event, then genuinely identifying supporting concepts. Include a named person only when the article is substantially about that individual; primaryPeople must be empty when no person is central. Do not treat byline authors, photographers, image or agency credits, publishers, quoted experts, captions, interface text, or related-content modules as primary people or story concepts unless the article is genuinely about them. Preserve complete organization and location names. Express events and topics as semantic multi-word noun phrases that can match later reporting, for example "Search operation", "Open water swimming", "Court ruling", or "Product launch", but only when the supplied content supports that meaning.

Populate storyProfile from the article body: distinguish central people from other people; put concise evidence-supported roles for retained people in peopleRoles; retain precise locations and organizations; describe event types as complete identifying noun phrases; retain only distinctive facts useful for matching later coverage; and add genuine alternative names in aliases. Do not join a city and country merely because both occur in the article: use "City, Country" only when that relationship is explicit in the supplied text. storySummary must be one concise, natural explanation of the article rather than a copied or trivially reworded headline. It should explain the central person or topic, what the article reports, the most distinctive supported facts, and any important uncertainty or attribution. Preserve qualifiers such as alleged, suspected, reported, accused, possible, or wanted in storySummary, distinctiveFacts and uncertaintyPhrases. A publisher or media provider is not an organization in the story. Reject generic descriptors such as "German citizen", broad or isolated words such as "Health", detached adjectives, attribution fragments such as "Official says", clipped phrases ending in modifiers such as "likely", and detached descriptions such as "terror attack carried out". Prefer contextual concepts such as "Sewage contamination" to an isolated material name. Never convert an allegation, official assessment, suspected motive, or reported link into a confirmed fact.

Use source fields in this order: title, description, articleText, then slug only as a fallback. The author field is source attribution, not evidence that the author is a story subject. Do not merely select frequent or long words. Exclude articles, conjunctions, prepositions, pronouns, filler, generic geography, generic news terms, isolated adjectives, and broad contextless categories. Never return isolated fragments when a stronger phrase exists. Deduplicate concepts and omit weaker concepts contained in stronger ones. Return fewer concepts rather than weak ones when fewer than 3 are reliable. Base every field only on the supplied source content, preserve its intent, and never invent a person, organization, location, event, geographic relationship, or detail absent from or unsupported by it.`,
      input: JSON.stringify(source),
      reasoning: { effort: 'low' },
      max_output_tokens: 600,
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
  } catch (error) {
    throw new ArticleAnalysisError(isTimeoutError(error) ? 'openai_timeout' : 'openai_request_failed');
  }
  if (!response.ok) {
    throw new ArticleAnalysisError('openai_http_error');
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ArticleAnalysisError('invalid_structured_response');
  }
  const outputText = extractResponseText(result);
  if (!outputText) throw new ArticleAnalysisError('invalid_structured_response');
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new ArticleAnalysisError('invalid_structured_response');
  }
  return {
    ...validateSuggestion(parsed),
    analysisProvider: 'openai',
    analysisStatus: 'success',
    analysisModel: model,
    fallbackReasonCode: null,
    analyzedAt: new Date().toISOString(),
    analysisDiagnosticId: diagnosticId,
  };
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

export const createUrlWatchMiddleware = ({
  apiKey,
  model = 'gpt-5.6-luna',
  fetchImpl = fetch,
} = {}) => (
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

    let suggestionDiagnosticId = null;
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
      const diagnosticId = randomUUID();
      suggestionDiagnosticId = diagnosticId;
      const suggestion = await generateWatchSuggestion({
        title,
        description: body.description,
        articleText: body.articleText,
        author: body.author,
        slug: body.slug,
        apiKey,
        model,
        fetchImpl,
        diagnosticId,
      });
      console.info(JSON.stringify({
        event: 'article_analysis',
        analysisProvider: suggestion.analysisProvider,
        analysisStatus: suggestion.analysisStatus,
        analysisModel: suggestion.analysisModel,
        diagnosticId,
      }));
      sendJson(response, 200, suggestion);
    } catch (error) {
      if (isSuggestionRequest) {
        const fallbackReasonCode = error.code || 'openai_request_failed';
        const diagnosticId = suggestionDiagnosticId || randomUUID();
        console.warn(JSON.stringify({
          event: 'article_analysis',
          analysisProvider: 'openai',
          analysisStatus: 'failed',
          fallbackReasonCode,
          diagnosticId,
          httpStatus: error.statusCode || 502,
        }));
        sendJson(response, error.statusCode || 502, {
          error: 'AI article analysis was unavailable.',
          analysisProvider: 'openai',
          analysisStatus: 'failed',
          analysisModel: null,
          fallbackReasonCode,
          analysisDiagnosticId: diagnosticId,
        });
        return;
      }
      console.warn(JSON.stringify({
        event: 'article_retrieval',
        status: 'failed',
        reasonCode: 'article_extraction_failed',
        httpStatus: error.statusCode || 502,
      }));
      sendJson(response, error.statusCode || 502, { error: error.message || 'The request failed.' });
    }
  }
);
