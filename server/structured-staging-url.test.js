import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { Socket } from 'node:net';
import { structuredCreationEnabled, structuredStagingUrlMatches } from './structured-creation-access.js';
import { createStructuredWatchMiddleware } from './structured-watch-api.js';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { examples } from './test-support/watch-definition-fixtures.js';
import { compileMonitoringPlan } from './watch-capabilities.js';

const staging = 'https://tseexvbwhrtofcsrvcqc.supabase.co';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env = () => ({ SUPABASE_URL: staging, VERCEL_ENV: 'preview', STRUCTURED_WATCH_BACKEND_ENABLED: 'true',
  STRUCTURED_WATCH_CREATION_ENABLED: 'true', STRUCTURED_WATCH_TEST_USER_IDS: owner,
  STRUCTURED_WATCH_SIGNING_SECRET: 'synthetic-structured-signing-only-'.repeat(2) });
const invoke = async (handler, url, method = 'POST', body = {}) => {
  const response = { setHeader() {}, end(raw) { this.body = JSON.parse(raw); } };
  await handler({ url, method, body, headers: { 'x-supabase-url': staging }, query: { SUPABASE_URL: staging } }, response);
  return response;
};
const invalidUrls = [
  ['missing', undefined], ['empty', ''], ['Production', 'https://cztpitujsnzhhenedwjn.supabase.co'],
  ['other project', 'https://synthetic-other.supabase.co'], ['lookalike host', staging + '.attacker.example'],
  ['trailing slash', staging + '/'], ['trailing space', staging + ' '], ['leading space', ' ' + staging],
  ['newline', staging + '\n'], ['extra path', staging + '/rest/v1'], ['query', staging + '?project=staging'],
  ['fragment', staging + '#staging'], ['HTTP', staging.replace('https:', 'http:')],
  ['embedded userinfo', staging.replace('https://', 'https://synthetic@')], ['explicit port', staging + ':443'],
  ['uppercase', staging.toUpperCase()], ['malformed', 'not a URL'], ['non-string', new URL(staging)],
];
test('exact Staging string alone is accepted without normalization', () => {
  assert.equal(structuredStagingUrlMatches({ SUPABASE_URL: staging }), true);
  assert.equal(structuredCreationEnabled(env()), true);
});
for (const [name, url] of invalidUrls) test(name + ' rejected on every structured HTTP operation before auth/client/provider/SQL', async () => {
  const config = { ...env(), SUPABASE_URL: url, VITE_SUPABASE_URL: staging };
  let calls = 0; const forbidden = () => { calls++; throw Error('Synthetic forbidden side effect'); };
  const options = { env: config, authenticate: forbidden, createClientImpl: forbidden,
    serviceClient: { rpc: forbidden }, fetchImpl: forbidden, discoverSource: forbidden };
  const structured = createStructuredWatchMiddleware(options);
  for (const [method, body] of [['GET', undefined], ['POST', { action: 'issue', SUPABASE_URL: staging }], ['POST', { action: 'confirm', SUPABASE_URL: staging }]]) {
    const r = await invoke(structured, '/api/structured-watches', method, body);
    assert.equal(r.statusCode, 404); assert.equal(r.body.code, 'STRUCTURED_FEATURE_UNAVAILABLE');
  }
  const planned = await invoke(createPlanWatchMiddleware(options), '/api/plan-watch?mode=interpretation.v1', 'POST',
    { request: 'Synthetic news request', language: 'en', SUPABASE_URL: staging });
  assert.equal(planned.statusCode, 404); assert.equal(planned.body.code, 'STRUCTURED_FEATURE_UNAVAILABLE');
  assert.equal(calls, 0); assert.equal(structuredCreationEnabled(config), false);
});
test('public VITE URL cannot substitute for server URL', () => {
  const config = env(); delete config.SUPABASE_URL; config.VITE_SUPABASE_URL = staging;
  assert.equal(structuredCreationEnabled(config), false);
});
test('valid Staging retains feature gates, Production block and owner allowlist', async () => {
  for (const patch of [{ VERCEL_ENV: 'production' }, { STRUCTURED_WATCH_CREATION_ENABLED: 'false' }, { STRUCTURED_WATCH_BACKEND_ENABLED: 'false' }]) {
    const handler = createStructuredWatchMiddleware({ env: { ...env(), ...patch }, authenticate: () => assert.fail('No auth while gated') });
    assert.equal((await invoke(handler, '/api/structured-watches', 'GET')).statusCode, 404);
  }
  const handler = createStructuredWatchMiddleware({ env: env(), authenticate: async () => ({ user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }) });
  assert.equal((await invoke(handler, '/api/structured-watches', 'GET')).statusCode, 403);
});
test('valid signed confirmation cannot bypass changed runtime URL; restoring Staging retains paused persistence', async () => {
  const config = env(); let authCalls = 0, rpcCalls = 0;
  const handler = createStructuredWatchMiddleware({ env: config, now: () => 2000000000000,
    authenticate: async () => { authCalls++; return { user: { id: owner } }; },
    serviceClient: { async rpc(_name, p) { rpcCalls++; return { data: { id: p.p_id, ownerId: p.p_owner,
      mutationId: p.p_mutation, operation: p.p_operation, expectedRevision: p.p_revision, revision: 1,
      definitionFingerprint: p.p_definition_fingerprint, payloadFingerprint: p.p_payload_fingerprint, monitoringState: 'paused' }, error: null }; } } });
  const interpretation = examples()[0];
  const identity = { watchId: id, mutationId: id, operation: 'create', expectedRevision: 0, title: 'Synthetic' };
  const issued = await invoke(handler, '/api/structured-watches', 'POST', { action: 'issue', ...identity,
    interpretation, plan: compileMonitoringPlan(interpretation, { structured: true }) });
  assert.equal(issued.statusCode, 200); assert.equal(rpcCalls, 0);
  const confirm = { action: 'confirm', ...identity, token: issued.body.token, definition: issued.body.definition };
  config.SUPABASE_URL = 'https://synthetic-other.supabase.co';
  assert.equal((await invoke(handler, '/api/structured-watches', 'POST', confirm)).statusCode, 404);
  assert.equal(authCalls, 1); assert.equal(rpcCalls, 0);
  config.SUPABASE_URL = staging;
  const saved = await invoke(handler, '/api/structured-watches', 'POST', confirm);
  assert.equal(saved.statusCode, 200); assert.equal(saved.body.receipt.monitoringState, 'paused'); assert.equal(rpcCalls, 1);
});
test('failed guard never reaches actual auth client initialization or network', async () => {
  let clients = 0;
  const forbidden = () => { throw Error('Synthetic unexpected network'); };
  const fetchMock = mock.method(globalThis, 'fetch', forbidden); const socketMock = mock.method(Socket.prototype, 'connect', forbidden);
  try {
    const config = { ...env(), SUPABASE_URL: 'https://synthetic-other.supabase.co' };
    const options = { env: config, createClientImpl: () => { clients++; throw Error('Synthetic client must not initialize'); } };
    const r = await invoke(createStructuredWatchMiddleware(options), '/api/structured-watches', 'GET');
    assert.equal(r.statusCode, 404);
    assert.equal((await invoke(createPlanWatchMiddleware(options), '/api/plan-watch?mode=interpretation.v1')).statusCode, 404);
    assert.equal(clients, 0); assert.equal(fetchMock.mock.callCount(), 0); assert.equal(socketMock.mock.callCount(), 0);
  } finally { fetchMock.mock.restore(); socketMock.mock.restore(); }
});
test('unrelated routes pass through and legacy planner does not require Staging guard', async () => {
  let next = 0;
  const options = { env: { ...env(), SUPABASE_URL: undefined }, authenticate: () => assert.fail('No structured auth'),
    fetchImpl: () => assert.fail('No AI/provider'), discoverSource: () => assert.fail('No source discovery') };
  const response = { setHeader() {}, end(raw) { this.body = JSON.parse(raw); } };
  await createStructuredWatchMiddleware(options)({ url: '/legacy', method: 'GET' }, response, () => next++);
  await createPlanWatchMiddleware(options)({ url: '/legacy', method: 'GET' }, response, () => next++);
  assert.equal(next, 2);
  const legacy = await invoke(createPlanWatchMiddleware(options), '/api/plan-watch?scope=migrated_routes', 'POST', { request: 'Keep me updated on Jannik Sinner.' });
  assert.equal(legacy.statusCode, 200); assert.equal('interpretation' in legacy.body, false);
});
