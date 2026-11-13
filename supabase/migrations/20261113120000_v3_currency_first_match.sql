begin;

-- Function bodies only. No existing Watch/state/event is rewritten or replayed.
do $migration$
declare
 policy_anchor text := ' insert into public.media_watch_email_policies(watch_id,user_id,mode,enabled) values(p_id,p_owner,''daily_digest'',true);';
 initial_persistence text := $initial$
 if initial_alert then
  update public.watches set
   media_last_change_detected_at=at_time,
   last_change_item_id='currency:'||(def->>'currencyRevision')||':'||(evid->>'id'),
   last_change_title=p_baseline->'article'->>'title',last_change_summary=p_baseline->'article'->>'summary',
   last_change_url=p_baseline->'article'->>'url',last_change_published_at=(p_baseline->'article'->>'publishedAt')::timestamptz
  where id=p_id;
  insert into public.currency_watch_events(watch_id,user_id,id,detected_at,article,evaluation)
  values(p_id,p_owner,'currency:'||(def->>'currencyRevision')||':'||(evid->>'id'),at_time,p_baseline->'article',p_baseline->'evaluation');
  -- Consent has just been created. Use processing time, rather than the earlier
  -- transaction-start default, so the normal eligible_after gate is respected.
  insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article_position,article,created_at)
  values(p_id,p_owner,evid->>'id',title,0,p_baseline->'article',clock_timestamp());
 end if;
$initial$;
 signatures regprocedure[]:=array[
  'public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
  'public.finish_v3_pilot_check(uuid,uuid,jsonb)'::regprocedure];
 -- One exact anchor per replacement; indices 1..8 belong to creation, 9..12 to completion.
 function_indices integer[]:=array[1,1,1,1,1,1,1,1,2,2,2,2];
 anchors text[]:=array[
  'prior jsonb;',
  'or p_baseline->''judgment'' is distinct from ''null''::jsonb or p_baseline->''article'' is distinct from ''null''::jsonb',
  '''alerted'',false',
  '''monitoring'',''watching'',1,gen_random_uuid(),at_time,''baseline'',',
  'last_evidence,evaluation,history)',
  'evid,nullif(p_baseline->''evaluation'',''null''::jsonb),jsonb_build_array(',
  '''judgment'',null,''baseline'',true',
  policy_anchor,
  'alert:=p.baseline_at is not null and j->>''action''=''ALERT'';',
  '''alerted'',false)),''[]'') into entries from jsonb_array_elements(p_result->''items'');',
  '''baseline'',p.baseline_at is null',
  'case when p.baseline_at is null then ''baseline'' when alert then ''matching-items'''];
 replacements text[]:=array[
  'prior jsonb; initial_alert boolean:=coalesce(p_source->>''type''=''currency'' and p_baseline->''evaluation''->>''met''=''true'' and p_baseline->''judgment''->>''action''=''ALERT'',false);',
  $validation$or (not initial_alert and (p_baseline->'judgment' is distinct from 'null'::jsonb or p_baseline->'article' is distinct from 'null'::jsonb))
 or (initial_alert and (jsonb_typeof(p_baseline->'article') is distinct from 'object'
  or p_baseline->'article'->>'url' is distinct from p_source->>'url'
  or p_baseline->'evaluation'->>'provider' is distinct from 'ecb'
  or (p_baseline->'evaluation')->>'base' is distinct from p_criteria->>'base'
  or (p_baseline->'evaluation')->>'quote' is distinct from p_criteria->>'quote'
  or (p_baseline->'evaluation')->>'operator' is distinct from p_criteria->>'operator'
  or (p_baseline->'evaluation')->>'target' is distinct from p_criteria->>'target'))$validation$,
  '''alerted'',initial_alert',
  '''monitoring'',case when initial_alert then ''updated'' else ''watching'' end,1,gen_random_uuid(),at_time,case when initial_alert then ''matching-items'' else ''baseline'' end,',
  'last_evidence,evaluation,last_judgment,history)',
  'evid,nullif(p_baseline->''evaluation'',''null''::jsonb),nullif(p_baseline->''judgment'',''null''::jsonb),jsonb_build_array(',
  '''judgment'',nullif(p_baseline->''judgment'',''null''::jsonb),''baseline'',not initial_alert',
  policy_anchor||initial_persistence,
  'alert:=(p.baseline_at is not null or (w.monitoring_source->>''type''=''currency'' and p_result->''evaluation''->>''met''=''true'')) and j->>''action''=''ALERT'';',
  '''alerted'',coalesce(alert,false))),''[]'') into entries from jsonb_array_elements(p_result->''items'');',
  '''baseline'',p.baseline_at is null and not coalesce(alert,false)',
  'case when alert then ''matching-items'' when p.baseline_at is null then ''baseline'''];
 definitions text[];
 expected text[];
 complete boolean;
 i integer;
 j integer;
 phase integer;
 occurrences integer;
begin
 for phase in 0..1 loop
  definitions:=array[pg_get_functiondef(signatures[1]),pg_get_functiondef(signatures[2])];
  if position('p.slot=2 or (p.engine=''wa-v3-evidence-refs.v1'' and w.monitoring_source->>''type''=''currency'')' in definitions[2])=0 then
  raise exception 'Unexpected V3 completion contract';
  end if;
  -- Validate every complete replacement in BOTH definitions, including the
  -- entire event/outbox block. Some anchors intentionally remain as prefixes
  -- inside their replacements; every other original fragment must be absent.
  complete:=true;
  for i in 1..array_length(anchors,1) loop
   j:=function_indices[i];
   occurrences:=(length(definitions[j])-length(replace(definitions[j],replacements[i],'')))/length(replacements[i]);
   if occurrences<>1 then complete:=false;end if;
   occurrences:=(length(definitions[j])-length(replace(definitions[j],anchors[i],'')))/length(anchors[i]);
   if occurrences<>(case when position(anchors[i] in replacements[i])>0 then 1 else 0 end) then complete:=false;end if;
  end loop;
  if phase=1 then
   if not complete or definitions is distinct from expected then
    raise exception 'V3 currency migration postcondition failed';
   end if;
   return;
  end if;
  if complete then return;end if; -- Idempotence requires all 12 final fragments.

  expected:=definitions;
  for i in 1..array_length(anchors,1) loop
   j:=function_indices[i];
   occurrences:=(length(expected[j])-length(replace(expected[j],anchors[i],'')))/length(anchors[i]);
   if occurrences<>1 then
    raise exception 'V3 currency migration anchor % in %: expected 1 occurrence, found %',i,signatures[j],occurrences;
   end if;
   expected[j]:=replace(expected[j],anchors[i],replacements[i]);
  end loop;
  -- Only publish after both candidates pass every anchor check. Any execution
  -- or postcondition failure rolls back both CREATE OR REPLACE statements.
  execute expected[1];
  execute expected[2];
 end loop;
end $migration$;

commit;
