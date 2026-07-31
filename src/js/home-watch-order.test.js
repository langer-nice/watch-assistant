import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOME_SORT_MODE,
  getHomeSortPreference,
  getHomeWatchActivityTimestamp,
  HOME_SORT_MODES,
  HOME_SORT_STORAGE_KEY,
  setHomeSortPreference,
  sortHomeWatches,
} from './home-watch-order.js';

const statuses = new Map([
  ['attention-new', 'attention'],
  ['attention-old', 'attention'],
  ['updated', 'updated'],
  ['updated-old', 'updated'],
  ['unchanged', 'unchanged'],
]);
const getStatus = ({ id }) => statuses.get(id) || 'unchanged';

const watches = [
  { id: 'unchanged', lastChecked: '2026-07-30T12:00:00Z' },
  { id: 'updated', latestUpdateAt: '2026-07-31T09:00:00Z' },
  { id: 'updated-old', latestUpdateAt: '2026-07-28T09:00:00Z' },
  { id: 'attention-old', latestChangeAt: '2026-07-29T08:00:00Z' },
  { id: 'attention-new', latestChangeAt: '2026-07-31T10:00:00Z' },
];

test('Needs attention first is the default and uses newest activity within each status', () => {
  const result = sortHomeWatches(watches, { getStatus, mode: 'invalid' });
  assert.deepEqual(result.map(({ id }) => id), [
    'attention-new', 'attention-old', 'updated', 'updated-old', 'unchanged',
  ]);
  assert.equal(DEFAULT_HOME_SORT_MODE, HOME_SORT_MODES.ATTENTION_FIRST);
});

test('Updated first reverses status priority and keeps every status visible', () => {
  const result = sortHomeWatches(watches, {
    getStatus,
    mode: HOME_SORT_MODES.UPDATED_FIRST,
  });
  assert.deepEqual(result.map(({ id }) => id), [
    'updated', 'updated-old', 'attention-new', 'attention-old', 'unchanged',
  ]);
});

test('date modes sort globally while all invalid timestamp forms remain visible and last', () => {
  const values = [
    { id: 'missing' },
    { id: 'empty', latestUpdateAt: '' },
    { id: 'invalid', lastChecked: 'not-a-date' },
    { id: 'zero', updatedAt: 0 },
    { id: 'epoch', latestChangeAt: '1970-01-01T00:00:00.000Z' },
    { id: 'older', latestChangeAt: '2026-07-20T10:00:00Z' },
    { id: 'newer', updates: [{ timestamp: '2026-07-31T10:00:00Z' }] },
  ];

  assert.deepEqual(
    sortHomeWatches(values, { mode: HOME_SORT_MODES.MOST_RECENT }).map(({ id }) => id),
    ['newer', 'older', 'empty', 'epoch', 'invalid', 'missing', 'zero'],
  );
  assert.deepEqual(
    sortHomeWatches(values, { mode: HOME_SORT_MODES.OLDEST_FIRST }).map(({ id }) => id),
    ['older', 'newer', 'empty', 'epoch', 'invalid', 'missing', 'zero'],
  );
});

test('Unix seconds and milliseconds resolve to the same meaningful activity timestamp', () => {
  const seconds = getHomeWatchActivityTimestamp({ latestUpdateAt: 1_790_000_000 });
  const milliseconds = getHomeWatchActivityTimestamp({ latestUpdateAt: 1_790_000_000_000 });
  assert.equal(seconds, milliseconds);
});

test('creation is used only when no valid monitoring or update activity exists', () => {
  assert.equal(
    getHomeWatchActivityTimestamp({
      createdAt: '2026-07-31T12:00:00Z',
      latestUpdateAt: '2026-07-30T12:00:00Z',
    }),
    Date.parse('2026-07-30T12:00:00Z'),
  );
  assert.equal(
    getHomeWatchActivityTimestamp({ createdAt: '2026-07-29T12:00:00Z' }),
    Date.parse('2026-07-29T12:00:00Z'),
  );
});

test('sorting returns a new array without mutating Watch order or data', () => {
  const original = structuredClone(watches);
  const result = sortHomeWatches(watches, { getStatus, mode: HOME_SORT_MODES.MOST_RECENT });
  assert.notEqual(result, watches);
  assert.deepEqual(watches, original);
});

test('a complete collection retains unchanged Watches in every sorting mode', () => {
  Object.values(HOME_SORT_MODES).forEach((mode) => {
    const result = sortHomeWatches(watches, { getStatus, mode });
    assert.deepEqual(
      new Set(result.map(({ id }) => id)),
      new Set(watches.map(({ id }) => id)),
    );
    assert.ok(result.some(({ id }) => id === 'unchanged'));
  });
});

test('sort preference is persisted, restored, and old Priority migrates safely', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(getHomeSortPreference(storage), HOME_SORT_MODES.ATTENTION_FIRST);
  assert.equal(
    setHomeSortPreference(HOME_SORT_MODES.OLDEST_FIRST, storage),
    HOME_SORT_MODES.OLDEST_FIRST,
  );
  assert.equal(values.get(HOME_SORT_STORAGE_KEY), HOME_SORT_MODES.OLDEST_FIRST);
  assert.equal(getHomeSortPreference(storage), HOME_SORT_MODES.OLDEST_FIRST);
  values.set(HOME_SORT_STORAGE_KEY, 'priority');
  assert.equal(getHomeSortPreference(storage), HOME_SORT_MODES.ATTENTION_FIRST);
  assert.equal(values.get(HOME_SORT_STORAGE_KEY), HOME_SORT_MODES.ATTENTION_FIRST);
  values.set(HOME_SORT_STORAGE_KEY, 'unsupported');
  assert.equal(getHomeSortPreference(storage), HOME_SORT_MODES.ATTENTION_FIRST);
});
