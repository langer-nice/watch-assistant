begin;
create or replace function public.guard_structured_watch_write() returns trigger
language plpgsql set search_path='' as $$
declare explicit_version boolean; marker text;
begin
 explicit_version := (tg_op<>'INSERT' and coalesce(old.watch_definition ? 'definitionVersion',false))
   or (tg_op<>'DELETE' and coalesce(new.watch_definition ? 'definitionVersion',false));
 if explicit_version then
  marker := current_setting('watch_assistant.structured_rpc',true);
  if current_user in ('authenticated','anon') or auth.role() in ('authenticated','anon') then
   raise exception 'Structured writes require server authorization' using errcode='42501';
  end if;
  if marker='monitor.v1' and auth.role()='service_role' and tg_op='UPDATE' then
   if (to_jsonb(new)-array['updated_at','last_checked_at','last_check_outcome','last_check_error_code',
       'current_status','check_started_at','media_last_change_detected_at','last_change_item_id',
       'last_change_title','last_change_url','last_change_summary','last_change_published_at'])
      is distinct from
      (to_jsonb(old)-array['updated_at','last_checked_at','last_check_outcome','last_check_error_code',
       'current_status','check_started_at','media_last_change_detected_at','last_change_item_id',
       'last_change_title','last_change_url','last_change_summary','last_change_published_at']) then
    raise exception 'Monitoring cannot change structured approval or activation' using errcode='42501';
   end if;
  elsif marker='schedule.v1' and auth.role()='service_role' and tg_op='UPDATE' then
   if (to_jsonb(new)-array['updated_at','monitoring_state','current_status','media_revision','check_started_at'])
      is distinct from (to_jsonb(old)-array['updated_at','monitoring_state','current_status','media_revision','check_started_at']) then
    raise exception 'Scheduling cannot change definition or owner' using errcode='42501';
   end if;
  elsif marker is distinct from 'persist.v1' then
   raise exception 'Structured writes require server authorization' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

-- No existing Watch is activated. The schedule is service-only and opt-in.
create table public.structured_media_schedules (
 watch_id uuid primary key references public.watches(id) on delete cascade,
 interval_seconds integer not null default 86400 check(interval_seconds between 3600 and 604800),
 next_due_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, lease_revision bigint, lease_kind text check(lease_kind in ('scheduled','manual')),
 failures integer not null default 0 check(failures between 0 and 10)
);
alter table public.structured_media_schedules enable row level security;
revoke all on public.structured_media_schedules from public,anon,authenticated,service_role;

alter table public.watches drop constraint watches_structured_definition_check;
alter table public.watches add constraint watches_structured_definition_check check (
 not coalesce(watch_definition ? 'definitionVersion',false) or (
  public.valid_structured_watch_definition(monitoring_source,watch_definition)
  and (monitoring_state in ('paused','preparing') or (monitoring_state='monitoring' and type='media_news'
       and watch_definition->'plan'->>'adapter'='google_news_literal_v1'))
  and ((type='media_news' and watch_definition->'plan'->>'domain' in ('media_news','currency'))
    or (type='company_bodacc' and watch_definition->'plan'->>'domain'='official_company'
      and siren=watch_definition->'plan'->'criteria'->>'siren' and request=watch_definition->>'request'))
 ));

-- Private operations cannot be called by browser roles. A future authenticated
-- activation handler must enforce the existing Staging gates and bind p_owner.
create function public.set_structured_media_monitoring(p_watch_id uuid,p_owner uuid,p_revision bigint,p_active boolean,p_interval_seconds integer default 86400) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if p_active is null or p_interval_seconds is null or p_interval_seconds not between 3600 and 604800 then raise exception 'Invalid interval' using errcode='22023'; end if;
 select * into w from public.watches where id=p_watch_id and user_id=p_owner and deleted_at is null for update;
 if w.id is null or w.media_revision is distinct from p_revision then return false; end if;
 if not public.validate_structured_media_completion(w.id) then raise exception 'Structured Media required' using errcode='22023'; end if;
 perform set_config('watch_assistant.structured_rpc','schedule.v1',true);
 update public.watches set monitoring_state=case when p_active then 'monitoring' else 'paused' end,
 current_status=case when p_active then 'watching' else 'paused' end,media_revision=media_revision+1,check_started_at=null where id=w.id;
 insert into public.structured_media_schedules(watch_id,interval_seconds,next_due_at)
 values(w.id,p_interval_seconds,clock_timestamp()) on conflict(watch_id) do update
 set interval_seconds=excluded.interval_seconds,next_due_at=excluded.next_due_at,lease_token=null,lease_until=null,lease_revision=null,lease_kind=null,failures=0;
 perform set_config('watch_assistant.structured_rpc','',true);
 return true;
end $$;

create function public.claim_structured_media_checks(p_owners uuid[],p_limit integer default 3) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; s public.structured_media_schedules%rowtype; token uuid; result jsonb:='[]';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 10 or coalesce(cardinality(p_owners),0)=0 then return result; end if;
 for w in select target.* from public.watches target join public.structured_media_schedules schedule on schedule.watch_id=target.id
 where target.user_id=any(p_owners) and target.type='media_news' and target.monitoring_state='monitoring' and target.deleted_at is null
 and target.watch_definition->'plan'->>'adapter'='google_news_literal_v1'
 and public.valid_structured_watch_definition(target.monitoring_source,target.watch_definition)
 and schedule.next_due_at<=clock_timestamp() and (schedule.lease_until is null or schedule.lease_until<=clock_timestamp())
 order by schedule.next_due_at,target.id limit p_limit for update of target skip locked loop
  select * into s from public.structured_media_schedules where watch_id=w.id for update;
  token:=gen_random_uuid();
  update public.structured_media_schedules set lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',lease_revision=w.media_revision,lease_kind='scheduled' where watch_id=w.id;
  perform set_config('watch_assistant.structured_rpc','monitor.v1',true);
  update public.watches set check_started_at=clock_timestamp() where id=w.id;
  perform set_config('watch_assistant.structured_rpc','',true);
  result:=result||jsonb_build_array(to_jsonb(w)||jsonb_build_object('lease_token',token,'media_watch_snapshots',(select to_jsonb(snapshot) from public.media_watch_snapshots snapshot where watch_id=w.id)));
 end loop;
 return result;
end $$;

-- Manual checks acquire the same lease before source retrieval when scheduling
-- is opted in. Claiming a paused Watch never activates it.
create function public.claim_structured_media_manual_check(p_watch_id uuid,p_owner uuid,p_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; s public.structured_media_schedules%rowtype; token uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select * into w from public.watches where id=p_watch_id and user_id=p_owner and deleted_at is null for update;
 if w.id is null or w.media_revision is distinct from p_revision or w.monitoring_state not in ('paused','monitoring') then return null; end if;
 if not public.validate_structured_media_completion(w.id) then raise exception 'Structured Media required' using errcode='22023'; end if;
 insert into public.structured_media_schedules(watch_id) values(w.id) on conflict do nothing;
 select * into s from public.structured_media_schedules where watch_id=w.id for update;
 if s.lease_until>clock_timestamp() then return null; end if;
 token:=gen_random_uuid();
 update public.structured_media_schedules set lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',lease_revision=w.media_revision,lease_kind='manual' where watch_id=w.id;
 return to_jsonb(w)||jsonb_build_object('lease_token',token,'media_watch_snapshots',(select to_jsonb(snapshot) from public.media_watch_snapshots snapshot where watch_id=w.id));
end $$;

-- Fence older workers and coordinate with manual completion under the same row
-- lock. The existing engine owns baseline, ledger, matching results and CAS.
create function public.finish_structured_media_check(p_watch_id uuid,p_owner uuid,p_revision bigint,p_token uuid,p_checked_at timestamptz,p_source_title text,p_source_url text,p_items jsonb,p_expected_checked_at timestamptz,p_expected_items jsonb,p_matching jsonb,p_error text default null,p_manual boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; s public.structured_media_schedules%rowtype; result jsonb; prior timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select * into w from public.watches where id=p_watch_id and user_id=p_owner for update;
 select * into s from public.structured_media_schedules where watch_id=p_watch_id for update;
 if w.id is null or w.deleted_at is not null or (not coalesce(p_manual,false) and w.monitoring_state<>'monitoring') or (coalesce(p_manual,false) and w.monitoring_state not in ('paused','monitoring')) or w.media_revision is distinct from p_revision
 or s.lease_kind is distinct from (case when p_manual then 'manual' else 'scheduled' end)
 or s.lease_token is distinct from p_token or p_token is null or s.lease_revision is distinct from p_revision or s.lease_until<=clock_timestamp() then return jsonb_build_object('status','skipped'); end if;
 if not public.validate_structured_media_completion(w.id) then raise exception 'Structured required' using errcode='22023'; end if;
 perform set_config('watch_assistant.structured_rpc','monitor.v1',true);
 select checked_at into prior from public.media_watch_snapshots where watch_id=w.id;
 if p_error is not null then
  perform public.fail_manual_media_watch_check_pre_v1(w.id,w.user_id,w.media_revision,p_expected_checked_at,left(p_error,100));
  result:=jsonb_build_object('status','failed');
 else
  result:=public.complete_manual_media_watch_check_pre_v1(w.id,p_checked_at,p_source_title,p_source_url,
   array(select value->>'id' from jsonb_array_elements(p_items)),p_items,p_expected_checked_at,p_expected_items,p_matching,w.media_revision,w.user_id);
 end if;
 -- A manual success may have advanced the snapshot. Release the lease without
 -- overwriting that success; the next check still observes a full interval.
 update public.watches set check_started_at=null where id=w.id;
 update public.structured_media_schedules set lease_token=null,lease_until=null,lease_revision=null,lease_kind=null,
 failures=case when p_error is not null and prior is not distinct from p_expected_checked_at then least(10,failures+1) else 0 end,
 next_due_at=clock_timestamp()+make_interval(secs=>case when p_error is not null and prior is not distinct from p_expected_checked_at then least(interval_seconds,300*power(2,least(6,failures))::integer) else interval_seconds end) where watch_id=w.id;
 perform set_config('watch_assistant.structured_rpc','',true);
 return result;
end $$;

revoke all on function public.claim_structured_media_manual_check(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.claim_structured_media_manual_check(uuid,uuid,bigint) to service_role;
revoke all on function public.set_structured_media_monitoring(uuid,uuid,bigint,boolean,integer) from public,anon,authenticated;
revoke all on function public.claim_structured_media_checks(uuid[],integer) from public,anon,authenticated;
revoke all on function public.finish_structured_media_check(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.set_structured_media_monitoring(uuid,uuid,bigint,boolean,integer),public.claim_structured_media_checks(uuid[],integer),public.finish_structured_media_check(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
