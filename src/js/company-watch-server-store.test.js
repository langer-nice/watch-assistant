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
        code: 'UPSTREAM_UNAVAILABLE', error: 'The official source is unavailable.', requestId: 'request-check',
      }), { status: 502, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'request-check' } });
    }
    if (path.startsWith('/api/company-watch?')) {
      return Response.json({ watch: failedWatch });
    }
    if (path === '/api/company-watches' && options.method === 'POST') {
      return Response.json({ watch: initialWatch, outcome: 'baseline' }, { status: 201 });
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

    const created = await store.createServerCompanyWatch({
      title: 'Company A',
      request: 'Company A, SIREN 552100554',
      whyFollowing: 'Pilot',
      company: { siren: '552100554', name: 'Company A' },
    });
    assert.equal(created.id, initialWatch.id);
    const creationRequest = requests.find(({ path, options }) => (
      path === '/api/company-watches' && options.method === 'POST'
    ));
    assert.ok(creationRequest);
    assert.deepEqual(JSON.parse(creationRequest.options.body), {
      siren: '552100554',
      title: 'Company A',
      request: 'Company A, SIREN 552100554',
      summary: 'Pilot',
      companyName: 'Company A',
    });
    assert.match(creationRequest.options.headers.Authorization, /^Bearer /u);

    await assert.rejects(
      store.checkServerCompanyWatch(initialWatch.id),
      ({ code, requestId, statusCode }) => (
        code === 'UPSTREAM_UNAVAILABLE'
        && requestId === 'request-check'
        && statusCode === 502
      ),
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
