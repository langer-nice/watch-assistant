import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPreviewTestWatches,
  isPreviewTestLoaderAvailable,
  loadPreviewTestWatches,
  PREVIEW_FIXTURE_PREFIX,
} from './preview-test-watches.js';
import { getWatches } from './watch-storage.js';
import { getLatestReport } from './report-storage.js';
import { getCanonicalWatchClassification } from './report-status.js';

const NOW = new Date('2026-08-17T12:00:00.000Z');

const createStorage = (watches = []) => {
  const values = new Map([
    ['watchAssistant.watches', JSON.stringify(watches)],
    ['watchAssistant.htmlEntityDecodeVersion', '1'],
    ['watchAssistant.reportStatusMigrationVersion', '2'],
  ]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
};

const withStorage = (watches, callback) => {
  const originalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  globalThis.localStorage = createStorage(watches);
  globalThis.window = new EventTarget();
  try {
    return callback();
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
};

test('loader is available locally and in Vercel previews, but not in production', () => {
  assert.equal(isPreviewTestLoaderAvailable({ DEV: true, VITE_VERCEL_ENV: '' }), true);
  assert.equal(isPreviewTestLoaderAvailable({ DEV: false, VITE_VERCEL_ENV: 'preview' }), true);
  assert.equal(isPreviewTestLoaderAvailable({ DEV: false, VITE_VERCEL_ENV: 'production' }), false);
  assert.equal(isPreviewTestLoaderAvailable({ DEV: false, VITE_VERCEL_ENV: '' }), false);
});

test('initial and repeated loads create exactly one copy of every fixture', () => withStorage([], () => {
  const expected = createPreviewTestWatches(NOW);
  const first = loadPreviewTestWatches({ now: NOW, env: { DEV: true } });
  const second = loadPreviewTestWatches({ now: NOW, env: { DEV: true } });
  const fixtures = getWatches().filter(({ id }) => id.startsWith(PREVIEW_FIXTURE_PREFIX));

  assert.equal(first.added, expected.length);
  assert.equal(second.added, 0);
  assert.equal(fixtures.length, expected.length);
  assert.equal(new Set(fixtures.map(({ id }) => id)).size, expected.length);
}));

test('normal load preserves existing Watches and same-ID records', () => {
  const fixtureId = `${PREVIEW_FIXTURE_PREFIX}updated`;
  const existing = [
    { id: 'personal-watch', title: 'My personal Watch', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: fixtureId, title: 'Existing collision', createdAt: '2026-01-02T00:00:00.000Z' },
  ];
  withStorage(existing, () => {
    loadPreviewTestWatches({ now: NOW, env: { DEV: true } });
    assert.equal(getWatches().find(({ id }) => id === 'personal-watch').title, 'My personal Watch');
    assert.equal(getWatches().find(({ id }) => id === fixtureId).title, 'Existing collision');
  });
});

test('explicit reset replaces existing data and creates a canonical consistent report', () => {
  withStorage([{ id: 'personal-watch', title: 'Personal', createdAt: '2026-01-01T00:00:00.000Z' }], () => {
    const result = loadPreviewTestWatches({ now: NOW, reset: true, env: { DEV: true } });
    const watches = getWatches();
    const report = getLatestReport();

    assert.equal(result.added, createPreviewTestWatches(NOW).length);
    assert.equal(watches.some(({ id }) => id === 'personal-watch'), false);
    assert.equal(report.entries.length, watches.length);
    for (const watch of watches) {
      const entry = report.entries.find(({ watchId }) => watch.id === watchId);
      assert.equal(entry.classification, getCanonicalWatchClassification(watch, { now: NOW }));
    }
    assert.equal(report.counts.attention, 1);
    assert.equal(report.counts.updated, 2);
    assert.equal(report.counts.watching, 2);
    assert.equal(report.counts.new, 0);
  });
});

test('production calls cannot load or overwrite any Watch', () => withStorage([], () => {
  const result = loadPreviewTestWatches({ now: NOW, reset: true, env: { DEV: false, VITE_VERCEL_ENV: 'production' } });
  assert.deepEqual(result, { available: false, added: 0, total: 0 });
  assert.deepEqual(getWatches(), []);
}));
