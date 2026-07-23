import { getLocalDateBoundaries, getWatchCreationDate } from './watch-dates.js';

const getTimestamp = (...values) => {
  for (const value of values) {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return 0;
};

const creationTimestamp = (watch) => getWatchCreationDate(watch)?.getTime() || 0;
const updateTimestamp = (watch) => getTimestamp(watch.latestChangeAt, watch.updatedAt);
const activityTimestamp = (watch) => getTimestamp(
  watch.latestChangeAt,
  watch.updatedAt,
  watch.lastChecked,
) || creationTimestamp(watch);
const newestFirst = (getWatchTimestamp) => (first, second) => (
  getWatchTimestamp(second) - getWatchTimestamp(first)
);

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
    hasDisplayableUpdate(watch)
    && (watch.requiresAttention === true || watch.status === 'attention')
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
