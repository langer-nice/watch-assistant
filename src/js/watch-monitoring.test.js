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
  matchFeedItemToStory,
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
  const watch = {
    id: 'watch-1',
    storyProfile: { concepts: [{ label: 'Item c', type: 'organization' }] },
    ...baseline,
  };
  const second = applyFeedCheckResult(watch, response(['c', 'a', 'b']));
  assert.equal(second.outcome, 'matching-items');
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
    storyProfile: { concepts: [{ label: 'Item new', type: 'organization' }] },
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
  assert.equal(saveCount, 1);
  assert.deepEqual(watch.monitoringSnapshot, original.monitoringSnapshot);
  assert.equal(watch.monitoringFailure.consecutiveCount, 1);
  assert.equal(watch.requiresAttention, undefined);
  assert.equal(controller.isChecking('watch-1'), false);
});

test('three consecutive failures mark monitoring unavailable without creating user action', async () => {
  let watch = {
    id: 'watch-1',
    feedUrl: 'https://example.com/feed.xml',
    status: 'watching',
    monitoringSnapshot: { itemIds: ['a'], items: [item('a')], checkedAt },
    candidateUpdates: [{ ...item('candidate'), status: 'candidate', detectedAt: checkedAt }],
  };
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch: (_id, changes) => {
      watch = { ...watch, ...changes };
      return watch;
    },
    requestCheck: async () => { throw new Error('temporary upstream failure'); },
    now: () => new Date(checkedAt),
  });
  await assert.rejects(controller.check('watch-1'));
  await assert.rejects(controller.check('watch-1'));
  assert.equal(watch.requiresAttention, undefined);
  await assert.rejects(controller.check('watch-1'));
  assert.equal(watch.requiresAttention, undefined);
  assert.equal(watch.actionRequired, undefined);
  assert.equal(watch.monitoringStatus.state, 'unavailable');
  assert.equal(watch.monitoringIssueReason, 'source-persistently-unavailable');
  assert.deepEqual(watch.monitoringSnapshot.itemIds, ['a']);
  assert.equal(watch.candidateUpdates[0].id, 'candidate');
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
    {
      id: 'watch-1',
      title: 'A feed Watch',
      status: 'watching',
      storyProfile: { concepts: [{ label: 'Item b', type: 'organization' }] },
      ...baseline,
    },
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

test('controller persists setup-required health without creating action when source is missing', async () => {
  let watch = { id: 'watch-1', inputType: 'url', status: 'watching' };
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch: (_id, changes) => {
      watch = { ...watch, ...changes };
      return watch;
    },
  });
  await assert.rejects(controller.check('watch-1'), (error) => error.code === 'MISSING_FEED_URL');
  assert.equal(watch.requiresAttention, undefined);
  assert.equal(watch.actionRequired, undefined);
  assert.equal(watch.monitoringIssueReason, 'no-compatible-source');
  assert.equal(watch.monitoringStatus.state, 'setup-required');
});

test('unseen unrelated publications are counted but never stored as Watch updates', () => {
  const baseline = applyFeedCheckResult({ id: 'watch-1' }, response(['a'])).changes;
  const result = applyFeedCheckResult({
    id: 'watch-1',
    storyProfile: {
      primaryPeople: ['Abdul Ballout'],
      locations: ['Beirut'],
      eventTypes: ['Deportation proceedings'],
    },
    ...baseline,
  }, response(['unrelated', 'a']));
  assert.equal(result.outcome, 'no-matching-items');
  assert.deepEqual(result.changes.candidateUpdates, []);
  assert.deepEqual(result.changes.lastCheckResult.diagnostics, {
    returnedItemCount: 2,
    unseenItemCount: 1,
    matchedCandidateCount: 0,
    storedUpdateCount: 0,
  });
});

test('a strong story identifier creates one candidate with explainable evidence', () => {
  const profile = {
    primaryPeople: ['Abdul Ballout'],
    locations: ['Beirut'],
    eventTypes: ['Deportation proceedings'],
    concepts: [
      { label: 'Abdul Ballout', type: 'person' },
      { label: 'Beirut', type: 'location' },
      { label: 'Deportation proceedings', type: 'event' },
    ],
  };
  const matchingItem = item('match', 'Abdul Ballout faces new deportation hearing');
  const match = matchFeedItemToStory(matchingItem, profile);
  assert.equal(match.matched, true);
  assert.deepEqual(match.evidence[0], {
    field: 'people',
    label: 'Abdul Ballout',
    strength: 'strong',
  });
  const baseline = applyFeedCheckResult({ id: 'watch-1', storyProfile: profile }, response(['a'])).changes;
  const result = applyFeedCheckResult(
    { id: 'watch-1', storyProfile: profile, ...baseline },
    { ...response([]), items: [matchingItem, item('a')] },
  );
  assert.equal(result.outcome, 'matching-items');
  assert.equal(result.changes.candidateUpdates[0].status, 'candidate');
  assert.equal(result.changes.unreadUpdateCount, 1);
  assert.equal(result.changes.latestUpdateAt, checkedAt);
});

test('a precise place only matches when combined with identifying event context', () => {
  const profile = {
    locations: ['Berlin'],
    eventTypes: ['Pride ramming attack'],
    concepts: [
      { label: 'Berlin', type: 'location' },
      { label: 'Pride ramming attack', type: 'event' },
    ],
  };
  assert.equal(matchFeedItemToStory(
    item('place-only', 'Traffic changes announced in Berlin'),
    profile,
  ).matched, false);
  assert.equal(matchFeedItemToStory(
    item('combined', 'Berlin Pride ramming attack: police issue update'),
    profile,
  ).matched, true);
});

test('a selected named work is strong monitoring evidence', () => {
  const match = matchFeedItemToStory(
    item('odyssey', 'The Odyssey clips reappear after another platform removal request'),
    { concepts: [{ label: 'The Odyssey', type: 'work' }] },
  );

  assert.equal(match.matched, true);
  assert.deepEqual(match.evidence, [{
    field: 'works',
    label: 'The Odyssey',
    strength: 'strong',
  }]);
});

test('monitoring matches only selected identifiers, never supporting profile prose', () => {
  const profile = {
    concepts: [
      { label: 'Perimenopause', type: 'condition' },
      { label: 'Brain fog', type: 'symptom' },
    ],
    distinctiveFacts: ['Short breaks', 'Calendars and reminders'],
    uncertaintyPhrases: ['The evidence remains uncertain and may vary between people.'],
  };
  assert.equal(matchFeedItemToStory(
    item('recommendation', 'Short breaks and calendars can improve concentration'),
    profile,
  ).matched, false);
  const match = matchFeedItemToStory(
    item('subject', 'New research examines perimenopause symptoms'),
    profile,
  );
  assert.equal(match.matched, true);
  assert.deepEqual(match.evidence, [{
    field: 'conditions',
    label: 'Perimenopause',
    strength: 'strong',
  }]);
});
