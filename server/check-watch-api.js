import { createHash } from 'node:crypto';
import he from 'he';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { PublicUrlError, validatePublicUrl } from './public-url-security.js';

const ENDPOINT = '/api/check-watch';
export const MAX_BODY_BYTES = 4 * 1024;
export const MAX_SOURCE_URL_LENGTH = 2_048;
export const MAX_FEED_BYTES = 1024 * 1024;
export const MAX_REDIRECTS = 3;
export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_ITEMS = 20;
export const MAX_TITLE_LENGTH = 300;
export const MAX_EXCERPT_LENGTH = 500;

const ACCEPTED_CONTENT_TYPES = [
  /^application\/(?:rss|atom)\+xml$/i,
  /^application\/xml$/i,
  /^application\/[\w.+-]+\+xml$/i,
  /^text\/xml$/i,
];
const SNIFFABLE_CONTENT_TYPES = new Set(['', 'text/plain']);

class CheckWatchError extends Error {
  constructor(code, statusCode, clientMessage, message = clientMessage, options) {
    super(message, options);
    this.name = 'CheckWatchError';
    this.code = code;
    this.statusCode = statusCode;
    this.clientMessage = clientMessage;
  }
}

const asArray = (value) => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const getTextValue = (value) => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(getTextValue).filter(Boolean).join(' ');
  if (!value || typeof value !== 'object') return '';
  return getTextValue(value['#text'] ?? value.__cdata ?? '');
};

const cleanText = (value, maxLength) => {
  const decoded = he.decode(getTextValue(value));
  return decoded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
};

const normalizeDate = (value) => {
  const text = cleanText(value, 200);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeLink = (value, baseUrl) => {
  const candidate = cleanText(value, MAX_SOURCE_URL_LENGTH);
  if (!candidate) return null;
  try {
    const url = new URL(candidate, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
};

const selectAtomLink = (links, baseUrl) => {
  const candidates = asArray(links);
  const selected = candidates.find((link) => (
    link && typeof link === 'object' && (!link['@_rel'] || link['@_rel'] === 'alternate')
  )) || candidates[0];
  const value = selected && typeof selected === 'object' ? selected['@_href'] : selected;
  return normalizeLink(value, baseUrl);
};

const createStableId = ({ explicitId, url, title, publishedAt, source, author, excerpt }) => {
  const stableValue = cleanText(explicitId, 1_000) || url;
  if (stableValue) return stableValue;
  return `generated:${createHash('sha256')
    .update(JSON.stringify([
      title || '',
      publishedAt || '',
      source || '',
      author || '',
      excerpt || '',
    ]))
    .digest('hex')}`;
};

const createNormalizedItem = ({
  explicitId,
  title,
  url,
  publishedAt,
  source,
  author,
  excerpt,
}) => {
  const normalizedTitle = cleanText(title, MAX_TITLE_LENGTH);
  const normalizedPublishedAt = normalizeDate(publishedAt);
  const normalizedUrl = url || null;
  const normalizedSource = cleanText(source, MAX_TITLE_LENGTH) || null;
  const normalizedAuthor = cleanText(author, MAX_TITLE_LENGTH) || null;
  const normalizedExcerpt = cleanText(excerpt, MAX_EXCERPT_LENGTH) || null;
  return {
    id: createStableId({
      explicitId,
      url: normalizedUrl,
      title: normalizedTitle,
      publishedAt: normalizedPublishedAt,
      source: normalizedSource,
      author: normalizedAuthor,
      excerpt: normalizedExcerpt,
    }),
    title: normalizedTitle || null,
    url: normalizedUrl,
    publishedAt: normalizedPublishedAt,
    source: normalizedSource,
    author: normalizedAuthor,
    excerpt: normalizedExcerpt,
  };
};

const getAtomAuthor = (authors) => {
  const names = asArray(authors)
    .map((author) => cleanText(author?.name ?? author, MAX_TITLE_LENGTH))
    .filter(Boolean);
  return names.join(', ');
};

const parseRss = (rss, sourceUrl) => {
  const channel = rss?.channel;
  if (!channel || typeof channel !== 'object') return null;
  const sourceTitle = cleanText(channel.title, MAX_TITLE_LENGTH) || null;
  const sourceLink = normalizeLink(channel.link, sourceUrl) || sourceUrl;
  const entries = asArray(channel.item).slice(0, MAX_ITEMS).map((item) => {
    const url = normalizeLink(item?.link, sourceUrl);
    return createNormalizedItem({
      explicitId: item?.guid,
      title: item?.title,
      url,
      publishedAt: item?.pubDate,
      source: item?.source || sourceTitle,
      author: item?.author || item?.creator,
      excerpt: item?.description,
    });
  });
  return { source: { title: sourceTitle, url: sourceLink }, items: entries };
};

const parseAtom = (feed, sourceUrl) => {
  if (!feed || typeof feed !== 'object') return null;
  const sourceTitle = cleanText(feed.title, MAX_TITLE_LENGTH) || null;
  const sourceLink = selectAtomLink(feed.link, sourceUrl) || sourceUrl;
  const entries = asArray(feed.entry).slice(0, MAX_ITEMS).map((entry) => {
    const entrySource = cleanText(entry?.source?.title, MAX_TITLE_LENGTH) || sourceTitle;
    return createNormalizedItem({
      explicitId: entry?.id,
      title: entry?.title,
      url: selectAtomLink(entry?.link, sourceUrl),
      publishedAt: entry?.published || entry?.updated,
      source: entrySource,
      author: getAtomAuthor(entry?.author),
      excerpt: entry?.summary || entry?.content,
    });
  });
  return { source: { title: sourceTitle, url: sourceLink }, items: entries };
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
});

export const parseFeedXml = (xml, { sourceUrl = '' } = {}) => {
  const value = String(xml || '').trim();
  if (!value) {
    throw new CheckWatchError('EMPTY_RESPONSE', 422, 'The feed is empty.');
  }
  if (/<!DOCTYPE\b/i.test(value)) {
    throw new CheckWatchError('UNSAFE_XML', 422, 'The feed XML is not supported.');
  }
  const validation = XMLValidator.validate(value);
  if (validation !== true) {
    throw new CheckWatchError('MALFORMED_XML', 422, 'The feed XML is malformed.');
  }

  let document;
  try {
    document = parser.parse(value);
  } catch (error) {
    throw new CheckWatchError(
      'MALFORMED_XML',
      422,
      'The feed XML is malformed.',
      'The XML parser rejected the feed.',
      { cause: error },
    );
  }
  const normalized = document?.rss
    ? parseRss(document.rss, sourceUrl)
    : document?.feed ? parseAtom(document.feed, sourceUrl) : null;
  if (!normalized) {
    throw new CheckWatchError('NOT_A_FEED', 422, 'The document is not an RSS or Atom feed.');
  }
  if (!normalized.items.length) {
    throw new CheckWatchError('EMPTY_FEED', 422, 'The feed does not contain any items.');
  }
  return normalized;
};

const isAcceptedContentType = (contentType) => {
  const mimeType = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  return ACCEPTED_CONTENT_TYPES.some((pattern) => pattern.test(mimeType))
    || SNIFFABLE_CONTENT_TYPES.has(mimeType);
};

const looksLikeFeedXml = (xml) => (
  /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--(?:[\s\S]*?)-->\s*)*<(?:rss\b|feed\b)/i.test(xml)
);

const readLimitedText = async (response, maxBytes) => {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new CheckWatchError('RESPONSE_TOO_LARGE', 502, 'The feed response is too large.');
  }
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let result = '';
  let byteCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteCount += value.byteLength;
    if (byteCount > maxBytes) {
      await reader.cancel();
      throw new CheckWatchError('RESPONSE_TOO_LARGE', 502, 'The feed response is too large.');
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
};

const fetchFeedWithinDeadline = async (sourceUrl, {
  fetchImpl,
  lookup,
  signal,
  maxFeedBytes,
  maxRedirects,
}) => {
  let url = await validatePublicUrl(sourceUrl, { lookup });
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/plain;q=0.5',
          'User-Agent': 'WatchAssistantPrototype/1.0',
        },
        redirect: 'manual',
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new CheckWatchError('TIMEOUT', 504, 'The feed request timed out.');
      }
      throw new CheckWatchError(
        'NETWORK_ERROR',
        502,
        'The feed could not be fetched.',
        'The upstream feed request failed.',
        { cause: error },
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirectCount === maxRedirects) {
        throw new CheckWatchError('TOO_MANY_REDIRECTS', 502, 'The feed redirected too many times.');
      }
      const redirectedUrl = new URL(location, url).href;
      if (redirectedUrl.length > MAX_SOURCE_URL_LENGTH) {
        throw new CheckWatchError('INVALID_REDIRECT', 502, 'The feed redirect is invalid.');
      }
      url = await validatePublicUrl(redirectedUrl, { lookup });
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) {
        throw new CheckWatchError('ACCESS_DENIED', 502, 'The monitoring source denied access.');
      }
      if ([404, 410].includes(response.status)) {
        throw new CheckWatchError('SOURCE_NOT_FOUND', 502, 'The monitoring source could not be found.');
      }
      throw new CheckWatchError('UPSTREAM_ERROR', 502, 'The feed could not be fetched.');
    }
    if (!isAcceptedContentType(response.headers.get('content-type'))) {
      await response.body?.cancel();
      throw new CheckWatchError('UNSUPPORTED_CONTENT_TYPE', 415, 'The response is not an RSS or Atom feed.');
    }

    const xml = await readLimitedText(response, maxFeedBytes);
    if (!looksLikeFeedXml(xml)) {
      throw new CheckWatchError('NOT_A_FEED', 422, 'The document is not an RSS or Atom feed.');
    }
    return { xml, finalUrl: url.href };
  }
  throw new CheckWatchError('TOO_MANY_REDIRECTS', 502, 'The feed redirected too many times.');
};

export const fetchAndNormalizeFeed = async (sourceUrl, {
  fetchImpl = fetch,
  lookup,
  timeoutMs = FETCH_TIMEOUT_MS,
  maxFeedBytes = MAX_FEED_BYTES,
  maxRedirects = MAX_REDIRECTS,
  now = () => new Date(),
} = {}) => {
  if (
    typeof sourceUrl !== 'string'
    || !sourceUrl.trim()
    || sourceUrl.trim().length > MAX_SOURCE_URL_LENGTH
  ) {
    throw new CheckWatchError('INVALID_SOURCE_URL', 400, 'sourceUrl is invalid.');
  }
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new CheckWatchError('TIMEOUT', 504, 'The feed request timed out.'));
    }, timeoutMs);
  });

  try {
    const operation = fetchFeedWithinDeadline(sourceUrl.trim(), {
      fetchImpl,
      lookup,
      signal: controller.signal,
      maxFeedBytes,
      maxRedirects,
    });
    const { xml, finalUrl } = await Promise.race([operation, timeout]);
    const normalized = parseFeedXml(xml, { sourceUrl: finalUrl });
    return {
      source: normalized.source,
      checkedAt: now().toISOString(),
      items: normalized.items,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const readJsonBody = async (request) => {
  if (request.body !== undefined) {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw new CheckWatchError('INVALID_BODY', 400, 'The request body must be a JSON object.');
    }
    if (Buffer.byteLength(JSON.stringify(request.body)) > MAX_BODY_BYTES) {
      throw new CheckWatchError('BODY_TOO_LARGE', 413, 'The request body is too large.');
    }
    return request.body;
  }

  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new CheckWatchError('BODY_TOO_LARGE', 413, 'The request body is too large.');
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(body || '');
  } catch (error) {
    throw new CheckWatchError(
      'INVALID_JSON',
      400,
      'The request body must be valid JSON.',
      undefined,
      { cause: error },
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CheckWatchError('INVALID_BODY', 400, 'The request body must be a JSON object.');
  }
  return parsed;
};

const validateSourceUrlInput = (body) => {
  if (!Object.hasOwn(body, 'sourceUrl')) {
    throw new CheckWatchError('MISSING_SOURCE_URL', 400, 'sourceUrl is required.');
  }
  if (typeof body.sourceUrl !== 'string') {
    throw new CheckWatchError('INVALID_SOURCE_URL', 400, 'sourceUrl must be a string.');
  }
  const sourceUrl = body.sourceUrl.trim();
  if (!sourceUrl || sourceUrl.length > MAX_SOURCE_URL_LENGTH) {
    throw new CheckWatchError('INVALID_SOURCE_URL', 400, 'sourceUrl is invalid.');
  }
  return sourceUrl;
};

const sendJson = (response, statusCode, body) => {
  if (typeof response.status === 'function' && typeof response.json === 'function') {
    response.status(statusCode).json(body);
    return;
  }
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
};

const toCheckWatchError = (error) => {
  if (error instanceof CheckWatchError) return error;
  if (error instanceof PublicUrlError) {
    const inputErrorCodes = new Set([
      'INVALID_URL',
      'INVALID_PROTOCOL',
      'URL_CREDENTIALS',
      'LOCAL_HOST',
      'PRIVATE_ADDRESS',
    ]);
    return new CheckWatchError(
      error.code,
      inputErrorCodes.has(error.code) ? 400 : 502,
      inputErrorCodes.has(error.code) ? 'sourceUrl is not allowed.' : 'The feed could not be fetched.',
      error.message,
      { cause: error },
    );
  }
  return new CheckWatchError('INTERNAL_ERROR', 500, 'The feed could not be checked.');
};

export const createCheckWatchMiddleware = (options = {}) => (
  async (request, response, next) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname !== ENDPOINT) {
      next?.();
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const sourceUrl = validateSourceUrlInput(body);
      sendJson(response, 200, await fetchAndNormalizeFeed(sourceUrl, options));
    } catch (cause) {
      const error = toCheckWatchError(cause);
      console.error(`[Check Watch] ${error.code}: ${error.message}`);
      sendJson(response, error.statusCode, {
        code: error.code,
        error: error.clientMessage,
      });
    }
  }
);
