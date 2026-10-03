begin;
-- The rotating snapshot cannot retain first-check context. Null means it was
-- not retained by older code; never relabel a later snapshot as initial context.
alter table public.media_watch_snapshots add column initial_items jsonb
 check (initial_items is null or (jsonb_typeof(initial_items)='array' and jsonb_array_length(initial_items)<=20 and octet_length(initial_items::text)<=120000));
create function public.capture_media_initial_context() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.watches w where w.id=new.watch_id and w.monitoring_source->>'type'='feed') then
  new.initial_items := new.items;
 end if;
 return new;
end $$;
revoke all on function public.capture_media_initial_context() from public,anon,authenticated;
create trigger media_initial_context before insert on public.media_watch_snapshots
for each row execute function public.capture_media_initial_context();

-- Dedicated manual path: preserves manual checks' lack of publication-date
-- cutoff and never enqueues mail. Scheduled/currency RPCs remain unchanged.
-- Caller is the authenticated HTTP handler, which supplies the verified owner.
create function public.complete_manual_media_watch_check(p_watch_id uuid, p_checked_at timestamptz, p_source_title text, p_source_url text, p_item_ids text[], p_items jsonb, p_expected_checked_at timestamptz, p_expected_items jsonb, p_notification_items jsonb, p_expected_revision bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 target public.watches%rowtype; previous public.media_watch_snapshots%rowtype;
 item jsonb; identity_key text; known boolean; matching boolean; published timestamptz;
 changes integer := 0; unseen integer := 0; latest jsonb; accepted jsonb := '[]'::jsonb; unseen_items jsonb := '[]'::jsonb; outcome text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Manual monitoring requires service role' using errcode='42501'; end if;
 if p_checked_at is null or p_items is null or p_item_ids is null or p_notification_items is null
   or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 or cardinality(p_item_ids) > 20
   or jsonb_typeof(p_notification_items) <> 'array' or jsonb_array_length(p_notification_items) > 20
   or octet_length(p_items::text) > 120000 or octet_length(p_notification_items::text) > 120000
 then raise exception 'Invalid media snapshot' using errcode='22023'; end if;
 select * into target from public.watches where id=p_watch_id and type='media_news' and deleted_at is null and user_id=p_user_id and monitoring_source->>'type'='feed' for update;
 if target.id is null or target.media_revision is distinct from p_expected_revision then return jsonb_build_object('status','skipped'); end if;
 select * into previous from public.media_watch_snapshots where watch_id=p_watch_id;
 if previous.watch_id is null then
  if p_expected_checked_at is not null or p_expected_items is not null then return jsonb_build_object('status','skipped'); end if;
 elsif previous.checked_at is distinct from p_expected_checked_at or previous.items is distinct from p_expected_items
   or p_checked_at < previous.checked_at then return jsonb_build_object('status','skipped');
 end if;
 -- Remember every observed identity, including baseline, nonmatching and disabled observations.
 -- This ledger is independent of the rotating, bounded snapshot and survives definition edits.
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item->'identityKeys') is distinct from 'array' then raise exception 'Missing article identity' using errcode='22023'; end if;
  if jsonb_array_length(item->'identityKeys') not between 1 and 2 then raise exception 'Invalid article identity' using errcode='22023'; end if;
  for identity_key in select jsonb_array_elements_text(item->'identityKeys') loop
   if identity_key !~ '^(url|id):[0-9a-f]{64}$' then raise exception 'Invalid article identity' using errcode='22023'; end if;
  end loop;
  select exists(select 1 from public.media_watch_seen_articles s where s.watch_id=target.id
    and s.article_key in (select jsonb_array_elements_text(item->'identityKeys'))) into known;
  insert into public.media_watch_seen_articles(watch_id,article_key)
   select target.id,jsonb_array_elements_text(item->'identityKeys') on conflict do nothing;
  if not known then
   unseen := unseen + 1;
   if previous.watch_id is not null then unseen_items := unseen_items || jsonb_build_array(item); end if;
  end if;
  published := null;
  begin published := nullif(item->>'publishedAt','')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then continue; end;
  matching := previous.watch_id is not null and not known
    and exists(select 1 from jsonb_array_elements(p_notification_items) candidate
      where candidate->>'id'=item->>'id');
  if matching then
   changes := changes + 1;
   if latest is null then latest := item; end if;
   accepted := accepted || jsonb_build_array(item);
  end if;
 end loop;
 insert into public.media_watch_snapshots(watch_id,user_id,checked_at,baseline_at,source_title,source_url,item_ids,items)
  values(target.id,target.user_id,p_checked_at,coalesce(previous.baseline_at,p_checked_at),p_source_title,p_source_url,p_item_ids,p_items)
  on conflict(watch_id) do update set checked_at=excluded.checked_at,source_title=excluded.source_title,source_url=excluded.source_url,item_ids=excluded.item_ids,items=excluded.items;
 outcome := case when previous.watch_id is null then 'baseline' when changes>0 then 'matching-items' when unseen>0 then 'no-matching-items' else 'no-new-items' end;
 update public.watches set last_checked_at=p_checked_at,
  last_check_outcome=outcome,
  last_check_error_code=null,current_status=case when changes>0 then 'updated' else current_status end,check_started_at=null,
  media_last_change_detected_at=case when latest is not null then p_checked_at else media_last_change_detected_at end,
  last_change_item_id=case when latest is not null then latest->'identityKeys'->>0 else last_change_item_id end,
  last_change_title=case when latest is not null then latest->>'title' else last_change_title end,
  last_change_url=case when latest is not null then latest->>'url' else last_change_url end,
  last_change_summary=case when latest is not null then latest->>'excerpt' else last_change_summary end,
  last_change_published_at=case when latest is not null then nullif(latest->>'publishedAt','')::timestamptz else last_change_published_at end
 where id=target.id;
 return jsonb_build_object('status','completed','outcome',outcome,'matchedItems',accepted,'unseenItems',unseen_items);
end $$;

revoke all on function public.complete_manual_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.complete_manual_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,jsonb,bigint,uuid) to service_role;
create function public.fail_manual_media_watch_check(p_watch_id uuid,p_user_id uuid,p_revision bigint,p_expected_checked_at timestamptz,p_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Manual monitoring requires service role' using errcode='42501'; end if;
 update public.watches w set last_check_error_code=case when p_code ~ '^[A-Z_]{1,50}$' then p_code else 'CHECK_FAILED' end
 where w.id=p_watch_id and w.user_id=p_user_id and w.monitoring_source->>'type'='feed'
 and w.media_revision=p_revision and w.deleted_at is null
 and (select s.checked_at from public.media_watch_snapshots s where s.watch_id=w.id) is not distinct from p_expected_checked_at;
end $$;
revoke all on function public.fail_manual_media_watch_check(uuid,uuid,bigint,timestamptz,text) from public,anon,authenticated;
grant execute on function public.fail_manual_media_watch_check(uuid,uuid,bigint,timestamptz,text) to service_role;
notify pgrst, 'reload schema';
commit;
