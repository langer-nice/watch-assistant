import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getHomeInboxSelection, groupWatches } from './watch-grouping.js';

const getMeaningfulUpdate = (watch) => watch.summary || '';
const options = {
  getMeaningfulUpdate,
  isDisplayableWatch: (watch) => Boolean(watch.title),
};

test('Home selects Needs attention before Updated without mutating unchanged Watches', () => {
  const attentionAlias = {
    id: 'attention-alias', title: 'Needs review', status: 'watching', requiresAttention: true,
  };
  const updatedAlias = {
    id: 'updated-alias', title: 'Has an update', status: 'new', summary: 'Meaningful update',
  };
  const unchanged = {
    id: 'unchanged', title: 'All quiet', status: 'watching', updates: [],
  };
  const source = [updatedAlias, unchanged, attentionAlias];
  const original = structuredClone(source);
  const selection = getHomeInboxSelection(source, options);

  assert.deepEqual(selection.watches.map(({ id }) => id), ['attention-alias', 'updated-alias']);
  assert.equal(selection.statusById.get('attention-alias'), 'attention');
  assert.equal(selection.statusById.get('updated-alias'), 'updated');
  assert.deepEqual(selection.quietWatches.map(({ id }) => id), ['unchanged']);
  assert.equal(selection.totalChecked, 3);
  assert.deepEqual(source, original);
});

test('the same unchanged Watch remains in the complete All Watches grouping', () => {
  const unchanged = {
    id: 'unchanged', title: 'All quiet', status: 'watching', createdAt: '2026-07-20T10:00:00Z',
  };
  const inbox = getHomeInboxSelection([unchanged], options);
  const allWatches = groupWatches([unchanged], options).flatMap(({ watches }) => watches);

  assert.deepEqual(inbox.watches, []);
  assert.equal(inbox.totalChecked, 1);
  assert.deepEqual(allWatches.map(({ id }) => id), ['unchanged']);
});

test('Home distinguishes first-use, Everything else, and the fallback caught-up state', async () => {
  const [html, navigation, en, fr] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);
  const english = JSON.parse(en);
  const french = JSON.parse(fr);

  assert.match(html, /id="homeEmptyState"[\s\S]*?data-i18n="home\.emptyAction"/);
  assert.match(html, /id="homeCaughtUpState"[\s\S]*?data-i18n="home\.dashboardUpToDate"[\s\S]*?data-i18n="home\.dashboardNoNewUpdates"[\s\S]*?href="watches\.html"/);
  assert.match(html, /id="homeBriefingList"[\s\S]*?id="homeAllQuiet"[\s\S]*?id="homeEverythingChecked"[\s\S]*?href="watches\.html"/);
  assert.match(navigation, /emptyState\.hidden = hasUserCreatedWatches/);
  assert.match(navigation, /briefingFeed\.hidden = !hasReport/);
  assert.match(navigation, /caughtUpState\.hidden = !hasReport \|\| hasHomeItems \|\| hasQuietItems/);
  assert.match(navigation, /allQuiet\.hidden = !hasReport \|\| !hasQuietItems/);
  assert.match(navigation, /pluralKey\('home\.everythingChecked', quietWatches\.length\)/);
  assert.equal(
    english.home.dashboardUpToDate,
    '✓ Everything is up to date.',
  );
  assert.equal(
    french.home.dashboardUpToDate,
    '✓ Tout est à jour.',
  );
  assert.equal(english.home.dashboardNoNewUpdates, 'This report found no changes.');
  assert.equal(french.home.viewAllWatches, 'Voir toutes les Watches');
});

test('unchanged Watches supply the Everything else count without becoming Home cards', () => {
  const unchanged = [
    { id: 'quiet-one', title: 'Quiet one', status: 'watching' },
    { id: 'quiet-two', title: 'Quiet two', status: 'stable' },
  ];
  const updated = {
    id: 'updated', title: 'Updated', status: 'new', summary: 'Meaningful update',
  };
  const selection = getHomeInboxSelection([unchanged[0], updated, unchanged[1]], options);

  assert.deepEqual(selection.watches.map(({ id }) => id), ['updated']);
  assert.equal(selection.quietWatches.length, 2);
  assert.deepEqual(selection.quietWatches, unchanged);
  assert.equal(new Set([
    ...selection.watches.map(({ id }) => id),
    ...selection.quietWatches.map(({ id }) => id),
  ]).size, 3);
});

test('All Watches renderer continues to read and render the complete collection', async () => {
  const navigation = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const renderer = navigation.match(/const renderWatchList = \(\) => \{[\s\S]*?const renderWatchDetail/)?.[0] || '';
  assert.match(renderer, /const watches = getWatches\(\)/);
  assert.match(renderer, /groupWatches\(displayWatches/);
  assert.match(renderer, /getCanonicalStatusMap\(watches, reports\)/);
  assert.doesNotMatch(renderer, /filter\([^)]*unchanged/);
});

test('All Watches reuses the Home summary presentation without a Monitoring badge', async () => {
  const [navigation, styles] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../scss/pages/_watches.scss', import.meta.url), 'utf8'),
  ]);
  const renderer = navigation.match(/const renderWatchList = \(\) => \{[\s\S]*?const renderWatchDetail/)?.[0] || '';

  assert.match(renderer, /renderSummaryWatchCard\(\{/);
  assert.match(renderer, /status = attentionIds\.has\(watch\.id\)[\s\S]*?newIds\.has\(watch\.id\)[\s\S]*?\? 'new'[\s\S]*?: null/);
  assert.doesNotMatch(renderer, /statuses\.watching|monitoringStatusBadge|watch-row/);
  assert.match(styles, /\.watch-list\s*\{[\s\S]*?display:\s*block/);
  assert.match(styles, /\.briefing-item\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--color-divider\)/);
});

test('Home keeps a newly created Watch for less than 24 hours and then removes it', () => {
  const now = new Date('2026-08-04T12:00:00Z');
  const recent = {
    id: 'recent', title: 'Recently created', status: 'watching', createdAt: '2026-08-03T12:00:01Z',
  };
  const exactlyOneDayOld = {
    id: 'one-day-old', title: 'One day old', status: 'watching', createdAt: '2026-08-03T12:00:00Z',
  };
  const selection = getHomeInboxSelection([exactlyOneDayOld, recent], { ...options, now });

  assert.deepEqual(selection.watches.map(({ id }) => id), ['recent']);
  assert.deepEqual(selection.newlyCreatedWatches.map(({ id }) => id), ['recent']);
  assert.equal(selection.statusById.get('recent'), 'new');
  assert.deepEqual(selection.quietWatches.map(({ id }) => id), ['one-day-old']);
});

test('New eligibility excludes Watches that cannot render on Home', () => {
  const now = new Date('2026-08-04T12:00:00Z');
  const hiddenRecent = {
    id: 'hidden-recent', title: '', status: 'watching', createdAt: '2026-08-04T11:00:00Z',
  };
  const selection = getHomeInboxSelection([hiddenRecent], { ...options, now });

  assert.deepEqual(selection.watches, []);
  assert.deepEqual(selection.newlyCreatedWatches, []);
  assert.deepEqual(selection.quietWatches, []);
  assert.equal(selection.totalChecked, 0);
});

test('Home hides a previously opened update when the Watch has nothing new', () => {
  const opened = {
    id: 'opened',
    title: 'Opened update',
    status: 'updated',
    summary: 'Previously reviewed change',
    updates: [{
      id: 'read-update',
      timestamp: '2026-08-03T10:00:00Z',
      summary: 'Previously reviewed change',
      status: 'read',
    }],
  };
  const selection = getHomeInboxSelection([opened], options);

  assert.deepEqual(selection.watches, []);
  assert.deepEqual(selection.quietWatches, [opened]);
});

test('two separately created Watches with the same title remain distinct without renderer duplication', () => {
  const now = new Date('2026-08-04T12:00:00Z');
  const watches = [
    {
      id: 'palais-segurane-first',
      title: 'PALAIS SEGURANE',
      status: 'watching',
      createdAt: '2026-08-04T11:51:00Z',
    },
    {
      id: 'palais-segurane-second',
      title: 'PALAIS SEGURANE',
      status: 'watching',
      createdAt: '2026-08-04T11:56:00Z',
    },
  ];
  const selection = getHomeInboxSelection(watches, { ...options, now });

  assert.deepEqual(selection.watches.map(({ id }) => id), [
    'palais-segurane-second',
    'palais-segurane-first',
  ]);
  assert.equal(new Set(selection.watches.map(({ id }) => id)).size, 2);
});
