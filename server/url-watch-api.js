import he from 'he';
import { randomUUID } from 'node:crypto';
import { PublicUrlError, validatePublicUrl } from './public-url-security.js';
import {
  AUTOMATIC_STORY_CONCEPT_TYPES,
  normalizeAutomaticStoryFingerprint,
} from '../src/js/monitoring-concepts.js';
import {
  cleanArticleContentForAnalysis,
  sanitizeMalformedCurrencyText,
} from '../src/js/article-content.js';

const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;
export const MAX_ARTICLE_TEXT_LENGTH = 12_000;
const MIN_MULTI_ENTRY_TEXT_LENGTH = 240;
const ARTICLE_BODY_SEPARATOR = '\n\n';
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;
export const PROVIDER_TIMEOUT_MS = 20_000;
export const PROVIDER_MAX_ATTEMPTS = 2;
const PROVIDER_RETRY_DELAY_MS = 250;
const PROVIDER_RETRY_JITTER_MS = 100;

export class ArticleAnalysisError extends Error {
  constructor(code, statusCode = 502, {
    retryable = false,
    aborted = false,
    validation = null,
  } = {}) {
    super('AI article analysis was unavailable.');
    this.name = 'ArticleAnalysisError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.aborted = aborted;
    this.validation = validation;
  }
}

const isTimeoutError = (error) => error?.name === 'TimeoutError';

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
      minItems: 0,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 100 },
          type: { type: 'string', enum: AUTOMATIC_STORY_CONCEPT_TYPES },
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
        works: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 100 } },
        productsServices: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 100 } },
        events: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 100 } },
        relationships: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 140 } },
        phenomena: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 100 } },
        conditions: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 100 } },
        symptoms: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 100 } },
        storySummary: { type: 'string', minLength: 20, maxLength: 360 },
      },
      required: [
        'primaryPeople', 'otherPeople', 'peopleRoles', 'locations', 'organizations', 'eventTypes',
        'distinctiveFacts', 'aliases', 'uncertaintyPhrases', 'works', 'productsServices', 'events',
        'relationships', 'phenomena', 'conditions', 'symptoms', 'storySummary',
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
    extractionMethod: jsonLdBodies.length
      ? 'json_ld_article_body'
      : articleBodies.length ? 'html_article_element' : 'metadata_only',
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

const hasProviderRefusal = (response) => response.output
  ?.flatMap((item) => item.content || [])
  .some((content) => content.type === 'refusal');

const createValidationError = (code, stage, path, rule, description) => (
  new ArticleAnalysisError(code, 502, {
    validation: { stage, path, rule, description },
  })
);

const getComparableTokens = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .match(/[\p{L}\p{N}]+/gu) || [];

const materiallyOverlaps = (label, contextualValue) => {
  const first = new Set(getComparableTokens(label));
  const second = new Set(getComparableTokens(contextualValue));
  if (!first.size || !second.size) return false;
  const shared = [...first].filter((token) => second.has(token)).length;
  return shared === Math.min(first.size, second.size)
    || shared / Math.max(first.size, second.size) >= 0.8;
};

const hasSameNormalizedLabel = (first, second) => (
  getComparableTokens(first).join(' ') === getComparableTokens(second).join(' ')
);

const OPTIONAL_PROFILE_ARRAYS = [
  'primaryPeople', 'otherPeople', 'peopleRoles', 'locations', 'organizations', 'eventTypes',
  'distinctiveFacts', 'aliases', 'uncertaintyPhrases', 'works', 'productsServices', 'events',
  'relationships', 'phenomena', 'conditions', 'symptoms',
];

const validateSuggestion = (suggestion) => {
  if (!suggestion || typeof suggestion !== 'object' || Array.isArray(suggestion)) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', '$', 'object_required',
      'The structured result must be an object.',
    );
  }
  for (const field of ['watchTitle', 'watchingFor', 'storyFingerprint', 'storyProfile', 'description']) {
    if (!(field in suggestion)) {
      throw createValidationError(
        'provider_schema_invalid', 'structured_schema', field, 'required',
        'A required top-level field was missing.',
      );
    }
  }
  if (!suggestion.storyProfile || typeof suggestion.storyProfile !== 'object' || Array.isArray(suggestion.storyProfile)) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', 'storyProfile', 'object_required',
      'The story profile must be an object.',
    );
  }
  const normalizedProfile = {
    ...suggestion.storyProfile,
    ...Object.fromEntries(OPTIONAL_PROFILE_ARRAYS.map((field) => [
      field,
      Array.isArray(suggestion.storyProfile[field]) ? suggestion.storyProfile[field] : [],
    ])),
  };
  const suppliedFingerprint = suggestion.storyFingerprint;
  if (!Array.isArray(suppliedFingerprint)) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', 'storyFingerprint', 'array_required',
      'The Story Fingerprint must be an array.',
    );
  }
  const invalidConceptIndex = suppliedFingerprint.findIndex((concept) => (
    !concept
    || typeof concept.label !== 'string'
    || !concept.label.trim()
    || ![...AUTOMATIC_STORY_CONCEPT_TYPES, 'fact', 'supporting'].includes(concept.type)
  ));
  if (invalidConceptIndex >= 0) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', `storyFingerprint[${invalidConceptIndex}]`,
      'identifier_shape_invalid', 'A Story Identifier had an invalid label or type.',
    );
  }
  const contextualValues = [
    ...normalizedProfile.distinctiveFacts,
    ...normalizedProfile.uncertaintyPhrases,
  ];
  const primaryPeople = normalizedProfile.primaryPeople;
  const eligibleFingerprint = (Array.isArray(suppliedFingerprint) ? suppliedFingerprint : [])
    .filter((concept) => (
      (
        concept?.type !== 'person'
        || primaryPeople.some((person) => hasSameNormalizedLabel(concept?.label, person))
      )
      && (
        ['condition', 'symptom', 'relationship'].includes(concept?.type)
        || !contextualValues.some((value) => materiallyOverlaps(concept?.label, value))
      )
    ));
  const legacyFacts = (Array.isArray(suppliedFingerprint) ? suppliedFingerprint : [])
    .filter((concept) => ['fact', 'supporting'].includes(concept?.type))
    .map((concept) => String(concept?.label || '').trim())
    .filter(Boolean);
  const storyFingerprint = normalizeAutomaticStoryFingerprint(
    eligibleFingerprint,
    5,
  );
  const keywords = storyFingerprint.map(({ label }) => label);
  const description = typeof suggestion?.description === 'string'
    ? sanitizeMalformedCurrencyText(suggestion.description).trim()
    : '';
  const sentenceCount = description.match(/[.!?](?:\s|$)/g)?.length || (description ? 1 : 0);
  const watchingFor = typeof suggestion?.watchingFor === 'string'
    ? sanitizeMalformedCurrencyText(suggestion.watchingFor).trim()
    : '';
  const storySummary = typeof normalizedProfile.storySummary === 'string'
    ? sanitizeMalformedCurrencyText(normalizedProfile.storySummary).replace(/\s+/g, ' ').trim()
    : '';
  const semanticRules = [
    [typeof suggestion.watchTitle === 'string' && suggestion.watchTitle.trim(), 'watchTitle', 'non_empty', 'The Watch title was empty.'],
    [keywords.length <= 5, 'storyFingerprint', 'maximum_items', 'The Story Fingerprint exceeded five identifiers.'],
    [watchingFor, 'watchingFor', 'non_empty', 'The monitoring instruction was empty.'],
    [storySummary.length >= 20, 'storyProfile.storySummary', 'minimum_length', 'The Story Summary was too short.'],
    [description, 'description', 'non_empty', 'The description was empty.'],
    [sentenceCount <= 2, 'description', 'maximum_sentences', 'The description exceeded two sentences.'],
  ];
  const failedRule = semanticRules.find(([valid]) => !valid);
  if (failedRule) {
    throw createValidationError(
      'application_validation_failed', 'application_validation',
      failedRule[1], failedRule[2], failedRule[3],
    );
  }
  const distinctiveFacts = [...new Set([
    ...normalizedProfile.distinctiveFacts,
    ...legacyFacts,
  ])];
  return {
    watchTitle: suggestion.watchTitle.trim(),
    watchingFor,
    storyFingerprint,
    keywords,
    storyProfile: { ...normalizedProfile, storySummary, distinctiveFacts },
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
  onDiagnostic,
  signal,
  providerTimeoutMs = PROVIDER_TIMEOUT_MS,
  maxAttempts = PROVIDER_MAX_ATTEMPTS,
  retryDelayMs = PROVIDER_RETRY_DELAY_MS,
  sleepImpl = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  randomImpl = Math.random,
}) => {
  if (!apiKey) {
    onDiagnostic?.({ stage: 'provider', attempted: false, succeeded: false, outcomeCode: 'configuration_missing' });
    throw new ArticleAnalysisError('configuration_missing', 503);
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

  const executeAttempt = async (attemptSignal) => {
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
        instructions: `Read and understand the complete cleaned article content. Build one structured story profile, a concise Watch title, a natural one-sentence monitoring instruction named watchingFor, and a short explanation of no more than two sentences.

storyProfile.storySummary explains the article naturally to a human. It must identify the central subject or phenomenon, explain what the article reports, include decisive supported context, and preserve important uncertainty or attribution. It must not merely copy, segment, or lightly reword the headline.

storyFingerprint is the separate, complete list of monitoring identifiers used to recognize future reporting about the same story. Select the smallest sufficient set: zero to five identifiers, normally 2 to 5 for a strong result, and fewer whenever fewer are reliable. Return them strongest first. Rank specificity and future matching value above general relevance. Before retaining an identifier, ask whether a future article containing it would be credible evidence that the article concerns the same monitored subject. Each identifier must be central, concise, independently understandable, and likely to appear or have a close semantic equivalent in later relevant coverage. Favor canonical named entities and short reusable event or relationship labels over descriptive phrases that read like miniature summaries. When two identifiers work as a pair, do not repeat the named entity inside a second long identifier. For example, for an unauthorized copy of a named work circulating on a platform, prefer the complementary pair "The Odyssey" (work) and "Unauthorized release on X" (event) over "Universal Studios takedown of leaked film posts" and "Unauthorized copy of The Odyssey on X". Use the most accurate available type, including work, product_service, condition, symptom, phenomenon or relationship. Use product_service for a named product, platform or service such as Amazon Luna or Google Stadia only when the supplied context supports that classification and the entity is central. A company remains an organization. Generic fact, supporting and manual are not permitted automatic identifier types.

Do not put general advice, list items, lifestyle recommendations, supporting examples, background details, generic themes, consequences, explanatory prose, uncertainty prose, or generic synthesized phrases in storyFingerprint. Put those values only in distinctiveFacts or uncertaintyPhrases when they remain useful context, and never duplicate them into storyFingerprint. Do not include quoted experts or organizations merely cited as sources. primaryPeople means people the story is genuinely centered on; quoted experts belong only in otherPeople. primaryPeople and organizations may be empty when none is central. Do not include byline authors, photographers, image or agency credits, publishers, captions, interface text, or related-content modules. Do not return headline fragments, incomplete phrases, entire sentences, or redundant parent and child concepts. For a health advice article about brain fog during perimenopause, select "Brain fog" and "Perimenopause" while keeping coping recommendations such as breaks, reminders and lifestyle routines only in distinctiveFacts. Prefer either "Brain fog during perimenopause" or the complementary pair "Brain fog" and "Perimenopause", not all three. Preserve a decisive relationship as one coherent identifier when separating it would lose meaning, such as an agreement being conditional on another action.

Populate storyProfile independently from the monitoring identifiers. primaryPeople, otherPeople, peopleRoles, locations, organizations, eventTypes, works, productsServices, events, relationships, phenomena, conditions and symptoms describe supported article entities and context; use empty arrays when a category is absent. distinctiveFacts contains useful supporting details, including recommendations when relevant to the human explanation. uncertaintyPhrases contains attribution and uncertainty prose. These supporting profile fields are not monitoring identifiers unless the same concise concept is deliberately selected in storyFingerprint because it is essential for future matching.

Preserve complete organization and location names. Use "City, Country" only when that relationship is explicit in the supplied text. Preserve qualifiers such as alleged, suspected, reported, accused, possible, or wanted in storySummary, distinctiveFacts and uncertaintyPhrases. Never convert an allegation, official assessment, suspected motive, reported link, or conditional political relationship into a confirmed fact. A publisher or media provider is not an organization in the story.

Use source fields in this order: title, description, articleText, then slug only as a fallback. The author field is source attribution, not evidence that the author is a story subject. Base every field only on supplied source content. Never invent a person, organization, location, event, relationship or detail.`,
      input: JSON.stringify(source),
      reasoning: { effort: 'low' },
      max_output_tokens: 1200,
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
      signal: attemptSignal,
    });
  } catch (error) {
    if (signal?.aborted || (error?.name === 'AbortError' && attemptSignal?.aborted && !isTimeoutError(attemptSignal.reason))) {
      throw new ArticleAnalysisError('provider_request_aborted', 499, { aborted: true });
    }
    const outcomeCode = isTimeoutError(error) || isTimeoutError(attemptSignal?.reason)
      ? 'provider_timeout'
      : 'provider_network_error';
    throw new ArticleAnalysisError(outcomeCode, 502, { retryable: true });
  }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) {
      throw new ArticleAnalysisError('provider_auth_error');
    }
    if (response.status === 429) {
      throw new ArticleAnalysisError('provider_rate_limited', 502, { retryable: true });
    }
    throw new ArticleAnalysisError('provider_http_error', 502, {
      retryable: response.status >= 500,
    });
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ArticleAnalysisError('provider_envelope_invalid');
  }
  if (result?.status === 'incomplete') {
    const truncated = result.incomplete_details?.reason === 'max_output_tokens';
    throw new ArticleAnalysisError(truncated ? 'provider_output_truncated' : 'provider_incomplete');
  }
  if (hasProviderRefusal(result)) {
    throw new ArticleAnalysisError('provider_refusal');
  }
  const outputText = extractResponseText(result);
  if (!outputText) {
    throw new ArticleAnalysisError('provider_output_missing');
  }
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new ArticleAnalysisError('provider_json_invalid');
  }
  onDiagnostic?.({ stage: 'parsed', value: parsed });
  let validated;
  try {
    validated = validateSuggestion(parsed);
  } catch (error) {
    throw error;
  }
  onDiagnostic?.({ stage: 'validated', value: validated });
  return {
    ...validated,
    analysisProvider: 'openai',
    analysisStatus: 'success',
    analysisModel: model,
    fallbackReasonCode: null,
    analyzedAt: new Date().toISOString(),
    analysisDiagnosticId: diagnosticId,
  };
  };

  const boundedAttempts = Math.max(1, Math.min(Number(maxAttempts) || 1, PROVIDER_MAX_ATTEMPTS));
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    const startedAt = Date.now();
    const timeoutSignal = AbortSignal.timeout(providerTimeoutMs);
    const attemptSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    try {
      const suggestion = await executeAttempt(attemptSignal);
      onDiagnostic?.({
        stage: 'provider_attempt', attempt, attempted: true, succeeded: true,
        durationMs: Date.now() - startedAt, outcomeCode: 'success',
        retryOccurred: attempt > 1, retryScheduled: false, aborted: false,
      });
      return suggestion;
    } catch (error) {
      const analysisError = error instanceof ArticleAnalysisError
        ? error
        : new ArticleAnalysisError('internal_error');
      const retryScheduled = analysisError.retryable && attempt < boundedAttempts && !signal?.aborted;
      onDiagnostic?.({
        stage: 'provider_attempt', attempt, attempted: true, succeeded: false,
        durationMs: Date.now() - startedAt, outcomeCode: analysisError.code,
        retryOccurred: attempt > 1, retryScheduled, aborted: analysisError.aborted,
        validation: analysisError.validation,
      });
      if (!retryScheduled) throw analysisError;
      const delay = retryDelayMs + Math.floor(randomImpl() * PROVIDER_RETRY_JITTER_MS);
      onDiagnostic?.({ stage: 'provider_retry', attempt, delayMs: delay, outcomeCode: analysisError.code });
      await sleepImpl(delay);
    }
  }
  throw new ArticleAnalysisError('internal_error');
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
  providerTimeoutMs = PROVIDER_TIMEOUT_MS,
  maxAttempts = PROVIDER_MAX_ATTEMPTS,
  retryDelayMs,
  sleepImpl,
  randomImpl,
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
      const requestController = new AbortController();
      request.once?.('aborted', () => requestController.abort(
        new DOMException('The caller disconnected.', 'AbortError'),
      ));
      response.once?.('close', () => {
        if (!response.writableEnded) {
          requestController.abort(new DOMException('The caller disconnected.', 'AbortError'));
        }
      });
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
        signal: requestController.signal,
        providerTimeoutMs,
        maxAttempts,
        retryDelayMs,
        sleepImpl,
        randomImpl,
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
        const fallbackReasonCode = error.code || 'internal_error';
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
          ...(error.validation ? { validation: error.validation } : {}),
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
