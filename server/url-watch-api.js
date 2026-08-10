import he from 'he';
import { randomUUID } from 'node:crypto';
import { PublicUrlError, validatePublicUrl } from './public-url-security.js';
import {
  AUTOMATIC_STORY_CONCEPT_TYPES,
  normalizeAutomaticStoryFingerprint,
} from '../src/js/monitoring-concepts.js';
import {
  cleanArticleContentForAnalysis,
  isAccessInterfaceText,
  sanitizeMalformedCurrencyText,
} from '../src/js/article-content.js';
import { getMediaStoryPublisher } from '../src/js/media-story-request.js';
import { classifyPage } from '../src/js/page-classification.js';
import { cleanStorySummaryText } from '../src/js/story-profile.js';

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

const STORY_CONCEPT_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    concepts: {
      type: 'array',
      minItems: 0,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 160 },
          type: { type: 'string', enum: AUTOMATIC_STORY_CONCEPT_TYPES },
          reason: { type: 'string', minLength: 1, maxLength: 180 },
        },
        required: ['label', 'type', 'reason'],
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['concepts', 'confidence'],
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

const collectJsonLdEntities = (value, entities = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdEntities(item, entities));
    return entities;
  }
  if (!value || typeof value !== 'object') return entities;
  entities.push(value);
  Object.values(value).forEach((item) => collectJsonLdEntities(item, entities));
  return entities;
};

const getJsonLdEntities = (html) => (
  [...String(html).matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )]
    .flatMap((match) => {
      try {
        return collectJsonLdEntities(JSON.parse(match[1]));
      } catch {
        return [];
      }
    })
);

const getJsonLdArticles = (entities) => entities.filter((value) => (
  typeof value?.articleBody === 'string' && isArticleLikeEntity(value)
));

const getNamedJsonLdValue = (value) => {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => (
    typeof item === 'string' ? item : item?.name
  )).find((item) => typeof item === 'string' && item.trim()) || '';
};

const normalizedBodyKey = (value) => value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const getDistinctArticleBodies = (articles) => {
  const seen = new Set();
  return articles
    .map((article) => cleanArticleContentForAnalysis(cleanPageText(article?.articleBody)))
    .filter((body) => {
      const key = normalizedBodyKey(body);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const ACCESS_MODULE_MARKER = /(?:access[-_\s]?(?:gate|limit|overlay|wall)|ad(?:vertising)?[-_\s]?(?:gate|unlock)|consent[-_\s]?(?:banner|dialog|overlay|wall)|login[-_\s]?(?:gate|prompt|wall)|member(?:ship)?[-_\s]?(?:card|gate|prompt|wall)|metered|paywall|premium[-_\s]?(?:content|gate)|reg(?:ister|istration|wall)|sign[-_\s]?in|subscri(?:be|ber|ption))/iu;
const NON_ARTICLE_MODULE_MARKER = /(?:related|recommend|most[-_\s]?read|more[-_\s]?on|promo|navigation|footer|sidebar|card|rail)/iu;
const ACCESS_LIMITED_CONTENT_PATTERN = /(?:already (?:a )?subscriber|access all articles|become a member|continue reading|create (?:an )?account|full access|log ?in to continue|sign ?in to continue|subscribe to continue|subscription required|support (?:our )?journalism|unlimited access|unlock (?:this )?(?:article|story)|why subscribe|abonnez-vous|acc[ée]dez [àa] tous (?:les|nos) articles|d[ée]j[àa] abonn[ée]|devenez membre|je (?:me connecte|m['’]abonne)|pourquoi s['’]abonner|profitez de tous nos articles|r[ée]serv[ée] aux abonn[ée]s|regarder une publicit[ée]|soutenez (?:notre|nos) journaliste?s?)/iu;

const hasAccessLimitedContent = (html) => {
  const source = String(html || '');
  const structuralSignal = [...source.matchAll(/<(?:aside|dialog|div|form|section)\b([^>]*)>/giu)]
    .some((match) => ACCESS_MODULE_MARKER.test(match[1]));
  return structuralSignal || ACCESS_LIMITED_CONTENT_PATTERN.test(cleanPageText(source));
};

const stripNonArticleModules = (html) => {
  let result = String(html || '');
  for (let pass = 0; pass < 3; pass += 1) {
    result = result
      .replace(/<(?:aside|footer|nav)\b[^>]*>[\s\S]*?<\/(?:aside|footer|nav)\s*>/giu, ' ')
      .replace(
        /<(button|dialog|form)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
        (match) => (ACCESS_MODULE_MARKER.test(match) || isAccessInterfaceText(cleanPageText(match)) ? ' ' : match),
      )
      .replace(
        /<(div|section)\b([^>]*(?:class|id|aria-label|data-component)\s*=\s*["'][^"']*(?:related|recommend|most[-_\s]?read|more[-_\s]?on|promo|navigation|footer|sidebar|card|rail|access[-_\s]?(?:gate|limit|overlay|wall)|ad(?:vertising)?[-_\s]?(?:gate|unlock)|consent|login|member(?:ship)?|metered|paywall|premium|reg(?:ister|istration|wall)|sign[-_\s]?in|subscri(?:be|ber|ption))[^"']*["'][^>]*)>[\s\S]*?<\/\1\s*>/giu,
        ' ',
      );
  }
  return result;
};

const getHtmlArticleBodies = (html) => {
  const candidates = [...String(html).matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article\s*>/giu)]
    .filter((match) => !NON_ARTICLE_MODULE_MARKER.test(match[1]))
    .map((match, index) => {
      const cleanedMarkup = stripNonArticleModules(match[2]);
      const articleBody = cleanArticleContentForAnalysis(cleanPageText(cleanedMarkup));
      const paragraphCount = (cleanedMarkup.match(/<p\b/giu) || []).length;
      const hasHeadline = /<h1\b/iu.test(cleanedMarkup);
      return {
        articleBody,
        index,
        score: articleBody.length + (paragraphCount * 80) + (hasHeadline ? 10_000 : 0),
      };
    })
    .filter(({ articleBody }) => articleBody)
    .sort((first, second) => second.score - first.score || first.index - second.index);
  return getDistinctArticleBodies(candidates.slice(0, 1));
};

const getFirstElementText = (html, tagNames) => {
  const pattern = new RegExp(`<(${tagNames.join('|')})\\b[^>]*>([\\s\\S]*?)<\\/\\1\\s*>`, 'iu');
  return cleanPageText(String(html || '').match(pattern)?.[2]);
};

const ACCESS_CHALLENGE_TITLE = /^(?:client challenge|access denied|access restricted|acc[eè]s restreint(?:\s*-.*)?|just a moment|security check)$/iu;

const titleFromArticleUrl = (sourceUrl) => {
  try {
    const slug = decodeURIComponent(new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1) || '')
      .replace(/_\d+(?:_\d+)?(?:\.html)?$/u, '')
      .replace(/\.html$/iu, '')
      .replace(/[-_]+/gu, ' ')
      .replace(/\b([ld])\s+([aeiouyàâäéèêëîïôöùûüÿœ])/giu, '$1’$2')
      .replace(/\s+/gu, ' ')
      .trim();
    return slug ? `${slug.charAt(0).toLocaleUpperCase()}${slug.slice(1)}` : '';
  } catch {
    return '';
  }
};

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
  const findMetaContent = (names) => names.map((name) => metadata.find((attributes) => (
    (attributes.property || attributes.name || '').toLowerCase() === name
    && attributes.content
  ))?.content).find(Boolean) || '';
  const openGraphTitle = findMetaContent(['og:title']);
  const openGraphType = cleanPageText(findMetaContent(['og:type']));
  const twitterTitle = findMetaContent(['twitter:title']);
  const cleanMetadataEvidence = (value) => {
    const cleaned = cleanArticleContentForAnalysis(cleanPageText(value));
    return isAccessInterfaceText(cleaned) ? '' : cleaned;
  };
  const openGraphDescription = cleanMetadataEvidence(findMetaContent(['og:description']));
  const twitterDescription = cleanMetadataEvidence(findMetaContent(['twitter:description']));
  const htmlDescription = cleanMetadataEvidence(findMetaContent(['description']));
  const metadataAuthor = cleanPageText(findMetaContent(['author', 'article:author']));
  const openGraphSiteName = cleanPageText(findMetaContent(['og:site_name']));
  const applicationName = cleanPageText(findMetaContent(['application-name']));
  const publishedAt = cleanPageText(findMetaContent([
    'article:published_time',
    'datepublished',
    'date',
  ]));
  const htmlTitle = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const documentLanguage = cleanPageText(
    getTagAttributes(String(html).match(/<html\b[^>]*>/iu)?.[0] || '').lang,
  );
  const jsonLdEntities = getJsonLdEntities(html);
  const jsonLdTypes = [...new Set(jsonLdEntities.flatMap((entity) => (
    Array.isArray(entity?.['@type']) ? entity['@type'] : [entity?.['@type']]
  )).filter((type) => typeof type === 'string' && type.trim()))];
  const jsonLdArticles = getJsonLdArticles(jsonLdEntities);
  const jsonLdBodies = getDistinctArticleBodies(jsonLdArticles);
  const preliminaryPageType = classifyPage({ sourceUrl, openGraphType, jsonLdTypes });
  const skipArticleExtraction = [
    'homepage', 'news_section', 'category_page', 'search_page', 'rss_feed',
  ].includes(preliminaryPageType);
  const articleBodies = skipArticleExtraction
    ? []
    : jsonLdBodies.length ? jsonLdBodies : getHtmlArticleBodies(html);
  const { articleText, includedArticleBodyCount } = createBoundedArticleText(articleBodies);
  const jsonLdArticle = jsonLdEntities.find((value) => (
    isArticleLikeEntity(value)
    && [value?.headline, value?.description, value?.publisher, value?.datePublished]
      .some(Boolean)
  )) || jsonLdArticles[0] || null;
  const articleHeadline = cleanTitle(getFirstElementText(html, ['h1']));
  const articleSubheading = cleanMetadataEvidence(
    getFirstElementText(html, ['h2']) || findMetaContent(['article:subheading']),
  );
  const extractedTitle = cleanTitle(
    jsonLdArticle?.headline || openGraphTitle || twitterTitle || articleHeadline || htmlTitle,
  );
  const accessChallenge = ACCESS_CHALLENGE_TITLE.test(extractedTitle)
    && !openGraphTitle
    && !jsonLdArticle
    && !articleBodies.length;
  const contentAccessLimited = accessChallenge || hasAccessLimitedContent(html);
  const title = accessChallenge ? titleFromArticleUrl(sourceUrl) : extractedTitle;
  const structuredAuthor = cleanPageText(getNamedJsonLdValue(jsonLdArticle?.author));
  const author = [metadataAuthor, structuredAuthor]
    .find((value) => value && !/^https?:\/\//i.test(value)) || '';
  const canonicalHref = (head.match(/<link\b[^>]*>/gi) || [])
    .map(getTagAttributes)
    .find((attributes) => (
      (attributes.rel || '').toLowerCase().split(/\s+/).includes('canonical')
      && attributes.href
    ))?.href;
  const canonicalUrl = (() => {
    try {
      if (!canonicalHref) return '';
      const value = new URL(canonicalHref, sourceUrl || undefined);
      return ['http:', 'https:'].includes(value.protocol) ? value.href : '';
    } catch {
      return '';
    }
  })();
  const jsonLdPublisher = cleanPageText(getNamedJsonLdValue(jsonLdArticle?.publisher));
  const urlPublisher = getMediaStoryPublisher(sourceUrl) || '';
  const headlineCount = (String(html).match(/<h[12]\b/giu) || []).length;
  const navigationLinkCount = [...String(html).matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/giu)]
    .reduce((count, match) => count + (match[1].match(/<a\b/giu) || []).length, 0);
  const pageType = classifyPage({
    sourceUrl,
    canonicalUrl,
    openGraphType,
    jsonLdTypes,
    publishedAt: publishedAt || cleanPageText(jsonLdArticle?.datePublished),
    author,
    articleText,
    articleBodyCount: articleBodies.length,
    headlineCount,
    navigationLinkCount,
  });

  return {
    title,
    description: cleanPageText(
      openGraphDescription
      || twitterDescription
      || cleanMetadataEvidence(jsonLdArticle?.description)
      || htmlDescription
      || articleSubheading,
    ),
    articleHeadline,
    articleSubheading,
    articleText,
    articleBodyCount: articleBodies.length,
    includedArticleBodyCount,
    extractionMethod: jsonLdBodies.length
      ? 'json_ld_article_body'
      : articleBodies.length ? 'html_article_element' : 'metadata_only',
    author,
    siteName: openGraphSiteName || jsonLdPublisher || applicationName || urlPublisher,
    publishedAt: publishedAt || cleanPageText(jsonLdArticle?.datePublished),
    sourceUrl,
    canonicalUrl,
    pageType,
    language: accessChallenge ? '' : documentLanguage,
    contentAccessLimited,
    titleSource: accessChallenge ? 'url_slug' : jsonLdArticle?.headline
      ? 'json_ld_headline'
      : openGraphTitle ? 'open_graph_title'
        : twitterTitle ? 'twitter_title'
          : articleHeadline ? 'article_headline' : 'html_title',
    openGraphType,
    jsonLdTypes,
    headlineCount,
    navigationLinkCount,
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

export const fetchPageMetadata = async (
  input,
  fetchImpl = fetch,
  { validateUrl = validatePageUrl } = {},
) => {
  let url = await validateUrl(input);
  const requestedUrl = url.href;

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
      url = await validateUrl(new URL(location, url).href);
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
      sourceUrl: requestedUrl,
      resolvedUrl: url.href,
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

const isContextualRestatement = (label, contextualValue, type) => {
  const first = new Set(getComparableTokens(label));
  const second = new Set(getComparableTokens(contextualValue));
  if (!first.size || !second.size) return false;
  const shared = [...first].filter((token) => second.has(token)).length;
  return shared === first.size && first.size === second.size
    || (Math.min(first.size, second.size) >= 2
      && shared / Math.max(first.size, second.size) >= 0.75)
    || (
      !['condition', 'symptom', 'relationship'].includes(type)
      && shared === first.size
    );
};

const hasSameNormalizedLabel = (first, second) => (
  getComparableTokens(first).join(' ') === getComparableTokens(second).join(' ')
);

const getProfileSupportedType = (concept, profile) => {
  if (['fact', 'supporting'].includes(concept?.type)) return concept?.type;
  const supportedTypes = [
    ['location', profile.locations],
    ['organization', profile.organizations],
    ['work', profile.works],
    ['product_service', profile.productsServices],
    ['relationship', profile.relationships],
    ['condition', profile.conditions],
    ['symptom', profile.symptoms],
    ['phenomenon', profile.phenomena],
    ['event', [...profile.events, ...profile.eventTypes]],
    ['person', profile.primaryPeople],
  ];
  return supportedTypes.find(([, values]) => (
    values.some((value) => hasSameNormalizedLabel(concept?.label, value))
  ))?.[0] || concept?.type;
};

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
  const typedFingerprint = (Array.isArray(suppliedFingerprint) ? suppliedFingerprint : [])
    .map((concept) => ({
      ...concept,
      type: getProfileSupportedType(concept, normalizedProfile),
    }));
  const eligibleFingerprint = typedFingerprint
    .filter((concept) => (
      (
        concept?.type !== 'person'
        || primaryPeople.some((person) => hasSameNormalizedLabel(concept?.label, person))
      )
      && !contextualValues.some((value) => (
        isContextualRestatement(concept?.label, value, concept?.type)
      ))
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
    ? cleanStorySummaryText(normalizedProfile.storySummary)
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

const GENERIC_MONITORING_CONCEPT = /^(?:business|entertainment|health|lifestyle|news|politics|science|sport|sports|technology|world)$/iu;
const CONCEPT_CONNECTOR = /^(?:a|an|and|at|de|des|du|en|et|for|from|in|la|le|les|of|on|the|to)$/iu;

const hasConceptSupportInEvidence = (label, evidence) => {
  const labelTokens = getComparableTokens(label).filter((token) => (
    token.length > 2 && !CONCEPT_CONNECTOR.test(token)
  ));
  if (!labelTokens.length) return false;
  const sourceTokens = new Set(getComparableTokens(evidence));
  const supportedCount = labelTokens.filter((token) => sourceTokens.has(token)).length;
  return supportedCount === labelTokens.length
    || (labelTokens.length >= 3 && supportedCount / labelTokens.length >= 0.75);
};

const hasTrustedConceptSupport = (label, source) => hasConceptSupportInEvidence(label, [
  source.title,
  source.subtitle,
  source.description,
  source.articleText,
].filter(Boolean).join(' '));

const hasPrimaryConceptSupport = (label, source) => hasConceptSupportInEvidence(label, [
  source.title,
  source.subtitle,
  source.description,
  source.openingText,
].filter(Boolean).join(' '));

const validateConceptProposal = (proposal, source) => {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', '$', 'object_required',
      'The structured concept proposal must be an object.',
    );
  }
  if (!Array.isArray(proposal.concepts)) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', 'concepts', 'array_required',
      'The monitoring concepts must be an array.',
    );
  }
  if (proposal.concepts.length > 6) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', 'concepts', 'maximum_items',
      'The concept proposal exceeded six items.',
    );
  }
  if (!Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', 'confidence', 'range',
      'The proposal confidence must be between zero and one.',
    );
  }
  const invalidIndex = proposal.concepts.findIndex((concept) => (
    !concept
    || typeof concept.label !== 'string'
    || !concept.label.trim()
    || concept.label.length > 160
    || !AUTOMATIC_STORY_CONCEPT_TYPES.includes(concept.type)
    || typeof concept.reason !== 'string'
    || !concept.reason.trim()
    || concept.reason.length > 180
  ));
  if (invalidIndex >= 0) {
    throw createValidationError(
      'provider_schema_invalid', 'structured_schema', `concepts[${invalidIndex}]`,
      'concept_shape_invalid', 'A monitoring concept had an invalid label, type or reason.',
    );
  }
  const eligible = proposal.concepts.filter(({ label }) => {
    const cleaned = String(label).replace(/\s+/gu, ' ').trim();
    return !GENERIC_MONITORING_CONCEPT.test(cleaned)
      && !isAccessInterfaceText(cleaned)
      && !ACCESS_LIMITED_CONTENT_PATTERN.test(cleaned)
      && hasTrustedConceptSupport(cleaned, source);
  });
  const normalized = normalizeAutomaticStoryFingerprint(eligible, 6);
  const concepts = normalized.map((concept) => ({
    ...concept,
    reason: eligible.find((candidate) => (
      candidate.type === concept.type && hasSameNormalizedLabel(candidate.label, concept.label)
    ))?.reason.trim() || 'Supported by the supplied article evidence',
  }));
  const hasCentralAnchor = concepts.some(({ label }) => hasPrimaryConceptSupport(label, source));
  const failedCentrality = proposal.concepts.length > 0 && !hasCentralAnchor;
  return {
    concepts: hasCentralAnchor ? concepts : [],
    confidence: failedCentrality ? 0 : proposal.confidence,
  };
};

const getOpeningText = (articleText) => String(articleText || '')
  .split(/\n{2,}/u)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean)
  .slice(0, 2)
  .join('\n\n')
  .slice(0, 2_000)
  .trim();

const createProviderEvidence = (source) => {
  const sections = {
    primaryEvidence: {
      headline: source.title,
      subheadline: source.subtitle,
      description: source.description,
      openingText: source.openingText,
    },
    supportingEvidence: {
      bodyText: source.articleText,
    },
    provenanceOnly: {
      authorByline: source.author,
      publisher: source.publisher,
    },
    metadata: {
      publishedAt: source.publishedAt,
      language: source.language,
    },
    deterministicHints: {
      candidates: source.deterministicCandidates,
      slug: source.slug,
    },
  };
  return Object.fromEntries(Object.entries(sections)
    .map(([section, values]) => [
      section,
      Object.fromEntries(Object.entries(values).filter(([, value]) => value)),
    ])
    .filter(([, values]) => Object.keys(values).length));
};

export const generateWatchSuggestion = async ({
  title,
  subtitle = '',
  description = '',
  articleText = '',
  author = '',
  publisher = '',
  publishedAt = '',
  language = '',
  deterministicCandidates = [],
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

  const cleanedArticleText = cleanArticleContentForAnalysis(articleText);
  const source = Object.fromEntries(Object.entries({
    title: String(title || '').trim(),
    subtitle: String(subtitle || '').trim(),
    description: String(description || '').trim(),
    openingText: getOpeningText(cleanedArticleText),
    articleText: cleanedArticleText,
    author: String(author || '').trim(),
    publisher: String(publisher || '').trim(),
    publishedAt: String(publishedAt || '').trim(),
    language: String(language || '').trim(),
    deterministicCandidates: normalizeAutomaticStoryFingerprint(deterministicCandidates, 6)
      .map(({ label, type }) => `${label} (${type})`)
      .join('; '),
    slug: String(slug || '').trim(),
  }).filter(([, value]) => value));
  const providerEvidence = createProviderEvidence(source);
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
        instructions: `Propose 0–6 monitoring concepts that would best help determine whether a future article concerns this same specific story or subject. Prefer three excellent concepts over six mediocre ones, and return fewer, including one or zero, when that is all the evidence supports. Never pad the profile to reach a target count.

This is concept selection only. Do not summarize the article, rewrite its title, create keywords, or list every named entity. Select the STORY SPINE: the smallest complementary set of concepts that preserves the identity of this particular story while remaining useful across normal wording changes in future reporting. Each concept must be concise, independently understandable, central to the supplied evidence, discriminating, and useful in later coverage.

Use the labeled evidence hierarchy. primaryEvidence is CENTRAL EVIDENCE: headline, subheadline, description and opening text have the highest signal for what the article is about. supportingEvidence is the full body: recurring subjects and developments tied directly to the opening may corroborate the Story Spine, while one-off deep-body references, historical examples, incidental geography, secondary actors and quoted people or organizations are PERIPHERAL EVIDENCE and must not become the profile merely because they occur in the article. provenanceOnly identifies who produced the article, not what the story is about. deterministicHints are optional hints, not evidence.

At least one selected concept must be directly grounded in primaryEvidence whenever you return a non-empty profile. This is a semantic centrality requirement, not headline keyword extraction and not a requirement that every concept appear in the headline. For every proposed concept ask: "If this concept were removed, would the remaining profile still preserve the identity of the headline development?" Also ask whether it is directly involved in what the headline, description or opening says happened, rather than context that appears elsewhere.

Never select an article author or byline as a Story concept merely because the name appears in provenance or article text. Select that person only when primaryEvidence shows that the article itself is substantively about the same person. Apply the same centrality test to secondary quoted people or organizations and incidental locations.

Reason about three dimensions when they are present, but do not treat them as mandatory output slots: (1) the principal subject — the person, organization, product, work, condition or phenomenon centrally involved; (2) the defining development or issue — what happened, is happening or is disputed, if the article has one; and (3) optional distinctive context — an evidence-grounded activity, attribute, relationship, circumstance, project, role, lifestyle or discriminating location without which the remaining profile would become materially broader or lose this story's identity. Apply this removal test to distinctive context: if removing it still identifies this particular story rather than a substantially broader subject, omit it; if not, one concise context concept may be useful. Do not manufacture context to fill the profile.

Choose the expected abstraction level. Preserve specific story-defining concepts such as a named person plus their legal case, election or distinctive profile context; a university plagiarism investigation and resignation; a named strike campaign; a particular agreement, merger or tournament; or a supported topic such as ultra-processed foods. A single strong topic concept can be sufficient. Reject isolated title fragments, list-item wording, generic categories such as News, Health or Politics, incidental deep-body mentions, quoted experts, bylines, publishers, and concepts that merely repeat one sentence.

Before returning the profile, perform a HEADLINE COVERAGE CHECK against the headline and primary article evidence: have you omitted a substantive, discriminating element that materially defines this specific story? If so, add or revise at most one concept when needed. If not, leave the profile unchanged. Do not copy every headline term. Ignore rhetorical wording, puns, click-oriented descriptions, incidental descriptors and generic geography when the remaining concepts already identify the story.

Every concept must be directly supported by the supplied trusted article evidence. Never use navigation, related-story cards, recommendations, Most Read modules, paywall or subscription text, login or registration prompts, advertising unlock copy, consent overlays, footers, or promotional content. The supplied deterministicCandidates are hints only and may be rejected or improved.

Use only the existing type enum. A company is an organization; a named product or service is product_service; a central subject or distinctive context without a narrower compatible type may be phenomenon. Explain briefly in reason why each concept helps recognize future reporting about this specific story and which supplied evidence supports it. Confidence describes the proposal as a whole. Do not invent facts or translate proper names.`,
      input: JSON.stringify(providerEvidence),
      reasoning: { effort: 'low' },
      max_output_tokens: 600,
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'story_concept_proposal',
          strict: true,
          schema: STORY_CONCEPT_PROPOSAL_SCHEMA,
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
  const validated = Array.isArray(parsed?.concepts)
    ? validateConceptProposal(parsed, source)
    : validateSuggestion(parsed);
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
        subtitle: body.subtitle,
        description: body.description,
        articleText: body.articleText,
        author: body.author,
        publisher: body.publisher,
        publishedAt: body.publishedAt,
        language: body.language,
        deterministicCandidates: body.deterministicCandidates,
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
