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
  briefingGeneratedAt,
  getMeaningfulUpdate,
  language = 'en',
  now = new Date(),
} = {}) => {
  const briefingTimestamp = getTimestamp(briefingGeneratedAt);
  const requiresAction = (watch) => (
    watch.status === 'attention' || watch.requiresAttention === true
  );
  const hasMeaningfulUpdate = (watch) => {
    const timestamp = updateTimestamp(watch);
    return Boolean(getMeaningfulUpdate?.(watch)?.trim())
      && timestamp > 0
      && (watch.status === 'updated' || timestamp > briefingTimestamp);
  };
  const wasCreatedToday = (watch) => {
    const createdAt = new Date(watch.createdAt);
    return !Number.isNaN(createdAt.getTime())
      && createdAt.getFullYear() === now.getFullYear()
      && createdAt.getMonth() === now.getMonth()
      && createdAt.getDate() === now.getDate();
  };

  const actionRequired = watches
    .filter(requiresAction)
    .sort(newestFirst(activityTimestamp));
  const assignedIds = new Set(actionRequired.map((watch) => watch.id));
  const updated = watches
    .filter((watch) => !assignedIds.has(watch.id) && hasMeaningfulUpdate(watch))
    .sort(newestFirst(updateTimestamp));
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
