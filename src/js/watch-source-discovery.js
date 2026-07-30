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
  return {
    url,
    type: source?.type === 'atom' ? 'atom' : 'rss',
    title: typeof source?.title === 'string' && source.title.trim()
      ? source.title.trim()
      : null,
    discovery: typeof source?.discovery === 'string' && source.discovery.trim()
      ? source.discovery.trim()
      : 'automatic',
  };
};

export const requestMonitoringSource = async (
  request,
  { language = 'en', fetchImpl = fetch } = {},
) => {
  let response;
  try {
    response = await fetchImpl('/api/monitoring-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request, language }),
    });
  } catch {
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
