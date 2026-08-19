import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewTestWatches } from './preview-test-watches.js';
import { refreshLatestReport } from './report-service.js';
import { normalizeReport, REPORTS_STORAGE_KEY } from './report-storage.js';
import {
  getCanonicalStatusMap,
  getCanonicalWatchClassification,
  WATCH_CLASSIFICATIONS,
} from './report-status.js';
import {
  applyFeedCheckResult,
  createWatchCheckController,
  MonitoringCheckError,
} from './watch-monitoring.js';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const baseline = {
  id: 'lifecycle', title: 'Lifecycle Watch', status: 'watching',
  createdAt: '2026-08-01T00:00:00.000Z',
  monitoringSource: { type: 'feed', url: 'https://example.com/feed.xml' },
  monitoringSnapshot: { checkedAt: '2026-08-19T09:00:00.000Z', itemIds: ['baseline'] },
  seenMonitoringItemIds: ['baseline'],
  storyProfile: {
    primaryPeople: ['Ada Lovelace'],
    concepts: [{ label: 'Ada Lovelace', type: 'person' }],
  },
  updates: [],
};
const item = {
  id: 'development', title: 'Ada Lovelace archive announces a major development',
  excerpt: 'A major new development was announced for the Ada Lovelace archive.',
  url: 'https://example.com/development', source: 'Example',
  publishedAt: '2026-08-19T09:30:00.000Z',
};
const response = (checkedAt, items) => ({ checkedAt, items, source: { title: 'Example' } });
const store = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const seedReport = (watch) => normalizeReport({
  id: 'current', startedAt: NOW.toISOString(), completedAt: NOW.toISOString(),
  watchIdsConsidered: [watch.id], watchIdsChecked: [watch.id], watchIdsSkipped: [],
  attempts: [{ watchId: watch.id, status: 'succeeded', startedAt: NOW.toISOString(), completedAt: NOW.toISOString(), outcome: 'no-new-items', code: null, resultIds: [] }],
  entries: [{ watchId: watch.id, classification: 'watching', title: watch.title, category: 'general', checkedAt: NOW.toISOString(), attemptStatus: 'succeeded', outcome: 'no-new-items', resultIds: [] }],
});

test.beforeEach(() => { globalThis.localStorage = store(); });
test.afterEach(() => { delete globalThis.localStorage; });

test('update, no-change, and failure form one canonical, idempotent lifecycle', () => {
  const updateResult = applyFeedCheckResult(baseline, response('2026-08-19T10:00:00.000Z', [item]));
  const updated = { ...baseline, ...updateResult.changes };
  assert.equal(updateResult.outcome, 'matching-items');
  assert.equal(updated.updates.length, 1);
  assert.equal(updated.lastChecked, '2026-08-19T10:00:00.000Z');
  assert.deepEqual(updated.monitoringSnapshot.itemIds, ['development']);
  assert.equal(getCanonicalWatchClassification(updated, { now: NOW }), WATCH_CLASSIFICATIONS.UPDATED);
  assert.equal(getCanonicalWatchClassification(updated, { now: NOW }), WATCH_CLASSIFICATIONS.UPDATED);

  const noChangeResult = applyFeedCheckResult(updated, response('2026-08-19T11:00:00.000Z', [item]));
  const unchanged = { ...updated, ...noChangeResult.changes };
  assert.equal(noChangeResult.outcome, 'no-new-items');
  assert.equal(unchanged.updates.length, 1, 'historical update is preserved');
  assert.equal(unchanged.lastChecked, '2026-08-19T11:00:00.000Z');
  assert.deepEqual(unchanged.monitoringSnapshot.itemIds, ['development']);
  assert.equal(getCanonicalWatchClassification(unchanged, { now: NOW }), WATCH_CLASSIFICATIONS.WATCHING);

  const failed = {
    ...unchanged,
    lastCheckAttempt: { status: 'failed', attemptedAt: '2026-08-19T12:00:00.000Z', code: 'TIMEOUT' },
  };
  assert.equal(failed.lastChecked, unchanged.lastChecked, 'failure preserves last successful check time');
  assert.deepEqual(failed.monitoringSnapshot, unchanged.monitoringSnapshot, 'failure preserves baseline');
  assert.equal(getCanonicalWatchClassification(failed, { now: NOW }), WATCH_CLASSIFICATIONS.ATTENTION);
});

test('Check Now stores failure metadata without changing the valid snapshot or lastChecked', async () => {
  let watch = { ...baseline };
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch: (_id, changes) => { watch = { ...watch, ...changes }; return watch; },
    requestCheck: async () => { throw new MonitoringCheckError('TIMEOUT', 'safe'); },
    now: () => NOW,
  });
  await assert.rejects(controller.check(watch.id));
  assert.deepEqual(watch.monitoringSnapshot, baseline.monitoringSnapshot);
  assert.equal(watch.lastChecked, undefined);
  assert.deepEqual(watch.lastCheckAttempt, {
    status: 'failed', attemptedAt: NOW.toISOString(), code: 'TIMEOUT',
  });
  assert.equal(watch.monitoringFailure.code, 'TIMEOUT');
  assert.equal(getCanonicalWatchClassification(watch, { now: NOW }), WATCH_CLASSIFICATIONS.ATTENTION);
});

test('refresh replaces the current report once and removes stale update presentation', () => {
  const failed = {
    ...baseline,
    updates: [{ id: 'old', timestamp: '2026-08-18T10:00:00.000Z', sourceTitle: 'Old success', summary: 'Old successful update' }],
    lastCheckAttempt: { status: 'failed', attemptedAt: NOW.toISOString(), code: 'TIMEOUT' },
  };
  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify([seedReport(failed)]));
  const first = refreshLatestReport({ watches: [failed], now: () => NOW });
  const second = refreshLatestReport({ watches: [failed], now: () => NOW });
  assert.equal(JSON.parse(localStorage.getItem(REPORTS_STORAGE_KEY)).length, 1);
  assert.deepEqual(second, first);
  assert.equal(first.counts.attention, 1);
  assert.equal(first.counts.updated, 0);
  assert.equal(first.entries[0].classification, 'attention');
  assert.equal(first.entries[0].updateTitle, '');
  assert.equal(first.entries[0].summary, '');
  assert.equal(first.entries[0].failureCode, 'TIMEOUT');
});

test('every preview fixture has one mutually exclusive status shared by live views and report totals', () => {
  const watches = createPreviewTestWatches(NOW);
  const statusMap = getCanonicalStatusMap(watches, [], { now: NOW });
  const entries = watches.map((watch) => ({
    watchId: watch.id,
    classification: getCanonicalWatchClassification(watch, { now: NOW }),
  }));
  for (const watch of watches) {
    assert.equal(statusMap.get(watch.id), entries.find((entry) => entry.watchId === watch.id).classification);
  }
  const total = Object.values(WATCH_CLASSIFICATIONS)
    .reduce((count, status) => count + entries.filter((entry) => entry.classification === status).length, 0);
  assert.equal(total, watches.length);
  assert.deepEqual(
    entries.map(({ classification }) => classification),
    ['updated', 'watching', 'attention', 'updated', 'watching'],
  );
});

test('legacy stored update text remains readable while modern no-change state ignores it', () => {
  const legacy = { id: 'legacy', latestChange: 'A meaningful historical change' };
  assert.equal(getCanonicalWatchClassification(legacy, { now: NOW }), WATCH_CLASSIFICATIONS.UPDATED);
  assert.equal(getCanonicalWatchClassification({
    ...legacy,
    lastCheckAttempt: { status: 'succeeded', attemptedAt: NOW.toISOString(), outcome: 'no-new-items' },
  }, { now: NOW }), WATCH_CLASSIFICATIONS.WATCHING);
});
