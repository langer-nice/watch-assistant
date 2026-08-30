import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompanyWatchMiddleware } from './company-watch-api.js';
import { CompanyWatchRepositoryError } from './company-watch-repository.js';

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
  const entries = [];
  const middleware = createCompanyWatchMiddleware({
    logger: {
      info: (message, details) => entries.push({ level: 'info', message, details }),
      warn: (message, details) => entries.push({ level: 'warn', message, details }),
    },
    createRequestId: () => 'request-anonymous',
    repositoryFactory: () => { repositoryCreated = true; return {}; },
  });

  const response = await call(middleware);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    code: 'AUTH_REQUIRED',
    error: 'Authentication is required.',
    requestId: 'request-anonymous',
  });
  assert.equal(repositoryCreated, false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['X-Request-Id'], 'request-anonymous');
  assert.equal(entries.some(({ level, details }) => (
    level === 'warn'
    && details.authenticated === false
    && details.stage === 'authenticate'
    && details.code === 'AUTH_REQUIRED'
    && details.statusCode === 401
  )), true);
});

test('authenticated collection requests use the verified user repository', async () => {
  const user = { id: '00000000-0000-4000-8000-00000000000a' };
  let repositoryUser = null;
  const watches = [{ id: 'watch-a', title: 'Company A' }];
  const middleware = createCompanyWatchMiddleware({
    logger: null,
    createRequestId: () => 'request-list',
    authenticate: async () => ({ user, client: { rls: true }, token: 'verified-token' }),
    repositoryFactory: (context) => {
      repositoryUser = context.user;
      return { list: async () => watches };
    },
  });

  const response = await call(middleware);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { watches, requestId: 'request-list' });
  assert.equal(repositoryUser, user);
});

test('creation returns the persisted baseline outcome and rejects malformed bodies', async () => {
  let received = null;
  const watch = { id: 'watch-a', title: 'Company A' };
  const middleware = createCompanyWatchMiddleware({
    logger: null,
    createRequestId: () => 'request-create',
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

test('duplicate creation returns only the authenticated user’s existing Watch identity', async () => {
  const existingWatch = { id: '00000000-0000-4000-8000-00000000000a', title: 'Company A' };
  const middleware = createCompanyWatchMiddleware({
    logger: null,
    createRequestId: () => 'request-duplicate',
    authenticate: async () => ({ user: { id: 'user-a' }, client: { rls: true } }),
    repositoryFactory: () => ({
      create: async () => {
        throw new CompanyWatchRepositoryError(
          'ACTIVE_WATCH_EXISTS', 409, 'Duplicate.', { existingWatch },
        );
      },
    }),
  });

  const response = await call(middleware, {
    method: 'POST', body: { siren: '552100554', title: 'Company A' },
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body.existingWatch, existingWatch);
  assert.equal(response.body.requestId, 'request-duplicate');
  assert.equal('userId' in response.body, false);
});

test('item and check routes expose only their supported methods', async () => {
  const middleware = createCompanyWatchMiddleware({
    logger: null,
    createRequestId: () => 'request-method',
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

test('authenticated PATCH forwards canonical category and returns the persisted category', async () => {
  const user = { id: 'verified-user' };
  let repositoryUser = null;
  let received = null;
  const persisted = { id: 'watch-a', category: 'finance' };
  const middleware = createCompanyWatchMiddleware({
    logger: null,
    createRequestId: () => 'request-category',
    authenticate: async () => ({ user, client: { rls: true } }),
    repositoryFactory: (context) => {
      repositoryUser = context.user;
      return {
        update: async (id, input) => {
          received = { id, input };
          return persisted;
        },
      };
    },
  });

  const response = await call(middleware, {
    method: 'PATCH',
    url: '/api/company-watch?id=00000000-0000-4000-8000-00000000000a',
    body: { category: 'finance', user_id: 'forged-user' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(repositoryUser, user);
  assert.deepEqual(received, {
    id: '00000000-0000-4000-8000-00000000000a',
    input: { category: 'finance', user_id: 'forged-user' },
  });
  assert.equal(response.body.watch.category, 'finance');
});

test('safe diagnostics correlate request stages and responses without user or payload data', async () => {
  const entries = [];
  const logger = {
    info: (message, details) => entries.push({ level: 'info', message, details }),
    warn: (message, details) => entries.push({ level: 'warn', message, details }),
  };
  const middleware = createCompanyWatchMiddleware({
    logger,
    createRequestId: () => 'request-diagnostic',
    authenticate: async () => ({
      user: { id: 'private-user-id' }, client: {}, token: 'private-token',
    }),
    repositoryFactory: ({ onCompanyWatchStage }) => ({
      create: async () => {
        onCompanyWatchStage('create-watch-insert');
        throw new Error('database contained private payload text');
      },
    }),
  });

  const response = await call(middleware, {
    method: 'POST',
    body: { siren: 'private-siren', title: 'private-title' },
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    code: 'INTERNAL_ERROR',
    error: 'The request could not be completed.',
    requestId: 'request-diagnostic',
  });
  assert.equal(response.headers['X-Request-Id'], 'request-diagnostic');
  assert.equal(entries[0].details.stage, 'request-arrival');
  assert.equal(entries.some(({ details }) => (
    details.authenticated === true && details.stage === 'authenticated'
  )), true);
  assert.equal(entries.some(({ details }) => (
    details.stage === 'create-watch-insert'
    && details.code === 'INTERNAL_ERROR'
    && details.statusCode === 500
  )), true);
  assert.equal(entries.some(({ message, details }) => (
    message === '[Company Watches] Response sent.' && details.statusCode === 500
  )), true);
  const serialized = JSON.stringify(entries);
  assert.doesNotMatch(serialized, /private-user-id|private-token|private-siren|private-title|private payload/u);
});
