import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReport } from './report-service.js';
import { getReportById, getReports, REPORTS_STORAGE_KEY } from './report-storage.js';
import {
  getCanonicalWatchClassification,
  WATCH_CLASSIFICATIONS,
} from './report-status.js';
import { MonitoringCheckError } from './watch-monitoring.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const createClock = () => {
  let value = Date.parse('2026-08-14T10:00:00Z');
  return () => new Date(value += 1000);
};

const createHarness = ({ outcomes = [] } = {}) => {
  const watch = {
    id: 'watch-1',
    title: 'Auditable Watch',
    category: 'news',
    status: 'watching',
    monitoringSource: { type: 'feed', url: 'https://example.com/feed.xml' },
    monitoringStatus: { state: 'active', reason: null },
    monitoringSnapshot: { checkedAt: '2026-08-14T09:00:00Z', itemIds: ['baseline'] },
    updates: [],
  };
  const watches = new Map([[watch.id, watch]]);
  let call = 0;
  const checkController = {
    check: async (watchId) => {
      const outcome = outcomes[call++] || { type: 'no-new-items', ids: [] };
      if (outcome.error) throw new MonitoringCheckError(outcome.error, 'safe failure');
      const checkedAt = new Date(Date.parse('2026-08-14T11:00:00Z') + call * 1000).toISOString();
      const current = watches.get(watchId);
      const additions = outcome.ids.map((id) => ({
        id,
        timestamp: checkedAt,
        sourceTitle: `Result ${id}`,
        summary: `Summary ${id}`,
        status: 'new',
      }));
      const next = {
        ...current,
        lastCheckAttempt: { status: 'succeeded', attemptedAt: checkedAt, outcome: outcome.type },
        monitoringStatus: { state: 'active', reason: null },
        updates: [...current.updates, ...additions],
      };
      watches.set(watchId, next);
      return {
        outcome: outcome.type,
        matchedItems: outcome.ids.map((id) => ({ id })),
        watch: next,
      };
    },
  };
  return {
    watch,
    watches,
    checkController,
    getWatch: (id) => watches.get(id),
    saveWatch: (id, changes) => {
      const next = { ...watches.get(id), ...changes };
      watches.set(id, next);
      return next;
    },
  };
};

test.beforeEach(() => {
  globalThis.localStorage = createStorage();
});

test.afterEach(() => {
  delete globalThis.localStorage;
});

test('five generations persist five distinct immutable report snapshots', async () => {
  const harness = createHarness({ outcomes: [
    { type: 'matching-items', ids: ['first'] },
    { type: 'no-new-items', ids: [] },
    { type: 'matching-items', ids: ['second'] },
    { type: 'no-new-items', ids: [] },
    { type: 'no-new-items', ids: [] },
  ] });
  const ids = ['report-1', 'report-2', 'report-3', 'report-4', 'report-5'];
  const generated = [];
  for (const id of ids) {
    generated.push(await generateReport({
      watches: [harness.watch],
      checkController: harness.checkController,
      getWatch: harness.getWatch,
      saveWatch: harness.saveWatch,
      clock: createClock(),
      idFactory: () => id,
    }));
  }

  assert.equal(getReports().length, 5);
  assert.equal(new Set(getReports().map(({ id }) => id)).size, 5);
  assert.equal(generated[0].entries[0].classification, WATCH_CLASSIFICATIONS.UPDATED);
  assert.equal(generated[2].entries[0].classification, WATCH_CLASSIFICATIONS.UPDATED);
  assert.deepEqual(getReportById('report-1').entries, generated[0].entries);

  harness.watches.get('watch-1').title = 'Changed later';
  harness.watches.get('watch-1').lastCheckAttempt = {
    status: 'failed', attemptedAt: '2026-08-14T12:00:00Z', code: 'MISSING_FEED_URL',
  };
  assert.equal(getReportById('report-1').entries[0].title, 'Auditable Watch');
  assert.equal(getReportById('report-1').entries[0].classification, WATCH_CLASSIFICATIONS.UPDATED);
  assert.equal(getReportById('report-1').entries[0].failureCode, null);
});

test('counts use actual terminal attempts and omit an unchecked Watch', async () => {
  const harness = createHarness();
  const paused = { id: 'paused', title: 'Paused', status: 'paused' };
  const report = await generateReport({
    watches: [harness.watch, paused],
    checkController: harness.checkController,
    getWatch: harness.getWatch,
    saveWatch: harness.saveWatch,
    clock: createClock(),
    idFactory: () => 'actual-attempts',
  });
  assert.deepEqual(report.watchIdsConsidered, ['watch-1', 'paused']);
  assert.deepEqual(report.watchIdsChecked, ['watch-1']);
  assert.equal(report.counts.considered, 2);
  assert.equal(report.counts.completed, 1);
  assert.equal(report.counts.succeeded, 1);
  assert.equal(report.counts.failed, 0);
});

test('missing source is skipped and its latest failed attempt takes precedence over stale content', async () => {
  const harness = createHarness({ outcomes: [{ type: 'no-new-items', ids: [] }] });
  const missing = {
    id: 'missing', title: 'Missing source', status: 'watching', updates: [{
      id: 'existing', timestamp: '2026-08-01T00:00:00Z', status: 'read',
      sourceTitle: 'Existing headline', summary: 'Existing meaningful summary',
    }],
    monitoringStatus: { state: 'setup-required', reason: 'no-compatible-source' },
  };
  harness.watches.set(missing.id, missing);
  const report = await generateReport({
    watches: [harness.watch, missing],
    checkController: harness.checkController,
    getWatch: harness.getWatch,
    saveWatch: harness.saveWatch,
    clock: createClock(),
    idFactory: () => 'partial',
  });
  assert.deepEqual(report.counts, {
    considered: 2, completed: 1, succeeded: 1, failed: 0, skipped: 1,
    attention: 0, new: 0, updated: 0, watching: 2,
  });
  const entry = report.entries.find(({ watchId }) => watchId === 'missing');
  assert.equal(entry.classification, 'watching');
  assert.equal(entry.updateTitle, '');
  assert.equal(entry.summary, '');
  assert.equal(entry.attemptStatus, 'skipped');
  assert.equal(entry.failureCode, 'MISSING_FEED_URL');
  assert.deepEqual(report.watchIdsChecked, ['watch-1']);
  assert.deepEqual(report.watchIdsSkipped, ['missing']);
  assert.equal(getCanonicalWatchClassification({
    ...missing,
    status: 'updated',
    currentStatus: 'updated',
    lastCheckAttempt: {
      status: 'failed', attemptedAt: '2026-08-14T11:00:00Z', code: 'MISSING_FEED_URL',
    },
  }, { reports: [report] }), WATCH_CLASSIFICATIONS.ATTENTION);
});

test('explicit user action takes precedence over meaningful update content', () => {
  assert.equal(getCanonicalWatchClassification({
    id: 'action', status: 'attention', requiresAttention: true,
    updates: [{ id: 'result', sourceTitle: 'Meaningful headline' }],
  }), WATCH_CLASSIFICATIONS.ATTENTION);
});

test('New retains the pre-change recent quiet Watch meaning', () => {
  assert.equal(getCanonicalWatchClassification({
    id: 'recent', status: 'watching', createdAt: new Date().toISOString(), updates: [],
  }), WATCH_CLASSIFICATIONS.NEW);
  assert.equal(getCanonicalWatchClassification({
    id: 'legacy', status: 'updated', currentStatus: 'updated', latestChange: 'Old text',
  }), WATCH_CLASSIFICATIONS.UPDATED);
});

test('compatible-source failure stays technical unless action is independently required', async () => {
  const harness = createHarness({ outcomes: [{ error: 'TIMEOUT' }] });
  const report = await generateReport({
    watches: [harness.watch], checkController: harness.checkController,
    getWatch: harness.getWatch, saveWatch: harness.saveWatch,
    clock: createClock(), idFactory: () => 'failed-check',
  });
  assert.equal(report.counts.completed, 1);
  assert.equal(report.counts.failed, 1);
  assert.equal(report.counts.skipped, 0);
  assert.equal(report.entries[0].classification, WATCH_CLASSIFICATIONS.WATCHING);
  assert.equal(report.entries[0].attemptStatus, 'failed');
});

test('single-flight generation returns one promise and persists one report', async () => {
  const harness = createHarness();
  let release;
  harness.checkController.check = () => new Promise((resolve) => {
    release = () => resolve({ outcome: 'no-new-items', matchedItems: [], watch: harness.watch });
  });
  const options = {
    watches: [harness.watch], checkController: harness.checkController,
    getWatch: harness.getWatch, saveWatch: harness.saveWatch,
    clock: createClock(), idFactory: () => 'single-flight',
  };
  const first = generateReport(options);
  const second = generateReport(options);
  assert.equal(first, second);
  release();
  await Promise.all([first, second]);
  assert.equal(JSON.parse(localStorage.getItem(REPORTS_STORAGE_KEY)).length, 1);
});
