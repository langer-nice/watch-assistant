begin;
-- Staging account delivery must preserve later envelopes when an older one wins
-- the per-Watch UTC-day submission slot. Legacy selection remains unchanged.
create or replace function public.pending_media_watch_digests(p_owners uuid[],p_structured boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x.id order by x.period,x.id) from (
  select chosen.id,chosen.period from (
   select distinct on (case when p_structured then d.watch_id else d.id end) d.id,d.period
   from public.media_watch_digests d join public.watches w on w.id=d.watch_id and w.user_id=d.user_id
   where (d.status='prepared' or(d.status='claimed' and d.claimed_at<clock_timestamp()-interval '30 minutes'))
   and d.submission_started_at is null and public.media_digest_consent(w.id,w.user_id)
   and (w.watch_definition ? 'definitionVersion')=p_structured
   and (not p_structured or (w.user_id=any(p_owners)
    and d.period<=public.media_digest_period(clock_timestamp())
    and not exists(select 1 from public.media_watch_digests active where active.watch_id=d.watch_id
     and active.status='claimed' and active.submission_started_at is null and active.claimed_at>=clock_timestamp()-interval '30 minutes')
    and not exists(select 1 from public.media_watch_digests submitted where submitted.watch_id=d.watch_id
     and submitted.submission_started_at is not null
     and public.media_digest_period(submitted.submission_started_at)=public.media_digest_period(clock_timestamp()))))
   order by case when p_structured then d.watch_id else d.id end,d.period,d.id
  ) chosen order by chosen.period,chosen.id limit 10
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.pending_media_watch_digests(uuid[],boolean) from public,anon,authenticated;
grant execute on function public.pending_media_watch_digests(uuid[],boolean) to service_role;
commit;
