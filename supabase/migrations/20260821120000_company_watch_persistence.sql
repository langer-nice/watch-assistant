alter table public.watches
  add column request text,
  add column summary text,
  add column company_name text,
  add column administrative_status text
    check (administrative_status is null or administrative_status in ('active', 'ceased', 'unknown')),
  add column company_status text,
  add column monitoring_state text not null default 'monitoring'
    check (monitoring_state in ('preparing', 'monitoring', 'paused')),
  add column current_status text not null default 'watching'
    check (current_status in ('watching', 'updated', 'attention', 'paused')),
  add column last_checked_at timestamptz,
  add column last_check_outcome text,
  add column last_check_error_code text,
  add column last_change_item_id text,
  add column last_change_title text,
  add column last_change_url text,
  add column last_change_summary text,
  add column last_change_event_type text,
  add column last_change_published_at timestamptz,
  add column check_started_at timestamptz;

alter table public.watches
  add constraint watches_request_length_check
    check (request is null or char_length(request) between 1 and 500),
  add constraint watches_summary_length_check
    check (summary is null or char_length(summary) <= 1000),
  add constraint watches_company_name_length_check
    check (company_name is null or char_length(company_name) <= 200);

create table public.company_watch_snapshots (
  watch_id uuid primary key references public.watches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_at timestamptz not null,
  source_title text,
  source_url text,
  item_ids text[] not null default '{}',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_watch_snapshots_items_array_check
    check (jsonb_typeof(items) = 'array'),
  constraint company_watch_snapshots_item_limit_check
    check (jsonb_array_length(items) <= 100),
  constraint company_watch_snapshots_item_ids_limit_check
    check (cardinality(item_ids) <= 100)
);

create index company_watch_snapshots_user_id_idx
  on public.company_watch_snapshots (user_id);

create trigger company_watch_snapshots_set_updated_at
before update on public.company_watch_snapshots
for each row execute function public.set_updated_at();

alter table public.company_watch_snapshots enable row level security;

revoke all on table public.company_watch_snapshots from anon;
grant select, insert, update, delete on table public.company_watch_snapshots to authenticated;

create policy company_watch_snapshots_select_own
on public.company_watch_snapshots for select to authenticated
using (user_id = (select auth.uid()));

create policy company_watch_snapshots_insert_own
on public.company_watch_snapshots for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.watches
    where watches.id = company_watch_snapshots.watch_id
      and watches.user_id = (select auth.uid())
  )
);

create policy company_watch_snapshots_update_own
on public.company_watch_snapshots for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.watches
    where watches.id = company_watch_snapshots.watch_id
      and watches.user_id = (select auth.uid())
  )
);

create policy company_watch_snapshots_delete_own
on public.company_watch_snapshots for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function public.claim_company_watch_check(p_watch_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed boolean := false;
begin
  update public.watches
  set check_started_at = timezone('utc', now())
  where id = p_watch_id
    and user_id = (select auth.uid())
    and deleted_at is null
    and type = 'company_bodacc'
    and (
      check_started_at is null
      or check_started_at < timezone('utc', now()) - interval '2 minutes'
    )
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function public.complete_company_watch_check(
  p_watch_id uuid,
  p_checked_at timestamptz,
  p_source_title text,
  p_source_url text,
  p_item_ids text[],
  p_items jsonb,
  p_company_name text,
  p_administrative_status text,
  p_company_status text,
  p_outcome text,
  p_current_status text,
  p_last_change_item_id text,
  p_last_change_title text,
  p_last_change_url text,
  p_last_change_summary text,
  p_last_change_event_type text,
  p_last_change_published_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id
  from public.watches
  where id = p_watch_id
    and user_id = (select auth.uid())
    and deleted_at is null
    and type = 'company_bodacc'
  for update;

  if owner_id is null then
    raise exception 'Company Watch not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 100
    or cardinality(p_item_ids) > 100 then
    raise exception 'Invalid Company Watch snapshot' using errcode = '22023';
  end if;

  insert into public.company_watch_snapshots (
    watch_id, user_id, checked_at, source_title, source_url, item_ids, items
  ) values (
    p_watch_id, owner_id, p_checked_at, p_source_title, p_source_url,
    coalesce(p_item_ids, '{}'), p_items
  )
  on conflict (watch_id) do update set
    checked_at = excluded.checked_at,
    source_title = excluded.source_title,
    source_url = excluded.source_url,
    item_ids = excluded.item_ids,
    items = excluded.items;

  update public.watches set
    company_name = coalesce(p_company_name, company_name),
    administrative_status = coalesce(p_administrative_status, administrative_status),
    company_status = coalesce(p_company_status, company_status),
    monitoring_state = 'monitoring',
    current_status = p_current_status,
    last_checked_at = p_checked_at,
    last_check_outcome = p_outcome,
    last_check_error_code = null,
    last_change_item_id = coalesce(p_last_change_item_id, last_change_item_id),
    last_change_title = coalesce(p_last_change_title, last_change_title),
    last_change_url = coalesce(p_last_change_url, last_change_url),
    last_change_summary = coalesce(p_last_change_summary, last_change_summary),
    last_change_event_type = coalesce(p_last_change_event_type, last_change_event_type),
    last_change_published_at = coalesce(p_last_change_published_at, last_change_published_at),
    check_started_at = null
  where id = p_watch_id;
end;
$$;

create or replace function public.fail_company_watch_check(
  p_watch_id uuid,
  p_error_code text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.watches
  set check_started_at = null,
      last_check_error_code = left(p_error_code, 100)
  where id = p_watch_id
    and user_id = (select auth.uid())
    and deleted_at is null;
$$;

revoke all on function public.claim_company_watch_check(uuid) from public, anon;
revoke all on function public.complete_company_watch_check(
  uuid, timestamptz, text, text, text[], jsonb, text, text, text, text, text,
  text, text, text, text, text, timestamptz
) from public, anon;
revoke all on function public.fail_company_watch_check(uuid, text) from public, anon;
grant execute on function public.claim_company_watch_check(uuid) to authenticated;
grant execute on function public.complete_company_watch_check(
  uuid, timestamptz, text, text, text[], jsonb, text, text, text, text, text,
  text, text, text, text, text, timestamptz
) to authenticated;
grant execute on function public.fail_company_watch_check(uuid, text) to authenticated;
