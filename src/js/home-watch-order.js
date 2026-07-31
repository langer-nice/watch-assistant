import { getWatchCreationDate, parseTimestampValue } from './watch-dates.js';
import { getLatestUpdate } from './watch-updates.js';

export const HOME_SORT_MODES = Object.freeze({
  ATTENTION_FIRST: 'needs-attention-first',
  UPDATED_FIRST: 'updated-first',
  MOST_RECENT: 'most-recent',
  OLDEST_FIRST: 'oldest-first',
});

export const DEFAULT_HOME_SORT_MODE = HOME_SORT_MODES.ATTENTION_FIRST;
export const HOME_SORT_STORAGE_KEY = 'watchAssistant.homeSort';

const VALID_SORT_MODES = new Set(Object.values(HOME_SORT_MODES));
const LEGACY_PRIORITY_MODE = 'priority';
const STATUS_PRIORITIES = Object.freeze({
  [HOME_SORT_MODES.ATTENTION_FIRST]: Object.freeze({ attention: 0, updated: 1 }),
  [HOME_SORT_MODES.UPDATED_FIRST]: Object.freeze({ updated: 0, attention: 1 }),
});

const ACTIVITY_FIELDS = [
  'latestUpdateAt',
  'lastUpdated',
  'latestChangeAt',
  'updatedAt',
  'lastChecked',
];

const getCollectionTimestamps = (watch, collection, fields) => (
  Array.isArray(watch?.[collection])
    ? watch[collection].flatMap((item) => fields.map((field) => item?.[field]))
    : []
);

const toSortableTimestamp = (value) => {
  const date = parseTimestampValue(value);
  const timestamp = date?.getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
};

export const normalizeHomeSortMode = (value) => (
  value === LEGACY_PRIORITY_MODE
    ? HOME_SORT_MODES.ATTENTION_FIRST
    : VALID_SORT_MODES.has(value) ? value : DEFAULT_HOME_SORT_MODE
);

export const getHomeSortPreference = (storage) => {
  try {
    const preferenceStorage = storage ?? globalThis.localStorage;
    const storedMode = preferenceStorage?.getItem(HOME_SORT_STORAGE_KEY);
    const mode = normalizeHomeSortMode(storedMode);
    if (storedMode === LEGACY_PRIORITY_MODE) {
      preferenceStorage?.setItem(HOME_SORT_STORAGE_KEY, mode);
    }
    return mode;
  } catch {
    return DEFAULT_HOME_SORT_MODE;
  }
};

export const setHomeSortPreference = (value, storage) => {
  const mode = normalizeHomeSortMode(value);
  try {
    const preferenceStorage = storage ?? globalThis.localStorage;
    preferenceStorage?.setItem(HOME_SORT_STORAGE_KEY, mode);
  } catch {
    // Sorting still works for this visit if browser storage is unavailable.
  }
  return mode;
};

/**
 * Home activity is the newest real update/change/check timestamp, with Watch creation as fallback.
 * All values pass through the shared timestamp parser; zero and legacy epoch sentinels are rejected.
 */
export const getHomeWatchActivityTimestamp = (watch) => {
  const activityValues = [
    ...ACTIVITY_FIELDS.map((field) => watch?.[field]),
    ...getCollectionTimestamps(watch, 'updates', ['timestamp', 'detectedAt', 'createdAt']),
    ...getCollectionTimestamps(watch, 'candidateUpdates', ['detectedAt', 'timestamp']),
    ...getCollectionTimestamps(watch, 'monitoringUpdates', ['detectedAt', 'timestamp']),
  ];
  const validActivityTimestamps = activityValues
    .map(toSortableTimestamp)
    .filter((timestamp) => timestamp !== null);
  if (validActivityTimestamps.length) return Math.max(...validActivityTimestamps);
  return toSortableTimestamp(getWatchCreationDate(watch));
};

export const getMeaningfulUpdateTimestamp = (watch) => {
  const persistedTimestamp = toSortableTimestamp(getLatestUpdate(watch)?.timestamp);
  if (persistedTimestamp !== null) return persistedTimestamp;
  const legacyValues = [
    watch?.latestUpdateAt,
    watch?.lastUpdated,
    ...getCollectionTimestamps(watch, 'candidateUpdates', ['detectedAt', 'timestamp']),
    ...getCollectionTimestamps(watch, 'monitoringUpdates', ['detectedAt', 'timestamp']),
    watch?.latestChangeAt,
    watch?.updatedAt,
  ];
  const legacyTimestamps = legacyValues
    .map(toSortableTimestamp)
    .filter((timestamp) => timestamp !== null);
  return legacyTimestamps.length ? Math.max(...legacyTimestamps) : null;
};

const compareFallback = (first, second) => {
  const firstId = typeof first.watch?.id === 'string' ? first.watch.id : '';
  const secondId = typeof second.watch?.id === 'string' ? second.watch.id : '';
  return firstId.localeCompare(secondId) || first.index - second.index;
};

const compareDates = (first, second, direction) => {
  if (first.timestamp === null && second.timestamp !== null) return 1;
  if (first.timestamp !== null && second.timestamp === null) return -1;
  if (first.timestamp !== null && second.timestamp !== null && first.timestamp !== second.timestamp) {
    return direction * (first.timestamp - second.timestamp);
  }
  return compareFallback(first, second);
};

export const sortHomeWatches = (watches, {
  getStatus = () => 'unchanged',
  mode = DEFAULT_HOME_SORT_MODE,
} = {}) => {
  const normalizedMode = normalizeHomeSortMode(mode);
  const entries = watches.map((watch, index) => ({
    watch,
    index,
    status: getStatus(watch),
    timestamp: null,
  }));
  entries.forEach((entry) => {
    entry.timestamp = entry.status === 'updated' && STATUS_PRIORITIES[normalizedMode]
      ? getMeaningfulUpdateTimestamp(entry.watch)
      : getHomeWatchActivityTimestamp(entry.watch);
  });

  entries.sort((first, second) => {
    const statusPriorities = STATUS_PRIORITIES[normalizedMode];
    if (statusPriorities) {
      const statusDifference = (statusPriorities[first.status] ?? Number.MAX_SAFE_INTEGER)
        - (statusPriorities[second.status] ?? Number.MAX_SAFE_INTEGER);
      return statusDifference || compareDates(first, second, -1);
    }
    return compareDates(
      first,
      second,
      normalizedMode === HOME_SORT_MODES.MOST_RECENT ? -1 : 1,
    );
  });

  return entries.map(({ watch }) => watch);
};

export const orderAllWatchGroups = (groups, {
  attentionWatches = [],
  updatedWatches = [],
  orderedWatches = [],
  mode = DEFAULT_HOME_SORT_MODE,
} = {}) => {
  const normalizedMode = normalizeHomeSortMode(mode);
  const orderById = new Map(orderedWatches.map((watch, index) => [watch.id, index]));
  const sortBySelectedOrder = (watches) => [...watches].sort((first, second) => (
    orderById.get(first.id) - orderById.get(second.id)
  ));
  const statusMode = [
    HOME_SORT_MODES.ATTENTION_FIRST,
    HOME_SORT_MODES.UPDATED_FIRST,
  ].includes(normalizedMode);

  if (statusMode) {
    const statusIds = new Set([
      ...attentionWatches.map(({ id }) => id),
      ...updatedWatches.map(({ id }) => id),
    ]);
    const statusGroups = [
      { type: 'actionRequired', watches: sortBySelectedOrder(attentionWatches) },
      { type: 'updated', watches: sortBySelectedOrder(updatedWatches) },
    ].filter((group) => group.watches.length);
    if (normalizedMode === HOME_SORT_MODES.UPDATED_FIRST) statusGroups.reverse();
    const quietGroups = groups
      .map((group) => ({
        ...group,
        watches: sortBySelectedOrder(group.watches.filter(({ id }) => !statusIds.has(id))),
      }))
      .filter((group) => group.watches.length);
    return [...statusGroups, ...quietGroups];
  }

  return groups
    .map((group) => ({ ...group, watches: sortBySelectedOrder(group.watches) }))
    .sort((first, second) => (
      orderById.get(first.watches[0]?.id) - orderById.get(second.watches[0]?.id)
    ));
};
