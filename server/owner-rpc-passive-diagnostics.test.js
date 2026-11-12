import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from './supabase-service.js';
import { productionWatchOwners, productionOwnerFailure } from './structured-production-access.js';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key = 'sb_secret_syntheticPrivateCredential';
const env = { SUPABASE_SERVICE_ROLE_KEY: key, CRON_SECRET: 'syntheticCronSecret',
  VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) };
const upstream = { code: 'PGRST303', message: 'JWT issued at future',
  details: 'JWT not yet valid', hint: 'Clock skew' };
const capture = t => {
  const events = [];
  t.mock.method(console, 'error', (...args) => { assert.equal(args.length, 1); events.push(JSON.parse(args[0])); });
  return events;
};
const rejectOnce = async (error = upstream, options = { env }, status = 401) => {
  let calls = 0;
  await assert.rejects(productionWatchOwners({ rpc: async name => {
    calls++; assert.equal(name, 'production_watch_owners'); return { error, status, data: null };
  } }, options), actual => {
    const expected = productionOwnerFailure(error, status);
    assert.equal(actual.message, expected.message);
    assert.deepEqual({ ...actual }, { ...expected });
    assert.equal(actual.cause, undefined);
    return true;
  });
  assert.equal(calls, 1);
};

test('success returns the original array with one RPC and no diagnostic event', async t => {
  const events = capture(t), owners = [owner]; let calls = 0;
  const result = await productionWatchOwners({ rpc: async name => {
    calls++; assert.equal(name, 'production_watch_owners'); return { data: owners, status: 200 };
  } }, { env });
  assert.strictEqual(result, owners); assert.equal(calls, 1); assert.deepEqual(events, []);
});

test('failure logs exactly once, retaining safe error fields and the existing propagated error', async t => {
  const events = capture(t); await rejectOnce();
  assert.equal(events.length, 1);
  const event = events[0];
  for (const field of ['code', 'message', 'details', 'hint']) assert.equal(event[field], upstream[field]);
  assert.equal(event.event, 'owner_rpc_auth_failure'); assert.equal(event.rpc, 'production_watch_owners');
  assert.equal(event.httpStatus, 401); assert.equal(event.keyFamily, 'sb_secret');
  assert.equal(event.nodeVersion, process.version); assert.match(event.sdkVersion, /^\d+\.\d+\.\d+/);
  assert.equal(event.deploymentEnvironment, 'production'); assert.equal(event.deploymentCommit, env.VERCEL_GIT_COMMIT_SHA);
  assert.equal(new Date(event.timestamp).toISOString(), event.timestamp);
  for (const absent of ['requestId', 'responseDate', 'headers', 'data', 'cause', 'stack']) assert(!Object.hasOwn(event, absent));
});

test('missing optional error and environment fields are omitted, not invented', async t => {
  const events = capture(t);
  await assert.rejects(productionWatchOwners({ rpc: async () => ({ error: {} }) }, { env: {} }));
  assert.equal(events.length, 1);
  const event = events[0];
  assert.deepEqual(Object.keys(event).sort(), ['event', 'timestamp', 'rpc', 'sdkVersion', 'nodeVersion'].sort());
});

test('raw key, cron secret, auth/apikey values, owner data and arbitrary causes cannot enter logs', async t => {
  const events = capture(t);
  const privateValues = [key, env.CRON_SECRET, owner, 'alice@example.test', 'Alice', 'opaqueCredential',
    'eyJhbGciOiJIUzI1NiJ9.private.signature', 'private.example.test'];
  const text = `JWT expired; ${privateValues.join(' ')}; Authorization: Bearer invalid`;
  await rejectOnce({ ...upstream, message: text, details: 'JWT expired; apikey: valid',
    hint: 'JWT expired; Cookie: valid', data: [owner], cause: { message: text }, headers: { authorization: 'Bearer invalid', apikey: key } });
  const serialized = JSON.stringify(events);
  for (const value of [...privateValues, 'Bearer invalid', 'apikey', 'authorization', 'Cookie: valid']) assert(!serialized.includes(value), value);
  assert.equal(events[0].message.startsWith('JWT expired;'), true);
  assert.equal(events[0].details, 'JWT expired; [redacted]');
  assert.equal(events[0].hint, 'JWT expired; [redacted]');
});

test('known credentials are removed even when composed of allowed auth vocabulary', async t => {
  const events = capture(t);
  await rejectOnce({ ...upstream, message: 'JWT invalid signature' }, { env: { SUPABASE_SERVICE_ROLE_KEY: 'invalid signature' } });
  assert.equal(events[0].message, 'JWT [redacted]');
});

test('fingerprint is stable, short, one-way and changes with the key', async t => {
  const events = capture(t);
  await rejectOnce(); await rejectOnce();
  await rejectOnce(upstream, { env: { ...env, SUPABASE_SERVICE_ROLE_KEY: key + 'Different' } });
  const expected = createHash('sha256').update(key).digest('hex');
  assert.equal(events[0].keyFingerprint, expected.slice(0, 8));
  assert.match(events[0].keyFingerprint, /^[a-f0-9]{8}$/);
  assert.equal(events[0].keyFingerprint, events[1].keyFingerprint);
  assert.notEqual(events[0].keyFingerprint, events[2].keyFingerprint);
  assert(!JSON.stringify(events).includes(expected));
});

test('transport rejection preserves the original error mapping, with no retry or invented status', async t => {
  const events = capture(t); let calls = 0;
  const cause = { code: 'PGRST303', message: 'JWT expired', details: 'JWT not yet valid' };
  await assert.rejects(productionWatchOwners({ rpc: async () => { calls++; throw cause; } }, { env }), error => {
    const expected = productionOwnerFailure(cause);
    assert.equal(error.message, expected.message); assert.deepEqual({ ...error }, { ...expected }); return true;
  });
  assert.equal(calls, 1); assert.equal(events.length, 1); assert(!Object.hasOwn(events[0], 'httpStatus'));
});

test('a throwing logger cannot change error propagation or trigger another RPC', async t => {
  t.mock.method(console, 'error', () => { throw Error('logger unavailable'); });
  await rejectOnce();
});

test('invalid owner data still fails closed without logging its payload', async t => {
  const events = capture(t); let calls = 0;
  await assert.rejects(productionWatchOwners({ rpc: async () => {
    calls++; return { data: [owner, 'private-owner-value'], status: 200 };
  } }, { env }), error => {
    assert.equal(error.message, productionOwnerFailure(null, 200).message);
    assert.equal(error.upstreamStatus, 200); return true;
  });
  assert.equal(calls, 1); assert.equal(events.length, 1);
  assert(!JSON.stringify(events).includes(owner)); assert(!JSON.stringify(events).includes('private-owner-value'));
});

test('installed SDK shape is observed with mocked HTTP only; unrelated RPCs produce no instrumentation', async t => {
  const events = capture(t), requests = [];
  const client = createSupabaseServiceClient({ env: { ...env, SUPABASE_URL: 'https://synthetic.example.test' },
    createClientImpl: (url, credential, options) => createClient(url, credential, { ...options, global: {
      fetch: async (input, init) => {
        requests.push(String(input)); assert.equal(new Headers(init.headers).get('apikey'), key);
        assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${key}`);
        return new Response(JSON.stringify(upstream), { status: 401, headers: {
          'Content-Type': 'application/json', 'sb-request-id': 'synthetic-request', Date: 'Thu, 12 Nov 2026 08:00:00 GMT',
        } });
      },
    } }),
  });
  const other = await client.rpc('unrelated_rpc');
  assert.equal(other.status, 401); assert.deepEqual(events, []);
  assert.deepEqual(Object.keys(other).sort(), ['success', 'error', 'data', 'count', 'status', 'statusText'].sort());
  assert.deepEqual(other.error, upstream);
  await assert.rejects(productionWatchOwners(client, { env }));
  assert.equal(requests.length, 2);
  assert(requests[0].endsWith('/rpc/unrelated_rpc')); assert(requests[1].endsWith('/rpc/production_watch_owners'));
  assert.equal(events.length, 1); assert.equal(events[0].code, 'PGRST303');
  assert(!Object.hasOwn(events[0], 'requestId')); assert(!Object.hasOwn(events[0], 'responseDate'));
});

test('untrusted optional metadata is omitted and text is bounded to a single log line', async t => {
  const events = capture(t);
  await rejectOnce({ code: 'private-owner', message: 'JWT expired\n' + 'invalid signature '.repeat(100), details: null, hint: '' },
    { env: { VERCEL_ENV: 'private-owner', VERCEL_GIT_COMMIT_SHA: owner } }, '401');
  assert(!Object.hasOwn(events[0], 'code')); assert(!Object.hasOwn(events[0], 'httpStatus'));
  assert(!Object.hasOwn(events[0], 'details')); assert(!Object.hasOwn(events[0], 'hint'));
  assert(!Object.hasOwn(events[0], 'deploymentCommit')); assert(!Object.hasOwn(events[0], 'deploymentEnvironment'));
  assert(events[0].message.length <= 400); assert(!events[0].message.includes('\n'));
});
