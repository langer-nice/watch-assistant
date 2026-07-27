import { getStoryProfileIdentifiers } from './story-profile.js';

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

const normalizeMatchText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const containsPhrase = (text, phrase) => {
  const normalizedPhrase = normalizeMatchText(phrase);
  return normalizedPhrase && ` ${text} `.includes(` ${normalizedPhrase} `);
};

export const matchFeedItemToStory = (item, storyProfile) => {
  const text = normalizeMatchText([
    item?.title,
    item?.excerpt,
    item?.author,
  ].filter(Boolean).join(' '));
  if (!text) return { matched: false, evidence: [] };

  const evidence = [];
  const manuallyAdded = new Set((storyProfile?.userAddedConcepts || []).map(normalizeMatchText));
  const evidenceType = {
    person: { field: 'people', strength: 'strong' },
    organization: { field: 'organizations', strength: 'strong' },
    work: { field: 'works', strength: 'strong' },
    location: { field: 'locations', strength: 'context' },
    event: { field: 'eventTypes', strength: 'context' },
    condition: { field: 'conditions', strength: 'strong' },
    symptom: { field: 'symptoms', strength: 'strong' },
    phenomenon: { field: 'phenomena', strength: 'strong' },
    relationship: { field: 'relationships', strength: 'strong' },
    supporting: { field: 'decisiveFacts', strength: 'distinctive' },
  };
  getStoryProfileIdentifiers(storyProfile).forEach(({ label, type }) => {
    const normalized = normalizeMatchText(label);
    const wordCount = normalized.split(' ').filter(Boolean).length;
    const selectedType = manuallyAdded.has(normalized)
      ? { field: 'userAddedConcepts', strength: 'strong' }
      : evidenceType[type];
    const permitsSpecificSingleWord = [
      'location', 'work', 'condition', 'symptom', 'phenomenon', 'relationship',
    ].includes(type);
    const isEligiblePhrase = wordCount >= 2
      || (permitsSpecificSingleWord && normalized.length >= 5);
    if (selectedType && isEligiblePhrase && containsPhrase(text, label)) {
      evidence.push({ ...selectedType, label });
    }
  });

  const hasStrong = evidence.some(({ strength }) => strength === 'strong');
  const hasDistinctive = evidence.some(({ strength, label }) => (
    strength === 'distinctive' && normalizeMatchText(label).split(' ').length >= 3
  ));
  const hasLocation = evidence.some(({ field }) => field === 'locations');
  const hasEventContext = evidence.some(({ field }) => (
    field === 'eventTypes' || field === 'decisiveFacts'
  ));
  return {
    matched: hasStrong || hasDistinctive || (hasLocation && hasEventContext),
    evidence,
  };
};

export const getMonitoringUpdates = (watch) => (
  Array.isArray(watch?.candidateUpdates || watch?.monitoringUpdates)
    ? (watch.candidateUpdates || watch.monitoringUpdates)
      .filter((item) => ['candidate', 'unreviewed'].includes(item?.status))
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
  const unseenItems = hasBaseline
    ? items.filter(({ id }) => !previouslySeen.has(id))
    : [];
  const matchedItems = unseenItems
    .map((item) => ({ item, match: matchFeedItemToStory(item, watch.storyProfile) }))
    .filter(({ match }) => match.matched);
  const detectedUpdates = matchedItems.map(({ item, match }) => ({
    ...item,
    status: 'candidate',
    detectedAt: checkedAt,
    matchEvidence: match.evidence,
  }));
  const existingUpdates = Array.isArray(watch.candidateUpdates || watch.monitoringUpdates)
    ? (watch.candidateUpdates || watch.monitoringUpdates)
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
    : !unseenItems.length
      ? 'no-new-items'
      : detectedUpdates.length ? 'matching-items' : 'no-matching-items';
  const diagnostics = {
    returnedItemCount: items.length,
    unseenItemCount: unseenItems.length,
    matchedCandidateCount: detectedUpdates.length,
    storedUpdateCount: monitoringUpdates.length,
  };
  const latestUpdateAt = detectedUpdates.length
    ? checkedAt
    : watch.latestUpdateAt || null;
  const hadMonitoringIssue = ['setup-required', 'unavailable', 'needs-attention']
    .includes(watch.monitoringStatus?.state)
    || Boolean(watch.monitoringIssueReason);
  const actionRequired = watch.actionRequired === true || (
    !hadMonitoringIssue && (watch.requiresAttention === true || watch.status === 'attention')
  );

  return {
    outcome,
    newItems: unseenItems,
    unseenItems,
    matchedItems: detectedUpdates,
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
      candidateUpdates: monitoringUpdates,
      monitoringUpdates,
      lastChecked: checkedAt,
      lastCheckedKey: null,
      lastCheckOutcome: {
        type: outcome,
        checkedAt,
        newItemIds: unseenItems.map(({ id }) => id),
        candidateItemIds: detectedUpdates.map(({ id }) => id),
        diagnostics,
      },
      lastCheckResult: {
        type: outcome,
        checkedAt,
        newItemIds: unseenItems.map(({ id }) => id),
        candidateItemIds: detectedUpdates.map(({ id }) => id),
        diagnostics,
      },
      monitoringReviewStatus: detectedUpdates.length ? 'candidate' : watch.monitoringReviewStatus || null,
      unreadUpdateCount: monitoringUpdates.filter((item) => (
        ['candidate', 'unreviewed'].includes(item?.status)
      )).length,
      latestUpdateAt,
      monitoringStatus: { state: 'active', reason: null },
      monitoringIssueReason: null,
      monitoringFailure: null,
      actionRequired,
      attentionReason: actionRequired ? watch.attentionReason || null : null,
      requiresAttention: actionRequired,
      status: actionRequired && watch.status !== 'paused'
        ? 'attention'
        : watch.status === 'attention' && hadMonitoringIssue ? 'watching' : watch.status || 'watching',
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
        const feedUrl = normalizeFeedUrl(watch.monitoringSource?.url || watch.feedUrl || '');
        if (!feedUrl) {
          saveWatch(watchId, {
            monitoringStatus: { state: 'setup-required', reason: 'no-compatible-source' },
            monitoringIssueReason: 'no-compatible-source',
          });
          throw new MonitoringCheckError(
            'MISSING_FEED_URL',
            'No monitoring source is configured for this Watch.',
          );
        }
        const response = await requestCheck(feedUrl);
        const result = applyFeedCheckResult(watch, response, { now });
        const updatedWatch = saveWatch(watchId, result.changes);
        if (import.meta.env?.DEV) {
          console.info('[Watch monitoring] Check completed', {
            watchId,
            outcome: result.outcome,
            ...result.changes.lastCheckResult.diagnostics,
          });
        }
        return { ...result, watch: updatedWatch };
      } catch (error) {
        if (!(error instanceof MonitoringCheckError && error.code === 'MISSING_FEED_URL')) {
          const currentWatch = getWatch(watchId) || {};
          const failureCount = Math.min(
            3,
            (Number(currentWatch.monitoringFailure?.consecutiveCount) || 0) + 1,
          );
          const persistent = failureCount >= 3;
          saveWatch(watchId, {
            monitoringFailure: {
              consecutiveCount: failureCount,
              failedAt: now().toISOString(),
              code: error instanceof MonitoringCheckError ? error.code : 'CHECK_FAILED',
            },
            ...(persistent ? {
              monitoringStatus: { state: 'unavailable', reason: 'source-persistently-unavailable' },
              monitoringIssueReason: 'source-persistently-unavailable',
            } : {}),
          });
        }
        throw error;
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
