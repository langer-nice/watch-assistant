import assert from 'node:assert/strict';
import test from 'node:test';
import { getWatchDetailPresentationSnapshot } from './watch-detail-presentation.js';
import { markUpdateAsRead } from './watch-updates.js';
import { definitions } from '../../server/test-support/watch-definition-fixtures.js';
import { getWatchStatusPresentation } from './watch-status-presentation.js';

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

// Persisted monitoring state and result classification are independent of sync.
const structured = () => ({...definitions()[1],id:'paused-fixture',status:'paused',monitoringState:'paused',monitoringAvailability:'saved',createdAt:'2026-01-01T00:00:00Z',updates:[]});
for (const changes of [
 {}, {status:'watching'},
 {lastCheckAttempt:{status:'succeeded'},updates:unreadWatch.updates},
]) test(`Structured paused state is not activated by hydration: ${JSON.stringify(changes)}`,()=>{
 const watch={...structured(),...changes},before=structuredClone(watch);
 assert.equal(getWatchDetailPresentationSnapshot(watch).classification,'paused');assert.deepEqual(watch,before);
 assert.deepEqual(getWatchStatusPresentation('paused',key=>key),{label:'statuses.paused',modifier:'stable'});
});
test('Structured monitoring is watching only for the explicit active scenario',()=>{
 const watch={...structured(),monitoringState:'monitoring',status:'watching',lastCheckAttempt:{status:'succeeded'}};
 assert.equal(getWatchDetailPresentationSnapshot(watch).classification,'watching');
});
for(const changes of [{actionRequired:true},{monitoringAvailability:'stale'},{status:'attention',requiresAttention:true},{status:'watching',monitoringState:'monitoring',lastCheckAttempt:{status:'failed'}}])test(`Structured attention remains visible: ${JSON.stringify(changes)}`,()=>{
 assert.equal(getWatchDetailPresentationSnapshot({...structured(),...changes}).classification,'attention');
});
test('legacy paused classification retains its existing behavior',()=>{
 assert.equal(getWatchDetailPresentationSnapshot({id:'legacy',status:'paused',monitoringState:'paused',createdAt:'2026-01-01T00:00:00Z',updates:[]}).classification,'watching');
});

test('missing persisted monitoring state without a successful check remains attention, not active',()=>{
 assert.equal(getWatchDetailPresentationSnapshot({...structured(),monitoringState:undefined}).classification,'attention');
});
