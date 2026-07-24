import test from 'node:test';
import assert from 'node:assert/strict';

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('persists a recoverable legacy creation date as createdAt', async () => {
  const originalStorage = globalThis.localStorage;
  const storage = createStorage({
    'watchAssistant.watches': JSON.stringify([{
      id: 'legacy-watch',
      title: 'Legacy Watch',
      createdDate: '2026-07-18T14:10:00+02:00',
    }]),
    'watchAssistant.htmlEntityDecodeVersion': '1',
  });
  globalThis.localStorage = storage;

  try {
    const { getStoredWatches } = await import('./watch-storage.js');
    const watches = getStoredWatches();
    const persisted = JSON.parse(storage.getItem('watchAssistant.watches'));
    assert.equal(watches[0].createdAt, '2026-07-18T12:10:00.000Z');
    assert.equal(persisted[0].createdAt, '2026-07-18T12:10:00.000Z');
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('preserves an explicit clarity warning flag without adding it to legacy Watches', async () => {
  const originalStorage = globalThis.localStorage;
  const storage = createStorage({
    'watchAssistant.watches': JSON.stringify([{
      id: 'legacy-without-clarity-flag',
      title: 'Existing Watch',
      createdAt: '2026-07-18T12:10:00.000Z',
    }]),
    'watchAssistant.htmlEntityDecodeVersion': '1',
  });
  globalThis.localStorage = storage;

  try {
    const { addWatch, getStoredWatches } = await import('./watch-storage.js?clarity-warning');
    assert.equal(
      getStoredWatches()[0].createdAsWrittenAfterClarityWarning,
      undefined,
    );

    addWatch({
      id: 'warned-watch',
      title: 'QSF',
      request: 'QSF',
      createdAt: '2026-07-24T10:00:00.000Z',
      createdAsWrittenAfterClarityWarning: true,
    });

    const persisted = JSON.parse(storage.getItem('watchAssistant.watches'));
    assert.equal(
      persisted.find((watch) => watch.id === 'warned-watch')
        .createdAsWrittenAfterClarityWarning,
      true,
    );
    assert.equal(
      persisted.find((watch) => watch.id === 'legacy-without-clarity-flag')
        .createdAsWrittenAfterClarityWarning,
      undefined,
    );
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
