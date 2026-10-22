begin;
-- Preserve the existing completion engines and their CAS, ledger and outbox logic.
-- The new marker permits result columns only; it cannot authorize definition edits.
create or replace function public.guard_structured_watch_write() returns trigger
language plpgsql set search_path='' as $$
declare explicit_version boolean; marker text;
begin
 explicit_version := (tg_op<>'INSERT' and coalesce(old.watch_definition ? 'definitionVersion',false))
   or (tg_op<>'DELETE' and coalesce(new.watch_definition ? 'definitionVersion',false));
 if explicit_version then
  marker := current_setting('watch_assistant.structured_rpc',true);
  if current_user in ('authenticated','anon') or auth.role() in ('authenticated','anon') then
   raise exception 'Structured writes require server authorization' using errcode='42501';
  end if;
  if marker='monitor.v1' and auth.role()='service_role' and tg_op='UPDATE' then
   if (to_jsonb(new)-array['updated_at','last_checked_at','last_check_outcome','last_check_error_code',
       'current_status','check_started_at','media_last_change_detected_at','last_change_item_id',
       'last_change_title','last_change_url','last_change_summary','last_change_published_at'])
      is distinct from
      (to_jsonb(old)-array['updated_at','last_checked_at','last_check_outcome','last_check_error_code',
       'current_status','check_started_at','media_last_change_detected_at','last_change_item_id',
       'last_change_title','last_change_url','last_change_summary','last_change_published_at']) then
    raise exception 'Monitoring cannot change structured approval or activation' using errcode='42501';
   end if;
  elsif marker is distinct from 'persist.v1' then
   raise exception 'Structured writes require server authorization' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

-- Private helper locks the authoritative row before version/source validation.
-- Missing version preserves legacy execution; every explicit invalid version fails.
create function public.validate_structured_media_completion(p_watch_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare target public.watches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Monitoring requires service role' using errcode='42501'; end if;
 select * into target from public.watches where id=p_watch_id for update;
 if target.id is null or not coalesce(target.watch_definition ? 'definitionVersion',false) then return false; end if;
 if target.type is distinct from 'media_news'
   or target.watch_definition->'plan'->>'adapter' is distinct from 'google_news_literal_v1'
   or not public.valid_structured_watch_definition(target.monitoring_source,target.watch_definition) then
  raise exception 'Invalid structured Media definition' using errcode='22023';
 end if;
 return true;
end $$;
revoke all on function public.validate_structured_media_completion(uuid) from public,anon,authenticated,service_role;

alter function public.complete_manual_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,jsonb,bigint,uuid) rename to complete_manual_media_watch_check_pre_v1;
revoke all on function public.complete_manual_media_watch_check_pre_v1(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,jsonb,bigint,uuid) from public,anon,authenticated,service_role;
create function public.complete_manual_media_watch_check(p_watch_id uuid,p_checked_at timestamptz,p_source_title text,p_source_url text,p_item_ids text[],p_items jsonb,p_expected_checked_at timestamptz,p_expected_items jsonb,p_notification_items jsonb,p_expected_revision bigint,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare structured boolean; previous_marker text; result jsonb;
begin
 structured := public.validate_structured_media_completion(p_watch_id);
 previous_marker := current_setting('watch_assistant.structured_rpc',true);
 if structured then perform set_config('watch_assistant.structured_rpc','monitor.v1',true); end if;
 result := public.complete_manual_media_watch_check_pre_v1(p_watch_id,p_checked_at,p_source_title,p_source_url,p_item_ids,p_items,p_expected_checked_at,p_expected_items,p_notification_items,p_expected_revision,p_user_id);
 if structured then perform set_config('watch_assistant.structured_rpc',coalesce(previous_marker,''),true); end if;
 return result;
exception when others then
 if structured then perform set_config('watch_assistant.structured_rpc',coalesce(previous_marker,''),true); end if;
 raise;
end $$;
revoke all on function public.complete_manual_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.complete_manual_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,jsonb,bigint,uuid) to service_role;

alter function public.complete_scheduled_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint) rename to complete_scheduled_media_watch_check_pre_v1;
revoke all on function public.complete_scheduled_media_watch_check_pre_v1(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint) from public,anon,authenticated,service_role;
create function public.complete_scheduled_media_watch_check(p_watch_id uuid,p_checked_at timestamptz,p_source_title text,p_source_url text,p_item_ids text[],p_items jsonb,p_expected_checked_at timestamptz,p_expected_items jsonb,p_outcome text,p_notification_items jsonb,p_enqueue_notifications boolean,p_expected_revision bigint) returns text
language plpgsql security definer set search_path='' as $$
declare structured boolean; previous_marker text; result text;
begin
 structured := public.validate_structured_media_completion(p_watch_id);
 previous_marker := current_setting('watch_assistant.structured_rpc',true);
 if structured then perform set_config('watch_assistant.structured_rpc','monitor.v1',true); end if;
 result := public.complete_scheduled_media_watch_check_pre_v1(p_watch_id,p_checked_at,p_source_title,p_source_url,p_item_ids,p_items,p_expected_checked_at,p_expected_items,p_outcome,p_notification_items,p_enqueue_notifications,p_expected_revision);
 if structured then perform set_config('watch_assistant.structured_rpc',coalesce(previous_marker,''),true); end if;
 return result;
exception when others then
 if structured then perform set_config('watch_assistant.structured_rpc',coalesce(previous_marker,''),true); end if;
 raise;
end $$;
revoke all on function public.complete_scheduled_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint) from public,anon,authenticated;
grant execute on function public.complete_scheduled_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint) to service_role;

alter function public.fail_manual_media_watch_check(uuid,uuid,bigint,timestamptz,text) rename to fail_manual_media_watch_check_pre_v1;
revoke all on function public.fail_manual_media_watch_check_pre_v1(uuid,uuid,bigint,timestamptz,text) from public,anon,authenticated,service_role;
create function public.fail_manual_media_watch_check(p_watch_id uuid,p_user_id uuid,p_revision bigint,p_expected_checked_at timestamptz,p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare structured boolean; previous_marker text;
begin
 structured := public.validate_structured_media_completion(p_watch_id);
 previous_marker := current_setting('watch_assistant.structured_rpc',true);
 if structured then perform set_config('watch_assistant.structured_rpc','monitor.v1',true); end if;
 perform public.fail_manual_media_watch_check_pre_v1(p_watch_id,p_user_id,p_revision,p_expected_checked_at,p_code);
 if structured then perform set_config('watch_assistant.structured_rpc',coalesce(previous_marker,''),true); end if;
 return;
exception when others then
 if structured then perform set_config('watch_assistant.structured_rpc',coalesce(previous_marker,''),true); end if;
 raise;
end $$;
revoke all on function public.fail_manual_media_watch_check(uuid,uuid,bigint,timestamptz,text) from public,anon,authenticated;
grant execute on function public.fail_manual_media_watch_check(uuid,uuid,bigint,timestamptz,text) to service_role;

-- No activation API or constraint relaxation. Persisted V1 Watches remain paused.
notify pgrst, 'reload schema';
commit;
