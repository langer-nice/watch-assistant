import test from 'node:test';
import assert from 'node:assert/strict';
import { configureMediaWatchServerStore, getMediaWatchLoadState } from './media-watch-server-store.js';

test('a rejected media JWT refreshes once and reloads without leaving a stale notice', async (t) => {
  const globals = Object.fromEntries(['window', 'localStorage', 'fetch'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: new EventTarget() },
    localStorage: { configurable: true, writable: true, value: storage },
  });
  t.after(async () => {
    await configureMediaWatchServerStore(null);
    for (const [key, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let token = 'old';
  let refreshes = 0;
  const listeners = new Set();
  const auth = {
    getState: () => ({ status: 'authenticated', session: { access_token: token, user: { id: 'owner' } } }),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    refreshSession: async () => {
      refreshes++;
      token = 'new';
      for (const fn of listeners) fn();
      return true;
    },
  };
  const calls = [];
  globalThis.fetch = async (_path, options) => {
    calls.push(options.headers.Authorization);
    return options.headers.Authorization === 'Bearer old'
      ? Response.json({ code: 'AUTH_REFRESH_REQUIRED' }, { status: 401 })
      : Response.json({ watches: [], emailEnabled: true });
  };
  await configureMediaWatchServerStore(auth);
  for (let i = 0; i < 20 && getMediaWatchLoadState().status !== 'ready'; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(refreshes, 1);
  assert.deepEqual(calls, ['Bearer old', 'Bearer new']);
  assert.equal(getMediaWatchLoadState().status, 'ready');
  assert.equal(getMediaWatchLoadState().error, null);
});
