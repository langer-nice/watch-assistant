begin;
do $general_v3$ begin
 if to_regclass('public.v3_pilot_watches') is null then return;end if;
-- Existing private sidecar is required: ordinary Watch JSON cannot safely mark
-- an authoritative server-only engine or retain admitted Intent. Keep RLS and
-- grants intact; pilot slots retain their original identity constraints.
alter table public.v3_pilot_watches alter column slot drop not null;
alter table public.v3_pilot_watches drop constraint v3_pilot_watches_slot_check;
alter table public.v3_pilot_watches drop constraint v3_pilot_watches_engine_check;
alter table public.v3_pilot_watches drop constraint v3_pilot_watches_user_id_check;
alter table public.v3_pilot_watches add column capture_kind text not null default 'FREE_TEXT' check(capture_kind in ('FREE_TEXT','URL'));
alter table public.v3_pilot_watches add constraint v3_engine_identity check(
 (engine='wa-v3-evidence-refs-pilot.v1' and slot between 1 and 4 and slot is not null and user_id='b4757e02-fc75-4984-b50e-8d933ae7ec04')
 or (engine='wa-v3-evidence-refs.v1' and slot is null));
create unique index v3_general_original_once on public.v3_pilot_watches(user_id,instruction) where engine='wa-v3-evidence-refs.v1';

create function public.create_v3_watch(p_id uuid,p_owner uuid,p_instruction text,p_kind text,p_understanding jsonb,p_source jsonb,p_criteria jsonb,p_baseline jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing uuid; def jsonb; title text; at_time timestamptz:=clock_timestamp(); evid jsonb:=p_baseline->'evidence'; items jsonb:=p_baseline->'items'; prior jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_id is null or p_owner is null or p_instruction is null or char_length(p_instruction) not between 1 and 500 or btrim(p_instruction)='' or p_kind not in ('FREE_TEXT','URL') or p_kind is null
 or p_understanding->'decision'->>'status' is distinct from 'READY_TO_MONITOR'
 or jsonb_typeof(p_understanding->'intent') is distinct from 'object'
 or coalesce(char_length(p_understanding->'intent'->>'canonical_text'),0)<1
 or jsonb_typeof(p_understanding->'intent'->'references') is distinct from 'array'
 or jsonb_typeof(p_understanding->'intent'->'explicit_constraints') is distinct from 'array'
 or p_understanding->'intent'->'unresolved_ambiguities' is distinct from '[]'::jsonb
 or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>20
 or jsonb_typeof(evid) is distinct from 'object' or coalesce(char_length(evid->>'id'),0)=0
 or p_baseline->'judgment' is distinct from 'null'::jsonb or p_baseline->'article' is distinct from 'null'::jsonb
 then raise exception 'Invalid V3 creation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_instruction,0));
 select watch_id into existing from public.v3_pilot_watches where user_id=p_owner and instruction=p_instruction;
 if existing is not null then return existing;end if;
 if exists(select 1 from public.watches where id=p_id) then raise exception 'Creation ID conflict';end if;
 title:=left(p_understanding->'intent'->>'canonical_text',200);
 if p_source->>'type'='currency' then
 if p_source is distinct from '{"type":"currency","provider":"ecb","url":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"}'::jsonb
 or p_criteria is null or (p_criteria->>'base' in ('GBP','EUR')) is distinct from true or (p_criteria->>'quote' in ('GBP','EUR')) is distinct from true or p_criteria->>'base'=p_criteria->>'quote'
 or (p_criteria->>'operator' in ('gt','gte')) is distinct from true or coalesce(p_criteria->>'target','') !~ '^[0-9]+([.][0-9]+)?$' or (p_criteria->>'target')::numeric<=0
 then raise exception 'Invalid currency source';end if;
 def:=jsonb_build_object('inputType','text','request',p_instruction,'category','finance','currencyCriteria',p_criteria,'currencyRevision',gen_random_uuid(),'currencyLanguage','en','currencyPolicy','crossing');
 else
 if p_source->>'type' is distinct from 'feed' or coalesce(p_source->>'url','') !~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$' or p_criteria is not null
 or coalesce(evid->>'url','') !~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$' then raise exception 'Invalid feed source';end if;
 def:=jsonb_build_object('inputType','url','request',p_instruction,'category','news','storyProfile',jsonb_build_object('concepts',jsonb_build_array(jsonb_build_object('label',title,'type','condition')),'userAddedConcepts','[]'::jsonb));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',value->>'id','fact',left(concat_ws(E'\n',value->>'title',value->>'excerpt'),1600),'alerted',false)),'[]') into prior from jsonb_array_elements(items);
 insert into public.watches(id,user_id,type,title,watch_definition,monitoring_source,monitoring_state,current_status,media_revision,media_mutation_id,last_checked_at,last_check_outcome,currency_evaluation)
 values(p_id,p_owner,'media_news',title,def,p_source,'monitoring','watching',1,gen_random_uuid(),at_time,'baseline',nullif(p_baseline->'evaluation','null'::jsonb));
 insert into public.v3_pilot_watches(watch_id,user_id,slot,engine,instruction,understanding,capture_kind,baseline_at,prior_state,last_evidence,evaluation,history)
 values(p_id,p_owner,null,'wa-v3-evidence-refs.v1',p_instruction,p_understanding,p_kind,at_time,jsonb_build_object('entries',prior),evid,nullif(p_baseline->'evaluation','null'::jsonb),jsonb_build_array(jsonb_build_object('at',at_time,'evidence',evid,'judgment',null,'baseline',true)));
 insert into public.media_watch_snapshots(watch_id,user_id,checked_at,source_title,source_url,item_ids,items,baseline_at,initial_items)
 values(p_id,p_owner,at_time,evid->>'source',evid->>'url',array(select value->>'id' from jsonb_array_elements(items)),items,at_time,items);
 insert into public.structured_media_schedules(watch_id,interval_seconds,next_due_at)
 values(p_id,86400,((at_time at time zone 'UTC')::date+1+time '06:00') at time zone 'UTC');
 insert into public.media_watch_email_policies(watch_id,user_id,mode,enabled) values(p_id,p_owner,'daily_digest',true);
 return p_id;
end $$;
revoke all on function public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb) to service_role;

-- Existing scheduler/leases/outbox remain authoritative. Carry source with each
-- generic claim; preserve exact pilot evaluation and all legacy claim behavior.
do $$declare f text;begin
 select pg_get_functiondef('public.claim_v3_pilot_checks()'::regprocedure) into f;
 if position('p.prior_state,p.evaluation' in f)=0 then raise exception 'Unexpected V3 claim contract';end if;
 execute replace(f,'p.prior_state,p.evaluation','p.prior_state,p.evaluation,w.monitoring_source as source');
 select pg_get_functiondef('public.finish_v3_pilot_check(uuid,uuid,jsonb)'::regprocedure) into f;
 if position('p.slot=2' in f)=0 then raise exception 'Unexpected V3 completion contract';end if;
 execute replace(f,'p.slot=2','(p.slot=2 or (p.engine=''wa-v3-evidence-refs.v1'' and w.monitoring_source->>''type''=''currency''))');
end $$;
end $general_v3$;
notify pgrst,'reload schema';
commit;
