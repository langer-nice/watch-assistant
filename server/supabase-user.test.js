import assert from 'node:assert/strict';
import test from 'node:test';

import { authenticateSupabaseRequest } from './supabase-user.js';

const request = (authorization) => ({ headers: authorization ? { authorization } : {} });

test('server authentication rejects missing and malformed Bearer tokens', async () => {
  await assert.rejects(
    authenticateSupabaseRequest(request(), {
      env: { SUPABASE_URL: 'https://pilot.supabase.co', SUPABASE_ANON_KEY: 'public-key' },
    }),
    ({ code, statusCode }) => code === 'AUTH_REQUIRED' && statusCode === 401,
  );

  await assert.rejects(
    authenticateSupabaseRequest(request('Basic not-a-bearer-token'), {
      env: { SUPABASE_URL: 'https://pilot.supabase.co', SUPABASE_ANON_KEY: 'public-key' },
    }),
    ({ code, statusCode }) => code === 'AUTH_REQUIRED' && statusCode === 401,
  );
});

test('server authentication rejects a JWT that Supabase Auth cannot verify', async () => {
  let repositoryClientCreated = false;
  const createClientImpl = () => ({
    auth: {
      getUser: async (token) => {
        assert.equal(token, 'invalid.jwt.token');
        return { data: { user: null }, error: { message: 'invalid JWT' } };
      },
    },
  });

  await assert.rejects(
    authenticateSupabaseRequest(request('Bearer invalid.jwt.token'), {
      env: { SUPABASE_URL: 'https://pilot.supabase.co', SUPABASE_ANON_KEY: 'public-key' },
      createClientImpl: (...args) => {
        if (args[2]?.global?.headers?.Authorization) repositoryClientCreated = true;
        return createClientImpl(...args);
      },
    }),
    ({ code, statusCode }) => code === 'INVALID_SESSION' && statusCode === 401,
  );
  assert.equal(repositoryClientCreated, false);
});

test('verified authentication builds an RLS client with the same user JWT and public key', async () => {
  const calls = [];
  const user = { id: '10000000-0000-4000-8000-00000000000a' };
  const createClientImpl = (url, key, options) => {
    calls.push({ url, key, options });
    return calls.length === 1
      ? { auth: { getUser: async () => ({ data: { user }, error: null }) } }
      : { rls: true };
  };

  const result = await authenticateSupabaseRequest(request('Bearer verified.jwt.token'), {
    env: { SUPABASE_URL: 'https://pilot.supabase.co', SUPABASE_ANON_KEY: 'public-key' },
    createClientImpl,
  });

  assert.equal(result.user, user);
  assert.equal(result.client.rls, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].key, 'public-key');
  assert.equal(calls[1].key, 'public-key');
  assert.equal(calls[1].options.global.headers.Authorization, 'Bearer verified.jwt.token');
});
