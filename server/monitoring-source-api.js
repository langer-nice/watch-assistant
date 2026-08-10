import { fetchAndNormalizeFeed } from './check-watch-api.js';
import { parseMediaMentionRequest } from '../src/js/media-mention-request.js';

const ENDPOINT = '/api/monitoring-source';
const MAX_BODY_BYTES = 4_096;
const MAX_REQUEST_LENGTH = 500;

export class MonitoringSourceDiscoveryError extends Error {
  constructor(code, statusCode, message, options) {
    super(message, options);
    this.name = 'MonitoringSourceDiscoveryError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const createNewsSearchFeedUrl = (request, language = 'en') => {
  const query = typeof request === 'string' ? request.trim() : '';
  if (!query || query.length > MAX_REQUEST_LENGTH) {
    throw new MonitoringSourceDiscoveryError(
      'INVALID_REQUEST',
      400,
      'A valid Watch request is required.',
    );
  }
  const locale = language === 'fr'
    ? { hl: 'fr', gl: 'FR', ceid: 'FR:fr' }
    : { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' };
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', query);
  Object.entries(locale).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
};

export const discoverTextMonitoringSource = async ({
  request,
  language = 'en',
}, options = {}) => {
  const mediaMentionRequest = parseMediaMentionRequest(request);
  const query = mediaMentionRequest.query || String(request || '').trim();
  const sourceUrl = createNewsSearchFeedUrl(query, language);
  try {
    const feed = await fetchAndNormalizeFeed(sourceUrl, options);
    return {
      monitoringSource: {
        url: sourceUrl,
        type: 'rss',
        title: feed.source?.title || null,
        discovery: 'news-search',
        query,
      },
    };
  } catch (cause) {
    throw new MonitoringSourceDiscoveryError(
      'NO_COMPATIBLE_SOURCE',
      422,
      'No supported public monitoring source could be found.',
      { cause },
    );
  }
};

const readJsonBody = async (request) => {
  if (request.body && typeof request.body === 'object') return request.body;
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new MonitoringSourceDiscoveryError('BODY_TOO_LARGE', 413, 'The request is too large.');
    }
  }
  try {
    const parsed = JSON.parse(body || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new MonitoringSourceDiscoveryError('INVALID_BODY', 400, 'The request must be valid JSON.');
  }
};

const sendJson = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
};

export const createMonitoringSourceMiddleware = (options = {}) => (
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
      sendJson(response, 200, await discoverTextMonitoringSource({
        request: body.request,
        language: body.language,
      }, options));
    } catch (error) {
      const safeError = error instanceof MonitoringSourceDiscoveryError
        ? error
        : new MonitoringSourceDiscoveryError(
          'NO_COMPATIBLE_SOURCE',
          422,
          'No supported public monitoring source could be found.',
        );
      sendJson(response, safeError.statusCode, {
        code: safeError.code,
        error: safeError.message,
      });
    }
  }
);
