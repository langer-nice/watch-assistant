import { normalizeFeedUrl } from './watch-monitoring.js';

export class SourceDiscoveryError extends Error {
  constructor(code = 'NO_COMPATIBLE_SOURCE') {
    super('No supported monitoring source could be found.');
    this.name = 'SourceDiscoveryError';
    this.code = code;
  }
}

export const normalizeMonitoringSource = (source) => {
  const url = normalizeFeedUrl(source?.url || '');
  if (!url) return null;
  const query = typeof source?.query === 'string' && source.query.trim()
    ? source.query.trim().slice(0, 500)
    : null;
  return {
    url,
    type: source?.type === 'atom' ? 'atom' : 'rss',
    title: typeof source?.title === 'string' && source.title.trim()
      ? source.title.trim()
      : null,
    discovery: typeof source?.discovery === 'string' && source.discovery.trim()
      ? source.discovery.trim()
      : 'automatic',
    ...(query ? { query } : {}),
  };
};

export const requestMonitoringSource = async (
  request,
  { language = 'en', fetchImpl = fetch, signal } = {},
) => {
  let response;
  try {
    response = await fetchImpl('/api/monitoring-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request, language }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new SourceDiscoveryError('DISCOVERY_UNAVAILABLE');
  }
  const result = await response.json().catch(() => null);
  const monitoringSource = normalizeMonitoringSource(result?.monitoringSource);
  if (!response.ok || !monitoringSource) {
    throw new SourceDiscoveryError(
      typeof result?.code === 'string' ? result.code : 'NO_COMPATIBLE_SOURCE',
    );
  }
  return monitoringSource;
};

const URL_DISCOVERY_LANGUAGES = ['en', 'fr'];

const requestUrlMonitoringSource = async (request, options = {}) => {
  const { language: _interfaceLanguage, ...requestOptions } = options;
  let lastError = null;
  for (const language of URL_DISCOVERY_LANGUAGES) {
    try {
      return await requestMonitoringSource(request, { ...requestOptions, language });
    } catch (error) {
      if (!(error instanceof SourceDiscoveryError)) throw error;
      lastError = error;
    }
  }
  throw lastError || new SourceDiscoveryError();
};

export const resolveUrlMonitoringSource = async (
  analysis,
  options = {},
) => {
  const existingSource = normalizeMonitoringSource(analysis?.monitoringSource);
  if (existingSource) {
    return { ...analysis, monitoringSource: existingSource };
  }
  const request = [analysis?.sourceTitle, analysis?.source]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .join(' ');
  if (!request) throw new SourceDiscoveryError('NO_COMPATIBLE_SOURCE');
  const monitoringSource = await requestUrlMonitoringSource(request, options);
  return { ...analysis, monitoringSource };
};
