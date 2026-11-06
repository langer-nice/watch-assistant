begin;

do $migration$
declare
  definition text;
  result_anchor text := ' evid:=p_result->''evidence'';';
  schedule_anchor text := ' update public.structured_media_schedules set lease_token=null';
  empty_branch text := $branch$
 if p_result = '{"empty_search":true}'::jsonb then
   if p.engine is distinct from 'wa-v3-evidence-refs.v1' or p.baseline_at is null
      or jsonb_typeof(p.understanding->'story_seed') is distinct from 'object'
      or nullif(p.understanding->'story_seed'->>'original_url', '') is null
      or w.monitoring_source->>'type' is distinct from 'feed'
      or coalesce(w.monitoring_source->>'url', '') not like 'https://news.google.com/rss/search?%' then
     raise exception 'Invalid empty story search completion';
   end if;
   update public.v3_pilot_watches
     set history = history || jsonb_build_array(jsonb_build_object(
       'at', at_time, 'status', 'succeeded', 'outcome', 'no-new-items', 'empty_search', true))
     where watch_id = p_id;
   update public.watches set check_started_at = null, last_checked_at = at_time,
     last_check_error_code = null, last_check_outcome = 'no-new-items', current_status = 'watching'
     where id = p_id;
 else
$branch$;
begin
  if to_regprocedure('public.finish_v3_pilot_check(uuid,uuid,jsonb)') is null then return; end if;
  definition := pg_get_functiondef('public.finish_v3_pilot_check(uuid,uuid,jsonb)'::regprocedure);
  if position(empty_branch in definition) > 0 then return; end if;
  if position(result_anchor in definition) = 0
     or position(schedule_anchor in definition) <= position(result_anchor in definition)
     or position('next_due_at=case when s.lease_kind=''manual'' then s.next_due_at' in definition) = 0 then
    raise exception 'Unexpected V3 completion contract';
  end if;
  -- Run after the unchanged role/lease/revision checks. Reuse the existing
  -- schedule completion for either branch; keep all prior evidence intact.
  execute replace(replace(definition, result_anchor, empty_branch || result_anchor),
    schedule_anchor, E' end if;\n' || schedule_anchor);
end $migration$;

commit;
