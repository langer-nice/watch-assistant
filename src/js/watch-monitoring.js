export const MAX_SNAPSHOT_ITEMS = 20;
export const MAX_SEEN_ITEM_IDS = 200;
export const MAX_MONITORING_UPDATES = 20;

export class MonitoringCheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MonitoringCheckError';
    this.code = code;
  }
}

export const normalizeFeedUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
};

const normalizeItem = (item) => {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
    return null;
  }
  const nullableString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    id: item.id.trim(),
    title: nullableString(item.title),
    url: nullableString(item.url),
    publishedAt: nullableString(item.publishedAt),
    source: nullableString(item.source),
    author: nullableString(item.author),
    excerpt: nullableString(item.excerpt),
  };
};

const uniqueById = (items, limit) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, limit);
};

const getCheckedAt = (value, now) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? now().toISOString() : new Date(parsed).toISOString();
};

export const getMonitoringUpdates = (watch) => (
  Array.isArray(watch?.monitoringUpdates)
    ? watch.monitoringUpdates.filter((item) => item?.status === 'unreviewed')
    : []
);

export const applyFeedCheckResult = (watch, response, { now = () => new Date() } = {}) => {
  if (!watch || typeof watch !== 'object') {
    throw new MonitoringCheckError('WATCH_NOT_FOUND', 'The Watch could not be found.');
  }
  if (!response || typeof response !== 'object' || !Array.isArray(response.items)) {
    throw new MonitoringCheckError('INVALID_RESPONSE', 'The monitoring response is invalid.');
  }

  const checkedAt = getCheckedAt(response.checkedAt, now);
  const items = uniqueById(
    response.items.map(normalizeItem).filter(Boolean),
    MAX_SNAPSHOT_ITEMS,
  );
  const currentIds = items.map(({ id }) => id);
  const hasBaseline = Array.isArray(watch.monitoringSnapshot?.itemIds);
  const previouslySeen = new Set([
    ...(Array.isArray(watch.seenMonitoringItemIds) ? watch.seenMonitoringItemIds : []),
    ...(hasBaseline ? watch.monitoringSnapshot.itemIds : []),
    ...(Array.isArray(watch.monitoringUpdates)
      ? watch.monitoringUpdates.map(({ id }) => id)
      : []),
  ].filter(Boolean));
  const newItems = hasBaseline
    ? items.filter(({ id }) => !previouslySeen.has(id))
    : [];
  const detectedUpdates = newItems.map((item) => ({
    ...item,
    status: 'unreviewed',
    detectedAt: checkedAt,
  }));
  const existingUpdates = Array.isArray(watch.monitoringUpdates)
    ? watch.monitoringUpdates
    : [];
  const monitoringUpdates = uniqueById(
    [...detectedUpdates, ...existingUpdates],
    MAX_MONITORING_UPDATES,
  );
  const seenMonitoringItemIds = [...new Set([
    ...currentIds,
    ...previouslySeen,
  ])].slice(0, MAX_SEEN_ITEM_IDS);
  const outcome = !hasBaseline
    ? 'baseline'
    : newItems.length ? 'new-items' : 'no-new-items';

  return {
    outcome,
    newItems,
    changes: {
      monitoringSnapshot: {
        checkedAt,
        source: response.source && typeof response.source === 'object'
          ? {
            title: typeof response.source.title === 'string' ? response.source.title : null,
            url: typeof response.source.url === 'string' ? response.source.url : null,
          }
          : null,
        itemIds: currentIds,
        items,
      },
      seenMonitoringItemIds,
      monitoringUpdates,
      lastChecked: checkedAt,
      lastCheckedKey: null,
      lastCheckOutcome: {
        type: outcome,
        checkedAt,
        newItemIds: newItems.map(({ id }) => id),
      },
      monitoringReviewStatus: newItems.length ? 'unreviewed' : watch.monitoringReviewStatus || null,
    },
  };
};

export const requestFeedCheck = async (feedUrl, { fetchImpl = fetch } = {}) => {
  const normalizedFeedUrl = normalizeFeedUrl(feedUrl);
  if (!normalizedFeedUrl) {
    throw new MonitoringCheckError('MISSING_FEED_URL', 'This Watch needs an RSS or Atom feed URL.');
  }
  let response;
  try {
    response = await fetchImpl('/api/check-watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: normalizedFeedUrl }),
    });
  } catch {
    throw new MonitoringCheckError('CHECK_FAILED', 'The Watch could not be checked.');
  }
  if (!response.ok) {
    throw new MonitoringCheckError('CHECK_FAILED', 'The Watch could not be checked.');
  }
  const result = await response.json().catch(() => null);
  if (!result || !Array.isArray(result.items)) {
    throw new MonitoringCheckError('INVALID_RESPONSE', 'The monitoring response is invalid.');
  }
  return result;
};

export const createWatchCheckController = ({
  getWatch,
  saveWatch,
  requestCheck = requestFeedCheck,
  now = () => new Date(),
}) => {
  const inFlight = new Map();

  const check = (watchId, { onCheckingChange = () => {} } = {}) => {
    if (inFlight.has(watchId)) return inFlight.get(watchId);

    const operation = (async () => {
      onCheckingChange(true);
      try {
        const watch = getWatch(watchId);
        if (!watch) {
          throw new MonitoringCheckError('WATCH_NOT_FOUND', 'The Watch could not be found.');
        }
        const response = await requestCheck(watch.feedUrl);
        const result = applyFeedCheckResult(watch, response, { now });
        const updatedWatch = saveWatch(watchId, result.changes);
        return { ...result, watch: updatedWatch };
      } finally {
        onCheckingChange(false);
        inFlight.delete(watchId);
      }
    })();

    inFlight.set(watchId, operation);
    return operation;
  };

  return {
    check,
    isChecking: (watchId) => inFlight.has(watchId),
  };
};
