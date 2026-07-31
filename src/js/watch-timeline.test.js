import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBriefingWatchGroups } from './watch-grouping.js';
import { getWatchTimelineEvents } from './watch-timeline.js';
import { getLatestUpdate } from './watch-updates.js';

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
