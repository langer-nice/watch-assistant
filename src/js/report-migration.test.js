import test from 'node:test';
import assert from 'node:assert/strict';

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('report-status migration v2 repairs v1 demotion and remains idempotent', async () => {
  const originalStorage = globalThis.localStorage;
  const stale = {
    id: 'user-watch', title: 'User Watch', status: 'updated', currentStatus: 'updated',
    latestChange: 'Useful historical description', updates: [], createdAt: '2026-08-01T00:00:00Z',
  };
  const genuine = {
    id: 'genuine-watch', title: 'Genuine Watch', status: 'updated', currentStatus: 'updated',
    createdAt: '2026-08-02T00:00:00Z',
    updates: [{
      id: 'result-1', timestamp: '2026-08-03T00:00:00Z', status: 'read',
      monitoringProvenance: {
        reportId: 'report-1', watchId: 'genuine-watch', resultId: 'result-1',
        detectedAt: '2026-08-03T00:00:00Z', reportedAt: '2026-08-03T01:00:00Z',
      },
    }],
  };
  const storedDemoResidue = {
    id: 'watch-002', title: 'Legacy demo residue', status: 'updated', updates: [],
  };
  const placeholder = {
    id: 'placeholder-watch', title: 'Placeholder', status: 'updated', currentStatus: 'updated',
    latestChange: 'Watch created', updates: [], createdAt: '2026-08-04T00:00:00Z',
  };
  globalThis.localStorage = createStorage({
    'watchAssistant.watches': JSON.stringify([
      { ...stale, status: 'watching', currentStatus: 'watching' },
      genuine, placeholder, storedDemoResidue,
    ]),
    'watchAssistant.htmlEntityDecodeVersion': '1',
    'watchAssistant.reportStatusMigrationVersion': '1',
  });
  try {
    const storage = await import('./watch-storage.js?report-status-migration');
    const first = storage.getWatches();
    const persistedAfterFirst = localStorage.getItem('watchAssistant.watches');
    const second = storage.getWatches();
    assert.equal(first.length, 3);
    assert.equal(first[0].id, stale.id);
    assert.equal(first[0].status, 'updated');
    assert.equal(first[0].currentStatus, 'updated');
    assert.equal(first[0].latestChange, stale.latestChange);
    assert.equal(first[1].status, 'watching');
    assert.equal(first[1].updates[0].monitoringProvenance.reportId, 'report-1');
    assert.equal(first[2].status, 'watching');
    assert.equal(first[2].latestChange, 'Watch created');
    assert.deepEqual(second, first);
    assert.equal(localStorage.getItem('watchAssistant.watches'), persistedAfterFirst);
    assert.equal(localStorage.getItem('watchAssistant.reportStatusMigrationVersion'), '2');
    assert.equal(storage.getDemoWatches().length > 0, true);
    assert.equal(storage.getWatches().some(({ id }) => id.startsWith('watch-00')), false);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
