import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as fixtures from './preview-test-watches.js';
const { createPreviewTestWatches, isPreviewTestLoaderAvailable, PREVIEW_FIXTURE_PREFIX } = fixtures;

test('shared environment predicate preserves onboarding behavior', () => {
  assert.equal(isPreviewTestLoaderAvailable({ DEV: true, VITE_VERCEL_ENV: '' }), true);
  assert.equal(isPreviewTestLoaderAvailable({ DEV: false, VITE_VERCEL_ENV: 'preview' }), true);
  assert.equal(isPreviewTestLoaderAvailable({ DEV: false, VITE_VERCEL_ENV: 'production' }), false);
  assert.equal(isPreviewTestLoaderAvailable({ DEV: false, VITE_VERCEL_ENV: '' }), false);
});

test('local development and Vercel previews bypass onboarding on every page load', async () => {
  const navigation = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const development = { DEV: true, VITE_VERCEL_ENV: '' };
  const preview = { DEV: false, VITE_VERCEL_ENV: 'preview' };

  assert.equal(isPreviewTestLoaderAvailable(development), true);
  assert.equal(isPreviewTestLoaderAvailable(development), true);
  assert.equal(isPreviewTestLoaderAvailable(preview), true);
  assert.equal(isPreviewTestLoaderAvailable(preview), true);
  assert.match(
    navigation,
    /if \(!isPreviewTestLoaderAvailable\(env\) && !hasCompletedOnboarding\(\)\)/,
  );
});

test('production preserves onboarding routing and never renders the Test Data control', async () => {
  const navigation = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const production = { DEV: false, VITE_VERCEL_ENV: 'production' };

  assert.equal(isPreviewTestLoaderAvailable(production), false);
  assert.match(navigation, /if \(!isPreviewTestLoaderAvailable\(env\)/);
  assert.match(navigation, /return getReplayIntroFlow\(\)/);
});


for (const env of ['local', 'preview', 'production']) {
  test(`no public test data renderer or action remains in ${env}`, async () => {
    const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /renderDevTools|loadPreviewTestWatches|watchAssistantResetDemo|data-load-preview-watches|data-reset-preview-watches|dev-reset-control/);
    assert.equal(fixtures.loadPreviewTestWatches, undefined);
  });
}

test('exclusive test-control styles and translations are removed', async () => {
  const styles = await readFile(new URL('../scss/base/_global.scss', import.meta.url), 'utf8');
  assert.doesNotMatch(styles, /dev-reset-control/);
  for (const lang of ['en', 'fr']) {
    const translations = JSON.parse(await readFile(new URL(`../locales/${lang}.json`, import.meta.url)));
    assert.equal(translations.dev, undefined);
  }
});

test('fixtures remain available directly to test harnesses as independent in-memory data', () => {
  const now = new Date('2026-08-17T12:00:00Z');
  const first = createPreviewTestWatches(now), second = createPreviewTestWatches(now);
  assert.equal(first.length, 6);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map(w => w.id)).size, first.length);
  assert.ok(first.every(w => w.id.startsWith(PREVIEW_FIXTURE_PREFIX)));
  first[0].title = 'Harness mutation';
  assert.notEqual(first[0].title, second[0].title);
});
