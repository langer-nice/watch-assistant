begin;
do $v3_manual_install$ begin
 if to_regprocedure('public.finish_v3_pilot_check(uuid,uuid,jsonb)') is null then return;end if;
-- Function-only adaptation. Existing signatures, grants, tables and RLS stay intact.
create or replace function public.claim_structured_media_manual_check(p_watch_id uuid,p_owner uuid,p_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; s public.structured_media_schedules%rowtype; token uuid; v3 jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select * into w from public.watches where id=p_watch_id and user_id=p_owner and deleted_at is null for update;
 if w.id is null or w.media_revision is distinct from p_revision or w.monitoring_state not in ('paused','monitoring') then return null; end if;
 select jsonb_build_object('id',w.id,'user_id',w.user_id,'slot',p.slot,'engine',p.engine,'instruction',p.instruction,
  'understanding',p.understanding,'baseline_at',p.baseline_at,'prior_state',p.prior_state,'evaluation',p.evaluation,
  'criteria',w.watch_definition->'currencyCriteria','source',w.monitoring_source)
 into v3 from public.v3_pilot_watches p where p.watch_id=w.id and p.user_id=w.user_id
 and p.engine in ('wa-v3-evidence-refs.v1','wa-v3-evidence-refs-pilot.v1');
 if v3 is not null then
  if w.monitoring_state<>'monitoring' or w.monitoring_source->>'type' not in ('feed','currency') then return null;end if;
 elsif not public.validate_structured_media_completion(w.id) then raise exception 'Structured Media required' using errcode='22023'; end if;
 if v3 is null then insert into public.structured_media_schedules(watch_id) values(w.id) on conflict do nothing;end if;
 select * into s from public.structured_media_schedules where watch_id=w.id for update;
 if s.watch_id is null then return null;end if;
 if s.lease_until>clock_timestamp() then return null; end if;
 token:=gen_random_uuid();
 update public.structured_media_schedules set lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',lease_revision=w.media_revision,lease_kind='manual' where watch_id=w.id;
 return to_jsonb(w)||jsonb_build_object('lease_token',token,'media_watch_snapshots',(select to_jsonb(snapshot) from public.media_watch_snapshots snapshot where watch_id=w.id))
  ||case when v3 is null then '{}'::jsonb else jsonb_build_object('v3',v3||jsonb_build_object('token',token)) end;
end $$;

-- Keep the V3 result transaction shared. Only manual orchestration/delivery differs.
do $$declare f text; old_due text:='((at_time at time zone ''UTC'')::date+1+time ''06:00'') at time zone ''UTC''';begin
 select pg_get_functiondef('public.finish_v3_pilot_check(uuid,uuid,jsonb)'::regprocedure) into f;
 if position('if alert and s.lease_kind is distinct from ''manual'' then' in f)>0 then
  if position('next_due_at=case when s.lease_kind=''manual'' then s.next_due_at' in f)=0 then raise exception 'Incomplete manual completion contract';end if;
 else
 if position('if alert then' in f)=0 or position('failures=0,next_due_at='||old_due in f)=0 then raise exception 'Unexpected V3 completion contract';end if;
 f:=replace(f,'if alert then','if alert and s.lease_kind is distinct from ''manual'' then');
 f:=replace(f,'failures=0,next_due_at='||old_due,
  'failures=case when s.lease_kind=''manual'' then s.failures else 0 end,next_due_at=case when s.lease_kind=''manual'' then s.next_due_at else '||old_due||' end');
 execute f;
 end if;
 select pg_get_functiondef('public.fail_v3_pilot_check(uuid,uuid)'::regprocedure) into f;
 if position('failures=case when lease_kind=''manual'' then failures' in f)>0 then
  if position('next_due_at=case when lease_kind=''manual'' then next_due_at' in f)=0 then raise exception 'Incomplete manual failure contract';end if;
 else
 if position('failures=least(failures+1,10)' in f)=0 or position('next_due_at=((clock_timestamp()' in f)=0 then raise exception 'Unexpected V3 failure contract';end if;
 f:=replace(f,'failures=least(failures+1,10)','failures=case when lease_kind=''manual'' then failures else least(failures+1,10) end');
 f:=replace(f,'next_due_at=((clock_timestamp() at time zone ''UTC'')::date+1+time ''06:00'') at time zone ''UTC''',
  'next_due_at=case when lease_kind=''manual'' then next_due_at else ((clock_timestamp() at time zone ''UTC'')::date+1+time ''06:00'') at time zone ''UTC'' end');
 execute f;
 end if;
end $$;
end $v3_manual_install$;
notify pgrst,'reload schema';
commit;
