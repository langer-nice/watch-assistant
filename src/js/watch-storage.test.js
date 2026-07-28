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

test('notifies the current page immediately after Watch state changes', async () => {
  const originalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  const storage = createStorage({
    'watchAssistant.htmlEntityDecodeVersion': '1',
  });
  const eventTarget = new EventTarget();
  globalThis.localStorage = storage;
  globalThis.window = eventTarget;

  try {
    const {
      addWatch,
      updateWatch,
      WATCH_STORAGE_CHANGED_EVENT,
    } = await import('./watch-storage.js?change-event');
    let changeCount = 0;
    eventTarget.addEventListener(WATCH_STORAGE_CHANGED_EVENT, () => {
      changeCount += 1;
    });

    addWatch({ id: 'live-watch', title: 'Live Watch', status: 'watching' });
    updateWatch('live-watch', { status: 'updated', latestChange: 'A new update.' });

    assert.equal(changeCount, 2);
    assert.equal(
      JSON.parse(storage.getItem('watchAssistant.watches'))[0].latestChange,
      'A new update.',
    );
    assert.equal(
      JSON.parse(storage.getItem('watchAssistant.watches'))[0].currentStatus,
      'updated',
    );
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('repeated localStorage reads do not duplicate a legacy migration Update', async () => {
  const originalStorage = globalThis.localStorage;
  const storage = createStorage({
    'watchAssistant.watches': JSON.stringify([{
      id: 'legacy-repeat',
      title: 'Stored Watch',
      latestChange: 'Stored update',
      latestChangeAt: '2026-07-27T10:00:00Z',
      createdAt: '2026-07-26T10:00:00Z',
      status: 'updated',
    }]),
    'watchAssistant.htmlEntityDecodeVersion': '1',
  });
  globalThis.localStorage = storage;

  try {
    const { getStoredWatches } = await import('./watch-storage.js?repeat-update-migration');
    const first = getStoredWatches();
    const second = getStoredWatches();
    const persisted = JSON.parse(storage.getItem('watchAssistant.watches'));

    assert.equal(first[0].updates.length, 1);
    assert.deepEqual(second[0].updates, first[0].updates);
    assert.deepEqual(persisted[0].updates, first[0].updates);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('persists the Watch/Update foundation for a newly created Watch', async () => {
  const originalStorage = globalThis.localStorage;
  const storage = createStorage({
    'watchAssistant.htmlEntityDecodeVersion': '1',
  });
  globalThis.localStorage = storage;

  try {
    const { addWatch } = await import('./watch-storage.js?new-update-foundation');
    addWatch({
      id: 'new-watch-with-history',
      title: 'New Watch',
      status: 'watching',
      currentStatus: 'watching',
      lastChecked: null,
      lastUpdated: null,
      updates: [],
    });

    const persisted = JSON.parse(storage.getItem('watchAssistant.watches'))[0];
    assert.equal(persisted.currentStatus, 'watching');
    assert.equal(persisted.lastChecked, null);
    assert.equal(persisted.lastUpdated, null);
    assert.deepEqual(persisted.updates, []);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('the storage helper marks one Update read without deleting its Watch or history', async () => {
  const originalStorage = globalThis.localStorage;
  const storage = createStorage({
    'watchAssistant.watches': JSON.stringify([{
      id: 'stored-history',
      title: 'Stored history',
      status: 'updated',
      currentStatus: 'updated',
      updates: [
        {
          id: 'read-me',
          timestamp: '2026-07-28T10:00:00Z',
          sourceUrl: 'https://example.com/update',
          sourceTitle: 'Update',
          sourceDomain: 'example.com',
          summary: 'A stored update.',
          status: 'new',
        },
      ],
    }]),
    'watchAssistant.htmlEntityDecodeVersion': '1',
  });
  globalThis.localStorage = storage;

  try {
    const { markUpdateAsRead } = await import('./watch-storage.js?mark-update-read');
    const result = markUpdateAsRead('stored-history', 'read-me');
    const persisted = JSON.parse(storage.getItem('watchAssistant.watches'));

    assert.equal(result.updates[0].status, 'read');
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].id, 'stored-history');
    assert.equal(persisted[0].updates.length, 1);
    assert.equal(persisted[0].updates[0].status, 'read');
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
