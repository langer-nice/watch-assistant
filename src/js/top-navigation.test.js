import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Watch Detail keeps All Watches active without a duplicate contextual destination', async () => {
  const source = await readFile(new URL('./top-navigation.js', import.meta.url), 'utf8');
  const detailConfig = source.match(
    /if \(document\.querySelector\('\.page--detail'\)\) \{[\s\S]*?\n  \}/,
  )?.[0] || '';

  assert.match(detailConfig, /pattern:\s*'none'/);
  assert.match(detailConfig, /activeSection:\s*'watches'/);
  assert.match(detailConfig, /showMobileNewWatchAction:\s*true/);
  assert.doesNotMatch(detailConfig, /destination|backToAllWatches/);
});

test('the shared header still renders native Home, All Watches, and New Watch links', async () => {
  const source = await readFile(new URL('./top-navigation.js', import.meta.url), 'utf8');

  assert.match(source, /id:\s*'home',[\s\S]*?href:\s*HOME_DESTINATION/);
  assert.match(source, /id:\s*'watches',[\s\S]*?href:\s*'watches\.html'/);
  assert.match(source, /id:\s*'new-watch',[\s\S]*?href:\s*'new-watch\.html'/);
  assert.match(source, /active \? ' aria-current="page"'/);
  assert.match(source, /<a class="primary-navigation__item[^`]+href="\$\{destination\.href\}"/);
});
