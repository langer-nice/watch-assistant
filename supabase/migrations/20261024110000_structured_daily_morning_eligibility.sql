begin;
-- A successful daily check yesterday must not postpone today's morning batch.
-- Preserve interval-based eligibility, retry backoff, leases, owner/type gates,
-- function identity and existing service-only permissions. No data updates.
create or replace function public.claim_structured_media_checks(p_owners uuid[],p_limit integer default 3) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; s public.structured_media_schedules%rowtype; token uuid; result jsonb:='[]';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 10 or coalesce(cardinality(p_owners),0)=0 then return result; end if;
 for w in select target.* from public.watches target join public.structured_media_schedules schedule on schedule.watch_id=target.id
 where target.user_id=any(p_owners) and target.type='media_news' and target.monitoring_state='monitoring' and target.deleted_at is null
 and target.watch_definition->'plan'->>'adapter'='google_news_literal_v1'
 and public.valid_structured_watch_definition(target.monitoring_source,target.watch_definition)
 and (schedule.next_due_at<=clock_timestamp()
   or (schedule.interval_seconds=86400 and schedule.failures=0
     and exists(select 1 from public.media_watch_snapshots previous
       where previous.watch_id=target.id
       and (previous.checked_at at time zone 'Europe/Paris')::date
         < (clock_timestamp() at time zone 'Europe/Paris')::date)))
 and (schedule.lease_until is null or schedule.lease_until<=clock_timestamp())
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

commit;
