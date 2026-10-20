begin;
-- Freeze only the three explicitly approved existing Staging identities.
-- This migration never changes Watches, consent, snapshots, article history or pending records.
do $scope$
declare ids uuid[];
begin
 select array_agg(id order by id) into ids from public.watches
 where user_id='4eee8bb6-21c1-46c2-b150-0fa8981a0aef' and type='media_news'
 and not(watch_definition ? 'definitionVersion') and monitoring_source->>'type'='feed' and deleted_at is null
 and (id in ('57a011cd-7686-4b21-a5f1-64a164de2568','577c99c0-8bda-43bc-b0a1-185e5bf0aa2f') or title='Microsoft media mentions');
 if coalesce(cardinality(ids),0) not in (0,3) then raise exception 'Expected exactly three approved legacy Watches';end if;
 ids:=coalesce(ids,'{}'::uuid[]); -- Fresh empty databases grant no Watch scope.
 execute format('create function public.staging_legacy_watch_scope(p_id uuid,p_owner uuid) returns boolean language sql immutable set search_path='''' as %L',
  format('select $1=any(%L::uuid[]) and $2=%L::uuid',ids,'4eee8bb6-21c1-46c2-b150-0fa8981a0aef'));
end $scope$;

create function public.staging_legacy_media_rows() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return coalesce((select jsonb_agg((to_jsonb(w)||jsonb_build_object('media_watch_snapshots',to_jsonb(s))) order by w.id)
 from public.watches w left join public.media_watch_snapshots s on s.watch_id=w.id and s.user_id=w.user_id
 where public.staging_legacy_watch_scope(w.id,w.user_id) and w.deleted_at is null and w.monitoring_state='monitoring'
 and not(w.watch_definition ? 'definitionVersion') and w.monitoring_source->>'type'='feed'
 and public.media_digest_consent(w.id,w.user_id)
 and exists(select 1 from public.media_watch_email_policies p where p.watch_id=w.id and p.user_id=w.user_id and p.mode='daily_digest' and p.enabled)), '[]'::jsonb);
end $$;
create function public.complete_staging_legacy_media_check(
 p_watch_id uuid,p_checked_at timestamptz,p_source_title text,p_source_url text,p_item_ids text[],p_items jsonb,
 p_expected_checked_at timestamptz,p_expected_items jsonb,p_notification_items jsonb,p_expected_revision bigint,p_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; w public.watches%rowtype; item jsonb; position integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 result:=public.complete_manual_media_watch_check(p_watch_id,p_checked_at,p_source_title,p_source_url,p_item_ids,p_items,p_expected_checked_at,p_expected_items,p_notification_items,p_expected_revision,p_user_id);
 if public.staging_legacy_watch_scope(p_watch_id,p_user_id) and result->>'status'='completed' and result->>'outcome'='matching-items'
 and exists(select 1 from public.media_watch_email_policies where watch_id=p_watch_id and user_id=p_user_id and mode='daily_digest' and enabled is true)
 and exists(select 1 from public.watches where id=p_watch_id and user_id=p_user_id and deleted_at is null and monitoring_state='monitoring')
 and public.media_digest_consent(p_watch_id,p_user_id) then
  select * into w from public.watches where id=p_watch_id and user_id=p_user_id and deleted_at is null and monitoring_state='monitoring' for update;
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
create function public.prepare_staging_legacy_digests(p_send_hour integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare locked_watch public.watches%rowtype; digest uuid; day date:=public.media_digest_period(clock_timestamp());
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_send_hour is null or p_send_hour not between 0 and 23 then raise exception 'Invalid hour' using errcode='22023';end if;
 if extract(hour from clock_timestamp() at time zone 'UTC')<p_send_hour then return '[]'::jsonb;end if;
 for locked_watch in select target.* from public.watches target join public.media_watch_email_policies p on p.watch_id=target.id and p.user_id=target.user_id
 where public.staging_legacy_watch_scope(target.id,target.user_id) and not(target.watch_definition ? 'definitionVersion')
 and p.mode='daily_digest' and public.media_digest_consent(target.id,target.user_id)
 and exists(select 1 from public.media_watch_notifications n where n.watch_id=target.id and n.user_id=target.user_id and n.delivery_mode='daily_digest' and n.status='pending' and n.digest_id is null and n.submission_started_at is null and n.created_at>=p.eligible_after)
 order by target.id for update of target skip locked loop
  insert into public.media_watch_digests(watch_id,user_id,period) values(locked_watch.id,locked_watch.user_id,day) on conflict(watch_id,period) do nothing returning id into digest;
  if digest is not null then
   update public.media_watch_notifications set digest_id=digest where watch_id=locked_watch.id and user_id=locked_watch.user_id and delivery_mode='daily_digest' and status='pending' and digest_id is null and submission_started_at is null;
  end if;
 end loop;
 return coalesce((select jsonb_agg(x.id order by x.period,x.id) from(
  select distinct on(d.watch_id) d.id,d.period from public.media_watch_digests d join public.watches w on w.id=d.watch_id and w.user_id=d.user_id
  where public.staging_legacy_watch_scope(w.id,w.user_id) and not(w.watch_definition ? 'definitionVersion')
  and public.media_digest_consent(w.id,w.user_id) and d.period<=day and d.submission_started_at is null
  and(d.status='prepared' or(d.status='claimed' and d.claimed_at<clock_timestamp()-interval '30 minutes'))
  and not exists(select 1 from public.media_watch_digests a where a.watch_id=w.id and a.status='claimed' and a.submission_started_at is null and a.claimed_at>=clock_timestamp()-interval '30 minutes')
  and not exists(select 1 from public.media_watch_digests a where a.watch_id=w.id and a.submission_started_at is not null and public.media_digest_period(a.submission_started_at)=day)
  order by d.watch_id,d.period,d.id
 )x),'[]'::jsonb);
end $$;

create function public.claim_staging_legacy_digest(p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select target.* into w from public.watches target join public.media_watch_digests d on d.watch_id=target.id and d.user_id=target.user_id
 where d.id=p_id and d.period<=public.media_digest_period(clock_timestamp()) and public.staging_legacy_watch_scope(target.id,target.user_id)
 and not(target.watch_definition ? 'definitionVersion') for update of target skip locked;
 if w.id is null or not public.media_digest_consent(w.id,w.user_id) then return null;end if;
 if exists(select 1 from public.media_watch_digests where watch_id=w.id and submission_started_at is not null and public.media_digest_period(submission_started_at)=public.media_digest_period(clock_timestamp())) then return null;end if;
 return public.claim_media_watch_digest(p_id,p_token,array[w.user_id],false);
end $$;

create function public.defer_staging_legacy_digest(p_id uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare d public.media_watch_digests%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform 1 from public.watches w join public.media_watch_digests x on x.watch_id=w.id and x.user_id=w.user_id
 where x.id=p_id and public.staging_legacy_watch_scope(w.id,w.user_id) and not(w.watch_definition ? 'definitionVersion') for update of w;
 if not found then return false;end if;
 select * into d from public.media_watch_digests where id=p_id and claim_token=p_token and status in('claimed','submitting') and provider_message_id is null and sent_at is null and error_code is null for update;
 if d.id is null then return false;end if;
 update public.media_watch_notifications set claim_token=null,claimed_at=null,submission_started_at=null,attempt_count=greatest(0,attempt_count-case when d.submission_started_at is null then 0 else 1 end) where digest_id=d.id and status='pending';
 update public.media_watch_digests set status='prepared',claim_token=null,claimed_at=null,submission_started_at=null where id=d.id;
 return true;
end $$;

do $acl$ declare f record;begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in('staging_legacy_watch_scope','staging_legacy_media_rows','complete_staging_legacy_media_check','prepare_staging_legacy_digests','claim_staging_legacy_digest','defer_staging_legacy_digest') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $acl$;
notify pgrst,'reload schema';
commit;
