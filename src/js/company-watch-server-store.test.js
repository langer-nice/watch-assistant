import assert from 'node:assert/strict';
import test from 'node:test';

test('authenticated Company store hydrates, refreshes failed checks, and clears on sign-out', async () => {
  const originalFetch = globalThis.fetch;
  const initialWatch = {
    id: '00000000-0000-4000-8000-00000000000a',
    inputType: 'company',
    title: 'Company A',
    category: 'general',
    createdAt: '2026-08-21T08:00:00.000Z',
  };
  const failedWatch = {
    ...initialWatch,
    lastCheckAttempt: { status: 'failed', code: 'UPSTREAM_UNAVAILABLE' },
  };
  const updatedWatch = { ...initialWatch, whyFollowing: 'Updated note' };
  const requests = [];
  let creationCount = 0;
  globalThis.fetch = async (path, options = {}) => {
    requests.push({ path, options });
    if (path.startsWith('/api/check-company-watch')) {
      return new Response(JSON.stringify({
        code: 'UPSTREAM_UNAVAILABLE', error: 'The official source is unavailable.', requestId: 'request-check',
      }), { status: 502, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'request-check' } });
    }
    if (path.startsWith('/api/company-watch?')) {
      if (options.method === 'PATCH') {
        const changes = JSON.parse(options.body);
        if (changes.category === 'finance') {
          return Response.json({ watch: { ...updatedWatch, category: 'finance' } });
        }
        if (changes.category === 'news') {
          return Response.json({ watch: { ...updatedWatch, category: 'general' } });
        }
        if (changes.category === 'events') {
          return Response.json({ code: 'DATABASE_ERROR', error: 'Save failed.' }, { status: 500 });
        }
        return Response.json({ watch: updatedWatch });
      }
      return Response.json({ watch: failedWatch });
    }
    if (path === '/api/company-watches' && options.method === 'POST') {
      creationCount += 1;
      if (creationCount > 1) {
        return Response.json({
          code: 'ACTIVE_WATCH_EXISTS',
          error: 'Duplicate.',
          requestId: 'request-duplicate',
          existingWatch: { id: initialWatch.id, title: initialWatch.title },
        }, { status: 409 });
      }
      return Response.json({ watch: initialWatch, outcome: 'baseline' }, { status: 201 });
    }
    return Response.json({ watches: [initialWatch] });
  };

  try {
    const store = await import('./company-watch-server-store.js?authenticated-store');
    let subscriber = null;
    let authState = {
      status: 'authenticated',
      session: { access_token: 'header.payload.signature' },
    };
    const auth = {
      getState: () => authState,
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
      category: 'general',
    });
    assert.match(creationRequest.options.headers.Authorization, /^Bearer /u);

    const noNoteRequestStart = requests.length;
    await assert.rejects(
      store.createServerCompanyWatch({
        title: 'Company A', request: 'Company A, SIREN 552100554',
        monitoringSummary: 'This Watch will follow relevant future reporting.',
        company: { siren: '552100554', name: 'Company A' },
      }),
      ({ code }) => code === 'ACTIVE_WATCH_EXISTS',
    );
    const noNoteRequest = requests.slice(noNoteRequestStart).find(({ path, options }) => (
      path === '/api/company-watches' && options.method === 'POST'
    ));
    assert.equal(JSON.parse(noNoteRequest.options.body).summary, '');

    await assert.rejects(
      store.createServerCompanyWatch({
        title: 'Company A', request: 'Company A, SIREN 552100554',
        company: { siren: '552100554', name: 'Company A' },
      }),
      ({ code, statusCode, existingWatch, requestId }) => (
        code === 'ACTIVE_WATCH_EXISTS'
        && statusCode === 409
        && requestId === 'request-duplicate'
        && existingWatch.id === initialWatch.id
        && existingWatch.title === initialWatch.title
      ),
    );
    assert.equal(store.getServerCompanyWatches().length, 1);

    const updated = await store.updateServerCompanyWatch(initialWatch.id, { summary: 'Updated note' });
    assert.equal(updated.whyFollowing, 'Updated note');
    const updateRequest = requests.find(({ path, options }) => (
      path === `/api/company-watch?id=${initialWatch.id}` && options.method === 'PATCH'
    ));
    assert.ok(updateRequest);
    assert.deepEqual(JSON.parse(updateRequest.options.body), { summary: 'Updated note' });
    assert.match(updateRequest.options.headers.Authorization, /^Bearer /u);

    const finance = await store.updateServerCompanyWatch(initialWatch.id, { category: 'finance' });
    assert.equal(finance.category, 'finance');
    const categoryRequest = requests.find(({ path, options }) => (
      path === `/api/company-watch?id=${initialWatch.id}`
      && options.method === 'PATCH'
      && JSON.parse(options.body).category === 'finance'
    ));
    assert.deepEqual(JSON.parse(categoryRequest.options.body), { category: 'finance' });
    assert.equal(store.getServerCompanyWatches()[0].category, 'finance');

    await assert.rejects(
      store.updateServerCompanyWatch(initialWatch.id, { category: 'news' }),
      ({ code }) => code === 'PERSISTED_CATEGORY_MISMATCH',
    );
    assert.equal(
      store.getServerCompanyWatches()[0].category,
      'finance',
      'a mismatched response must not overwrite the accepted persisted category',
    );
    await assert.rejects(
      store.updateServerCompanyWatch(initialWatch.id, { category: 'events' }),
      ({ code, statusCode }) => code === 'DATABASE_ERROR' && statusCode === 500,
    );
    assert.equal(
      store.getServerCompanyWatches()[0].category,
      'finance',
      'a failed PATCH must preserve the last accepted category',
    );

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

    authState = { status: 'anonymous', session: null };
    await subscriber(authState);
    assert.equal(store.isCompanyWatchServerMode(), false);
    assert.deepEqual(store.getServerCompanyWatches(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
