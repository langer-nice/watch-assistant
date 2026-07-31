import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addUpdateToWatch,
  getLatestUpdate,
  getUnreadUpdates,
  getWatchUpdates,
  markUpdateAsRead,
  markUpdatesAsRead,
  migrateLegacyWatchUpdates,
  normalizeUpdate,
} from './watch-updates.js';

const update = (id, timestamp, overrides = {}) => ({
  id,
  timestamp,
  sourceUrl: `https://news.example.com/${id}`,
  sourceTitle: `Story ${id}`,
  summary: `Summary ${id}`,
  status: 'new',
  ...overrides,
});

test('adds multiple Updates chronologically without overwriting Watch metadata', () => {
  const original = { id: 'watch-1', title: 'Long-lived Watch', currentStatus: 'watching', updates: [] };
  const newestFirst = addUpdateToWatch(
    addUpdateToWatch(original, update('second', '2026-07-28T12:00:00Z')),
    update('first', '2026-07-28T10:00:00Z'),
  );

  assert.equal(newestFirst.title, original.title);
  assert.deepEqual(newestFirst.updates.map(({ id }) => id), ['first', 'second']);
  assert.equal(newestFirst.currentStatus, 'updated');
  assert.equal(newestFirst.lastUpdated, '2026-07-28T12:00:00.000Z');
  assert.equal(newestFirst.updates[0].sourceDomain, 'news.example.com');
});

test('rejects the same monitoring Update when it is processed more than once', () => {
  const watch = addUpdateToWatch(
    { id: 'watch-1', currentStatus: 'watching', updates: [] },
    update('result-1', '2026-07-28T10:00:00Z', { rawMonitoringResult: { id: 'result-1' } }),
  );
  const repeated = addUpdateToWatch(watch, update('result-1', '2026-07-28T11:00:00Z'));

  assert.equal(repeated.updates.length, 1);
  assert.deepEqual(repeated.updates[0].rawMonitoringResult, { id: 'result-1' });
});

test('gets latest and unread Updates safely in chronological order', () => {
  const watch = {
    updates: [
      update('latest', '2026-07-28T12:00:00Z', { status: 'read' }),
      update('oldest', '2026-07-28T08:00:00Z'),
      update('middle', '2026-07-28T10:00:00Z'),
    ],
  };

  assert.equal(getLatestUpdate(watch).id, 'latest');
  assert.deepEqual(getUnreadUpdates(watch).map(({ id }) => id), ['oldest', 'middle']);
  assert.equal(getLatestUpdate({ updates: [] }), null);
  assert.equal(getLatestUpdate(null), null);
});

test('marks only the requested Update read, preserves history and persists the Watch', () => {
  const watch = {
    id: 'watch-1',
    currentStatus: 'updated',
    updates: [
      update('first', '2026-07-28T08:00:00Z', { status: 'read' }),
      update('second', '2026-07-28T10:00:00Z'),
    ],
  };
  let persisted = null;
  const result = markUpdateAsRead(watch, 'second', {
    persist: (updatedWatch) => { persisted = updatedWatch; },
  });

  assert.deepEqual(result.updates.map(({ id, status }) => ({ id, status })), [
    { id: 'first', status: 'read' },
    { id: 'second', status: 'read' },
  ]);
  assert.equal(result.currentStatus, 'updated');
  assert.equal(result.unreadUpdateCount, 0);
  assert.equal(persisted, result);
  assert.equal(result.id, 'watch-1');
});

test('marks multiple displayed Updates read in one persisted transition', () => {
  const watch = {
    id: 'watch-batch',
    currentStatus: 'updated',
    unreadUpdateCount: 3,
    updates: [
      update('first', '2026-07-28T08:00:00Z'),
      update('second', '2026-07-28T10:00:00Z'),
      update('third', '2026-07-28T12:00:00Z'),
    ],
  };
  let persistCount = 0;
  const result = markUpdatesAsRead(watch, ['first', 'third'], {
    persist: () => { persistCount += 1; },
  });

  assert.deepEqual(result.updates.map(({ status }) => status), ['read', 'new', 'read']);
  assert.equal(result.unreadUpdateCount, 1);
  assert.equal(result.currentStatus, 'updated');
  assert.equal(persistCount, 1);
});

test('a later detection becomes unread without reopening previously read Updates', () => {
  const readWatch = markUpdatesAsRead({
    id: 'watch-later',
    currentStatus: 'updated',
    updates: [update('first', '2026-07-28T08:00:00Z')],
  }, ['first']);
  const result = addUpdateToWatch(readWatch, update('later', '2026-07-29T08:00:00Z'));

  assert.deepEqual(result.updates.map(({ id, status }) => ({ id, status })), [
    { id: 'first', status: 'read' },
    { id: 'later', status: 'new' },
  ]);
  assert.equal(result.unreadUpdateCount, 1);
  assert.equal(result.currentStatus, 'updated');
});

test('duplicate detections preserve an existing read state', () => {
  const watch = {
    id: 'watch-duplicate-read',
    currentStatus: 'updated',
    updates: [update('same', '2026-07-28T08:00:00Z', { status: 'read' })],
  };
  const result = addUpdateToWatch(watch, update('same', '2026-07-28T08:00:00Z'));

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].status, 'read');
  assert.equal(result.unreadUpdateCount, 0);
});

test('empty and malformed Update histories remain safe to render', () => {
  assert.deepEqual(getWatchUpdates({ updates: [null, {}, { timestamp: 'not-a-date' }] }), []);
  assert.deepEqual(getUnreadUpdates({ updates: 'not-an-array' }), []);
  assert.equal(markUpdatesAsRead(null, ['missing']), null);
});

test('legacy migration never invents a 1970 Update when no timestamp exists', () => {
  assert.deepEqual(migrateLegacyWatchUpdates({
    id: 'undated-legacy',
    title: 'Undated legacy Watch',
    latestChange: 'A stored change without a date.',
    status: 'updated',
  }), []);
});

test('legacy epoch sentinels use a meaningful stored Watch date or are removed', () => {
  const sentinelUpdate = {
    id: 'legacy-update',
    timestamp: '1970-01-01T00:00:00.000Z',
    sourceTitle: 'Existing card content',
    status: 'new',
  };
  const seconds = Date.parse('2026-07-30T10:00:00.000Z') / 1_000;

  assert.equal(migrateLegacyWatchUpdates({
    id: 'repairable',
    createdAt: seconds,
    updates: [sentinelUpdate],
  })[0].timestamp, '2026-07-30T10:00:00.000Z');
  assert.deepEqual(migrateLegacyWatchUpdates({
    id: 'undated',
    updates: [sentinelUpdate],
  }), []);
});

test('Update timestamps accept Unix seconds and milliseconds consistently', () => {
  const expected = '2026-07-31T08:00:00.000Z';
  const milliseconds = Date.parse(expected);
  const seconds = milliseconds / 1_000;

  assert.equal(normalizeUpdate({ id: 'seconds', timestamp: seconds }).timestamp, expected);
  assert.equal(normalizeUpdate({ id: 'milliseconds', timestamp: milliseconds }).timestamp, expected);
  for (const timestamp of [undefined, null, '', 'invalid', 0, '0']) {
    assert.equal(normalizeUpdate({ id: 'invalid', timestamp }), null);
  }
});
