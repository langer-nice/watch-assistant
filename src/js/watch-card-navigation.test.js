import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderWatchCardLink } from './watch-card-link.js';
import { migrateWatchModel, WATCH_MODEL_VERSION } from './watch-model.js';
import {
  getCreatedWatchDetailHref,
  getWatchDetailHref,
  getWatchIdFromLocation,
} from './watch-routes.js';

const watches = [
  {
    id: 'watch alpha/one',
    title: 'First dynamic Watch',
    category: 'general',
    status: 'attention',
    actionRequired: true,
    requiresAttention: true,
    currentSituation: 'First update',
    latestChange: 'First update',
    latestChangeAt: '2026-07-27T12:00:00.000Z',
    createdAt: '2026-07-27T10:00:00.000Z',
  },
  {
    id: 'watch-beta',
    title: 'Second dynamic Watch',
    category: 'general',
    status: 'attention',
    actionRequired: true,
    requiresAttention: true,
    currentSituation: 'Second update',
    latestChange: 'Second update',
    latestChangeAt: '2026-07-27T13:00:00.000Z',
    createdAt: '2026-07-27T11:00:00.000Z',
  },
];

const renderedCard = (watch, className = 'briefing-item__link') => renderWatchCardLink({
  watchId: watch.id,
  className,
  content: `<h2>${watch.title}</h2><p>${watch.latestChange}</p>`,
});

const getAttribute = (markup, name) => (
  markup.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] || null
);

const activateNativeLink = (markup, { key = null } = {}) => {
  if (key && key !== 'Enter') return null;
  return getAttribute(markup, 'href');
};

test('Home and All Watches render native full-card links wired into the real renderers', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const homeRenderer = source.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing =/)?.[0] || '';
  const listRenderer = source.match(/const renderWatchCards =[\s\S]*?list\.innerHTML =/)?.[0] || '';

  for (const renderer of [homeRenderer, listRenderer]) {
    assert.match(renderer, /renderWatchCardLink\(\{[\s\S]*?watchId: watch\.id/);
    assert.doesNotMatch(renderer, /tabindex="-1"|aria-disabled="true"|<button/i);
  }

  const homeMarkup = renderedCard(watches[0]);
  const allMarkup = renderedCard(watches[1], 'watch-row');
  for (const [markup, watch] of [[homeMarkup, watches[0]], [allMarkup, watches[1]]]) {
    assert.match(markup, /^<a\b/);
    assert.equal(getAttribute(markup, 'data-watch-id'), watch.id);
    assert.equal(getWatchIdFromLocation(activateNativeLink(markup)), watch.id);
    assert.equal(getWatchIdFromLocation(activateNativeLink(markup, { key: 'Enter' })), watch.id);
    assert.equal(activateNativeLink(markup, { key: ' ' }), null);
    assert.match(markup, new RegExp(`<h2>${watch.title}</h2><p>${watch.latestChange}</p>`));
    assert.doesNotMatch(markup, /\sonclick=|javascript:/i);
  }
});

test('different and dynamically added Watch IDs produce distinct encoded routes', () => {
  assert.deepEqual(watches.map(({ id }) => getWatchDetailHref(id)), [
    'watch-detail.html?id=watch%20alpha%2Fone',
    'watch-detail.html?id=watch-beta',
  ]);
  assert.equal(getWatchDetailHref('new id/after-refresh'), 'watch-detail.html?id=new%20id%2Fafter-refresh');
});

test('creation and detail routing preserve the new Watch canonical ID', () => {
  const id = 'created watch/with punctuation';
  const href = getCreatedWatchDetailHref(id);
  assert.equal(
    href,
    'watch-detail.html?id=created%20watch%2Fwith%20punctuation&watchCreated=created%20watch%2Fwith%20punctuation',
  );
  assert.equal(getWatchIdFromLocation(href), id);
});

test('navigation remains correct after migration, rerender and a status update', () => {
  const legacy = { ...watches[0], watchModelVersion: 8 };
  const migrated = migrateWatchModel(legacy).watch;
  assert.equal(migrated.watchModelVersion, WATCH_MODEL_VERSION);
  assert.equal(getWatchIdFromLocation(activateNativeLink(renderedCard(migrated))), legacy.id);

  const rerendered = renderedCard({
    ...migrated,
    status: 'updated',
    latestChange: 'A monitoring update received in this tab',
  });
  assert.equal(getWatchIdFromLocation(activateNativeLink(rerendered)), legacy.id);
  assert.match(rerendered, /A monitoring update received in this tab/);
});

test('a malformed Watch ID is skipped without breaking valid sibling links', () => {
  const markup = [
    renderedCard({ ...watches[0], id: null }),
    renderedCard(watches[1]),
    renderedCard({ ...watches[0], id: '   ' }),
  ].join('');
  assert.equal((markup.match(/<a\b/g) || []).length, 1);
  assert.equal(getWatchIdFromLocation(activateNativeLink(markup)), watches[1].id);
  assert.equal(getWatchDetailHref(undefined), null);
  assert.equal(getCreatedWatchDetailHref({}), null);
});

test('application navigation has no inline onclick or string event dependency', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<[^>]+\sonclick\s*=|setAttribute\(['"]onclick|javascript:/i);
  assert.match(source, /if \(isOnboardingFirstWatch\(\)\) \{[\s\S]*?completeOnboardingFirstWatch\(watch\.id\);[\s\S]*?window\.location\.href = 'index\.html';[\s\S]*?return;/);
  assert.match(source, /window\.location\.href = getCreatedWatchDetailHref\(watch\.id\)/);
});

test('All Watches renders at most one canonical Home-style update separator per rerender', async () => {
  const [navigation, allQuietStyles] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_all-quiet.scss', import.meta.url), 'utf8'),
  ]);
  const listRenderer = navigation.match(/const renderWatchList = \(\) => \{[\s\S]*?const renderWatchDetail/)?.[0] || '';

  assert.match(listRenderer, /getUpdatedSeparatorWatchId\(\s*groups,\s*canonicalGroups\.updatedWatches/);
  assert.match(listRenderer, /watch\.id === separatorAfterWatchId/);
  assert.equal((listRenderer.match(/watch-list__update-separator/g) || []).length, 1);
  assert.match(listRenderer, /list\.innerHTML = groups/);
  assert.match(allQuietStyles, /\.all-quiet::before,\s*\.watch-list__update-separator\s*\{[\s\S]*?height:\s*2px;[\s\S]*?margin-bottom:\s*var\(--space-xl\);[\s\S]*?background:\s*var\(--color-border-strong\)/);
});

test('Home preserves the validated separator across attention and update containers', async () => {
  const [html, homeStyles, itemStyles] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../scss/pages/_home.scss', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_briefing-item.scss', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /id="homeAttentionSection"[\s\S]*?id="homeUpdateGroups"/);
  assert.match(homeStyles, /#homeAttentionSection:not\(\[hidden\]\) \+ #homeUpdateGroups > \.briefing-group:first-child\s*\{[\s\S]*?border-top:\s*1px solid var\(--color-divider\)/);
  assert.match(itemStyles, /\.briefing-item \+ \.briefing-item\s*\{[\s\S]*?border-top:\s*1px solid var\(--color-divider\)/);
});
