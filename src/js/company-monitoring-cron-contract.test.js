import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Vercel config has exactly one daily Company monitoring cron', async () => {
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons, [{ path: '/api/cron/company-monitoring', schedule: '0 6 * * *' }]);
});

test('service-role key remains in server-only modules and never has a VITE prefix', async () => {
  const server = await readFile(new URL('../../server/supabase-service.js', import.meta.url), 'utf8');
  const browser = await readFile(new URL('./supabase-client.js', import.meta.url), 'utf8');
  assert.match(server, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(browser, /(?<!VITE_)SUPABASE_SERVICE_ROLE_KEY/);
});

test('scheduled persistence is service-role-only, locked, historical, and versioned', async () => {
  const sql = await readFile(new URL(
    '../../supabase/migrations/20260902120000_automatic_company_monitoring.sql', import.meta.url,
  ), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.company_watch_snapshot_history from public, anon, authenticated/i);
  assert.match(sql, /revoke all on sequence public\.company_watch_snapshot_history_id_seq[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /auth\.role\(\) <> 'service_role'/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /previous\.checked_at is distinct from p_expected_checked_at/i);
  assert.match(sql, /previous\.items is distinct from p_expected_items/i);
  assert.match(sql, /return 'skipped'/i);
  assert.match(sql, /has_update := snapshot_changed[\s\S]+p_outcome = 'matching-items'[\s\S]+p_last_change_item_id is not null/i);
  assert.match(sql, /current_status = case when has_update then 'updated' else current_status end/i);
  assert.match(sql, /record_scheduled_company_watch_failure\([\s\S]+p_expected_checked_at timestamptz,[\s\S]+p_expected_items jsonb/i);
  assert.match(sql, /on conflict do nothing/i);
  assert.match(sql, /company_watch_snapshot_history_content_idx/i);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]+to authenticated/i);
});
