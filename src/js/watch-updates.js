import { parseTimestampValue } from './watch-dates.js';

const UPDATE_STATUSES = new Set(['new', 'read']);
const LEGACY_EPOCH_SENTINEL = '1970-01-01T00:00:00.000Z';

const normalizeText = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalizeTimestamp = (value) => {
  const parsed = parseTimestampValue(value);
  return parsed ? parsed.toISOString() : null;
};

const hashText = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const getSourceDomain = (sourceUrl) => {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
};

const getUpdateIdentity = (update) => [
  update.timestamp,
  update.sourceUrl,
  update.sourceTitle,
  update.summary,
].map((value) => value || '').join('\u0000');

const TRACKING_QUERY_PARAMETERS = new Set([
  'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'referrer',
]);

const getCanonicalArticleUrl = (value) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hostname = url.hostname.replace(/^www\./i, '').toLocaleLowerCase();
    url.hash = '';
    [...url.searchParams.keys()].forEach((key) => {
      if (key.toLocaleLowerCase().startsWith('utm_') || TRACKING_QUERY_PARAMETERS.has(
        key.toLocaleLowerCase(),
      )) {
        url.searchParams.delete(key);
      }
    });
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, '');
    return url.href;
  } catch {
    return null;
  }
};

export const normalizeUpdate = (update, { fallbackTimestamp = null } = {}) => {
  if (!update || typeof update !== 'object') return null;
  const timestamp = normalizeTimestamp(
    update.timestamp || update.detectedAt || update.publishedAt || fallbackTimestamp,
  );
  if (!timestamp) return null;

  const sourceUrl = normalizeText(update.sourceUrl || update.url);
  const sourceTitle = normalizeText(update.sourceTitle || update.title);
  const sourceName = normalizeText(update.sourceName || update.source);
  const summary = normalizeText(update.summary || update.excerpt || update.title);
  const sourceDomain = normalizeText(update.sourceDomain) || getSourceDomain(sourceUrl);
  const publishedAt = normalizeTimestamp(update.publishedAt || update.rawMonitoringResult?.publishedAt);
  const detectedAt = normalizeTimestamp(update.detectedAt || timestamp);
  const status = UPDATE_STATUSES.has(update.status)
    ? update.status
    : ['candidate', 'unreviewed', 'updated'].includes(update.status) ? 'new' : 'read';
  const generatedIdentity = [timestamp, sourceUrl, sourceTitle, summary]
    .map((value) => value || '').join('\u0000');
  const id = normalizeText(update.id) || `update-${hashText(generatedIdentity)}`;
  const provenance = update.monitoringProvenance;
  const monitoringProvenance = provenance
    && typeof provenance.reportId === 'string'
    && typeof provenance.watchId === 'string'
    && typeof provenance.resultId === 'string'
    && provenance.resultId === id
    ? {
      reportId: provenance.reportId,
      watchId: provenance.watchId,
      resultId: provenance.resultId,
      detectedAt: normalizeTimestamp(provenance.detectedAt || timestamp),
      reportedAt: normalizeTimestamp(provenance.reportedAt),
    }
    : null;

  return {
    id,
    timestamp,
    sourceUrl,
    sourceTitle,
    sourceName,
    sourceDomain,
    summary,
    status,
    ...(publishedAt ? { publishedAt } : {}),
    ...(detectedAt ? { detectedAt } : {}),
    ...(monitoringProvenance ? { monitoringProvenance } : {}),
    ...('rawMonitoringResult' in update && update.rawMonitoringResult != null
      ? { rawMonitoringResult: update.rawMonitoringResult }
      : {}),
  };
};

const normalizeUpdates = (updates) => {
  const seenIds = new Set();
  const seenResults = new Set();
  const seenArticleUrls = new Set();
  return (Array.isArray(updates) ? updates : [])
    .map((update) => normalizeUpdate(update))
    .filter((update) => {
      if (!update) return false;
      const identity = getUpdateIdentity(update);
      const articleUrl = getCanonicalArticleUrl(update.sourceUrl);
      if (
        seenIds.has(update.id)
        || seenResults.has(identity)
        || (articleUrl && seenArticleUrls.has(articleUrl))
      ) return false;
      seenIds.add(update.id);
      seenResults.add(identity);
      if (articleUrl) seenArticleUrls.add(articleUrl);
      return true;
    })
    .sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp));
};

export const getWatchUpdates = (watch) => normalizeUpdates(watch?.updates);

export const getLatestUpdate = (watch) => {
  const updates = getWatchUpdates(watch);
  return updates[updates.length - 1] || null;
};

export const getUnreadUpdates = (watch) => (
  getWatchUpdates(watch).filter(({ status }) => status === 'new')
);

export const addUpdateToWatch = (watch, update) => {
  if (!watch || typeof watch !== 'object') return watch;
  const normalizedUpdate = normalizeUpdate(update);
  if (!normalizedUpdate) return watch;

  const updates = normalizeUpdates(watch.updates);
  const identity = getUpdateIdentity(normalizedUpdate);
  const articleUrl = getCanonicalArticleUrl(normalizedUpdate.sourceUrl);
  const duplicate = updates.some((existing) => (
    existing.id === normalizedUpdate.id
    || getUpdateIdentity(existing) === identity
    || (articleUrl && getCanonicalArticleUrl(existing.sourceUrl) === articleUrl)
  ));
  if (duplicate) return {
    ...watch,
    updates,
    unreadUpdateCount: getUnreadUpdates({ updates }).length,
    lastUpdated: getLatestUpdate({ updates })?.timestamp || watch.lastUpdated || null,
  };

  updates.push(normalizedUpdate);
  updates.sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp));
  const previousStatus = watch.currentStatus || watch.status || 'watching';
  const protectedStatus = ['attention', 'paused', 'completed'].includes(previousStatus);
  const currentStatus = normalizedUpdate.status === 'new' && !protectedStatus
    ? 'updated'
    : previousStatus;

  return {
    ...watch,
    currentStatus,
    lastUpdated: updates[updates.length - 1].timestamp,
    unreadUpdateCount: getUnreadUpdates({ updates }).length,
    updates,
  };
};

export const markUpdatesAsRead = (watch, updateIds, { persist } = {}) => {
  if (!watch || typeof watch !== 'object') return watch;
  const requestedIds = new Set((Array.isArray(updateIds) ? updateIds : [])
    .map(normalizeText).filter(Boolean));
  if (!requestedIds.size) return watch;
  let changed = false;
  const updates = normalizeUpdates(watch.updates).map((update) => {
    if (!requestedIds.has(update.id) || update.status === 'read') return update;
    changed = true;
    return { ...update, status: 'read' };
  });
  if (!changed) return watch;

  const updatedWatch = {
    ...watch,
    unreadUpdateCount: getUnreadUpdates({ updates }).length,
    updates,
  };
  if (typeof persist === 'function') persist(updatedWatch);
  return updatedWatch;
};

export const markUpdateAsRead = (watch, updateId, options) => (
  markUpdatesAsRead(watch, [updateId], options)
);

const newestLegacyCandidate = (candidateUpdates) => [...candidateUpdates]
  .sort((first, second) => (
    (parseTimestampValue(second?.detectedAt || second?.publishedAt)?.getTime() || 0)
    - (parseTimestampValue(first?.detectedAt || first?.publishedAt)?.getTime() || 0)
  ))[0] || null;

const getLegacyUpdateTimestamp = (watch, candidate) => [
  candidate?.detectedAt,
  candidate?.publishedAt,
  watch.latestUpdateAt,
  watch.lastUpdated,
  watch.latestChangeAt,
  watch.updatedAt,
  watch.lastChecked,
  watch.createdAt,
].map(normalizeTimestamp).find(Boolean) || null;

export const migrateLegacyWatchUpdates = (watch, candidateUpdates = []) => {
  if (Object.prototype.hasOwnProperty.call(watch, 'updates')) {
    const replacementTimestamp = getLegacyUpdateTimestamp(watch);
    return normalizeUpdates(watch.updates).flatMap((update) => {
      if (update.timestamp !== LEGACY_EPOCH_SENTINEL) return update;
      return replacementTimestamp ? [{ ...update, timestamp: replacementTimestamp }] : [];
    });
  }

  const candidate = newestLegacyCandidate(candidateUpdates);
  const hasLegacyMeaningfulUpdate = Boolean(
    candidate
    || normalizeText(watch.latestChange)
    || ['new', 'updated'].includes(watch.currentStatus)
    || ['new', 'updated'].includes(watch.status),
  );
  if (!hasLegacyMeaningfulUpdate) return [];
  const timestamp = getLegacyUpdateTimestamp(watch, candidate);
  const rawMonitoringResult = candidate
    || watch.lastCheckResult
    || watch.lastCheckOutcome
    || watch.monitoringSnapshot
    || null;
  const initial = normalizeUpdate({
    id: candidate?.id || null,
    timestamp,
    sourceUrl: candidate?.url,
    sourceTitle: candidate?.title
      || watch.latestChange,
    sourceName: candidate?.source,
    summary: candidate?.excerpt
      || watch.latestChange
      || watch.currentSituation
      || watch.title
      || watch.request,
    status: ['candidate', 'unreviewed'].includes(candidate?.status)
      || ['new', 'updated'].includes(watch.status) ? 'new' : 'read',
    ...(rawMonitoringResult ? { rawMonitoringResult } : {}),
  });
  if (!initial) return [];
  if (!candidate?.id) {
    initial.id = `legacy-${hashText(`${watch.id || ''}\u0000${getUpdateIdentity(initial)}`)}`;
  }
  return [initial];
};
