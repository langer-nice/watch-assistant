const getTimestamp = (...values) => {
  for (const value of values) {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return 0;
};

const creationTimestamp = (watch) => getTimestamp(watch.createdAt);
const updateTimestamp = (watch) => getTimestamp(watch.latestChangeAt, watch.updatedAt);
const activityTimestamp = (watch) => getTimestamp(
  watch.latestChangeAt,
  watch.updatedAt,
  watch.lastChecked,
  watch.createdAt,
);
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
  const wasCreatedToday = (watch) => {
    const createdAt = new Date(watch.createdAt);
    return !Number.isNaN(createdAt.getTime())
      && createdAt.getFullYear() === now.getFullYear()
      && createdAt.getMonth() === now.getMonth()
      && createdAt.getDate() === now.getDate();
  };

  const actionRequired = attentionWatches.sort(newestFirst(activityTimestamp));
  const assignedIds = new Set(actionRequired.map((watch) => watch.id));
  const updated = updatedWatches.sort(newestFirst(updateTimestamp));
  updated.forEach((watch) => assignedIds.add(watch.id));
  const newWatches = watches
    .filter((watch) => !assignedIds.has(watch.id) && wasCreatedToday(watch))
    .sort(newestFirst(creationTimestamp));
  newWatches.forEach((watch) => assignedIds.add(watch.id));

  const historicalMonths = new Map();
  const watchesWithoutCreationDate = [];
  watches.forEach((watch) => {
    if (assignedIds.has(watch.id)) return;
    const createdAt = new Date(watch.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      watchesWithoutCreationDate.push(watch);
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
    { type: 'new', watches: newWatches },
    ...[...historicalMonths.values()]
      .sort((first, second) => second.timestamp - first.timestamp)
      .map((group) => ({
        ...group,
        watches: group.watches.sort(newestFirst(creationTimestamp)),
      })),
    { type: 'older', watches: watchesWithoutCreationDate },
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
