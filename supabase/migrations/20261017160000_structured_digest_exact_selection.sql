begin;
-- Staging exact-selection adapter. Existing batch/legacy claim contracts stay intact.
create function public.claim_structured_media_test_digest(
 p_digest_id uuid,p_watch_id uuid,p_owner uuid,p_claim_token uuid,p_owners uuid[],p_send_hour integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_digest_id is null or p_watch_id is null or p_owner is null or p_claim_token is null
 or not coalesce(p_owner=any(p_owners),false) or p_send_hour is null or p_send_hour not between 0 and 23
 or extract(hour from clock_timestamp() at time zone 'UTC')<p_send_hour then return null;end if;
 -- Match ownership before claiming, with the same Watch-first locking order as
 -- the existing claim. A concurrent owner operation cannot alter the policy.
 select * into w from public.watches where id=p_watch_id and user_id=p_owner
 and type='media_news' and deleted_at is null and watch_definition->>'definitionVersion'='watch-definition.v1'
 for update skip locked;
 if w.id is null or not public.media_digest_consent(w.id,p_owner) then return null;end if;
 if not exists(select 1 from public.media_watch_digests d
 join public.media_watch_email_policies p on p.watch_id=d.watch_id and p.user_id=d.user_id
 where d.id=p_digest_id and d.watch_id=w.id and d.user_id=p_owner
 and d.status='prepared' and d.submission_started_at is null
 and d.period<=public.media_digest_period(clock_timestamp()) and p.mode='daily_digest' and p.enabled
 and exists(select 1 from public.media_watch_notifications n where n.digest_id=d.id
 and n.watch_id=w.id and n.user_id=p_owner and n.delivery_mode='daily_digest'
 and n.status='pending' and n.submission_started_at is null and n.created_at>=p.eligible_after)) then return null;end if;
 if exists(select 1 from public.media_watch_digests where watch_id=w.id and submission_started_at is not null
 and public.media_digest_period(submission_started_at)=public.media_digest_period(clock_timestamp())) then return null;end if;
 return public.claim_media_watch_digest(p_digest_id,p_claim_token,array[p_owner],true);
end $$;
revoke all on function public.claim_structured_media_test_digest(uuid,uuid,uuid,uuid,uuid[],integer) from public,anon,authenticated;
grant execute on function public.claim_structured_media_test_digest(uuid,uuid,uuid,uuid,uuid[],integer) to service_role;
commit;
