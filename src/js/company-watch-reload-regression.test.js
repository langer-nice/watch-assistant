import { configureAccountStorage, localWatchStorageKey } from './account-storage.js';
configureAccountStorage({ getState: () => ({ status: 'authenticated', session: { user: { id: 'synthetic-local-owner' } } }) });
import assert from 'node:assert/strict';
import test from 'node:test';

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const deferred = () => {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
};

const remoteWatch = ({ id, title, siren, whyFollowing = '', ...overrides }) => ({
  id,
  inputType: 'company',
  title,
  request: siren,
  whyFollowing,
  category: 'general',
  status: 'watching',
  currentStatus: 'watching',
  monitoringState: 'monitoring',
  createdAt: '2026-08-31T08:00:00.000Z',
  company: { siren, name: title },
  ...overrides,
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('a stale authenticated load cannot overwrite a newer restored session', async () => {
  const originalGlobals = Object.fromEntries(
    ['window', 'localStorage', 'fetch'].map((key) => (
      [key, Object.getOwnPropertyDescriptor(globalThis, key)]
    )),
  );
  const localNews = {
    id: 'local-news', inputType: 'url', title: 'Local News', status: 'watching',
    currentStatus: 'watching', createdAt: '2026-08-30T08:00:00.000Z',
  };
  const localDuplicate = {
    id: '30000000-0000-4000-8000-000000000002', inputType: 'company',
    title: 'Old local duplicate', status: 'watching', currentStatus: 'watching',
    createdAt: '2026-08-29T08:00:00.000Z',
    company: { siren: '542051180', name: 'Old local duplicate' },
  };
  const previewCompany = {
    id: 'preview-test-company', inputType: 'company', title: 'Preview Company',
    status: 'watching', currentStatus: 'watching', createdAt: '2026-08-28T08:00:00.000Z',
  };
  const localOrangeDuplicate = {
    id: '30000000-0000-4000-8000-000000000003', inputType: 'company',
    title: 'Old local ORANGE', status: 'watching', currentStatus: 'watching',
    createdAt: '2026-08-27T08:00:00.000Z',
    company: { siren: '380129866', name: 'Old local ORANGE' },
    updates: [],
  };
  const storage = createStorage({
    [localWatchStorageKey('watchAssistant.watches')]: JSON.stringify([
      localNews, localDuplicate, localOrangeDuplicate, previewCompany,
    ]),
  });
  const browserWindow = new EventTarget();
  browserWindow.dispatchEvent = EventTarget.prototype.dispatchEvent.bind(browserWindow);
  const requests = [];

  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: browserWindow },
    localStorage: { configurable: true, writable: true, value: storage },
    fetch: { configurable: true, writable: true, value: (path, options = {}) => {
      const pending = deferred();
      requests.push({ path, options, pending });
      return pending.promise;
    } },
  });

  try {
    const store = await import('./company-watch-server-store.js');
    const watchStorage = await import('./watch-storage.js');
    let authState = { status: 'anonymous', session: null };
    let publishAuthState;
    const auth = {
      getState: () => authState,
      subscribe(callback) { publishAuthState = callback; return () => {}; },
    };
    await store.configureCompanyWatchServerStore(auth);

    authState = {
      status: 'authenticated',
      session: { access_token: 'old.header.signature', user: { id: 'user-a' } },
    };
    publishAuthState(authState);
    await flush();
    assert.equal(requests.length, 1);

    authState = { status: 'anonymous', session: null };
    publishAuthState(authState);
    await flush();

    authState = {
      status: 'authenticated',
      session: { access_token: 'new.header.signature', user: { id: 'user-a' } },
    };
    publishAuthState(authState);
    await flush();
    assert.equal(requests.length, 2);

    const currentRows = [
      remoteWatch({
        id: '30000000-0000-4000-8000-000000000001',
        title: 'CEMEX GRANULATS',
        siren: '552005969',
      }),
      remoteWatch({
        id: '30000000-0000-4000-8000-000000000002',
        title: 'TOTALENERGIES SE',
        siren: '542051180',
        whyFollowing: '',
      }),
      remoteWatch({
        id: '30000000-0000-4000-8000-000000000003',
        title: 'ORANGE',
        siren: '380129866',
        lastCheckOutcome: { type: 'no-new-items', checkedAt: '2026-09-04T06:00:00.000Z' },
        lastCheckAttempt: { status: 'succeeded', attemptedAt: '2026-09-04T06:00:00.000Z' },
        updates: [{
          id: 'A20260160287', status: 'read', sourceTitle: 'ORANGE STORE sale',
          summary: 'Stored business-sale change', timestamp: '2026-08-23T00:00:00.000Z',
        }],
        unreadUpdateCount: 0,
      }),
    ];
    requests[1].pending.resolve(Response.json({ watches: currentRows }));
    await flush();
    await flush();

    requests[0].pending.resolve(Response.json({ watches: [currentRows[0]] }));
    await flush();
    await flush();

    assert.deepEqual(
      store.getServerCompanyWatches().map(({ title }) => title),
      ['CEMEX GRANULATS', 'TOTALENERGIES SE', 'ORANGE'],
      'the old session response must not replace the successful restored-session result',
    );

    publishAuthState(authState);
    await flush();
    assert.equal(
      requests.length,
      2,
      'a duplicate callback for the same hydrated session must not start another list request',
    );

    const failedReload = store.hydrateServerCompanyWatches();
    await flush();
    requests[2].pending.resolve(Response.json({
      code: 'DATABASE_ERROR', error: 'The Company Watch list is temporarily unavailable.',
    }, { status: 503 }));
    await assert.rejects(failedReload, ({ code, statusCode }) => (
      code === 'DATABASE_ERROR' && statusCode === 503
    ));
    assert.equal(store.getCompanyWatchServerHydrationError()?.code, 'DATABASE_ERROR');
    assert.deepEqual(
      store.getServerCompanyWatches().map(({ title }) => title),
      ['CEMEX GRANULATS', 'TOTALENERGIES SE', 'ORANGE'],
      'a controlled read failure must preserve the last valid server state',
    );

    const displayed = watchStorage.getWatches();
    assert.equal(displayed.some(({ id }) => id === localNews.id), true);
    assert.equal(displayed.some(({ id }) => id === previewCompany.id), true);
    assert.equal(displayed.filter(({ id }) => id === localDuplicate.id).length, 1);
    assert.equal(
      displayed.find(({ id }) => id === localDuplicate.id).title,
      'TOTALENERGIES SE',
      'the database representation wins over the old local duplicate',
    );
    assert.equal(
      displayed.find(({ id }) => id === localDuplicate.id).whyFollowing,
      '',
      'a nullable database summary remains a safe empty rationale field',
    );
    const orange = displayed.filter(({ id }) => id === localOrangeDuplicate.id);
    assert.equal(orange.length, 1, 'the server Company Watch must replace its local duplicate once');
    assert.equal(orange[0].title, 'ORANGE');
    assert.equal(orange[0].currentStatus, 'watching');
    assert.equal(orange[0].updates.length, 1);
    assert.equal(orange[0].updates[0].id, 'A20260160287');
    assert.equal(orange[0].updates[0].status, 'read');
  } finally {
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
