import assert from 'node:assert/strict';
import test from 'node:test';
import { getWatchDetailPresentationSnapshot } from './watch-detail-presentation.js';
import { markUpdateAsRead } from './watch-updates.js';

const unreadWatch = {
  id: 'updated-watch',
  status: 'watching',
  createdAt: '2026-08-01T08:00:00.000Z',
  lastCheckAttempt: {
    status: 'succeeded', attemptedAt: '2026-08-02T08:00:00.000Z', outcome: 'matching-items',
  },
  updates: [{
    id: 'selected-update',
    timestamp: '2026-08-02T08:00:00.000Z',
    sourceTitle: 'Selected development',
    summary: 'Selected development',
    status: 'new',
  }],
};

test('first detail presentation remains Updated while its exact development is acknowledged', () => {
  const firstPresentation = getWatchDetailPresentationSnapshot(unreadWatch);
  const acknowledged = markUpdateAsRead(unreadWatch, firstPresentation.updateId);

  assert.deepEqual(firstPresentation, {
    classification: 'updated',
    updateId: 'selected-update',
  });
  assert.equal(firstPresentation.classification, 'updated');
  assert.equal(acknowledged.updates[0].status, 'read');
  assert.deepEqual(getWatchDetailPresentationSnapshot(acknowledged), {
    classification: 'watching',
    updateId: null,
  });
});

test('snapshot targets cannot acknowledge a concurrently arriving newer development', () => {
  const firstPresentation = getWatchDetailPresentationSnapshot(unreadWatch);
  const concurrent = {
    ...unreadWatch,
    updates: [...unreadWatch.updates, {
      id: 'newer-update',
      timestamp: '2026-08-03T08:00:00.000Z',
      sourceTitle: 'Newer development',
      summary: 'Newer development',
      status: 'new',
    }],
  };
  const acknowledged = markUpdateAsRead(concurrent, firstPresentation.updateId);

  assert.deepEqual(acknowledged.updates.map(({ id, status }) => ({ id, status })), [
    { id: 'selected-update', status: 'read' },
    { id: 'newer-update', status: 'new' },
  ]);
  assert.equal(getWatchDetailPresentationSnapshot(acknowledged).classification, 'updated');
});

test('non-Updated Watches never receive a temporary Updated presentation', () => {
  assert.equal(getWatchDetailPresentationSnapshot({
    id: 'watching', status: 'watching', lastCheckAttempt: { status: 'succeeded' }, updates: [],
  }).classification, 'watching');
  assert.equal(getWatchDetailPresentationSnapshot({
    ...unreadWatch, lastCheckAttempt: { status: 'failed' },
  }).classification, 'attention');
  assert.equal(getWatchDetailPresentationSnapshot({
    id: 'new', status: 'watching', createdAt: new Date().toISOString(), updates: [],
  }).classification, 'new');
});
