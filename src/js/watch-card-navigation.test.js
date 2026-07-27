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
