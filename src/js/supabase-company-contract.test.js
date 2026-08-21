import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260821120000_company_watch_persistence.sql',
  import.meta.url,
);

test('Company snapshot schema is bounded, owner-scoped, and authenticated-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create table public\.company_watch_snapshots/i);
  assert.match(sql, /watch_id uuid primary key references public\.watches\(id\) on delete cascade/i);
  assert.match(sql, /jsonb_array_length\(items\) <= 100/i);
  assert.match(sql, /cardinality\(item_ids\) <= 100/i);
  assert.match(sql, /alter table public\.company_watch_snapshots enable row level security/i);
  assert.match(sql, /revoke all on table public\.company_watch_snapshots from anon/i);
  for (const action of ['select', 'insert', 'update', 'delete']) {
    assert.match(sql, new RegExp(`create policy company_watch_snapshots_${action}_own`, 'i'));
  }
  assert.match(sql, /watches\.user_id = \(select auth\.uid\(\)\)/i);
});

test('manual Company checks use database claims and atomic snapshot completion', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create or replace function public\.claim_company_watch_check/i);
  assert.match(sql, /check_started_at < timezone\('utc', now\(\)\) - interval '2 minutes'/i);
  assert.match(sql, /create or replace function public\.complete_company_watch_check/i);
  assert.match(sql, /for update;/i);
  assert.match(sql, /on conflict \(watch_id\) do update/i);
  assert.match(sql, /create or replace function public\.fail_company_watch_check/i);
  assert.match(sql, /grant execute on function public\.claim_company_watch_check\(uuid\) to authenticated/i);
  assert.doesNotMatch(sql, /security definer/i);
});

test('the Company isolation test covers both users, forged ownership, and anonymous access', async () => {
  const sql = await readFile(
    new URL('../../supabase/tests/company_watch_rls.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /user B can read user A Watch/);
  assert.match(sql, /user B modified user A Watch/);
  assert.match(sql, /user B attached a snapshot to user A Watch/);
  assert.match(sql, /user B claimed user A check/);
  assert.match(sql, /anonymous role can read Watches/);
  assert.match(sql, /anonymous role can read snapshots/);
});
