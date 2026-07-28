import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getWatchDetailHref } from './watch-routes.js';

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

test('each Home and All Watches item uses the native full-card route contract', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const homeRenderer = source.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing =/)?.[0] || '';
  const listRenderer = source.match(/const renderWatchCards =[\s\S]*?list\.innerHTML =/)?.[0] || '';

  for (const renderer of [homeRenderer, listRenderer]) {
    assert.match(renderer, /<a class="[^"]+" href="\$\{getWatchDetailHref\(watch\.id\)\}">/);
    assert.doesNotMatch(renderer, /tabindex="-1"|aria-disabled="true"|<button/i);
  }
});

test('different and dynamically added Watch IDs produce distinct encoded routes', () => {
  assert.deepEqual(watches.map(({ id }) => getWatchDetailHref(id)), [
    'watch-detail.html?id=watch%20alpha%2Fone',
    'watch-detail.html?id=watch-beta',
  ]);
  assert.equal(getWatchDetailHref('new id/after-refresh'), 'watch-detail.html?id=new%20id%2Fafter-refresh');
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

  assert.match(
    html,
    /id="homeAttentionSection"[\s\S]*?id="homeUpdateGroups"/,
  );
  assert.match(
    homeStyles,
    /#homeAttentionSection:not\(\[hidden\]\) \+ #homeUpdateGroups > \.briefing-group:first-child\s*\{[\s\S]*?border-top:\s*1px solid var\(--color-divider\)/,
  );
  assert.match(
    itemStyles,
    /\.briefing-item \+ \.briefing-item\s*\{[\s\S]*?border-top:\s*1px solid var\(--color-divider\)/,
  );
});
