import { getWatchCreationDate, parseTimestampValue } from './watch-dates.js';
import { getWatchUpdates } from './watch-updates.js';

const normalizeEventTimestamp = (...values) => {
  for (const value of values) {
    const timestamp = parseTimestampValue(value);
    if (timestamp) return timestamp.toISOString();
  }
  return null;
};

const isCreatedEvent = (event) => (
  event?.type === 'created'
  || event?.labelKey === 'watchData.created'
  || /^(watch created|watch créée)$/i.test(String(event?.label || '').trim())
);

const compareEvents = (first, second) => {
  if (first.type === 'created' && second.type !== 'created') return -1;
  if (second.type === 'created' && first.type !== 'created') return 1;
  const firstTime = first.timestamp ? Date.parse(first.timestamp) : null;
  const secondTime = second.timestamp ? Date.parse(second.timestamp) : null;
  if (firstTime !== null && secondTime !== null && firstTime !== secondTime) {
    return firstTime - secondTime;
  }
  return first.order - second.order;
};

export const getWatchTimelineEvents = (watch) => {
  if (!watch || typeof watch !== 'object') return [];

  const persistedTimeline = Array.isArray(watch.timeline) ? watch.timeline : [];
  const events = persistedTimeline
    .filter((event) => event && typeof event === 'object')
    .map((event, index) => ({
      type: isCreatedEvent(event) ? 'created' : 'lifecycle',
      timestamp: normalizeEventTimestamp(event.timestamp, event.date, event.createdAt),
      dateKey: event.dateKey || null,
      source: event,
      order: index,
    }));

  if (!events.some(({ type }) => type === 'created')) {
    const creationDate = getWatchCreationDate(watch);
    if (creationDate) {
      events.unshift({
        type: 'created',
        timestamp: creationDate.toISOString(),
        dateKey: null,
        source: null,
        order: -1,
      });
    }
  }

  const persistedUpdateIds = new Set(events.flatMap(({ source }) => {
    const updateId = source?.updateId
      || source?.monitoringUpdateId
      || (source?.type === 'update' ? source.id : null);
    return updateId ? [String(updateId)] : [];
  }));
  const updateEvents = getWatchUpdates(watch)
    .filter(({ id }) => !persistedUpdateIds.has(id))
    .map((update, index) => ({
      type: 'update',
      timestamp: update.timestamp,
      dateKey: null,
      source: update,
      order: persistedTimeline.length + index,
    }));

  return [...events, ...updateEvents].sort(compareEvents);
};
