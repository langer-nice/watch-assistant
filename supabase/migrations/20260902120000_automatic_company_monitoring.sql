-- Atomic, service-role-only persistence for scheduled Company Watch checks.
create table public.company_watch_snapshot_history (
  id bigint generated always as identity primary key,
  watch_id uuid not null references public.watches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_at timestamptz not null,
  source_title text,
  source_url text,
  item_ids text[] not null default '{}',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint company_watch_snapshot_history_items_array_check
    check (jsonb_typeof(items) = 'array'),
  constraint company_watch_snapshot_history_item_limit_check
    check (jsonb_array_length(items) <= 100),
  constraint company_watch_snapshot_history_item_ids_limit_check
    check (cardinality(item_ids) <= 100)
);

create index company_watch_snapshot_history_watch_checked_idx
  on public.company_watch_snapshot_history (watch_id, checked_at desc);
create unique index company_watch_snapshot_history_content_idx
  on public.company_watch_snapshot_history (watch_id, md5(items::text));

alter table public.company_watch_snapshot_history enable row level security;
revoke all on table public.company_watch_snapshot_history from public, anon, authenticated;
revoke all on sequence public.company_watch_snapshot_history_id_seq
  from public, anon, authenticated;
grant select on table public.company_watch_snapshot_history to authenticated;

create policy company_watch_snapshot_history_select_own
on public.company_watch_snapshot_history for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.complete_scheduled_company_watch_check(
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
  p_last_change_published_at timestamptz
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
begin
  if auth.role() <> 'service_role' then
    raise exception 'Scheduled monitoring requires service role' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 100
    or cardinality(p_item_ids) > 100 then
    raise exception 'Invalid Company Watch snapshot' using errcode = '22023';
  end if;

  select * into target from public.watches
  where id = p_watch_id and deleted_at is null and type = 'company_bodacc'
    and monitoring_state = 'monitoring'
  for update;
  if target.id is null then
    return 'skipped';
  end if;
  select * into previous from public.company_watch_snapshots where watch_id = p_watch_id;
  if previous.watch_id is null then
    if p_expected_checked_at is not null or p_expected_items is not null then
      return 'skipped';
    end if;
  elsif previous.checked_at is distinct from p_expected_checked_at
    or previous.items is distinct from p_expected_items then
    return 'skipped';
  end if;
  snapshot_changed := previous.watch_id is not null and previous.items is distinct from p_items;
  has_update := snapshot_changed
    and p_outcome = 'matching-items'
    and p_last_change_item_id is not null;

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
  return case when has_update then 'changed' else 'unchanged' end;
end;
$$;

create or replace function public.record_scheduled_company_watch_failure(
  p_watch_id uuid,
  p_error_code text,
  p_expected_checked_at timestamptz,
  p_expected_items jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.watches%rowtype;
  previous public.company_watch_snapshots%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Scheduled monitoring requires service role' using errcode = '42501';
  end if;
  select * into target from public.watches
  where id = p_watch_id and deleted_at is null and type = 'company_bodacc'
    and monitoring_state = 'monitoring'
  for update;
  if target.id is null then
    return false;
  end if;
  select * into previous from public.company_watch_snapshots where watch_id = p_watch_id;
  if previous.watch_id is null then
    if p_expected_checked_at is not null or p_expected_items is not null then
      return false;
    end if;
  elsif previous.checked_at is distinct from p_expected_checked_at
    or previous.items is distinct from p_expected_items then
    return false;
  end if;
  update public.watches
  set last_check_error_code = left(p_error_code, 100), check_started_at = null
  where id = p_watch_id;
  return true;
end;
$$;

revoke all on function public.complete_scheduled_company_watch_check(
  uuid, timestamptz, text, text, text[], jsonb, timestamptz, jsonb, text, text, text, text,
  text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.record_scheduled_company_watch_failure(uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_scheduled_company_watch_check(
  uuid, timestamptz, text, text, text[], jsonb, timestamptz, jsonb, text, text, text, text,
  text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.record_scheduled_company_watch_failure(
  uuid, text, timestamptz, jsonb
) to service_role;
