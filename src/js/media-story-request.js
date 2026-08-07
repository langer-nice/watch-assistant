const MEDIA_PUBLISHERS = [
  { host: /(^|\.)bbc\.(com|co\.uk)$/i, source: 'BBC News' },
  { host: /(^|\.)cnn\.com$/i, source: 'CNN' },
  { host: /(^|\.)reuters\.com$/i, source: 'Reuters' },
  // Preserve the labels previously produced by url-analysis.js hostname fallback.
  { host: /(^|\.)lemonde\.fr$/i, source: 'Le Monde' },
  { host: /(^|\.)franceinfo\.fr$/i, source: 'Franceinfo' },
  { host: /(^|\.)francetvinfo\.fr$/i, source: 'Francetvinfo' },
  { host: /(^|\.)theguardian\.com$/i, source: 'The Guardian' },
  { host: /(^|\.)nytimes\.com$/i, source: 'The New York Times' },
];

const isFeedUrl = (url) => (
  /(?:^|[/._-])(?:atom|feeds?|rss)(?:[/._-]|$)/iu.test(url.pathname)
  || /\.(?:atom|rss|xml)$/iu.test(url.pathname)
  || ['atom', 'feed', 'rss'].includes(url.searchParams.get('format')?.toLocaleLowerCase())
);

export const normalizeMediaStoryUrl = (value) => {
  try {
    const input = String(value || '').trim();
    const url = new URL(/^https?:\/\//iu.test(input) ? input : `https://${input}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export const getMediaStoryPublisher = (value) => {
  const normalizedUrl = normalizeMediaStoryUrl(value);
  if (!normalizedUrl) return null;
  const url = new URL(normalizedUrl);
  return MEDIA_PUBLISHERS.find(({ host }) => host.test(url.hostname))?.source || null;
};

export const parseMediaStoryRequest = (value) => {
  const normalizedUrl = normalizeMediaStoryUrl(value);
  if (!normalizedUrl) return { recognized: false, url: null, publisher: null };
  const url = new URL(normalizedUrl);
  const publisher = getMediaStoryPublisher(normalizedUrl);
  const recognized = Boolean(publisher && url.pathname !== '/' && !isFeedUrl(url));
  return {
    recognized,
    url: recognized ? normalizedUrl : null,
    publisher: recognized ? publisher : null,
  };
};
