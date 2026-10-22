begin;
create or replace function public.finish_structured_media_check(p_watch_id uuid,p_owner uuid,p_revision bigint,p_token uuid,p_checked_at timestamptz,p_source_title text,p_source_url text,p_items jsonb,p_expected_checked_at timestamptz,p_expected_items jsonb,p_matching jsonb,p_error text default null,p_manual boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; s public.structured_media_schedules%rowtype; result jsonb; prior timestamptz; baseline timestamptz; article jsonb; published timestamptz; fresh_matching jsonb := '[]'::jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select * into w from public.watches where id=p_watch_id and user_id=p_owner for update;
 select * into s from public.structured_media_schedules where watch_id=p_watch_id for update;
 if w.id is null or w.deleted_at is not null or (not coalesce(p_manual,false) and w.monitoring_state<>'monitoring') or (coalesce(p_manual,false) and w.monitoring_state not in ('paused','monitoring')) or w.media_revision is distinct from p_revision
 or s.lease_kind is distinct from (case when p_manual then 'manual' else 'scheduled' end)
 or s.lease_token is distinct from p_token or p_token is null or s.lease_revision is distinct from p_revision or s.lease_until<=clock_timestamp() then return jsonb_build_object('status','skipped'); end if;
 if not public.validate_structured_media_completion(w.id) then raise exception 'Structured required' using errcode='22023'; end if;
 perform set_config('watch_assistant.structured_rpc','monitor.v1',true);
 select checked_at,baseline_at into prior,baseline from public.media_watch_snapshots where watch_id=w.id;
 if p_error is not null then
  perform public.fail_manual_media_watch_check_pre_v1(w.id,w.user_id,w.media_revision,p_expected_checked_at,left(p_error,100));
  result:=jsonb_build_object('status','failed');
 else
  -- Discovery is not publication. Retain every observed item/identity, but only
  -- report dated developments published since this Watch's initial reference.
  -- Use the baseline, never the previous check or a rolling 24-hour cutoff:
  -- late-discovered post-baseline publications remain eligible.
  if prior is not null and baseline is not null
   and jsonb_typeof(p_items)='array' and jsonb_typeof(p_matching)='array' then
   for article in select value from jsonb_array_elements(p_items) loop
    published := null;
    begin published := nullif(article->>'publishedAt','')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then continue;end;
    -- Undated/invalid/future publications are context, not proven new events.
    if published>=baseline and published<=p_checked_at
     and exists(select 1 from jsonb_array_elements(p_matching) candidate where candidate->>'id'=article->>'id') then
     fresh_matching:=fresh_matching||jsonb_build_array(article);
    end if;
   end loop;
   p_matching:=fresh_matching;
  end if;
  result:=public.complete_manual_media_watch_check_pre_v1(w.id,p_checked_at,p_source_title,p_source_url,
   array(select value->>'id' from jsonb_array_elements(p_items)),p_items,p_expected_checked_at,p_expected_items,p_matching,w.media_revision,w.user_id);
 end if;
 -- A manual success may have advanced the snapshot. Release the lease without
 -- overwriting that success; the next check still observes a full interval.
 update public.watches set check_started_at=null where id=w.id;
 update public.structured_media_schedules set lease_token=null,lease_until=null,lease_revision=null,lease_kind=null,
 failures=case when p_error is not null and prior is not distinct from p_expected_checked_at then least(10,failures+1) else 0 end,
 next_due_at=clock_timestamp()+make_interval(secs=>case when p_error is not null and prior is not distinct from p_expected_checked_at then least(interval_seconds,300*power(2,least(6,failures))::integer) else interval_seconds end) where watch_id=w.id;
 perform set_config('watch_assistant.structured_rpc','',true);
 return result;
end $$;

commit;
