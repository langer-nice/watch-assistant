import { getLocalDateBoundaries, getWatchCreationDate } from './watch-dates.js';
import { getLatestUpdate } from './watch-updates.js';

const getTimestamp = (...values) => {
  for (const value of values) {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return 0;
};

const creationTimestamp = (watch) => getWatchCreationDate(watch)?.getTime() || 0;
const updateTimestamp = (watch) => getTimestamp(
  watch.lastUpdated,
  watch.latestChangeAt,
  watch.updatedAt,
);
const activityTimestamp = (watch) => getTimestamp(
  watch.latestChangeAt,
  watch.updatedAt,
  watch.lastChecked,
) || creationTimestamp(watch);
const newestFirst = (getWatchTimestamp) => (first, second) => (
  getWatchTimestamp(second) - getWatchTimestamp(first)
);

const TECHNICAL_MONITORING_STATES = new Set(['setup-required', 'unavailable', 'needs-attention']);
const TECHNICAL_MONITORING_REASONS = new Set([
  'monitoring-source-missing',
  'no-compatible-source',
  'source-persistently-unavailable',
]);

export const isUserActionRequired = (watch) => {
  if (watch?.actionRequired === true) return true;
  const isTechnical = TECHNICAL_MONITORING_STATES.has(watch?.monitoringStatus?.state)
    || TECHNICAL_MONITORING_REASONS.has(watch?.monitoringIssueReason)
    || TECHNICAL_MONITORING_REASONS.has(watch?.attentionReason);
  return !isTechnical && (watch?.requiresAttention === true || watch?.status === 'attention');
};

export const getLatestWatchUpdateTimestamp = (watch) => getTimestamp(
  getLatestUpdate(watch)?.timestamp,
  watch?.latestUpdateAt,
  watch?.lastUpdated,
  watch?.candidateUpdates?.[0]?.detectedAt,
  watch?.monitoringUpdates?.[0]?.detectedAt,
  watch?.latestChangeAt,
  watch?.updatedAt,
);

export const groupHomeWatches = (watches, {
  getMeaningfulUpdate,
  isDisplayableWatch = () => true,
  language = 'en',
  now = new Date(),
} = {}) => {
  const { attentionWatches, updatedWatches } = getBriefingWatchGroups(watches, {
    getMeaningfulUpdate,
    isDisplayableWatch,
  });
  const attention = attentionWatches.sort(newestFirst(activityTimestamp));
  const updates = updatedWatches.sort(newestFirst(getLatestWatchUpdateTimestamp));
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const today = [];
  const thisWeek = [];
  const undated = [];
  const months = new Map();
  updates.forEach((watch) => {
    const timestamp = getLatestWatchUpdateTimestamp(watch);
    if (!timestamp) {
      undated.push(watch);
      return;
    }
    const updatedAt = new Date(timestamp);
    if (updatedAt >= todayStart && updatedAt < tomorrowStart) {
      today.push(watch);
      return;
    }
    if (updatedAt >= weekStart && updatedAt < todayStart) {
      thisWeek.push(watch);
      return;
    }
    const key = `${updatedAt.getFullYear()}-${updatedAt.getMonth()}`;
    if (!months.has(key)) {
      months.set(key, {
        type: 'updatedMonth',
        timestamp: new Date(updatedAt.getFullYear(), updatedAt.getMonth(), 1).getTime(),
        label: new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
          month: 'long',
          year: 'numeric',
        }).format(updatedAt),
        watches: [],
      });
    }
    months.get(key).watches.push(watch);
  });
  return [
    { type: 'attention', watches: attention },
    { type: 'updatedToday', watches: today },
    { type: 'updatedThisWeek', watches: thisWeek },
    ...[...months.values()].sort((first, second) => second.timestamp - first.timestamp),
    { type: 'updated', watches: undated },
  ].filter((group) => group.watches.length);
};

export const groupWatches = (watches, {
  getMeaningfulUpdate,
  isDisplayableWatch = () => true,
  language = 'en',
  now = new Date(),
} = {}) => {
  const { attentionWatches, updatedWatches } = getBriefingWatchGroups(watches, {
    getMeaningfulUpdate,
    isDisplayableWatch,
  });
  const {
    today: todayStart,
    tomorrow: tomorrowStart,
    last7Days: last7DaysStart,
  } = getLocalDateBoundaries(now);

  const today = watches
    .filter((watch) => {
      const createdAt = getWatchCreationDate(watch);
      return createdAt
        && createdAt >= todayStart
        && createdAt < tomorrowStart;
    })
    .sort(newestFirst(creationTimestamp));
  const assignedIds = new Set(today.map((watch) => watch.id));
  const actionRequired = attentionWatches
    .filter((watch) => !assignedIds.has(watch.id))
    .sort(newestFirst(activityTimestamp));
  actionRequired.forEach((watch) => assignedIds.add(watch.id));
  const updated = updatedWatches
    .filter((watch) => !assignedIds.has(watch.id))
    .sort(newestFirst(updateTimestamp));
  updated.forEach((watch) => assignedIds.add(watch.id));
  const last7Days = watches
    .filter((watch) => {
      const createdAt = getWatchCreationDate(watch);
      return !assignedIds.has(watch.id)
        && createdAt
        && createdAt >= last7DaysStart
        && createdAt < todayStart;
    })
    .sort(newestFirst(creationTimestamp));
  last7Days.forEach((watch) => assignedIds.add(watch.id));

  const historicalMonths = new Map();
  const unknownDate = [];
  watches.forEach((watch) => {
    if (assignedIds.has(watch.id)) return;
    const createdAt = getWatchCreationDate(watch);
    if (!createdAt) {
      unknownDate.push(watch);
      return;
    }
    const monthKey = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
    if (!historicalMonths.has(monthKey)) {
      historicalMonths.set(monthKey, {
        type: 'historical',
        timestamp: new Date(createdAt.getFullYear(), createdAt.getMonth(), 1).getTime(),
        label: new Intl.DateTimeFormat(language, {
          month: 'long',
          year: 'numeric',
        }).format(createdAt),
        watches: [],
      });
    }
    historicalMonths.get(monthKey).watches.push(watch);
  });

  return [
    { type: 'actionRequired', watches: actionRequired },
    { type: 'updated', watches: updated },
    { type: 'today', watches: today },
    { type: 'last7Days', watches: last7Days },
    ...[...historicalMonths.values()]
      .sort((first, second) => second.timestamp - first.timestamp)
      .map((group) => ({
        ...group,
        watches: group.watches.sort(newestFirst(creationTimestamp)),
      })),
    { type: 'unknownDate', watches: unknownDate },
  ].filter((group) => group.watches.length > 0);
};

export const getUpdatedSeparatorWatchId = (groups, updatedWatches) => {
  const updatedIds = new Set(updatedWatches.map(({ id }) => id));
  const orderedWatches = groups.flatMap(({ watches }) => watches);
  const lastUpdatedIndex = orderedWatches.findLastIndex(({ id }) => updatedIds.has(id));
  return lastUpdatedIndex >= 0 && lastUpdatedIndex < orderedWatches.length - 1
    ? orderedWatches[lastUpdatedIndex].id
    : null;
};

export const getBriefingWatchGroups = (watches, {
  getMeaningfulUpdate,
  isDisplayableWatch = () => true,
} = {}) => {
  const activeWatches = watches.filter((watch) => watch.status !== 'completed');
  const hasDisplayableUpdate = (watch) => (
    isDisplayableWatch(watch)
    && Boolean(getMeaningfulUpdate?.(watch)?.trim())
  );
  const attentionWatches = activeWatches.filter((watch) => (
    isDisplayableWatch(watch)
    && isUserActionRequired(watch)
  ));
  const attentionIds = new Set(attentionWatches.map((watch) => watch.id));
  const updatedWatches = activeWatches.filter((watch) => (
    !attentionIds.has(watch.id)
    && hasDisplayableUpdate(watch)
  ));
  const visibleIds = new Set([
    ...attentionIds,
    ...updatedWatches.map((watch) => watch.id),
  ]);

  return {
    attentionWatches,
    updatedWatches,
    quietWatches: activeWatches.filter((watch) => !visibleIds.has(watch.id)),
  };
};

export const getHomeInboxSelection = (watches, options = {}) => {
  const briefing = getBriefingWatchGroups(watches, options);
  const attentionIds = new Set(briefing.attentionWatches.map(({ id }) => id));
  const updatedIds = new Set(briefing.updatedWatches.map(({ id }) => id));
  const inboxIds = new Set([...attentionIds, ...updatedIds]);
  return {
    ...briefing,
    watches: watches.filter((watch) => inboxIds.has(watch.id)),
    statusById: new Map([
      ...briefing.attentionWatches.map((watch) => [watch.id, 'attention']),
      ...briefing.updatedWatches.map((watch) => [watch.id, 'updated']),
    ]),
  };
};
