-- Durable, service-role-only outbox for scheduled Company Watch email notifications.
create table public.company_watch_notifications (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.watches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'email' check (channel = 'email'),
  source_event_id text not null check (char_length(source_event_id) between 1 and 1000),
  company_name text not null check (char_length(company_name) between 1 and 200),
  event jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 100),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  claim_token uuid,
  claimed_at timestamptz,
  constraint company_watch_notifications_event_object_check check (jsonb_typeof(event) = 'object'),
  constraint company_watch_notifications_delivery_state_check check (
    (status = 'sent' and sent_at is not null and provider_message_id is not null)
    or (status <> 'sent' and sent_at is null)
  ),
  constraint company_watch_notifications_unique_event
    unique (watch_id, user_id, channel, source_event_id)
);

create index company_watch_notifications_pending_idx
  on public.company_watch_notifications (created_at)
  where status = 'pending' and attempt_count = 0;

alter table public.company_watch_notifications enable row level security;
revoke all on table public.company_watch_notifications from public, anon, authenticated;
grant select, insert, update on table public.company_watch_notifications to service_role;

drop function public.complete_scheduled_company_watch_check(
  uuid, timestamptz, text, text, text[], jsonb, timestamptz, jsonb, text, text, text, text,
  text, text, text, text, text, timestamptz
);

create function public.complete_scheduled_company_watch_check(
  p_watch_id uuid,
  p_checked_at timestamptz,
  p_source_title text,
  p_source_url text,
  p_item_ids text[],
  p_items jsonb,
  p_expected_checked_at timestamptz,
  p_expected_items jsonb,
  p_company_name text,
  p_administrative_status text,
  p_company_status text,
  p_outcome text,
  p_last_change_item_id text,
  p_last_change_title text,
  p_last_change_url text,
  p_last_change_summary text,
  p_last_change_event_type text,
  p_last_change_published_at timestamptz,
  p_notification_items jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.watches%rowtype;
  previous public.company_watch_snapshots%rowtype;
  snapshot_changed boolean;
  has_update boolean;
  notification_item jsonb;
  notification_event_id text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Scheduled monitoring requires service role' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 100
    or cardinality(p_item_ids) > 100
    or jsonb_typeof(p_notification_items) <> 'array'
    or jsonb_array_length(p_notification_items) > 100 then
    raise exception 'Invalid Company Watch snapshot' using errcode = '22023';
  end if;

  select * into target from public.watches
  where id = p_watch_id and deleted_at is null and type = 'company_bodacc'
    and monitoring_state = 'monitoring'
  for update;
  if target.id is null then return 'skipped'; end if;
  select * into previous from public.company_watch_snapshots where watch_id = p_watch_id;
  if previous.watch_id is null then
    if p_expected_checked_at is not null or p_expected_items is not null then return 'skipped'; end if;
  elsif previous.checked_at is distinct from p_expected_checked_at
    or previous.items is distinct from p_expected_items then
    return 'skipped';
  end if;
  snapshot_changed := previous.watch_id is not null and previous.items is distinct from p_items;
  has_update := snapshot_changed and p_outcome = 'matching-items' and p_last_change_item_id is not null;

  if snapshot_changed then
    insert into public.company_watch_snapshot_history
      (watch_id, user_id, checked_at, source_title, source_url, item_ids, items)
    values (p_watch_id, target.user_id, previous.checked_at, previous.source_title,
      previous.source_url, previous.item_ids, previous.items)
    on conflict do nothing;
  end if;

  insert into public.company_watch_snapshots
    (watch_id, user_id, checked_at, source_title, source_url, item_ids, items)
  values (p_watch_id, target.user_id, p_checked_at, p_source_title, p_source_url,
    coalesce(p_item_ids, '{}'), p_items)
  on conflict (watch_id) do update set
    checked_at = excluded.checked_at, source_title = excluded.source_title,
    source_url = excluded.source_url, item_ids = excluded.item_ids, items = excluded.items;

  if snapshot_changed then
    insert into public.company_watch_snapshot_history
      (watch_id, user_id, checked_at, source_title, source_url, item_ids, items)
    values (p_watch_id, target.user_id, p_checked_at, p_source_title, p_source_url,
      coalesce(p_item_ids, '{}'), p_items)
    on conflict do nothing;
  end if;

  update public.watches set
    company_name = coalesce(p_company_name, company_name),
    administrative_status = coalesce(p_administrative_status, administrative_status),
    company_status = coalesce(p_company_status, company_status),
    current_status = case when has_update then 'updated' else current_status end,
    last_checked_at = p_checked_at,
    last_check_outcome = p_outcome,
    last_check_error_code = null,
    last_change_item_id = case when has_update then p_last_change_item_id else last_change_item_id end,
    last_change_title = case when has_update then p_last_change_title else last_change_title end,
    last_change_url = case when has_update then p_last_change_url else last_change_url end,
    last_change_summary = case when has_update then p_last_change_summary else last_change_summary end,
    last_change_event_type = case when has_update then p_last_change_event_type else last_change_event_type end,
    last_change_published_at = case when has_update then p_last_change_published_at else last_change_published_at end,
    check_started_at = null
  where id = p_watch_id;

  if has_update then
    for notification_item in select value from jsonb_array_elements(p_notification_items)
    loop
      notification_event_id := nullif(btrim(notification_item ->> 'id'), '');
      if notification_event_id is not null then
        insert into public.company_watch_notifications
          (watch_id, user_id, source_event_id, company_name, event)
        values (
          p_watch_id,
          target.user_id,
          left(notification_event_id, 1000),
          left(coalesce(p_company_name, target.company_name, target.title), 200),
          jsonb_build_object(
            'title', notification_item ->> 'title',
            'url', notification_item ->> 'url',
            'summary', notification_item ->> 'excerpt',
            'eventType', notification_item ->> 'eventType',
            'publishedAt', notification_item ->> 'publishedAt',
            'source', coalesce(notification_item ->> 'source', p_source_title, 'BODACC')
          )
        ) on conflict (watch_id, user_id, channel, source_event_id) do nothing;
      end if;
    end loop;
  end if;

  return case when has_update then 'changed' else 'unchanged' end;
end;
$$;

revoke all on function public.complete_scheduled_company_watch_check(
  uuid, timestamptz, text, text, text[], jsonb, timestamptz, jsonb, text, text, text, text,
  text, text, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_scheduled_company_watch_check(
  uuid, timestamptz, text, text, text[], jsonb, timestamptz, jsonb, text, text, text, text,
  text, text, text, text, text, timestamptz, jsonb
) to service_role;

create or replace function public.get_company_watch_notification_locale(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare selected_locale text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Notification delivery requires service role' using errcode = '42501';
  end if;
  select locale into selected_locale from public.profiles where id = p_user_id;
  return case when selected_locale = 'fr' then 'fr' else 'en' end;
end;
$$;

create or replace function public.claim_company_watch_email_notification(
  p_notification_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare claimed public.company_watch_notifications%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Notification delivery requires service role' using errcode = '42501';
  end if;
  update public.company_watch_notifications
  set claim_token = p_claim_token, claimed_at = timezone('utc', now()), attempt_count = attempt_count + 1
  where id = p_notification_id and channel = 'email' and status = 'pending'
    and attempt_count = 0 and claim_token is null
  returning * into claimed;
  if claimed.id is null then return null; end if;
  return jsonb_build_object(
    'id', claimed.id,
    'watch_id', claimed.watch_id,
    'user_id', claimed.user_id,
    'source_event_id', claimed.source_event_id,
    'company_name', claimed.company_name,
    'event', claimed.event
  );
end;
$$;

create or replace function public.complete_company_watch_email_notification(
  p_notification_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare completed boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Notification delivery requires service role' using errcode = '42501';
  end if;
  update public.company_watch_notifications
  set status = 'sent', sent_at = timezone('utc', now()),
      provider_message_id = left(p_provider_message_id, 200), last_error_code = null
  where id = p_notification_id and status = 'pending' and claim_token = p_claim_token
    and p_provider_message_id is not null and char_length(p_provider_message_id) > 0
  returning true into completed;
  return coalesce(completed, false);
end;
$$;

create or replace function public.fail_company_watch_email_notification(
  p_notification_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare failed boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Notification delivery requires service role' using errcode = '42501';
  end if;
  update public.company_watch_notifications
  set status = 'failed', last_error_code = left(p_error_code, 100)
  where id = p_notification_id and status = 'pending' and claim_token = p_claim_token
  returning true into failed;
  return coalesce(failed, false);
end;
$$;

revoke all on function public.claim_company_watch_email_notification(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_company_watch_email_notification(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_company_watch_email_notification(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_company_watch_notification_locale(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_company_watch_email_notification(uuid, uuid) to service_role;
grant execute on function public.complete_company_watch_email_notification(uuid, uuid, text) to service_role;
grant execute on function public.fail_company_watch_email_notification(uuid, uuid, text) to service_role;
grant execute on function public.get_company_watch_notification_locale(uuid) to service_role;
