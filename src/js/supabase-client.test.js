import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSupabaseBrowserClient,
  getSupabaseBrowserConfig,
} from './supabase-client.js';

test('initializes the Supabase browser client with valid public configuration', () => {
  const calls = [];
  const result = createSupabaseBrowserClient({
    env: {
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    },
    createClientImpl: (...args) => {
      calls.push(args);
      return { auth: {} };
    },
  });

  assert.ok(result.client);
  assert.deepEqual(calls, [[
    'https://project.supabase.co',
    'public-anon-key',
    { auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true } },
  ]]);
});

test('missing Supabase configuration is safely disabled for DEV and Test Data', () => {
  let called = false;
  const result = createSupabaseBrowserClient({
    env: { DEV: true, VITE_VERCEL_ENV: 'preview' },
    createClientImpl: () => { called = true; },
  });

  assert.equal(result.client, null);
  assert.equal(result.config.enabled, false);
  assert.equal(result.config.reason, 'missing-config');
  assert.equal(called, false);
});

test('rejects invalid URLs and any service-role key exposed with VITE_', () => {
  assert.equal(getSupabaseBrowserConfig({
    VITE_SUPABASE_URL: 'http://not-secure.test',
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
  }).reason, 'invalid-url');

  assert.throws(
    () => getSupabaseBrowserConfig({ VITE_SUPABASE_SERVICE_ROLE_KEY: 'must-not-bundle' }),
    /must never be exposed/,
  );
});
