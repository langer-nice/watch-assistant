import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createCompanyApiRouter } from './company-api-router.js';
import { CompanyWatchRepositoryError, validateWatchId } from './company-watch-repository.js';

const id = '10000000-0000-4000-8000-00000000000a';
const user = { id: 'owner-a' };
const response = () => ({ headers: {}, statusCode: null, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; },
  end(body) { this.body = body; },
});
const make = (options = {}) => {
  const calls = [];
  const methods = Object.fromEntries(['list', 'create', 'get', 'update', 'remove', 'check'].map(method => [method, async (...args) => {
    calls.push({ method, args });
    if (['get', 'update', 'remove', 'check'].includes(method)) validateWatchId(args[0]);
    if (method === 'list') return [{ id }];
    if (['create', 'check'].includes(method)) return { watch: { id }, result: { outcome: 'baseline', matchedItems: [] } };
    return { id };
  }]));
  const router = createCompanyApiRouter({ logger: null, createRequestId: () => 'request-test',
    authenticate: async () => ({ user, client: { rls: true } }),
    repositoryFactory: context => { assert.equal(context.user, user); return methods; }, ...options });
  return { router, calls };
};
const invoke = async (router, url, method = 'GET', body = {}) => {
  const res = response(); const req = { url, method, body, headers: {}, query: {} };
  await router(req, res); assert.equal(req.url, url); return res;
};
const contracts = [
  ['company-watches', 'GET', 'list', 200], ['company-watches', 'POST', 'create', 201],
  ['company-watch', 'GET', 'get', 200], ['company-watch', 'PATCH', 'update', 200],
  ['company-watch', 'DELETE', 'remove', 200], ['check-company-watch', 'POST', 'check', 200],
];
for (const [path, method, operation, status] of contracts) {
  for (const prefix of ['/api/', '/api/company/']) {
    test(`${method} ${prefix}${path} retains ${operation} contract`, async () => {
      const { router, calls } = make(); const res = await invoke(router, `${prefix}${path}?id=${id}`, method);
      assert.equal(res.statusCode, status); assert.equal(calls.length, 1); assert.equal(calls[0].method, operation);
      assert.equal(res.body.requestId, 'request-test'); assert.equal(res.headers['Cache-Control'], 'no-store');
    });
  }
}
for (const path of ['company-watches', 'company-watch', 'check-company-watch']) {
  test(`${path} authenticates before any repository access`, async () => {
    let accessed = false;
    const { router } = make({ authenticate: undefined, repositoryFactory: () => { accessed = true; } });
    const res = await invoke(router, `/api/company/${path}?id=${id}`);
    assert.equal(res.statusCode, 401); assert.equal(res.body.code, 'AUTH_REQUIRED'); assert.equal(accessed, false);
  });
}
test('method restrictions and Allow headers remain route-specific', async () => {
  for (const [path, supported, allow] of [
    ['company-watches', ['GET', 'POST'], 'GET, POST'],
    ['company-watch', ['GET', 'PATCH', 'DELETE'], 'GET, PATCH, DELETE'],
    ['check-company-watch', ['POST'], 'POST'],
  ]) {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS', 'HEAD'].filter(m => !supported.includes(m))) {
      const { router, calls } = make(); const res = await invoke(router, `/api/company/${path}?id=${id}`, method);
      assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, allow); assert.equal(calls.length, 0);
    }
  }
});
test('query, Vercel dynamic params, bodies and spoofed headers cannot change dispatch', async () => {
  const { router, calls } = make(); const res = response();
  const req = { url: `/api/company/company-watch?id=${id}&operation=check-company-watch&operation=company-watches`,
    method: 'GET', body: { operation: 'check-company-watch', route: 'company-watches' },
    query: { operation: 'check-company-watch' }, headers: { 'x-matched-path': '/api/check-company-watch', 'x-original-url': '/api/company-watches' } };
  await router(req, res); assert.equal(res.statusCode, 200); assert.equal(calls[0].method, 'get'); assert.deepEqual(calls[0].args, [id]);
});
test('duplicate query parameters retain the existing first-id contract', async () => {
  const { router, calls } = make(); await invoke(router, `/api/company/company-watch?id=${id}&id=forged`);
  assert.deepEqual(calls[0].args, [id]);
});
test('unknown/internal template paths and unrelated APIs fail before authentication', async () => {
  const { router } = make({ authenticate: () => { throw Error('Must not authenticate'); } });
  for (const url of ['/api/company/unknown', '/api/company/[operation]', '/api/company-watch-extra', '/api/company', '/api/structured-watches', '/api/check-watch', '/api/cron/company-monitoring', '/api/company/company-watch/extra', '/api/company/%63ompany-watch']) {
    assert.equal((await invoke(router, url)).statusCode, 404);
  }
});
test('missing and invalid Watch IDs retain the repository error contract', async () => {
  for (const suffix of ['', '?id=not-a-uuid']) {
    const { router } = make(); const res = await invoke(router, '/api/company/company-watch' + suffix);
    assert.equal(res.statusCode, 400); assert.equal(res.body.code, 'INVALID_WATCH_ID');
  }
});
test('another owner Watch remains unavailable and error responses unchanged', async () => {
  const { router } = make({ repositoryFactory: () => ({ get: async () => {
    throw new CompanyWatchRepositoryError('WATCH_NOT_FOUND', 404, 'The Company Watch was not found.');
  } }) });
  const res = await invoke(router, `/api/company/company-watch?id=${id}`);
  assert.deepEqual(res.body, { code: 'WATCH_NOT_FOUND', error: 'The Company Watch was not found.', requestId: 'request-test' });
  assert.equal(res.statusCode, 404);
});
test('malformed request bodies remain rejected', async () => {
  for (const [path, method] of [['company-watches', 'POST'], ['company-watch', 'PATCH']]) {
    const { router, calls } = make(); const res = await invoke(router, `/api/company/${path}?id=${id}`, method, []);
    assert.equal(res.statusCode, 400); assert.equal(res.body.code, 'INVALID_BODY'); assert.equal(calls.length, 0);
  }
});
test('native request stream and original URL are preserved', async () => {
  const { router, calls } = make(); const req = Readable.from(['{"title":"Company"}']);
  req.url = '/api/company/company-watches'; req.method = 'POST'; req.headers = {};
  const res = response(); await router(req, res);
  assert.equal(res.statusCode, 201); assert.deepEqual(calls[0].args, [{ title: 'Company' }]); assert.equal(req.url, '/api/company/company-watches');
});
test('configuration preserves exact public URLs and has eleven deployable entry points', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites, ['company-watches', 'company-watch', 'check-company-watch'].map(path => ({ source: '/api/' + path, destination: '/api/company/' + path })));
  assert.equal(config.git.deploymentEnabled['codex/structured-interpretation-v1'], false);
  assert.deepEqual(config.crons, [{ path: '/api/cron/company-monitoring', schedule: '0 6 * * *' }]);
  assert.deepEqual(config.functions, { 'api/watch-suggestion.js': { maxDuration: 60 } });
  const files = await readdir(new URL('../api/', import.meta.url), { recursive: true });
  const entrypoints = files.filter(f => f.endsWith('.js')); assert.equal(entrypoints.length, 11);
  assert(entrypoints.includes('company/[operation].js')); assert(entrypoints.includes('cron/company-monitoring.js'));
  for (const removed of ['company-watch.js', 'company-watches.js', 'check-company-watch.js']) assert(!entrypoints.includes(removed));
});
