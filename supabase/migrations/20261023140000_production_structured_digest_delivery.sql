begin;
-- Production-only adapters around the existing consent/claim/submission protocol.
-- Installed Staging functions/data remain untouched; no table or data backfill.
do $production$
begin
 if to_regprocedure('public.morning_report_context(uuid,timestamptz)') is null then
  if to_regprocedure('public.morning_report_context(timestamptz)') is not null then return; end if;
  raise exception 'Production report/owner prerequisites missing';
 end if;

create function public.prepare_production_structured_digests(p_since timestamptz,p_owners uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; digest uuid;
 day_key date:=(clock_timestamp() at time zone 'Europe/Paris')::date;
 lower_bound timestamptz:=greatest(p_since,((day_key-1)+time '08:15') at time zone 'Europe/Paris');
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_since is null or p_since>clock_timestamp() or coalesce(cardinality(p_owners),0)=0 then return '[]'::jsonb;end if;
 if (clock_timestamp() at time zone 'Europe/Paris')::time<time '08:15'
 or (clock_timestamp() at time zone 'Europe/Paris')::time>=time '08:30' then return '[]'::jsonb;end if;
 for w in select target.* from public.watches target join public.media_watch_email_policies p on p.watch_id=target.id and p.user_id=target.user_id
 where target.watch_definition->>'definitionVersion'='watch-definition.v1' and target.user_id=any(p_owners)
 and p.mode='daily_digest' and public.media_digest_consent(target.id,target.user_id)
 and exists(select 1 from public.media_watch_notifications n where n.watch_id=target.id and n.user_id=target.user_id
 and n.delivery_mode='daily_digest' and n.status='pending' and n.digest_id is null and n.submission_started_at is null
 and n.created_at>=greatest(lower_bound,p.eligible_after))
 order by target.id limit 10 for update of target skip locked loop
  insert into public.media_watch_digests(watch_id,user_id,period) values(w.id,w.user_id,day_key)
  on conflict(watch_id,period) do nothing returning id into digest;
  if digest is not null then
   update public.media_watch_notifications n set digest_id=digest where n.watch_id=w.id and n.user_id=w.user_id
   and n.delivery_mode='daily_digest' and n.status='pending' and n.digest_id is null and n.submission_started_at is null
   and n.created_at>=lower_bound and n.created_at>=(select eligible_after from public.media_watch_email_policies where watch_id=w.id and user_id=w.user_id);
  end if;
 end loop;
 return coalesce((select jsonb_agg(id order by id) from (
  select d.id from public.media_watch_digests d join public.watches candidate_watch on candidate_watch.id=d.watch_id and candidate_watch.user_id=d.user_id
  where d.period=day_key and candidate_watch.user_id=any(p_owners) and candidate_watch.watch_definition->>'definitionVersion'='watch-definition.v1'
  and d.submission_started_at is null and (d.status='prepared' or(d.status='claimed' and d.claimed_at<clock_timestamp()-interval '30 minutes'))
  and public.media_digest_consent(candidate_watch.id,candidate_watch.user_id) order by d.id limit 10
 ) candidates),'[]'::jsonb);
end $$;

create function public.claim_production_structured_digest(p_id uuid,p_token uuid,p_owners uuid[],p_since timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; day_key date:=(clock_timestamp() at time zone 'Europe/Paris')::date;
 lower_bound timestamptz:=greatest(p_since,((day_key-1)+time '08:15') at time zone 'Europe/Paris');
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_since is null or p_since>clock_timestamp() or (clock_timestamp() at time zone 'Europe/Paris')::time<time '08:15'
 or (clock_timestamp() at time zone 'Europe/Paris')::time>=time '08:30' then return null;end if;
 select target.* into w from public.watches target join public.media_watch_digests d on d.watch_id=target.id and d.user_id=target.user_id
 where d.id=p_id and d.period=day_key and target.user_id=any(p_owners)
 and target.watch_definition->>'definitionVersion'='watch-definition.v1' for update of target;
 if w.id is null or not public.media_digest_consent(w.id,w.user_id)
 or not exists(select 1 from public.media_watch_email_policies p where p.watch_id=w.id and p.user_id=w.user_id and p.mode='daily_digest' and p.enabled) then return null;end if;
 -- Reject old/foreign membership rather than silently presenting or replaying it.
 if not exists(select 1 from public.media_watch_notifications where digest_id=p_id and status='pending')
 or exists(select 1 from public.media_watch_notifications n where n.digest_id=p_id
 and (n.watch_id<>w.id or n.user_id<>w.user_id or n.status<>'pending' or n.delivery_mode<>'daily_digest'
 or n.submission_started_at is not null or n.created_at<lower_bound
 or n.created_at<(select eligible_after from public.media_watch_email_policies where watch_id=w.id and user_id=w.user_id))) then return null;end if;
 return public.claim_media_watch_digest(p_id,p_token,p_owners,true);
end $$;
revoke all on function public.prepare_production_structured_digests(timestamptz,uuid[]),public.claim_production_structured_digest(uuid,uuid,uuid[],timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.prepare_production_structured_digests(timestamptz,uuid[]),public.claim_production_structured_digest(uuid,uuid,uuid[],timestamptz) to service_role;

-- Legacy cadence is unchanged: yesterday/today's latest completed result can be
-- included as partial/stale. Required due Structured checks still block reports.
do $context$
declare installed text;
begin
 select pg_get_functiondef('public.morning_report_context(uuid,timestamptz)'::regprocedure) into installed;
 if position('w.last_checked_at<p_cutoff or w.last_check_error_code' in installed)=0 then raise exception 'Unexpected Production context contract';end if;
 -- Only the no-schedule branch changes; Structured due/lease checks are retained.
 installed:=replace(installed,'(s.watch_id is null and (w.last_checked_at is null or w.last_checked_at<p_cutoff or w.last_check_error_code is not null))',
 '(s.watch_id is null and w.last_checked_at is null)');
 execute installed;
end $context$;
end $production$;
notify pgrst,'reload schema';
commit;
