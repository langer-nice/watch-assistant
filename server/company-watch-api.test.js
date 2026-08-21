import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompanyWatchMiddleware } from './company-watch-api.js';

const createResponse = () => ({
  headers: {},
  statusCode: null,
  body: null,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; },
});

const call = async (middleware, { method = 'GET', url = '/api/company-watches', body, headers = {} } = {}) => {
  const response = createResponse();
  await middleware({ method, url, body, headers }, response);
  return response;
};

test('Company Watch endpoints reject anonymous requests before repository access', async () => {
  let repositoryCreated = false;
  const middleware = createCompanyWatchMiddleware({
    repositoryFactory: () => { repositoryCreated = true; return {}; },
  });

  const response = await call(middleware);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    code: 'AUTH_REQUIRED',
    error: 'Authentication is required.',
  });
  assert.equal(repositoryCreated, false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('authenticated collection requests use the verified user repository', async () => {
  const user = { id: '00000000-0000-4000-8000-00000000000a' };
  let repositoryUser = null;
  const watches = [{ id: 'watch-a', title: 'Company A' }];
  const middleware = createCompanyWatchMiddleware({
    authenticate: async () => ({ user, client: { rls: true }, token: 'verified-token' }),
    repositoryFactory: (context) => {
      repositoryUser = context.user;
      return { list: async () => watches };
    },
  });

  const response = await call(middleware);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { watches });
  assert.equal(repositoryUser, user);
});

test('creation returns the persisted baseline outcome and rejects malformed bodies', async () => {
  let received = null;
  const watch = { id: 'watch-a', title: 'Company A' };
  const middleware = createCompanyWatchMiddleware({
    authenticate: async () => ({ user: { id: 'user-a' }, client: {} }),
    repositoryFactory: () => ({
      create: async (input) => {
        received = input;
        return { watch, result: { outcome: 'baseline' } };
      },
    }),
  });

  const response = await call(middleware, {
    method: 'POST',
    body: { siren: '552100554', title: 'Company A', user_id: 'forged-user' },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.outcome, 'baseline');
  assert.equal(received.siren, '552100554');

  const malformed = await call(middleware, { method: 'POST', body: [] });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.code, 'INVALID_BODY');
});

test('item and check routes expose only their supported methods', async () => {
  const middleware = createCompanyWatchMiddleware({
    authenticate: async () => ({ user: { id: 'user-a' }, client: {} }),
    repositoryFactory: () => ({}),
  });

  const item = await call(middleware, { method: 'POST', url: '/api/company-watch?id=watch-a' });
  assert.equal(item.statusCode, 405);
  assert.equal(item.headers.Allow, 'GET, PATCH, DELETE');

  const check = await call(middleware, { method: 'GET', url: '/api/check-company-watch?id=watch-a' });
  assert.equal(check.statusCode, 405);
  assert.equal(check.headers.Allow, 'POST');
});
