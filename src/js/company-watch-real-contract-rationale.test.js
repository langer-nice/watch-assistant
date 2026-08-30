import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createCompanyWatchMiddleware } from '../../server/company-watch-api.js';
import { getWatchRationalePresentation } from './company-watch-rationale.js';

const LEGACY_ORANGE_RATIONALE = 'This Watch will follow future reporting directly related to Enterprise SIREN 380129866., including major developments and significant follow-up reporting.';

const loadMessages = (language) => readFile(
  new URL(`../locales/${language}.json`, import.meta.url),
  'utf8',
).then(JSON.parse);

const createTranslate = (messages) => (key, variables = {}) => {
  const value = key.split('.').reduce((current, part) => current?.[part], messages);
  return Object.entries(variables).reduce(
    (result, [name, replacement]) => result.replaceAll(`{${name}}`, replacement),
    value,
  );
};

const orangeRow = {
  id: '30000000-0000-4000-8000-000000000001',
  user_id: '40000000-0000-4000-8000-000000000001',
  type: 'company_bodacc',
  title: 'ORANGE',
  siren: '380129866',
  request: 'Monitor ORANGE SIREN 380129866',
  summary: LEGACY_ORANGE_RATIONALE,
  category: 'general',
  company_name: 'ORANGE',
  administrative_status: 'active',
  company_status: 'active',
  monitoring_state: 'monitoring',
  current_status: 'watching',
  check_started_at: null,
  last_checked_at: '2026-08-29T10:00:00.000Z',
  last_check_outcome: 'baseline',
  last_check_error_code: null,
  created_at: '2026-08-20T09:00:00.000Z',
  updated_at: '2026-08-29T10:00:00.000Z',
  deleted_at: null,
  company_watch_snapshots: [{
    checked_at: '2026-08-29T10:00:00.000Z',
    source_title: 'BODACC',
    source_url: 'https://www.bodacc.fr/',
    item_ids: [],
    items: [],
  }],
};

const createClient = (row) => ({
  from(table) {
    assert.equal(table, 'watches');
    const query = {
      select() { return query; },
      eq() { return query; },
      is() { return query; },
      order() { return query; },
      then(resolve, reject) {
        return Promise.resolve({ data: [structuredClone(row)], error: null }).then(resolve, reject);
      },
    };
    return query;
  },
});

const createResponse = () => ({
  headers: {}, statusCode: null, body: null,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; },
});

test('real ORANGE row stays canonical through API hydration and always renders locale-derived rationale', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const before = structuredClone(orangeRow);
  const response = createResponse();
  const middleware = createCompanyWatchMiddleware({
    logger: null,
    createRequestId: () => 'request-orange',
    authenticate: async () => ({
      user: { id: orangeRow.user_id },
      client: createClient(orangeRow),
    }),
  });
  await middleware({ method: 'GET', url: '/api/company-watches', headers: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.watches.length, 1);
  assert.equal(response.body.watches[0].inputType, 'company');
  assert.equal(response.body.watches[0].whyFollowing, LEGACY_ORANGE_RATIONALE);
  assert.deepEqual(response.body.watches[0].monitoringSource, {
    type: 'bodacc', provider: 'dila', siren: '380129866', title: 'BODACC',
    discovery: 'official-company',
  });

  let fetchCount = 0;
  globalThis.window = new EventTarget();
  globalThis.fetch = async () => {
    fetchCount += 1;
    return Response.json(response.body);
  };

  try {
    const store = await import(`./company-watch-server-store.js?orange-contract=${Date.now()}`);
    const auth = {
      getState: () => ({
        status: 'authenticated',
        session: { access_token: 'synthetic.header.signature' },
      }),
      subscribe: () => () => {},
    };
    await store.configureCompanyWatchServerStore(auth);
    const hydrated = store.getServerCompanyWatches()[0];
    const [en, fr] = await Promise.all(['en', 'fr'].map(loadMessages));
    const english = getWatchRationalePresentation(
      hydrated, hydrated.whyFollowing, createTranslate(en),
    );
    const french = getWatchRationalePresentation(
      hydrated, hydrated.whyFollowing, createTranslate(fr),
    );

    assert.match(english, /official BODACC announcements concerning ORANGE \(SIREN 380129866\)/u);
    assert.match(french, /annonces officielles publiées au BODACC concernant ORANGE \(SIREN 380129866\)/u);
    assert.doesNotMatch(english, /future reporting directly related/u);
    assert.doesNotMatch(french, /future reporting directly related/u);
    assert.equal(hydrated.whyFollowing, LEGACY_ORANGE_RATIONALE, 'hydration preserves the stored field');

    await store.hydrateServerCompanyWatches();
    const rehydrated = store.getServerCompanyWatches()[0];
    assert.equal(
      getWatchRationalePresentation(rehydrated, rehydrated.whyFollowing, createTranslate(fr)),
      french,
      'a later hydration pass cannot restore legacy presentation',
    );
    assert.equal(fetchCount, 2, 'locale presentation performs no server write or extra request');
    assert.deepEqual(orangeRow, before, 'presentation and hydration do not mutate the database row fixture');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
