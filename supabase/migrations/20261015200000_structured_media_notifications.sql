begin;

-- No implicit opt-in: missing preference means disabled. No direct write grants.
create table public.structured_media_email_preferences (
 watch_id uuid primary key references public.watches(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null default false
);
alter table public.structured_media_email_preferences enable row level security;
revoke all on public.structured_media_email_preferences from public,anon,authenticated,service_role;
grant select on public.structured_media_email_preferences to authenticated;
create policy structured_media_email_preferences_owner on public.structured_media_email_preferences
 for select to authenticated using (user_id=(select auth.uid()));

create function public.get_structured_media_email_preference(p_watch_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.watches w where w.id=p_watch_id and w.user_id=auth.uid() and w.deleted_at is null and w.type='media_news' and w.watch_definition->'plan'->>'domain'='media_news' and w.watch_definition->>'definitionVersion'='watch-definition.v1') then return null; end if;
 return coalesce((select enabled from public.structured_media_email_preferences where watch_id=p_watch_id and user_id=auth.uid()),false);
end $$;
create function public.set_structured_media_email_preference(p_watch_id uuid,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype;
begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into w from public.watches where id=p_watch_id and user_id=auth.uid() and deleted_at is null
 and type='media_news' and watch_definition->'plan'->>'domain'='media_news' and watch_definition->>'definitionVersion'='watch-definition.v1' for update;
 if w.id is null or p_enabled is null then raise exception 'Preference not authorized' using errcode='42501'; end if;
 insert into public.structured_media_email_preferences(watch_id,user_id,enabled) values(w.id,w.user_id,p_enabled)
 on conflict(watch_id) do update set enabled=excluded.enabled;
 if not p_enabled then
  update public.media_watch_notifications set status='failed',last_error_code='EMAIL_OPTED_OUT'
   where watch_id=w.id and user_id=w.user_id and status='pending' and submission_started_at is null;
 end if;
 return p_enabled;
end $$;
revoke all on function public.get_structured_media_email_preference(uuid) from public,anon,authenticated,service_role;
revoke all on function public.set_structured_media_email_preference(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_structured_media_email_preference(uuid) to authenticated;
grant execute on function public.set_structured_media_email_preference(uuid,boolean) to authenticated;
-- Opt-in atomic handoff. Existing completion owns all row locks, leases, CAS,
-- baseline suppression and durable article identities. Manual checks stay silent.
create function public.finish_structured_media_check_with_notifications(
 p_watch_id uuid,p_owner uuid,p_revision bigint,p_token uuid,p_checked_at timestamptz,
 p_source_title text,p_source_url text,p_items jsonb,p_expected_checked_at timestamptz,
 p_expected_items jsonb,p_matching jsonb,p_error text default null,p_enqueue_notifications boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; w public.watches%rowtype; item jsonb; position integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 result:=public.finish_structured_media_check(p_watch_id,p_owner,p_revision,p_token,p_checked_at,
  p_source_title,p_source_url,p_items,p_expected_checked_at,p_expected_items,p_matching,p_error,false);
 if p_enqueue_notifications is true and result->>'status'='completed' and result->>'outcome'='matching-items'
 and exists(select 1 from public.structured_media_email_preferences where watch_id=p_watch_id and user_id=p_owner and enabled is true) then
  select * into w from public.watches where id=p_watch_id and user_id=p_owner and deleted_at is null and monitoring_state='monitoring' for update;
  if w.id is null then raise exception 'Notification owner or state invalid' using errcode='42501'; end if;
  for item in select value from jsonb_array_elements(result->'matchedItems') loop
   if coalesce(item->>'url','') !~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$' then
    raise exception 'Invalid notification article URL' using errcode='22023';
   end if;
   position:=position+1;
   insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article_position,article)
   values(w.id,w.user_id,item->'identityKeys'->>0,left(w.title,200),position,
    jsonb_build_object('title',item->>'title','url',item->>'url','summary',item->>'excerpt',
     'publishedAt',item->>'publishedAt','source',coalesce(item->>'sourceTitle',item->>'source',p_source_title)))
   on conflict(watch_id,user_id,source_article_id) do nothing;
  end loop;
 end if;
 return result;
end $$;
revoke all on function public.finish_structured_media_check_with_notifications(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_structured_media_check_with_notifications(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean) to service_role;

-- Preserve the legacy claim result; add a server-owned discriminator only for V1.
alter function public.claim_media_watch_email_notification(uuid,uuid) rename to claim_media_watch_email_notification_pre_structured;
revoke all on function public.claim_media_watch_email_notification_pre_structured(uuid,uuid) from public,anon,authenticated,service_role;
create function public.claim_media_watch_email_notification(p_notification_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; w public.watches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select target.* into w from public.watches target join public.media_watch_notifications n on n.watch_id=target.id
  where n.id=p_notification_id and n.user_id=target.user_id for update of target;
 if w.id is null then return null; end if;
 if w.watch_definition ? 'definitionVersion' and not exists(select 1 from public.structured_media_email_preferences where watch_id=w.id and user_id=w.user_id and enabled is true) then return null; end if;
 result:=public.claim_media_watch_email_notification_pre_structured(p_notification_id,p_claim_token);
 if result is not null and w.watch_definition ? 'definitionVersion' then result:=result||jsonb_build_object('is_structured',true); end if;
 return result;
end $$;
revoke all on function public.claim_media_watch_email_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_media_watch_email_notification(uuid,uuid) to service_role;

-- Pause/delete/edit cancels pending intents through the existing invalidation
-- trigger. Also recheck eligibility after recipient lookup and before submission.
alter function public.begin_media_watch_email_submission(uuid,uuid) rename to begin_media_watch_email_submission_pre_structured;
revoke all on function public.begin_media_watch_email_submission_pre_structured(uuid,uuid) from public,anon,authenticated,service_role;
create function public.begin_media_watch_email_submission(p_notification_id uuid,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select target.* into w from public.watches target join public.media_watch_notifications n on n.watch_id=target.id
  where n.id=p_notification_id and n.user_id=target.user_id for update of target;
 if w.watch_definition ? 'definitionVersion' and (w.deleted_at is not null or w.monitoring_state<>'monitoring' or not exists(select 1 from public.structured_media_email_preferences where watch_id=w.id and user_id=w.user_id and enabled is true)) then return false; end if;
 return public.begin_media_watch_email_submission_pre_structured(p_notification_id,p_claim_token);
end $$;
revoke all on function public.begin_media_watch_email_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_media_watch_email_submission(uuid,uuid) to service_role;
-- Dedicated test claim cannot claim legacy or non-allowlisted rows, even if
-- a stale query or an incorrect client supplies their notification UUID.
create function public.claim_structured_media_test_email_notification(p_notification_id uuid,p_claim_token uuid,p_owners uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if not exists(select 1 from public.watches w join public.media_watch_notifications n on n.watch_id=w.id
  where n.id=p_notification_id and n.user_id=w.user_id and w.user_id=any(p_owners)
  and w.watch_definition->>'definitionVersion'='watch-definition.v1' and w.watch_definition->'plan'->>'domain'='media_news') then return null; end if;
 return public.claim_media_watch_email_notification(p_notification_id,p_claim_token);
end $$;
revoke all on function public.claim_structured_media_test_email_notification(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.claim_structured_media_test_email_notification(uuid,uuid,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
