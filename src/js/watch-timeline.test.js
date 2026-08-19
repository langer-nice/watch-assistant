import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBriefingWatchGroups } from './watch-grouping.js';
import { getWatchJourneyEvents, getWatchTimelineEvents } from './watch-timeline.js';
import { getLatestUpdate, getWatchUpdates } from './watch-updates.js';
import { getCurrentSituationPresentation } from './watch-update-presentation.js';

const createdAt = '2026-07-29T08:00:00.000Z';
const update = (id, timestamp, sourceTitle = null, summary = null) => ({
  id,
  timestamp,
  sourceTitle,
  summary,
  status: 'new',
});
const watchWith = (updates = []) => ({
  id: 'watch-history',
  title: 'Hamas Gaza Disarmament Agreement',
  status: 'watching',
  currentStatus: updates.length ? 'updated' : 'watching',
  createdAt,
  timeline: [{ type: 'created', labelKey: 'watchData.created', date: createdAt }],
  updates,
});

test('a Watch without updates has only its genuine creation event', () => {
  const events = getWatchTimelineEvents(watchWith());
  assert.deepEqual(events.map(({ type }) => type), ['created']);
});

test('one persisted update appears after creation with its meaningful title', () => {
  const events = getWatchTimelineEvents(watchWith([
    update('update-1', '2026-07-30T09:00:00Z', 'Agreement talks resume'),
  ]));
  assert.deepEqual(events.map(({ type }) => type), ['created', 'update']);
  assert.equal(events[1].source.sourceTitle, 'Agreement talks resume');
});

test('How We Got Here excludes the newest Update projected as Current Situation', () => {
  const oneUpdate = watchWith([
    update('itv', '2026-08-07T12:00:00Z', 'Ivan Toney charged over Soho assault'),
  ]);
  assert.deepEqual(
    getWatchJourneyEvents(oneUpdate, { currentUpdateId: 'itv' }).map(({ type }) => type),
    ['created'],
  );

  const threeUpdates = watchWith([
    update('itv', '2026-08-07T12:00:00Z', 'Initial charge'),
    update('court', '2026-08-08T12:00:00Z', 'First court hearing'),
    update('latest', '2026-08-09T12:00:00Z', 'Case adjourned'),
  ]);
  const journey = getWatchJourneyEvents(threeUpdates, { currentUpdateId: 'latest' });
  assert.deepEqual(journey.map(({ source }) => source?.id || 'created'), [
    'created', 'itv', 'court',
  ]);
  assert.deepEqual(getWatchTimelineEvents(threeUpdates).map(({ source }) => source?.id || 'created'), [
    'created', 'itv', 'court', 'latest',
  ]);
});

test('How We Got Here clusters publisher articles by development while history stays complete', () => {
  const watch = watchWith([
    {
      ...update('nyt', '2026-08-07T09:00:00Z', 'Ivan Toney charged over Soho nightclub incident'),
      sourceUrl: 'https://nypost.com/ivan-toney-charged-soho',
      summary: 'Ivan Toney was charged with assault after an incident at a Soho nightclub.',
    },
    {
      ...update('itv', '2026-08-07T10:00:00Z', 'Footballer Ivan Toney charged with assault'),
      sourceUrl: 'https://itv.com/news/ivan-toney-assault-charge',
      summary: 'The charge follows the same Soho nightclub incident.',
    },
    {
      ...update('guardian', '2026-08-07T11:00:00Z', 'Ivan Toney faces assault charge after London incident'),
      sourceUrl: 'https://croydonguardian.co.uk/ivan-toney-charge',
      summary: 'The footballer faces a charge over the Soho nightclub incident.',
    },
    {
      ...update('court', '2026-08-09T09:00:00Z', 'Ivan Toney enters not-guilty plea at court hearing'),
      sourceUrl: 'https://example.com/ivan-toney-court-plea',
      summary: 'Toney pleaded not guilty at a hearing in the Soho assault case.',
    },
    {
      ...update('syndicated-charge', '2026-08-10T09:00:00Z', 'Ivan Toney charged after Soho incident'),
      sourceUrl: 'https://socialnews.example/ivan-toney-charge',
      summary: 'A syndicated report repeats the original assault charge.',
    },
  ]);

  assert.equal(getWatchUpdates(watch).length, 5);
  const current = getCurrentSituationPresentation(watch);
  assert.equal(current.update.id, 'court');
  assert.deepEqual(
    getWatchJourneyEvents(watch, { currentUpdateId: current.update.id })
      .map(({ source }) => source?.id || 'created'),
    ['created', 'nyt'],
  );
});

test('materially different developments from different publishers remain separate milestones', () => {
  const watch = watchWith([
    update('charge', '2026-08-07T09:00:00Z', 'Ivan Toney charged over Soho assault'),
    update('bail', '2026-08-08T09:00:00Z', 'Ivan Toney granted bail in Soho assault case'),
    update('hearing', '2026-08-09T09:00:00Z', 'Ivan Toney appears at court hearing'),
  ]);
  const current = getCurrentSituationPresentation(watch);
  assert.equal(current.update.id, 'hearing');
  assert.deepEqual(
    getWatchJourneyEvents(watch, { currentUpdateId: current.update.id })
      .map(({ source }) => source?.id || 'created'),
    ['created', 'charge', 'bail'],
  );
});

test('two distinct updates remain distinct and are ordered chronologically across timestamp formats', () => {
  const events = getWatchTimelineEvents(watchWith([
    update('update-2', 1785405600000, 'Second development'),
    update('update-1', 1785315600, 'First development'),
  ]));
  assert.deepEqual(events.map(({ source }) => source?.id).filter(Boolean), ['update-1', 'update-2']);
  assert.equal(events.length, 3);
  assert.ok(Date.parse(events[1].timestamp) < Date.parse(events[2].timestamp));
});

test('genuine duplicate records render once without collapsing distinct updates', () => {
  const first = update('update-1', '2026-07-30T09:00:00Z', 'First development');
  const events = getWatchTimelineEvents(watchWith([
    first,
    { ...first },
    update('update-2', '2026-07-30T10:00:00Z', 'Second development'),
  ]));
  assert.deepEqual(events.map(({ source }) => source?.id).filter(Boolean), ['update-1', 'update-2']);
});

test('persisted history survives a storage reload and invalid timestamps never create epoch events', () => {
  const stored = JSON.parse(JSON.stringify(watchWith([
    update('valid', '2026-07-30T09:00:00Z', null, 'A meaningful summary'),
    update('zero', 0, 'Invalid zero'),
    update('empty', '', 'Invalid empty'),
    update('invalid', 'not-a-date', 'Invalid date'),
  ])));
  const events = getWatchTimelineEvents(stored);
  assert.equal(events.length, 2);
  assert.equal(events[1].source.summary, 'A meaningful summary');
  assert.ok(events.every(({ timestamp }) => !timestamp?.startsWith('1970-')));
});

test('legacy lifecycle data is retained and a missing timeline safely derives real creation data', () => {
  const legacy = watchWith([update('update-1', '2026-07-30T09:00:00Z')]);
  legacy.timeline.push({ label: 'Monitoring activated', date: '2026-07-29T08:05:00Z' });
  assert.deepEqual(
    getWatchTimelineEvents(legacy).map(({ type }) => type),
    ['created', 'lifecycle', 'update'],
  );
  assert.deepEqual(
    getWatchTimelineEvents({ created_at: 1785312000 }).map(({ type }) => type),
    ['created'],
  );
  assert.deepEqual(getWatchTimelineEvents({ createdAt: 0, timeline: [] }), []);
});

test('Home Updated grouping and Watch Detail history use the same persisted update record', () => {
  const watch = watchWith([
    update('update-1', '2026-07-30T09:00:00Z', 'First development'),
    update('update-2', '2026-07-30T10:00:00Z', 'Second development'),
  ]);
  const groups = getBriefingWatchGroups([watch], {
    getMeaningfulUpdate: (item) => getLatestUpdate(item)?.sourceTitle || '',
  });
  assert.deepEqual(groups.updatedWatches.map(({ id }) => id), [watch.id]);
  assert.equal(getWatchTimelineEvents(watch).length, 3);
});

test('only the newest rendered event receives the established active green treatment', async () => {
  const [navigation, styles] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_timeline.scss', import.meta.url), 'utf8'),
  ]);
  assert.match(navigation, /isLatest: index === items\.length - 1/);
  assert.match(navigation, /timeline__item\$\{item\.isLatest \? ' timeline__item--latest' : ''\}/);
  assert.match(styles, /\.timeline__marker[\s\S]*?background: var\(--color-border\)/);
  assert.match(styles, /\.timeline__item--latest \.timeline__marker[\s\S]*?background: var\(--color-indicator-unchanged\)/);
});

test('BODACC history uses its source publication date instead of its detection date', () => {
  const watch = {
    createdAt: '2026-08-01T08:00:00.000Z',
    updates: [{
      id: 'bodacc-notice',
      timestamp: '2026-08-10T12:00:00.000Z',
      detectedAt: '2026-08-10T12:00:00.000Z',
      publishedAt: '2026-08-05T00:00:00.000Z',
      sourceTitle: 'Accounts filed',
      summary: 'Accounts filed',
      status: 'read',
    }],
  };
  const updateEvent = getWatchTimelineEvents(watch).find(({ type }) => type === 'update');
  assert.equal(updateEvent.timestamp, '2026-08-05T00:00:00.000Z');
  assert.equal(updateEvent.source.detectedAt, '2026-08-10T12:00:00.000Z');
});
