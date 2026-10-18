begin;
-- Service-only release of this worker's claim when the delivery window closes.
-- Call ONLY before invoking the email provider, never for an uncertain submission.
create function public.defer_structured_digest_before_send(p_id uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.media_watch_digests%rowtype; w public.watches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select target.* into w from public.watches target join public.media_watch_digests x on x.watch_id=target.id and x.user_id=target.user_id where x.id=p_id for update of target;
 if w.id is null or w.watch_definition->>'definitionVersion' is distinct from 'watch-definition.v1' then return false;end if;
 select * into d from public.media_watch_digests where id=p_id and claim_token=p_token and status in ('claimed','submitting') and provider_message_id is null and sent_at is null and error_code is null for update;
 if d.id is null then return false;end if;
 update public.media_watch_notifications set claim_token=null,claimed_at=null,submission_started_at=null,
 attempt_count=greatest(0,attempt_count-case when d.submission_started_at is null then 0 else 1 end)
 where digest_id=d.id and status='pending';
 update public.media_watch_digests set status='prepared',claim_token=null,claimed_at=null,submission_started_at=null where id=d.id;
 return true;
end $$;
revoke all on function public.defer_structured_digest_before_send(uuid,uuid) from public,anon,authenticated;
grant execute on function public.defer_structured_digest_before_send(uuid,uuid) to service_role;
commit;
