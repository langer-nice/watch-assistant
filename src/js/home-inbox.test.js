import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getHomeInboxSelection, groupWatches } from './watch-grouping.js';

const getMeaningfulUpdate = (watch) => watch.summary || '';
const options = {
  getMeaningfulUpdate,
  isDisplayableWatch: (watch) => Boolean(watch.title),
};

test('Home selects canonical attention and updated Watches without mutating unchanged Watches', () => {
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

  assert.deepEqual(selection.watches.map(({ id }) => id), ['updated-alias', 'attention-alias']);
  assert.equal(selection.statusById.get('attention-alias'), 'attention');
  assert.equal(selection.statusById.get('updated-alias'), 'updated');
  assert.deepEqual(selection.quietWatches.map(({ id }) => id), ['unchanged']);
  assert.deepEqual(source, original);
});

test('the same unchanged Watch remains in the complete All Watches grouping', () => {
  const unchanged = {
    id: 'unchanged', title: 'All quiet', status: 'watching', createdAt: '2026-07-20T10:00:00Z',
  };
  const inbox = getHomeInboxSelection([unchanged], options);
  const allWatches = groupWatches([unchanged], options).flatMap(({ watches }) => watches);

  assert.deepEqual(inbox.watches, []);
  assert.deepEqual(allWatches.map(({ id }) => id), ['unchanged']);
});

test('Home distinguishes first-use and all-caught-up empty states in English and French', async () => {
  const [html, navigation, en, fr] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);
  const english = JSON.parse(en);
  const french = JSON.parse(fr);

  assert.match(html, /id="homeEmptyState"[\s\S]*?data-i18n="home\.emptyAction"/);
  assert.match(html, /id="homeCaughtUpState"[\s\S]*?data-i18n="home\.allCaughtUp"/);
  assert.match(navigation, /emptyState\.hidden = hasUserCreatedWatches/);
  assert.match(navigation, /caughtUpState\.hidden = !hasUserCreatedWatches \|\| hasHomeItems/);
  assert.equal(
    english.home.allCaughtUp,
    'You’re all caught up. No Watches need your attention right now.',
  );
  assert.equal(
    french.home.allCaughtUp,
    'Vous êtes à jour. Aucune Watch ne nécessite votre attention pour le moment.',
  );
});

test('All Watches renderer continues to read and render the complete collection', async () => {
  const navigation = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const renderer = navigation.match(/const renderWatchList = \(\) => \{[\s\S]*?const renderWatchDetail/)?.[0] || '';
  assert.match(renderer, /const watches = getWatches\(\)/);
  assert.match(renderer, /groupWatches\(watches/);
  assert.doesNotMatch(renderer, /getHomeInboxSelection|filter\([^)]*unchanged/);
});
