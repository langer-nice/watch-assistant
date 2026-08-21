import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20260820120000_supabase_foundations.sql', import.meta.url);

test('all user tables enable RLS and expose only ownership-scoped policies', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of ['profiles', 'watches']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon`, 'i'));
  }

  for (const action of ['select', 'insert', 'update', 'delete']) {
    assert.match(sql, new RegExp(`create policy profiles_${action}_own`, 'i'));
    assert.match(sql, new RegExp(`create policy watches_${action}_own`, 'i'));
  }
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/i);
});

test('ownership policies refuse cross-user reads and writes by construction', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const isolationTest = await readFile(new URL('../../supabase/tests/rls_isolation.sql', import.meta.url), 'utf8');

  assert.match(sql, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(isolationTest, /user B can read another user row/);
  assert.match(isolationTest, /user B modified user A row/);
  assert.match(isolationTest, /user B inserted a row for user A/);
});

test('minimal Company Watches keep the required active SIREN uniqueness contract', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /on public\.watches \(user_id, siren\)\s+where deleted_at is null/i);
});

test('browser code never reads or embeds a service-role value', async () => {
  const client = await readFile(new URL('./supabase-client.js', import.meta.url), 'utf8');
  const env = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  const vite = await readFile(new URL('../../vite.config.js', import.meta.url), 'utf8');

  assert.match(client, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY\s*\?\?|SUPABASE_SERVICE_ROLE_KEY\s*\|\|/);
  assert.match(env, /SUPABASE_SERVICE_ROLE_KEY=configure_in_vercel/);
  assert.match(vite, /VITE_SUPABASE_SERVICE_ROLE_KEY is forbidden/);
});
