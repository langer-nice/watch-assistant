import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaWatchMiddleware } from './media-watch-api.js';

const requestBody = () => ({
  revision: 3,
  mutation: '00000000-0000-4000-8000-000000000002',
  deleted: false,
  definition: {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Fixture',
    monitoring_state: 'monitoring',
    monitoring_source: { type: 'feed', url: 'https://fixture.example/rss' },
    watch_definition: {
      inputType: 'text', category: 'news', request: 'Fixture mentions',
      mediaMention: { subjects: ['Fixture'], matchMode: 'all' },
    },
  },
});

async function persist(rpcResult) {
  const calls = [];
  const headers = {};
  let status, body, responses = 0;
  const handler = createMediaWatchMiddleware({
    authenticate: async () => ({
      user: { id: 'fixture' },
      client: { rpc: async (name, args) => {
        calls.push({ name, args });
        if (rpcResult instanceof Error) throw rpcResult;
        return rpcResult;
      } },
    }),
  });
  await handler({ url: '/api/media-watches', method: 'POST', body: requestBody() }, {
    setHeader(name, value) { headers[name] = value; },
    set statusCode(value) { status = value; },
    end(value) { responses++; body = JSON.parse(value); },
  });
  assert.equal(calls.length, 1, 'no second persistence RPC');
  assert.equal(calls[0].name, 'persist_media_watch');
  assert.equal(calls[0].args.p_revision, 3);
  assert.equal(calls[0].args.p_mutation, requestBody().mutation);
  assert.equal(responses, 1, 'one terminal response');
  assert.equal(headers['Cache-Control'], 'no-store');
  return { status, body };
}

for (const code of ['40001', 'PT409']) {
  test(`${code} returns MEDIA_CONFLICT / 409 without retry`, async () => {
    assert.deepEqual(await persist({ data: null, error: { code } }), {
      status: 409, body: { code: 'MEDIA_CONFLICT' },
    });
  });
}

for (const code of ['PGRST003', '42501', 'XX000', undefined]) {
  test(`database error ${code} remains an unavailable response`, async () => {
    assert.deepEqual(await persist({ data: null, error: { code } }), {
      status: 503,
      body: { code: 'PERSISTENCE_UNAVAILABLE', error: 'Media Watch persistence is unavailable.' },
    });
  });
}

test('network rejection is not disguised as a conflict', async () => {
  assert.equal((await persist(new Error('fixture network failure'))).status, 503);
});

test('successful persistence keeps its existing response', async () => {
  const watch = { id: requestBody().definition.id, media_revision: 4 };
  assert.deepEqual(await persist({ data: watch, error: null }), {
    status: 200, body: { watch },
  });
});
