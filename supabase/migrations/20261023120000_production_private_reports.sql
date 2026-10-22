begin;
-- Production manifest only; never replace the installed Staging report functions.
do $production$
begin
 if to_regclass('public.watch_reports') is not null then
  if to_regprocedure('public.morning_report_context(timestamptz)') is not null then return; end if;
  raise exception 'Existing report schema requires explicit review';
 end if;
-- Same RPC-only storage design: no direct grants, including service_role.
create table public.watch_reports (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('automatic','manual')),
 morning_day date,
 completed_at timestamptz not null,
 report jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 check ((kind='automatic')=(morning_day is not null))
);
create unique index watch_reports_one_morning on public.watch_reports(user_id,morning_day) where kind='automatic';
create index watch_reports_latest on public.watch_reports(user_id,completed_at desc);
alter table public.watch_reports enable row level security;
revoke all on public.watch_reports from public,anon,authenticated,service_role;

-- Keep legacy transport-off maintenance from consuming protected Structured intents.
-- Legacy cancellations and uncertain provider-submission handling are unchanged.
create or replace function public.maintain_media_watch_notifications(p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if p_enabled is null then raise exception 'Missing mode' using errcode='22023'; end if;
 update public.media_watch_notifications set status='failed',last_error_code='EMAIL_DELIVERY_OUTCOME_UNKNOWN'
 where status='pending' and submission_started_at is not null and claimed_at<now()-interval '30 minutes';
 if not p_enabled then
  update public.media_watch_notifications n set status='failed',last_error_code='EMAIL_DISABLED'
  where n.status='pending' and n.submission_started_at is null and n.delivery_mode='immediate'
  and exists(select 1 from public.watches w where w.id=n.watch_id and not coalesce(w.watch_definition ? 'definitionVersion',false));
 end if;
end $$;
revoke all on function public.maintain_media_watch_notifications(boolean) from public,anon,authenticated;
grant execute on function public.maintain_media_watch_notifications(boolean) to service_role;

create function public.production_watch_owners() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(id order by id) from (
  select distinct u.id from auth.users u join public.watches w on w.user_id=u.id
  where w.deleted_at is null and w.monitoring_state='monitoring'
 ) owners),'[]'::jsonb);
end $$;
revoke all on function public.production_watch_owners() from public,anon,authenticated,service_role;
grant execute on function public.production_watch_owners() to service_role;

create function public.morning_report_context(p_owner uuid,p_cutoff timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=p_owner; rows_json jsonb; pending_count integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if owner_id is null or not exists(select 1 from auth.users where id=owner_id) then raise exception 'Invalid report owner' using errcode='42501'; end if;
 if p_cutoff is distinct from ((clock_timestamp() at time zone 'Europe/Paris')::date+time '08:00') at time zone 'Europe/Paris' then raise exception 'Invalid morning cutoff' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object(
 'media_watch_snapshots',(select to_jsonb(m) from public.media_watch_snapshots m where m.watch_id=w.id),
 'company_watch_snapshots',(select to_jsonb(c) from public.company_watch_snapshots c where c.watch_id=w.id)
 ) order by w.id),'[]'::jsonb) into rows_json from public.watches w
 where w.user_id=owner_id and w.deleted_at is null and w.monitoring_state='monitoring';
 select count(*) into pending_count from public.watches w
 left join public.structured_media_schedules s on s.watch_id=w.id
 where w.user_id=owner_id and w.deleted_at is null and w.monitoring_state='monitoring' and (
 (s.watch_id is not null and (s.next_due_at<=p_cutoff+interval '15 minutes' or s.lease_until>clock_timestamp()
  or (s.failures>0 and (w.last_checked_at is null or w.last_checked_at<p_cutoff))))
 or (s.watch_id is null and (w.last_checked_at is null or w.last_checked_at<p_cutoff or w.last_check_error_code is not null))
 );
 return jsonb_build_object('watches',rows_json,'revision',md5(rows_json::text),'pending',pending_count,
 'exists',exists(select 1 from public.watch_reports r where r.user_id=owner_id and r.kind='automatic' and r.morning_day=(p_cutoff at time zone 'Europe/Paris')::date));
end $$;
revoke all on function public.morning_report_context(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.morning_report_context(uuid,timestamptz) to service_role;

create function public.save_watch_report(p_report jsonb,p_kind text) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; finished timestamptz; day_key date; context jsonb; cutoff timestamptz;
begin
 owner_id:=case when auth.role()='authenticated' then auth.uid() else (p_report->>'ownerId')::uuid end;
 if owner_id is null or owner_id is distinct from (p_report->>'ownerId')::uuid or
 not ((auth.role()='service_role' and p_kind='automatic' and exists(select 1 from public.watches where user_id=owner_id and deleted_at is null and monitoring_state='monitoring')) or (auth.role()='authenticated' and auth.uid()=owner_id and p_kind='manual')) then
 raise exception 'Report owner denied' using errcode='42501'; end if;
 if p_report->>'version' is distinct from '2' or p_report->>'origin' is distinct from p_kind
 or octet_length(p_report::text)>1048576 or not (p_report ?& array['entries','attempts','watchIdsConsidered','watchIdsChecked','watchIdsSkipped','startedAt','completedAt','id']) then raise exception 'Invalid report' using errcode='22023'; end if;
 if exists(select 1 from unnest(array['entries','attempts','watchIdsConsidered','watchIdsChecked','watchIdsSkipped']) k where jsonb_typeof(p_report->k) is distinct from 'array') then raise exception 'Invalid report arrays' using errcode='22023'; end if;
 finished:=(p_report->>'completedAt')::timestamptz;
 if finished is null or finished>clock_timestamp()+interval '1 minute' or (p_report->>'startedAt')::timestamptz>finished then raise exception 'Invalid report time' using errcode='22023'; end if;
 -- Every nested Watch identity must belong to this owner. No client-provided
 -- foreign Watch content can be persisted through this definer function.
 if exists(select 1 from (
 select value#>>'{}' as id from jsonb_array_elements(p_report->'watchIdsConsidered')
 union all select value#>>'{}' from jsonb_array_elements(p_report->'watchIdsChecked')
 union all select value#>>'{}' from jsonb_array_elements(p_report->'watchIdsSkipped')
 union all select value->>'watchId' from jsonb_array_elements(p_report->'entries')
 union all select value->>'watchId' from jsonb_array_elements(p_report->'attempts')
 ) ids where not exists(select 1 from public.watches w where w.id::text=ids.id and w.user_id=owner_id and w.deleted_at is null)) then raise exception 'Report Watch denied' using errcode='42501'; end if;
 if p_kind='automatic' then
  if (clock_timestamp() at time zone 'Europe/Paris')::time<time '08:00' or (clock_timestamp() at time zone 'Europe/Paris')::time>=time '08:30' then return false; end if;
  cutoff:=((clock_timestamp() at time zone 'Europe/Paris')::date+time '08:00') at time zone 'Europe/Paris';
  -- Serialize against scheduled completions/manual acknowledgements. A changed
  -- context is retried later; never label a mixture of source versions current.
  perform 1 from public.watches w where w.user_id=owner_id and w.deleted_at is null order by w.id for share;
  context:=public.morning_report_context(owner_id,cutoff);
  if (context->>'pending')::integer>0 or context->>'revision' is distinct from p_report->>'sourceRevision' then return false; end if;
  day_key:=(cutoff at time zone 'Europe/Paris')::date;
 end if;
 insert into public.watch_reports(id,user_id,kind,morning_day,completed_at,report)
 values((p_report->>'id')::uuid,owner_id,p_kind,day_key,finished,p_report-'sourceRevision') on conflict do nothing;
 return found;
end $$;
revoke all on function public.save_watch_report(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.save_watch_report(jsonb,text) to authenticated,service_role;

create function public.latest_watch_report() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null then raise exception 'Authenticated owner required' using errcode='42501'; end if;
 return (select report from public.watch_reports where user_id=auth.uid() order by completed_at desc,created_at desc limit 1);
end $$;
revoke all on function public.latest_watch_report() from public,anon,authenticated,service_role;
grant execute on function public.latest_watch_report() to authenticated;
end $production$;
commit;
