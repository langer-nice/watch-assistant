begin;
-- Preserve newly accepted daily-digest articles before manual checks advance the identity ledger.
-- The server invokes this only behind the existing Structured Staging intent/digest gates.
create function public.finish_structured_manual_check_with_digest(
 p_watch_id uuid,p_owner uuid,p_revision bigint,p_token uuid,p_checked_at timestamptz,
 p_source_title text,p_source_url text,p_items jsonb,p_expected_checked_at timestamptz,
 p_expected_items jsonb,p_matching jsonb,p_error text default null,p_manual boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; w public.watches%rowtype; item jsonb; position integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if p_manual is distinct from true then raise exception 'Manual check required' using errcode='22023';end if;
 result:=public.finish_structured_media_check(p_watch_id,p_owner,p_revision,p_token,p_checked_at,
  p_source_title,p_source_url,p_items,p_expected_checked_at,p_expected_items,p_matching,p_error,true);
 if result->>'status'='completed' and result->>'outcome'='matching-items'
 and exists(select 1 from public.media_watch_email_policies where watch_id=p_watch_id and user_id=p_owner and mode='daily_digest' and enabled is true)
 and exists(select 1 from public.watches where id=p_watch_id and user_id=p_owner and deleted_at is null and monitoring_state='monitoring')
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
revoke all on function public.finish_structured_manual_check_with_digest(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_structured_manual_check_with_digest(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean) to service_role;


commit;
