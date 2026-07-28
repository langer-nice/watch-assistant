const UPDATE_STATUSES = new Set(['new', 'read']);

const normalizeText = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalizeTimestamp = (value) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
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

export const normalizeUpdate = (update, { fallbackTimestamp = null } = {}) => {
  if (!update || typeof update !== 'object') return null;
  const timestamp = normalizeTimestamp(
    update.timestamp || update.detectedAt || update.publishedAt || fallbackTimestamp,
  );
  if (!timestamp) return null;

  const sourceUrl = normalizeText(update.sourceUrl || update.url);
  const sourceTitle = normalizeText(update.sourceTitle || update.title);
  const summary = normalizeText(update.summary || update.excerpt || update.title);
  const sourceDomain = normalizeText(update.sourceDomain) || getSourceDomain(sourceUrl);
  const status = UPDATE_STATUSES.has(update.status)
    ? update.status
    : ['candidate', 'unreviewed', 'updated'].includes(update.status) ? 'new' : 'read';
  const generatedIdentity = [timestamp, sourceUrl, sourceTitle, summary]
    .map((value) => value || '').join('\u0000');
  const id = normalizeText(update.id) || `update-${hashText(generatedIdentity)}`;

  return {
    id,
    timestamp,
    sourceUrl,
    sourceTitle,
    sourceDomain,
    summary,
    status,
    ...('rawMonitoringResult' in update && update.rawMonitoringResult != null
      ? { rawMonitoringResult: update.rawMonitoringResult }
      : {}),
  };
};

const normalizeUpdates = (updates) => {
  const seenIds = new Set();
  const seenResults = new Set();
  return (Array.isArray(updates) ? updates : [])
    .map((update) => normalizeUpdate(update))
    .filter((update) => {
      if (!update) return false;
      const identity = getUpdateIdentity(update);
      if (seenIds.has(update.id) || seenResults.has(identity)) return false;
      seenIds.add(update.id);
      seenResults.add(identity);
      return true;
    })
    .sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp));
};

export const getLatestUpdate = (watch) => {
  const updates = normalizeUpdates(watch?.updates);
  return updates[updates.length - 1] || null;
};

export const getUnreadUpdates = (watch) => (
  normalizeUpdates(watch?.updates).filter(({ status }) => status === 'new')
);

export const addUpdateToWatch = (watch, update) => {
  if (!watch || typeof watch !== 'object') return watch;
  const normalizedUpdate = normalizeUpdate(update);
  if (!normalizedUpdate) return watch;

  const updates = normalizeUpdates(watch.updates);
  const identity = getUpdateIdentity(normalizedUpdate);
  const duplicate = updates.some((existing) => (
    existing.id === normalizedUpdate.id || getUpdateIdentity(existing) === identity
  ));
  if (duplicate) return {
    ...watch,
    updates,
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
    updates,
  };
};

export const markUpdateAsRead = (watch, updateId, { persist } = {}) => {
  if (!watch || typeof watch !== 'object' || !normalizeText(updateId)) return watch;
  let changed = false;
  const updates = normalizeUpdates(watch.updates).map((update) => {
    if (update.id !== updateId || update.status === 'read') return update;
    changed = true;
    return { ...update, status: 'read' };
  });
  if (!changed) return watch;

  const hasUnreadUpdates = updates.some(({ status }) => status === 'new');
  const updatedWatch = {
    ...watch,
    currentStatus: !hasUnreadUpdates && watch.currentStatus === 'updated'
      ? 'watching'
      : watch.currentStatus || watch.status || 'watching',
    updates,
  };
  if (typeof persist === 'function') persist(updatedWatch);
  return updatedWatch;
};

const newestLegacyCandidate = (candidateUpdates) => [...candidateUpdates]
  .sort((first, second) => (
    Date.parse(second?.detectedAt || second?.publishedAt || 0)
    - Date.parse(first?.detectedAt || first?.publishedAt || 0)
  ))[0] || null;

export const migrateLegacyWatchUpdates = (watch, candidateUpdates = []) => {
  if (Object.prototype.hasOwnProperty.call(watch, 'updates')) {
    return normalizeUpdates(watch.updates);
  }

  const candidate = newestLegacyCandidate(candidateUpdates);
  const timestamp = [
    candidate?.detectedAt,
    candidate?.publishedAt,
    watch.latestUpdateAt,
    watch.latestChangeAt,
    watch.lastChecked,
    watch.sourcePublishedAt,
    watch.createdAt,
  ].map(normalizeTimestamp).find(Boolean) || '1970-01-01T00:00:00.000Z';
  const rawMonitoringResult = candidate
    || watch.lastCheckResult
    || watch.lastCheckOutcome
    || watch.monitoringSnapshot
    || null;
  const initial = normalizeUpdate({
    id: candidate?.id || null,
    timestamp,
    sourceUrl: candidate?.url || watch.sourceUrl || watch.storyProfile?.sourceArticle?.url,
    sourceTitle: candidate?.title
      || watch.sourceTitle
      || watch.storyProfile?.sourceArticle?.title
      || watch.title,
    summary: candidate?.excerpt
      || watch.latestChange
      || watch.monitoringSummary
      || watch.storyProfile?.storySummary
      || watch.currentSituation
      || watch.sourceTitle
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

