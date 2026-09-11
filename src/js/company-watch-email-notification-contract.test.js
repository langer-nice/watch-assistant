import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MIGRATION = new URL(
  '../../supabase/migrations/20260911120000_company_watch_email_notifications.sql', import.meta.url,
);

test('scheduled email outbox is durable, uniquely keyed, and inaccessible to browser roles', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  assert.match(sql, /status in \('pending', 'sent', 'failed'\)/iu);
  assert.match(sql, /attempt_count integer not null default 0/iu);
  assert.match(sql, /last_error_code text/iu); assert.match(sql, /provider_message_id text/iu);
  assert.match(sql, /unique \(watch_id, user_id, channel, source_event_id\)/iu);
  assert.match(sql, /enable row level security/iu);
  assert.match(sql, /revoke all on table public\.company_watch_notifications from public, anon, authenticated/iu);
  assert.doesNotMatch(sql, /grant [^;]+ on table public\.company_watch_notifications to authenticated/iu);
  assert.match(sql, /auth\.role\(\) <> 'service_role'/iu);
  assert.match(sql, /get_company_watch_notification_locale/iu);
  assert.doesNotMatch(sql, /grant select on table public\.profiles to service_role/iu);
});

test('only the canonical scheduled genuine-new-event branch enqueues email', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  assert.match(sql, /snapshot_changed := previous\.watch_id is not null/iu);
  assert.match(sql, /has_update := snapshot_changed and p_outcome = 'matching-items' and p_last_change_item_id is not null/iu);
  assert.match(sql, /if has_update then[\s\S]+jsonb_array_elements\(p_notification_items\)[\s\S]+insert into public\.company_watch_notifications/iu);
  assert.match(sql, /on conflict \(watch_id, user_id, channel, source_event_id\) do nothing/iu);
  assert.match(sql, /where id = p_notification_id[\s\S]+status = 'pending'[\s\S]+attempt_count = 0[\s\S]+claim_token is null/iu);
});

test('manual Check now path cannot create or send email notifications', async () => {
  const manualApi = await readFile(new URL('../../api/check-company-watch.js', import.meta.url), 'utf8');
  const repository = await readFile(new URL('../../server/company-watch-repository.js', import.meta.url), 'utf8');
  assert.doesNotMatch(manualApi, /company-watch-notification|company-watch-email/iu);
  assert.doesNotMatch(repository, /company_watch_notifications|company-watch-email/iu);
});
