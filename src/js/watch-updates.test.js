import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addUpdateToWatch,
  getLatestUpdate,
  getUnreadUpdates,
  markUpdateAsRead,
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
  assert.equal(result.currentStatus, 'watching');
  assert.equal(persisted, result);
  assert.equal(result.id, 'watch-1');
});

