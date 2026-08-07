export const PAGE_TYPES = Object.freeze({
  ARTICLE: 'article',
  HOMEPAGE: 'homepage',
  NEWS_SECTION: 'news_section',
  CATEGORY_PAGE: 'category_page',
  SEARCH_PAGE: 'search_page',
  LIVE_PAGE: 'live_page',
  RSS_FEED: 'rss_feed',
  GENERIC_WEBPAGE: 'generic_webpage',
});

const PAGE_TYPE_VALUES = new Set(Object.values(PAGE_TYPES));
const CATEGORY_SEGMENTS = new Set([
  'business', 'culture', 'entertainment', 'future', 'health', 'lifestyle', 'politics',
  'science', 'sport', 'sports', 'technology', 'travel', 'world',
]);
const SEARCH_QUERY_KEYS = ['q', 'query', 'search', 'search_query', 'searchterm'];

const toUrl = (value) => {
  try {
    return new URL(String(value || '').trim());
  } catch {
    return null;
  }
};

const getTypes = (values) => (Array.isArray(values) ? values : [values])
  .filter((value) => typeof value === 'string' && value.trim())
  .map((value) => value.trim());

const isFeedUrl = (url) => (
  /(?:^|[/._-])(?:atom|feeds?|rss)(?:[/._-]|$)/iu.test(url.pathname)
  || /\.(?:atom|rss|xml)$/iu.test(url.pathname)
  || ['atom', 'feed', 'rss'].includes(url.searchParams.get('format')?.toLocaleLowerCase())
);

const isSearchUrl = (url) => (
  /(?:^|\/)(?:search|recherche)(?:\/|$)/iu.test(url.pathname)
  || SEARCH_QUERY_KEYS.some((key) => url.searchParams.has(key))
);

const isKnownArticlePath = (url) => {
  const path = url.pathname;
  const host = url.hostname.replace(/^www\./iu, '');
  if (/bbc\.(?:com|co\.uk)$/iu.test(host)) {
    return /\/(?:news|sport)(?:\/[^/]+)*\/articles?\/[^/]+/iu.test(path)
      || /\/news\/(?:[^/]+-)?\d{6,}(?:\/|$)/iu.test(path);
  }
  if (/(?:^|\.)cnn\.com$/iu.test(host)) return /\/\d{4}\/\d{2}\/\d{2}\//u.test(path);
  if (/(?:^|\.)reuters\.com$/iu.test(host)) return /-\d{4}-\d{2}-\d{2}\/?$/u.test(path);
  if (/(?:^|\.)lemonde\.fr$/iu.test(host)) return /\/article\//u.test(path);
  if (/(?:^|\.)(?:franceinfo|francetvinfo)\.fr$/iu.test(host)) {
    return /_\d+\.html$/u.test(path);
  }
  return false;
};

const isKnownLivePath = (url) => {
  const host = url.hostname.replace(/^www\./iu, '');
  return /bbc\.(?:com|co\.uk)$/iu.test(host)
    && /^\/news\/live\/[^/]+\/?$/iu.test(url.pathname);
};

export const isStoryPageType = (pageType) => (
  pageType === PAGE_TYPES.ARTICLE || pageType === PAGE_TYPES.LIVE_PAGE
);

const CLARIFICATION_PAGE_TYPES = new Set([
  PAGE_TYPES.HOMEPAGE,
  PAGE_TYPES.NEWS_SECTION,
  PAGE_TYPES.CATEGORY_PAGE,
  PAGE_TYPES.SEARCH_PAGE,
]);

export const requiresNonArticleClarification = (pageType) => (
  CLARIFICATION_PAGE_TYPES.has(pageType)
);

export const classifyPage = ({
  sourceUrl,
  canonicalUrl,
  openGraphType,
  jsonLdTypes,
  publishedAt,
  author,
  articleText,
  articleBodyCount = 0,
  headlineCount = 0,
  navigationLinkCount = 0,
} = {}) => {
  const requestedUrl = toUrl(sourceUrl);
  if (requestedUrl && isFeedUrl(requestedUrl)) return PAGE_TYPES.RSS_FEED;
  if (requestedUrl && isSearchUrl(requestedUrl)) return PAGE_TYPES.SEARCH_PAGE;
  if (requestedUrl && !requestedUrl.pathname.split('/').filter(Boolean).length) {
    return PAGE_TYPES.HOMEPAGE;
  }

  const url = toUrl(canonicalUrl) || requestedUrl;
  if (!url) return PAGE_TYPES.GENERIC_WEBPAGE;
  if (isFeedUrl(url)) return PAGE_TYPES.RSS_FEED;

  const segments = url.pathname.split('/').filter(Boolean);
  if (!segments.length) return PAGE_TYPES.HOMEPAGE;
  if (isSearchUrl(url)) return PAGE_TYPES.SEARCH_PAGE;

  const firstSegment = segments[0].toLocaleLowerCase();
  if (isKnownLivePath(url)) return PAGE_TYPES.LIVE_PAGE;
  if (firstSegment === 'news' && segments.length <= 2 && !isKnownArticlePath(url)) {
    return PAGE_TYPES.NEWS_SECTION;
  }
  if (segments.length === 1 && CATEGORY_SEGMENTS.has(firstSegment)) {
    return PAGE_TYPES.CATEGORY_PAGE;
  }

  const declaredTypes = getTypes(jsonLdTypes);
  const livePosting = declaredTypes.some((type) => /(?:^|:)LiveBlogPosting$/iu.test(type));
  const articleSchema = declaredTypes.some((type) => /(?:Article|Posting)$/iu.test(type));
  const articleOpenGraph = String(openGraphType || '').trim().toLocaleLowerCase() === 'article';
  const meaningfulArticleText = String(articleText || '').trim().length >= 120;
  const strongArticleMetadata = Boolean(publishedAt)
    && (Boolean(author) || meaningfulArticleText || Number(articleBodyCount) === 1);

  if (livePosting || (/\/live(?:\/|$)/iu.test(url.pathname) && strongArticleMetadata)) {
    return PAGE_TYPES.LIVE_PAGE;
  }
  if (articleSchema || articleOpenGraph || isKnownArticlePath(url) || strongArticleMetadata) {
    return PAGE_TYPES.ARTICLE;
  }

  const navigationHeavy = Number(headlineCount) >= 4 || Number(navigationLinkCount) >= 8;
  if (navigationHeavy || Number(articleBodyCount) > 1 || CATEGORY_SEGMENTS.has(firstSegment)) {
    return firstSegment === 'news' ? PAGE_TYPES.NEWS_SECTION : PAGE_TYPES.CATEGORY_PAGE;
  }
  return PAGE_TYPES.GENERIC_WEBPAGE;
};

export const normalizePageType = (value) => (
  PAGE_TYPE_VALUES.has(value) ? value : null
);

export const getNonStoryPageExplanation = (pageType, language = 'en') => {
  const french = language === 'fr';
  const messages = french ? {
    [PAGE_TYPES.HOMEPAGE]: "Cette page semble être la page d’accueil d’un site d’actualités plutôt qu’un article unique.",
    [PAGE_TYPES.NEWS_SECTION]: "Cette page semble être une rubrique d’actualités plutôt qu’un article unique.",
    [PAGE_TYPES.CATEGORY_PAGE]: "Cette page semble être une page de catégorie plutôt qu’un article unique.",
    [PAGE_TYPES.SEARCH_PAGE]: "Cette page semble être une page de résultats de recherche plutôt qu’un article unique.",
    [PAGE_TYPES.RSS_FEED]: "Cette URL semble être un flux RSS plutôt qu’un article unique.",
    [PAGE_TYPES.GENERIC_WEBPAGE]: "Cette page ne semble pas être un article d’actualité unique.",
  } : {
    [PAGE_TYPES.HOMEPAGE]: 'This appears to be a news homepage rather than a single news story.',
    [PAGE_TYPES.NEWS_SECTION]: 'This appears to be a news section rather than a single news story.',
    [PAGE_TYPES.CATEGORY_PAGE]: 'This appears to be a category page rather than a single news story.',
    [PAGE_TYPES.SEARCH_PAGE]: 'This appears to be a search results page rather than a single news story.',
    [PAGE_TYPES.RSS_FEED]: 'This appears to be an RSS feed rather than a single news story.',
    [PAGE_TYPES.GENERIC_WEBPAGE]: 'This page does not appear to be a single news story.',
  };
  return messages[pageType] || messages[PAGE_TYPES.GENERIC_WEBPAGE];
};
