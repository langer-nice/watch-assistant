begin;
-- Additive Staging adapter: only the explicitly selected Watches are touched.
create function public.prepare_scoped_structured_media_digests(p_send_hour integer,p_owners uuid[],p_watches uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; digest uuid; count_created integer:=0; period_day date:=public.media_digest_period(clock_timestamp());
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_send_hour is null or p_send_hour not between 0 and 23 or coalesce(cardinality(p_owners),0)=0 or coalesce(cardinality(p_watches),0) not between 1 and 2 or array_position(p_watches,null) is not null then raise exception 'Invalid scope' using errcode='22023';end if;
 if extract(hour from clock_timestamp() at time zone 'UTC')<p_send_hour then return '[]'::jsonb;end if;
 for w in select target.* from public.watches target join public.media_watch_email_policies p on p.watch_id=target.id and p.user_id=target.user_id
 where p.mode='daily_digest' and public.media_digest_consent(target.id,target.user_id)
 and target.watch_definition->>'definitionVersion'='watch-definition.v1'
 and target.user_id=any(p_owners) and target.id=any(p_watches)
 and exists(select 1 from public.media_watch_notifications n where n.watch_id=target.id and n.user_id=target.user_id and n.delivery_mode='daily_digest' and n.status='pending' and n.digest_id is null and n.submission_started_at is null and n.created_at>=p.eligible_after)
 order by target.id limit 10 for update of target skip locked loop
  insert into public.media_watch_digests(watch_id,user_id,period) values(w.id,w.user_id,period_day) on conflict(watch_id,period) do nothing returning id into digest;
  if digest is not null then
   update public.media_watch_notifications set digest_id=digest where watch_id=w.id and user_id=w.user_id and delivery_mode='daily_digest' and status='pending' and digest_id is null and submission_started_at is null;
   count_created:=count_created+1;
  end if;
 end loop;
 return coalesce((select jsonb_agg(jsonb_build_object('digestId',d.id,'watchId',d.watch_id,'ownerId',d.user_id) order by d.period,d.id)
 from public.media_watch_digests d join public.watches target on target.id=d.watch_id and target.user_id=d.user_id
 where d.watch_id=any(p_watches) and d.user_id=any(p_owners)
 and target.watch_definition->>'definitionVersion'='watch-definition.v1'
 and d.status='prepared' and d.submission_started_at is null
 and d.period<=period_day and public.media_digest_consent(target.id,target.user_id)), '[]'::jsonb);
end $$;
revoke all on function public.prepare_scoped_structured_media_digests(integer,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.prepare_scoped_structured_media_digests(integer,uuid[],uuid[]) to service_role;
commit;
