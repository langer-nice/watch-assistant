import assert from 'node:assert/strict';
import test from 'node:test';
import { getBriefingWatchGroups } from './watch-grouping.js';
import {
  applyFeedCheckResult,
  createWatchCheckController,
  getMonitoringUpdates,
  MAX_MONITORING_UPDATES,
  MAX_SEEN_ITEM_IDS,
  normalizeFeedUrl,
  requestFeedCheck,
} from './watch-monitoring.js';

const checkedAt = '2026-07-26T12:00:00.000Z';
const item = (id, title = `Item ${id}`) => ({
  id,
  title,
  url: `https://example.com/${id}`,
  publishedAt: checkedAt,
  source: 'Example News',
  author: null,
  excerpt: `Excerpt ${id}`,
});
const response = (ids, date = checkedAt) => ({
  source: { title: 'Example News', url: 'https://example.com/' },
  checkedAt: date,
  items: ids.map((id) => item(id)),
});

test('first successful check creates a baseline without false new updates', () => {
  const result = applyFeedCheckResult({ id: 'watch-1' }, response(['a', 'b']));
  assert.equal(result.outcome, 'baseline');
  assert.deepEqual(result.newItems, []);
  assert.deepEqual(result.changes.monitoringSnapshot.itemIds, ['a', 'b']);
  assert.deepEqual(result.changes.monitoringUpdates, []);
  assert.equal(result.changes.lastChecked, checkedAt);
});

test('later checks detect only unseen IDs and repeated checks do not duplicate updates', () => {
  const baseline = applyFeedCheckResult({ id: 'watch-1' }, response(['a', 'b'])).changes;
  const watch = { id: 'watch-1', ...baseline };
  const second = applyFeedCheckResult(watch, response(['c', 'a', 'b']));
  assert.equal(second.outcome, 'new-items');
  assert.deepEqual(second.newItems.map(({ id }) => id), ['c']);
  assert.deepEqual(second.changes.monitoringUpdates.map(({ id }) => id), ['c']);

  const repeated = applyFeedCheckResult(
    { ...watch, ...second.changes },
    response(['c', 'a', 'b'], '2026-07-26T13:00:00.000Z'),
  );
  assert.equal(repeated.outcome, 'no-new-items');
  assert.deepEqual(repeated.changes.monitoringUpdates.map(({ id }) => id), ['c']);
});

test('snapshot and update storage remain bounded', () => {
  const oldIds = Array.from({ length: MAX_SEEN_ITEM_IDS }, (_, index) => `old-${index}`);
  const oldUpdates = Array.from({ length: MAX_MONITORING_UPDATES }, (_, index) => ({
    ...item(`update-${index}`),
    status: 'unreviewed',
    detectedAt: checkedAt,
  }));
  const result = applyFeedCheckResult({
    id: 'watch-1',
    monitoringSnapshot: { itemIds: ['previous'] },
    seenMonitoringItemIds: oldIds,
    monitoringUpdates: oldUpdates,
  }, response(['new']));
  assert.equal(result.changes.seenMonitoringItemIds.length, MAX_SEEN_ITEM_IDS);
  assert.equal(result.changes.monitoringUpdates.length, MAX_MONITORING_UPDATES);
  assert.equal(result.changes.monitoringUpdates[0].id, 'new');
});

test('controller preserves a snapshot after failure and restores checking state', async () => {
  const original = {
    id: 'watch-1',
    feedUrl: 'https://example.com/feed.xml',
    monitoringSnapshot: { itemIds: ['a'], items: [item('a')], checkedAt },
  };
  let watch = structuredClone(original);
  let saveCount = 0;
  const states = [];
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch: (_id, changes) => {
      saveCount += 1;
      watch = { ...watch, ...changes };
      return watch;
    },
    requestCheck: async () => {
      throw new Error('network detail');
    },
  });

  await assert.rejects(controller.check('watch-1', {
    onCheckingChange: (state) => states.push(state),
  }));
  assert.deepEqual(states, [true, false]);
  assert.equal(saveCount, 0);
  assert.deepEqual(watch.monitoringSnapshot, original.monitoringSnapshot);
  assert.equal(controller.isChecking('watch-1'), false);
});

test('controller prevents concurrent checks and restores state after success', async () => {
  let resolveRequest;
  let requestCount = 0;
  let watch = { id: 'watch-1', feedUrl: 'https://example.com/feed.xml' };
  const states = [];
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch: (_id, changes) => {
      watch = { ...watch, ...changes };
      return watch;
    },
    requestCheck: () => {
      requestCount += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
  });
  const first = controller.check('watch-1', {
    onCheckingChange: (state) => states.push(state),
  });
  const second = controller.check('watch-1');
  assert.equal(first, second);
  assert.equal(requestCount, 1);
  assert.equal(controller.isChecking('watch-1'), true);
  resolveRequest(response(['a']));
  await first;
  assert.deepEqual(states, [true, false]);
  assert.equal(controller.isChecking('watch-1'), false);
  assert.equal(watch.lastChecked, checkedAt);
});

test('new updates survive serialization and are available to the Home grouping', () => {
  const baseline = applyFeedCheckResult({ id: 'watch-1' }, response(['a'])).changes;
  const result = applyFeedCheckResult(
    { id: 'watch-1', title: 'A feed Watch', status: 'watching', ...baseline },
    response(['b', 'a']),
  );
  const reloaded = JSON.parse(JSON.stringify({
    id: 'watch-1',
    title: 'A feed Watch',
    status: 'watching',
    ...baseline,
    ...result.changes,
  }));
  assert.deepEqual(getMonitoringUpdates(reloaded).map(({ id }) => id), ['b']);
  const groups = getBriefingWatchGroups([reloaded], {
    getMeaningfulUpdate: (watch) => getMonitoringUpdates(watch)[0]?.title || '',
  });
  assert.deepEqual(groups.updatedWatches.map(({ id }) => id), ['watch-1']);
});

test('feed URL support is explicit and rejects unusable values', () => {
  assert.equal(normalizeFeedUrl('https://example.com/feed.xml'), 'https://example.com/feed.xml');
  assert.equal(normalizeFeedUrl('http://example.com/feed'), 'http://example.com/feed');
  assert.equal(normalizeFeedUrl('file:///tmp/feed.xml'), null);
  assert.equal(normalizeFeedUrl('https://user:pass@example.com/feed'), null);
  assert.equal(normalizeFeedUrl(''), null);
});

test('checking a Watch without a usable feed reports the visible missing-feed state', async () => {
  await assert.rejects(
    requestFeedCheck(''),
    (error) => error?.code === 'MISSING_FEED_URL',
  );
});
