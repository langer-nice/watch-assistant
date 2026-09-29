import assert from 'node:assert/strict';
import test from 'node:test';
import { configureAccountStorage, localWatchStorageKey } from './account-storage.js';
import { canClaimLocalMediaWatch, configureMediaWatchServerStore, getMediaPersistenceState, synchronizeMediaWatches } from './media-watch-server-store.js';
import { claimLocalMediaWatch, getStoredWatches, updateWatch } from './watch-storage.js';

test('an existing unowned media Watch requires an explicit account claim and keeps its ID', async (t) => {
  const originals = { localStorage: globalThis.localStorage, fetch: globalThis.fetch, window: globalThis.window };
  const storage = {};
  Object.defineProperties(storage, {
    getItem: { value: (key) => storage[key] ?? null },
    setItem: { value: (key, value) => { storage[key] = String(value); } },
    removeItem: { value: (key) => { delete storage[key]; } },
  });
  globalThis.localStorage = storage;
  globalThis.window = new EventTarget();
  t.after(async () => {
    await configureMediaWatchServerStore(null);
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  });
  const ownerId = 'local-claim-owner';
  const auth = { getState: () => ({ status: 'authenticated', session: {
    user: { id: ownerId }, access_token: 'test-token',
  } }), subscribe: () => () => {} };
  configureAccountStorage(auth);
  const id = '00000000-0000-4000-8000-000000000088';
  const request = 'Dis-moi quand Ed Sheeran est mentionné dans les médias';
  const original = { id, title: 'Ed Sheeran dans les médias', inputType: 'text', request,
    category: 'news', status: 'watching', createdAt: '2026-09-28T12:00:00Z',
    feedUrl: 'https://news.google.com/rss/search?q=Ed+Sheeran',
    monitoringSource: { url: 'https://news.google.com/rss/search?q=Ed+Sheeran', type: 'feed' } };
  localStorage.setItem(localWatchStorageKey('watchAssistant.watches'), JSON.stringify([original]));
  let remote = [];
  let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') {
      posts += 1;
      const { definition } = JSON.parse(options.body);
      remote = [{ ...definition, media_revision: 1, current_status: 'watching',
        created_at: original.createdAt }];
      return Response.json({ watch: remote[0] });
    }
    return Response.json({ watches: remote, emailEnabled: false });
  };
  await configureMediaWatchServerStore(auth);
  assert.equal(canClaimLocalMediaWatch(getStoredWatches()[0]), true);
  assert.equal(canClaimLocalMediaWatch({ ...original, monitoringSource: null }), false,
    'a Watch without a valid source must not offer an account claim');
  updateWatch(id, { title: 'Ed Sheeran dans les médias' });
  await synchronizeMediaWatches();
  assert.equal(posts, 0, 'an ordinary edit must not silently claim a local Watch');
  const claimed = claimLocalMediaWatch(id);
  assert.equal(claimed.mediaPersistence.ownerId, ownerId);
  await synchronizeMediaWatches();
  assert.equal(posts, 1);
  assert.equal(remote[0].id, id);
  assert.equal(getStoredWatches().length, 1);
  assert.equal(getMediaPersistenceState(getStoredWatches()[0]).status, 'saved');
  assert.equal(claimLocalMediaWatch(id), null, 'a repeated claim must not create another row');
});
