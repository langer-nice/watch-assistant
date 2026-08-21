import assert from 'node:assert/strict';
import test from 'node:test';

test('authenticated Company store hydrates, refreshes failed checks, and clears on sign-out', async () => {
  const originalFetch = globalThis.fetch;
  const initialWatch = {
    id: '00000000-0000-4000-8000-00000000000a',
    inputType: 'company',
    title: 'Company A',
    createdAt: '2026-08-21T08:00:00.000Z',
  };
  const failedWatch = {
    ...initialWatch,
    lastCheckAttempt: { status: 'failed', code: 'UPSTREAM_UNAVAILABLE' },
  };
  const requests = [];
  globalThis.fetch = async (path, options = {}) => {
    requests.push({ path, options });
    if (path.startsWith('/api/check-company-watch')) {
      return new Response(JSON.stringify({
        code: 'UPSTREAM_UNAVAILABLE', error: 'The official source is unavailable.',
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    if (path.startsWith('/api/company-watch?')) {
      return Response.json({ watch: failedWatch });
    }
    return Response.json({ watches: [initialWatch] });
  };

  try {
    const store = await import('./company-watch-server-store.js?authenticated-store');
    let subscriber = null;
    const auth = {
      getState: () => ({
        status: 'authenticated',
        session: { access_token: 'header.payload.signature' },
      }),
      subscribe: (callback) => { subscriber = callback; return () => {}; },
    };

    await store.configureCompanyWatchServerStore(auth);
    assert.equal(store.isCompanyWatchServerMode(), true);
    assert.equal(store.getServerCompanyWatches()[0].title, 'Company A');
    assert.match(requests[0].options.headers.Authorization, /^Bearer /u);

    await assert.rejects(
      store.checkServerCompanyWatch(initialWatch.id),
      ({ code }) => code === 'UPSTREAM_UNAVAILABLE',
    );
    assert.equal(
      store.getServerCompanyWatches()[0].lastCheckAttempt.code,
      'UPSTREAM_UNAVAILABLE',
    );

    await subscriber({ status: 'anonymous', session: null });
    assert.equal(store.isCompanyWatchServerMode(), false);
    assert.deepEqual(store.getServerCompanyWatches(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
