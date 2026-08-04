import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sortHomeWatches, HOME_SORT_MODES } from './home-watch-order.js';
import { renderWatchCardLink } from './watch-card-link.js';
import { getBriefingWatchGroups } from './watch-grouping.js';
import { applyFeedCheckResult } from './watch-monitoring.js';
import { getWatchTimelineEvents } from './watch-timeline.js';
import {
  getCurrentSituationPresentation,
  getLatestCheckUpdates,
} from './watch-update-presentation.js';

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

const baseWatch = {
  id: 'broad-peak',
  title: 'Broad Peak avalanche',
  sourceUrl: 'https://original.example.com/initial-story',
  status: 'watching',
  currentStatus: 'watching',
  monitoringSnapshot: { itemIds: ['initial'], checkedAt: '2026-07-31T12:00:00Z' },
  seenMonitoringItemIds: ['initial'],
  monitoringSource: {
    discovery: 'news-search',
    url: 'https://news.google.com/rss/search?q=Broad+Peak',
  },
  updates: [],
};

const update = (id, timestamp, overrides = {}) => ({
  id,
  timestamp,
  sourceUrl: `https://updates.example.com/${id}`,
  sourceTitle: `${id} article title`,
  sourceName: 'Example News',
  summary: `${id} meaningful development`,
  status: 'new',
  ...overrides,
});

test('Current Situation uses the newest persisted meaningful update and preserves the pending fallback', () => {
  const pending = 'No major development has been detected yet.';
  assert.deepEqual(
    getCurrentSituationPresentation(baseWatch, { fallback: pending }),
    { update: null, title: '', summary: pending, metadata: '', articleUrl: '' },
  );

  const watch = {
    ...baseWatch,
    lastChecked: '2026-07-31T18:00:00Z',
    updates: [
      update('older', '2026-07-31T14:00:00Z'),
      update('newer', '2026-07-31T15:07:00Z'),
    ],
  };
  const presentation = getCurrentSituationPresentation(watch, {
    fallback: pending,
    formatTimestamp: (value) => value,
    sanitizeUrl: safeUrl,
  });
  assert.equal(presentation.update.id, 'newer');
  assert.equal(presentation.title, 'newer article title');
  assert.equal(presentation.summary, 'newer meaningful development');
  assert.equal(presentation.articleUrl, 'https://updates.example.com/newer');
  assert.notEqual(presentation.articleUrl, watch.sourceUrl);
  assert.doesNotMatch(presentation.summary, /No major development/);

  const invalidLink = getCurrentSituationPresentation({
    updates: [update('invalid', '2026-07-31T16:00:00Z', { sourceUrl: 'javascript:alert(1)' })],
  }, { sanitizeUrl: safeUrl });
  assert.equal(invalidLink.articleUrl, '');
});

test('monitoring persists one detected article and a later no-change check preserves it', () => {
  const detectedArticle = {
    id: 'new-article',
    title: 'Rescuers announce a new development',
    url: 'https://updates.example.com/rescue-report',
    source: 'Example News',
    excerpt: 'The rescue operation entered a new phase.',
    publishedAt: '2026-07-31T14:55:00Z',
  };
  const first = applyFeedCheckResult(baseWatch, {
    checkedAt: '2026-07-31T15:07:00Z',
    items: [detectedArticle],
  });
  const persisted = { ...baseWatch, ...first.changes };
  assert.equal(persisted.updates.length, 1);
  assert.equal(persisted.updates[0].sourceUrl, detectedArticle.url);
  assert.equal(persisted.updates[0].sourceName, detectedArticle.source);
  assert.equal(persisted.sourceUrl, baseWatch.sourceUrl);

  const repeated = applyFeedCheckResult(persisted, {
    checkedAt: '2026-07-31T17:00:00Z',
    items: [detectedArticle],
  });
  const afterNoChange = { ...persisted, ...repeated.changes };
  assert.equal(repeated.outcome, 'no-new-items');
  assert.equal(afterNoChange.updates.length, 1);
  assert.equal(afterNoChange.lastUpdated, '2026-07-31T15:07:00.000Z');
  assert.equal(getCurrentSituationPresentation(afterNoChange).update.id, detectedArticle.id);
});

test('review actions count only persisted updates from the latest check', () => {
  const watch = {
    updates: [
      update('older', '2026-07-31T13:00:00Z'),
      update('first', '2026-07-31T14:00:00Z'),
      update('second', '2026-07-31T15:00:00Z'),
    ],
    lastCheckResult: { candidateItemIds: ['first', 'second', 'missing'] },
  };
  assert.deepEqual(getLatestCheckUpdates(watch).map(({ id }) => id), ['first', 'second']);
  assert.deepEqual(getLatestCheckUpdates({ ...watch, lastCheckResult: { candidateItemIds: [] } }), []);
});

test('Updated classification and ordering use persisted update time, never a later no-change check', () => {
  const newer = {
    id: 'newer', title: 'Newer', lastChecked: '2026-07-31T15:08:00Z',
    updates: [update('newer-update', '2026-07-31T15:07:00Z')],
  };
  const olderWithLaterCheck = {
    id: 'older', title: 'Older', lastChecked: '2026-07-31T18:00:00Z',
    updates: [update('older-update', '2026-07-31T14:00:00Z')],
  };
  const newWatch = {
    id: 'created', title: 'Just created', createdAt: '2026-07-31T17:00:00Z', updates: [],
  };
  const watches = [olderWithLaterCheck, newWatch, newer];
  const briefing = getBriefingWatchGroups(watches, {
    getMeaningfulUpdate: (watch) => getCurrentSituationPresentation(watch).summary,
    isDisplayableWatch: () => true,
  });
  const statusById = new Map(briefing.updatedWatches.map((watch) => [watch.id, 'updated']));
  assert.deepEqual(briefing.updatedWatches.map(({ id }) => id).sort(), ['newer', 'older']);
  assert.deepEqual(briefing.quietWatches.map(({ id }) => id), ['created']);
  assert.deepEqual(sortHomeWatches(watches, {
    mode: HOME_SORT_MODES.ATTENTION_FIRST,
    getStatus: (watch) => statusById.get(watch.id) || 'unchanged',
  }).map(({ id }) => id), ['newer', 'older', 'created']);
});

test('Updated card navigation reveals Current Situation without opening the external article', () => {
  const markup = renderWatchCardLink({
    watchId: 'broad peak',
    className: 'watch-row',
    revealLatestUpdate: true,
    content: 'Broad Peak',
  });
  assert.match(markup, /href="watch-detail\.html\?id=broad%20peak#current-situation"/);
  assert.doesNotMatch(markup, /updates\.example\.com|target="_blank"/);
});

test('timeline keeps detected updates chronological and ordinary events link-free', () => {
  const events = getWatchTimelineEvents({
    createdAt: '2026-07-31T12:00:00Z',
    timeline: [{ type: 'created', date: '2026-07-31T12:00:00Z' }],
    updates: [update('article', '2026-07-31T15:07:00Z')],
  });
  assert.deepEqual(events.map(({ type }) => type), ['created', 'update']);
  assert.equal(events[0].source?.sourceUrl, undefined);
  assert.equal(events[1].source.sourceUrl, 'https://updates.example.com/article');
});

test('renderers use Updated badges, semantic update destinations, and the shared All Watches sorter', async () => {
  const [navigation, detailHtml, watchesHtml, enSource, frSource] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../../watch-detail.html', import.meta.url), 'utf8'),
    readFile(new URL('../../watches.html', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);
  const homeRenderer = navigation.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing/)?.[0] || '';
  const sharedRenderer = navigation.match(/const getSummaryCardStatus =[\s\S]*?const renderHomeWatchCards/)?.[0] || '';
  const allRenderer = navigation.match(/const renderWatchList =[\s\S]*?const renderWatchDetail/)?.[0] || '';
  const detailRenderer = navigation.match(/const renderWatchDetail = \(\) => \{[\s\S]*?function scheduleFirstMonitoringPass/)?.[0] || '';

  assert.match(sharedRenderer, /statuses\.updated/);
  assert.doesNotMatch(homeRenderer, /statuses\.new/);
  assert.match(allRenderer, /\? 'updated'/);
  assert.match(allRenderer, /newIds\.has\(watch\.id\)[\s\S]*?\? 'new'/);
  assert.match(allRenderer, /sortHomeWatches\(watches/);
  assert.match(allRenderer, /getStatus: \(watch\) => statusById\.get\(watch\.id\) \|\| 'unchanged'/);
  assert.match(watchesHtml, /id="allWatchesSort"[\s\S]*?needs-attention-first[\s\S]*?updated-first[\s\S]*?most-recent[\s\S]*?oldest-first/);
  assert.match(detailHtml, /id="current-situation"[\s\S]*?tabindex="-1"[\s\S]*?id="watchCurrentUpdateLink"/);
  assert.match(detailHtml, /id="watchCheckReview"[^>]*href="#current-situation"/);
  assert.match(detailRenderer, /getCurrentSituationPresentation\(watch/);
  assert.match(detailRenderer, /timeline__article-link[\s\S]*?detail\.openArticle/);
  assert.doesNotMatch(detailRenderer, /timeline__marker[^>]*(?:href|button)/);
  for (const source of [enSource, frSource]) {
    assert.doesNotMatch(source, /candidate story update|mise à jour candidate/i);
  }
});
