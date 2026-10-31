begin;
do $pilot_install$ begin
 if to_regprocedure('public.morning_report_context(uuid,timestamptz)') is null then return;end if;
-- Private pilot identity and validated semantic state. Existing Watch contracts
-- remain unchanged; this is an acquisition-compatible sidecar, not a migration.
create table public.v3_pilot_watches (
 watch_id uuid primary key references public.watches(id) on delete cascade,
 user_id uuid not null references auth.users(id), slot integer not null check(slot between 1 and 4),
 engine text not null check(engine='wa-v3-evidence-refs-pilot.v1'),
 instruction text not null, understanding jsonb not null,
 baseline_at timestamptz, prior_state jsonb not null default '{"entries":[]}',
 last_evidence jsonb, last_judgment jsonb, evaluation jsonb, history jsonb not null default '[]',
 unique(user_id,slot),check(user_id='b4757e02-fc75-4984-b50e-8d933ae7ec04')
);
alter table public.v3_pilot_watches enable row level security;
revoke all on public.v3_pilot_watches from public,anon,authenticated,service_role;
grant select on public.v3_pilot_watches to service_role;

create function public.guard_v3_pilot_identity() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.v3_pilot_watches where watch_id=old.id) and auth.role() in ('anon','authenticated')
 and (TG_OP='DELETE' or (to_jsonb(new)-array['monitoring_state','current_status','deleted_at','media_revision','media_mutation_id','updated_at','check_started_at']) is distinct from (to_jsonb(old)-array['monitoring_state','current_status','deleted_at','media_revision','media_mutation_id','updated_at','check_started_at'])) then
 raise exception 'Pilot identity is immutable' using errcode='42501';end if;
 if TG_OP='DELETE' then return old;end if;return new;end $$;
create trigger watches_guard_v3_pilot before update or delete on public.watches for each row execute function public.guard_v3_pilot_identity();
revoke all on function public.guard_v3_pilot_identity() from public,anon,authenticated,service_role;

create function public.create_v3_pilot(p_slot integer,p_understanding jsonb,p_source jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:='b4757e02-fc75-4984-b50e-8d933ae7ec04'; ident uuid; req text; title text; def jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 req:=(array['Keep me updated on important new developments concerning Manchester City.','Tell me when GBP/EUR goes above 1.17.','Tell me when Apple announces a new Mac product.','Tell me when there are credible new reports that Metallica may announce concerts or tour dates in Europe for 2027, even before official confirmation.'])[p_slot];
 title:=(array['Manchester City important developments','GBP/EUR > 1.17','Apple Mac product announcements','Metallica Europe 2027 credible reports'])[p_slot];
 if req is null or p_understanding->'decision'->>'status' is distinct from 'READY_TO_MONITOR'
 or jsonb_typeof(p_understanding->'intent') is distinct from 'object'
 or coalesce(char_length(p_understanding->'intent'->>'canonical_text'),0)<1 then raise exception 'Invalid pilot understanding';end if;
 perform pg_advisory_xact_lock(191903,p_slot);
 select watch_id into ident from public.v3_pilot_watches where user_id=owner_id and slot=p_slot;
 if ident is not null then return ident;end if;
 ident:=gen_random_uuid();
 if p_slot=2 then
 if p_source is distinct from '{"type":"currency","provider":"ecb","url":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"}'::jsonb then raise exception 'Invalid currency source';end if;
 def:=jsonb_build_object('inputType','text','request',req,'category','finance','currencyCriteria',jsonb_build_object('base','GBP','quote','EUR','operator','gt','target','1.17'),'currencyRevision',gen_random_uuid(),'currencyLanguage','en','currencyPolicy','crossing');
 else
 if p_source->>'type'<>'feed' or (p_slot=3 and p_source->>'url'<>'https://www.apple.com/newsroom/rss-feed.rss') or (p_slot in (1,4) and p_source->>'url' not like 'https://news.google.com/rss/search?%') then raise exception 'Invalid news source';end if;
 def:=jsonb_build_object('inputType','url','request',req,'category','news','storyProfile',jsonb_build_object('concepts',jsonb_build_array(jsonb_build_object('label',title,'type','condition')),'userAddedConcepts','[]'::jsonb));
 end if;
 insert into public.watches(id,user_id,type,title,watch_definition,monitoring_source,monitoring_state,current_status,media_revision,media_mutation_id)
 values(ident,owner_id,'media_news',title,def,p_source,'monitoring','watching',1,gen_random_uuid());
 insert into public.v3_pilot_watches(watch_id,user_id,slot,engine,instruction,understanding) values(ident,owner_id,p_slot,'wa-v3-evidence-refs-pilot.v1',req,p_understanding);
 insert into public.structured_media_schedules(watch_id,interval_seconds,next_due_at) values(ident,86400,clock_timestamp());
 insert into public.media_watch_email_policies(watch_id,user_id,mode,enabled) values(ident,owner_id,'daily_digest',true);
 return ident;
end $$;

create function public.claim_v3_pilot_checks() returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; token uuid; result jsonb:='[]';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 for r in select w.id,w.user_id,p.slot,p.engine,p.instruction,p.understanding,p.baseline_at,p.prior_state,p.evaluation
 from public.v3_pilot_watches p join public.watches w on w.id=p.watch_id and w.user_id=p.user_id join public.structured_media_schedules s on s.watch_id=w.id
 where w.deleted_at is null and w.monitoring_state='monitoring' and s.next_due_at<=clock_timestamp() and (s.lease_until is null or s.lease_until<=clock_timestamp())
 order by w.id for update of w,s skip locked loop
 token:=gen_random_uuid();
 update public.structured_media_schedules set lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',lease_kind='scheduled',lease_revision=(select media_revision from public.watches where id=r.id) where watch_id=r.id;
 update public.watches set check_started_at=clock_timestamp() where id=r.id;
 result:=result||jsonb_build_array(to_jsonb(r)||jsonb_build_object('token',token));
 end loop;return result;
end $$;

create function public.finish_v3_pilot_check(p_id uuid,p_token uuid,p_result jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; s public.structured_media_schedules%rowtype;p public.v3_pilot_watches%rowtype;at_time timestamptz:=clock_timestamp(); alert boolean; evid jsonb; j jsonb; article jsonb; entries jsonb;fact text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into w from public.watches where id=p_id for update;
 select * into s from public.structured_media_schedules where watch_id=p_id for update;
 select * into p from public.v3_pilot_watches where watch_id=p_id and user_id=w.user_id for update;
 if p.watch_id is null or w.deleted_at is not null or w.monitoring_state<>'monitoring' or s.lease_token is distinct from p_token or p_token is null or s.lease_until<=at_time or s.lease_revision<>w.media_revision then return false;end if;
 evid:=p_result->'evidence';j:=nullif(p_result->'judgment','null'::jsonb);article:=nullif(p_result->'article','null'::jsonb);
 if jsonb_typeof(evid) is distinct from 'object' or jsonb_typeof(p_result->'items') is distinct from 'array' or jsonb_array_length(p_result->'items')>20 then raise exception 'Invalid completion';end if;
 alert:=p.baseline_at is not null and j->>'action'='ALERT';
 if alert and (article is null or article->>'url' !~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$') then raise exception 'Invalid alert evidence';end if;
 if p.baseline_at is null then
 select coalesce(jsonb_agg(jsonb_build_object('id',value->>'id','fact',left(concat_ws(E'\n',value->>'title',value->>'excerpt'),1600),'alerted',false)),'[]') into entries from jsonb_array_elements(p_result->'items');
 else
 select string_agg(value->>'text',E'\n') into fact from jsonb_array_elements(coalesce(j->'evidence_basis','[]')) where value->>'role' is distinct from 'PROVENANCE';
 select coalesce(jsonb_agg(value),'[]') into entries from jsonb_array_elements(p.prior_state->'entries') where value->>'id' is distinct from evid->>'id';
 entries:=entries||jsonb_build_array(jsonb_build_object('id',evid->>'id','fact',coalesce(nullif(left(fact,4000),''),left(evid->>'content',4000)),'alerted',coalesce(alert,false) or exists(select 1 from jsonb_array_elements(p.prior_state->'entries') old_entry where old_entry->>'id'=evid->>'id' and old_entry->>'alerted'='true')));
 select coalesce(jsonb_agg(value order by ord),'[]') into entries from jsonb_array_elements(entries) with ordinality t(value,ord) where ord>jsonb_array_length(entries)-48;
 end if;
 update public.v3_pilot_watches set baseline_at=coalesce(baseline_at,at_time),prior_state=jsonb_build_object('entries',entries),last_evidence=evid,last_judgment=j,evaluation=nullif(p_result->'evaluation','null'::jsonb),history=history||jsonb_build_array(jsonb_build_object('at',at_time,'evidence',evid,'judgment',j,'baseline',p.baseline_at is null)) where watch_id=p_id;
 insert into public.media_watch_snapshots(watch_id,user_id,checked_at,source_title,source_url,item_ids,items,baseline_at,initial_items)
 values(p_id,w.user_id,at_time,evid->>'source',evid->>'url',array(select value->>'id' from jsonb_array_elements(p_result->'items')),p_result->'items',at_time,p_result->'items')
 on conflict(watch_id) do update set checked_at=excluded.checked_at,source_title=excluded.source_title,source_url=excluded.source_url,item_ids=excluded.item_ids,items=excluded.items;
 update public.watches set check_started_at=null,last_checked_at=at_time,last_check_error_code=null,last_check_outcome=case when p.baseline_at is null then 'baseline' when alert then 'matching-items' else 'no-new-items' end,
 currency_evaluation=case when p.slot=2 then nullif(p_result->'evaluation','null'::jsonb)||jsonb_build_object('checkedAt',at_time) else currency_evaluation end,
 current_status=case when alert then 'updated' else 'watching' end,
 media_last_change_detected_at=case when alert then at_time else media_last_change_detected_at end,
 last_change_item_id=case when alert then case when p.slot=2 then 'currency:'||(w.watch_definition->>'currencyRevision')||':'||(evid->>'id') else evid->>'id' end else last_change_item_id end,last_change_title=case when alert then article->>'title' else last_change_title end,last_change_url=case when alert then article->>'url' else last_change_url end,last_change_summary=case when alert then article->>'summary' else last_change_summary end,last_change_published_at=case when alert then (article->>'publishedAt')::timestamptz else last_change_published_at end
 where id=p_id;
 if alert and p.slot=2 then
 insert into public.currency_watch_events(watch_id,user_id,id,detected_at,article,evaluation) values(p_id,w.user_id,'currency:'||(w.watch_definition->>'currencyRevision')||':'||(evid->>'id'),at_time,article,p_result->'evaluation') on conflict(watch_id,id) do nothing;
 end if;
 if alert then
 insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article_position,article)
 values(p_id,w.user_id,evid->>'id',w.title,0,article) on conflict(watch_id,user_id,source_article_id) do nothing;
 end if;
 update public.structured_media_schedules set lease_token=null,lease_until=null,lease_revision=null,lease_kind=null,failures=0,next_due_at=at_time+interval '24 hours' where watch_id=p_id;
 return true;
end $$;
create function public.fail_v3_pilot_check(p_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform 1 from public.watches where id=p_id for update;
 if exists(select 1 from public.v3_pilot_watches p join public.structured_media_schedules s on s.watch_id=p.watch_id where p.watch_id=p_id and s.lease_token=p_token) then
 update public.structured_media_schedules set lease_token=null,lease_until=null,lease_revision=null,lease_kind=null,failures=least(failures+1,10),next_due_at=clock_timestamp()+interval '24 hours' where watch_id=p_id;
 update public.watches set check_started_at=null,last_check_error_code='V3_PILOT_CHECK_FAILED' where id=p_id;
 end if;end $$;
revoke all on function public.create_v3_pilot(integer,jsonb,jsonb),public.claim_v3_pilot_checks(),public.finish_v3_pilot_check(uuid,uuid,jsonb),public.fail_v3_pilot_check(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_v3_pilot(integer,jsonb,jsonb),public.claim_v3_pilot_checks(),public.finish_v3_pilot_check(uuid,uuid,jsonb),public.fail_v3_pilot_check(uuid,uuid) to service_role;

-- Extend eligibility only for explicitly registered pilot rows; every other
-- definition/owner/consent branch retains its installed implementation.
do $$declare f text;begin
 select pg_get_functiondef('public.media_digest_consent(uuid,uuid)'::regprocedure) into f;
 execute replace(f,'FUNCTION public.media_digest_consent(','FUNCTION public.media_digest_consent_pre_v3_pilot(');
end $$;
revoke all on function public.media_digest_consent_pre_v3_pilot(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.media_digest_consent(p_watch uuid,p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.v3_pilot_watches where watch_id=p_watch and user_id=p_owner) then exists(select 1 from public.watches w join public.media_watch_email_policies p on p.watch_id=w.id and p.user_id=w.user_id where w.id=p_watch and w.user_id=p_owner and w.deleted_at is null and w.monitoring_state='monitoring' and p.enabled and p.mode<>'off') else public.media_digest_consent_pre_v3_pilot(p_watch,p_owner) end
$$;
revoke all on function public.media_digest_consent(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.media_digest_consent(uuid,uuid) to service_role;
do $$declare name text; f text; old text; new text;
begin
 foreach name in array array['prepare_production_structured_digests','claim_production_structured_digest'] loop
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=name;
 if f is null then raise exception 'Production digest prerequisite missing';end if;
 foreach old in array array['target.watch_definition->>''definitionVersion''=''watch-definition.v1''','candidate_watch.watch_definition->>''definitionVersion''=''watch-definition.v1'''] loop
 new:='('||old||' or exists(select 1 from public.v3_pilot_watches vp where vp.watch_id='||case when old like 'target.%' then 'target' else 'candidate_watch' end||'.id and vp.user_id='||case when old like 'target.%' then 'target' else 'candidate_watch' end||'.user_id))';
 f:=replace(f,old,new);
 end loop;
 execute f;
 end loop;
end $$;
-- Existing claim's boolean discriminator must recognize only registered pilots.
do $$declare f text;old text:='(w.watch_definition ? ''definitionVersion'')';begin
 select pg_get_functiondef('public.claim_media_watch_digest(uuid,uuid,uuid[],boolean)'::regprocedure) into f;
 if position(old in f)=0 then raise exception 'Unexpected digest discriminator';end if;
 f:=replace(f,old,'((w.watch_definition ? ''definitionVersion'') or exists(select 1 from public.v3_pilot_watches vp where vp.watch_id=w.id and vp.user_id=w.user_id))');
 execute f;
end $$;
end $pilot_install$;
notify pgrst,'reload schema';
commit;
