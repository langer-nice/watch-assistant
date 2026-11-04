-- Presentation only. Preserve the existing atomic creation transaction, source
-- concepts, Intent, ownership, grants, RLS and historical rows.
do $migration$
declare
 f text:=pg_get_functiondef('public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
 anchor text:=' insert into public.watches(id,user_id,type,title,watch_definition,monitoring_source,monitoring_state,current_status,media_revision,media_mutation_id,last_checked_at,last_check_outcome,currency_evaluation)';
 addition text:=$body$
 if p_kind='URL' and jsonb_typeof(p_understanding->'story_seed')='object' and p_understanding ? 'display_title' then
  if jsonb_typeof(p_understanding->'display_title') is distinct from 'string'
   or char_length(btrim(p_understanding->>'display_title')) not between 1 and 160
  then raise exception 'Invalid article display title';end if;
  title:=btrim(p_understanding->>'display_title');
 end if;
$body$;
begin
 if position(addition in f)>0 then return;end if;
 if position(anchor in f)=0 or position('title:=left(p_understanding->''intent''->>''canonical_text'',200);' in f)=0 then
  raise exception 'Unexpected V3 title creation contract';
 end if;
 execute replace(f,anchor,addition||anchor);
end;
$migration$;
