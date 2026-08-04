import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckCompanyMiddleware } from './bodacc-api.js';

const VALID_SIREN = '552005969';

const createResponse = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const callEndpoint = async ({ method = 'POST', body, fetchImpl, directoryFetchImpl }) => {
  const request = { method, url: '/api/check-company', body };
  const response = createResponse();
  const originalError = console.error;
  console.error = () => {};
  try {
    await createCheckCompanyMiddleware({
      now: () => new Date('2026-08-04T08:00:00.000Z'),
      fetchImpl,
      directoryFetchImpl,
    })(request, response);
  } finally {
    console.error = originalError;
  }
  return response;
};

test('POST /api/check-company returns the normalized connector response', async () => {
  const response = await callEndpoint({
    body: { siren: '552 005 969' },
    fetchImpl: async () => new Response(JSON.stringify({ total_count: 0, results: [] }), {
      headers: { 'content-type': 'application/json' },
    }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    source: { title: 'BODACC', url: 'https://www.bodacc.fr/' },
    checkedAt: '2026-08-04T08:00:00.000Z',
    items: [],
  });
});

test('POST /api/check-company adds optional official identity without changing BODACC fields', async () => {
  const response = await callEndpoint({
    body: { siren: VALID_SIREN },
    fetchImpl: async () => new Response(JSON.stringify({ total_count: 0, results: [] })),
    directoryFetchImpl: async () => new Response(JSON.stringify({
      results: [{
        siren: VALID_SIREN,
        nom_complet: 'OFFICIAL COMPANY',
        etat_administratif: 'A',
      }],
    })),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.company, {
    siren: VALID_SIREN,
    officialName: 'OFFICIAL COMPANY',
    administrativeStatus: 'active',
    rawStatus: 'A',
    source: 'recherche-entreprises',
  });
  assert.deepEqual(response.body.items, []);
});

test('POST /api/check-company keeps BODACC available when identity lookup fails', async () => {
  const response = await callEndpoint({
    body: { siren: VALID_SIREN },
    fetchImpl: async () => new Response(JSON.stringify({ total_count: 0, results: [] })),
    directoryFetchImpl: async () => { throw new Error('directory unavailable'); },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.items, []);
  assert.equal('company' in response.body, false);
});

test('POST /api/check-company returns 400 for an invalid SIREN', async () => {
  const response = await callEndpoint({
    body: { siren: '123456789' },
    fetchImpl: async () => { throw new Error('must not be called'); },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'INVALID_SIREN');
  assert.match(response.body.error, /valid 9-digit identifier/i);
});

test('POST /api/check-company propagates a safe upstream error as 502', async () => {
  const response = await callEndpoint({
    body: { siren: VALID_SIREN },
    fetchImpl: async () => new Response('private upstream detail', { status: 503 }),
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.body, {
    code: 'UPSTREAM_ERROR',
    error: 'BODACC could not complete the request.',
  });
  assert.doesNotMatch(JSON.stringify(response.body), /private upstream detail/);
});

test('POST /api/check-company rejects a malformed body', async () => {
  const response = await callEndpoint({
    body: 'not-an-object',
    fetchImpl: async () => { throw new Error('must not be called'); },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    code: 'INVALID_BODY',
    error: 'The request body must be a JSON object.',
  });
});

test('POST /api/check-company rejects unsupported HTTP methods', async () => {
  const response = await callEndpoint({ method: 'GET', body: undefined });

  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.body, { error: 'Method not allowed.' });
  assert.equal(response.headers.Allow, 'POST');
});
