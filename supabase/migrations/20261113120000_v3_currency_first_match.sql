begin;

-- Function bodies only. No existing Watch/state/event is rewritten or replayed.
do $migration$
declare
 f text;
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
begin
 f:=pg_get_functiondef('public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
 if position('initial_alert boolean' in f)>0 then return;end if;
 if position('prior jsonb;' in f)=0 or position(policy_anchor in f)=0
  or position('or p_baseline->''judgment'' is distinct from ''null''::jsonb or p_baseline->''article'' is distinct from ''null''::jsonb' in f)=0
  or position('last_evidence,evaluation,history)' in f)=0 then
  raise exception 'Unexpected V3 creation contract';
 end if;
 f:=replace(f,'prior jsonb;',
  'prior jsonb; initial_alert boolean:=coalesce(p_source->>''type''=''currency'' and p_baseline->''evaluation''->>''met''=''true'' and p_baseline->''judgment''->>''action''=''ALERT'',false);');
 f:=replace(f,
  'or p_baseline->''judgment'' is distinct from ''null''::jsonb or p_baseline->''article'' is distinct from ''null''::jsonb',
  $validation$or (not initial_alert and (p_baseline->'judgment' is distinct from 'null'::jsonb or p_baseline->'article' is distinct from 'null'::jsonb))
 or (initial_alert and (jsonb_typeof(p_baseline->'article') is distinct from 'object'
  or p_baseline->'article'->>'url' is distinct from p_source->>'url'
  or p_baseline->'evaluation'->>'provider' is distinct from 'ecb'
  or (p_baseline->'evaluation')->>'base' is distinct from p_criteria->>'base'
  or (p_baseline->'evaluation')->>'quote' is distinct from p_criteria->>'quote'
  or (p_baseline->'evaluation')->>'operator' is distinct from p_criteria->>'operator'
  or (p_baseline->'evaluation')->>'target' is distinct from p_criteria->>'target'))$validation$);
 f:=replace(f,'''alerted'',false','''alerted'',initial_alert');
 f:=replace(f,'''monitoring'',''watching'',1,gen_random_uuid(),at_time,''baseline'',',
  '''monitoring'',case when initial_alert then ''updated'' else ''watching'' end,1,gen_random_uuid(),at_time,case when initial_alert then ''matching-items'' else ''baseline'' end,');
 f:=replace(f,'last_evidence,evaluation,history)','last_evidence,evaluation,last_judgment,history)');
 f:=replace(f,'evid,nullif(p_baseline->''evaluation'',''null''::jsonb),jsonb_build_array(',
  'evid,nullif(p_baseline->''evaluation'',''null''::jsonb),nullif(p_baseline->''judgment'',''null''::jsonb),jsonb_build_array(');
 f:=replace(f,'''judgment'',null,''baseline'',true','''judgment'',nullif(p_baseline->''judgment'',''null''::jsonb),''baseline'',not initial_alert');
 execute replace(f,policy_anchor,policy_anchor||initial_persistence);

 f:=pg_get_functiondef('public.finish_v3_pilot_check(uuid,uuid,jsonb)'::regprocedure);
 if position('alert:=p.baseline_at is not null and j->>''action''=''ALERT'';' in f)=0
  or position('p.slot=2 or (p.engine=''wa-v3-evidence-refs.v1'' and w.monitoring_source->>''type''=''currency'')' in f)=0 then
  raise exception 'Unexpected V3 completion contract';
 end if;
 f:=replace(f,'alert:=p.baseline_at is not null and j->>''action''=''ALERT'';',
  'alert:=(p.baseline_at is not null or (w.monitoring_source->>''type''=''currency'' and p_result->''evaluation''->>''met''=''true'')) and j->>''action''=''ALERT'';');
 f:=replace(f,'''alerted'',false','''alerted'',coalesce(alert,false)');
 f:=replace(f,'''baseline'',p.baseline_at is null','''baseline'',p.baseline_at is null and not coalesce(alert,false)');
 f:=replace(f,'case when p.baseline_at is null then ''baseline'' when alert then ''matching-items''',
  'case when alert then ''matching-items'' when p.baseline_at is null then ''baseline''');
 execute f;
end $migration$;

commit;
