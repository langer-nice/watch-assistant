import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createPlanWatchMiddleware } from './plan-watch-api.js';

const callMiddleware = async ({
  method = 'POST', body = '{}', options = {}, url = '/api/plan-watch',
} = {}) => {
  const request = Readable.from([body]);
  request.method = method;
  request.url = url;
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
  await createPlanWatchMiddleware(options)(request, response, () => {
    assert.fail('The planner endpoint should handle this request.');
  });
  return response;
};

test('POST /api/plan-watch returns the normalized planner response', async () => {
  const response = await callMiddleware({
    body: JSON.stringify({ request: 'Monitor company SIREN 905266524' }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    strategy: 'official_company',
    connector: 'bodacc',
    country: 'FR',
    identifier: '905266524',
    confidence: 1,
    needsClarification: false,
    clarificationQuestion: null,
  });
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('POST /api/plan-watch accepts a valid standalone SIREN', async () => {
  const response = await callMiddleware({
    url: '/api/plan-watch?scope=official_company',
    body: JSON.stringify({ request: '905266524' }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    strategy: 'official_company',
    connector: 'bodacc',
    country: 'FR',
    identifier: '905266524',
    confidence: 1,
    needsClarification: false,
    clarificationQuestion: null,
  });
});

test('POST /api/plan-watch accepts company name plus SIREN without a verb', async () => {
  const response = await callMiddleware({
    url: '/api/plan-watch?scope=official_company',
    body: JSON.stringify({ request: 'CEMEX GRANULATS 552005969' }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    strategy: 'official_company',
    connector: 'bodacc',
    country: 'FR',
    identifier: '552005969',
    confidence: 1,
    needsClarification: false,
    clarificationQuestion: null,
  });
});

test('migrated route scope returns a Media Story decision without RSS discovery', async () => {
  const request = 'https://www.bbc.com/news/articles/example';
  const response = await callMiddleware({
    url: '/api/plan-watch?scope=migrated_routes',
    body: JSON.stringify({ request }),
    options: {
      discoverSource: async () => assert.fail('Media planning must not run RSS discovery.'),
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    strategy: 'media_story',
    connector: 'media_story',
    country: null,
    identifier: request,
    confidence: 0.9,
    needsClarification: false,
    clarificationQuestion: null,
  });
});

test('invalid JSON and unsupported methods still return the exact planner schema', async () => {
  const [invalidJson, wrongMethod] = await Promise.all([
    callMiddleware({ body: '{bad json' }),
    callMiddleware({ method: 'GET' }),
  ]);
  const keys = [
    'strategy',
    'connector',
    'country',
    'identifier',
    'confidence',
    'needsClarification',
    'clarificationQuestion',
  ];

  assert.equal(invalidJson.statusCode, 400);
  assert.equal(wrongMethod.statusCode, 405);
  for (const response of [invalidJson, wrongMethod]) {
    assert.deepEqual(Object.keys(response.body), keys);
    assert.equal(response.body.strategy, 'unknown');
    assert.equal(response.body.connector, null);
    assert.equal(response.body.needsClarification, true);
  }
});

test('planner discovery failures are normalized instead of reaching the caller', async () => {
  const response = await callMiddleware({
    body: JSON.stringify({ request: 'Monitor energy news' }),
    options: { discoverSource: async () => { throw new Error('upstream detail'); } },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    strategy: 'web_search',
    connector: 'web_ai',
    country: null,
    identifier: null,
    confidence: 0.5,
    needsClarification: false,
    clarificationQuestion: null,
  });
});

test('company migration scope does not run RSS discovery for non-Company requests', async () => {
  const response = await callMiddleware({
    url: '/api/plan-watch?scope=official_company',
    body: JSON.stringify({ request: 'Monitor energy news' }),
    options: {
      discoverSource: async () => assert.fail('Company migration must not run RSS discovery.'),
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    strategy: 'web_search',
    connector: 'web_ai',
    country: null,
    identifier: null,
    confidence: 0.5,
    needsClarification: false,
    clarificationQuestion: null,
  });
});
