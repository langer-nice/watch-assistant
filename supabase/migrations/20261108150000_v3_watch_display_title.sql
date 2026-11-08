begin;
-- Reconnect the existing presentation field for all new V3 news Watches.
-- No historical UPDATE, RPC signature, source concept, Intent or ACL change.
do $migration$
declare
 f text:=pg_get_functiondef('public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
 old_guard text:='if p_kind=''URL'' and jsonb_typeof(p_understanding->''story_seed'')=''object'' and p_understanding ? ''display_title'' then';
 new_guard text:='if p_source->>''type''=''feed'' and p_understanding ? ''display_title'' then';
begin
 if position(new_guard in f)>0 then return;end if;
 if position(old_guard in f)=0 then raise exception 'Unexpected V3 display title contract';end if;
 -- The assignment stays immediately before INSERT, after detailed concepts
 -- were constructed, so presentation cannot replace monitoring criteria.
 execute replace(f,old_guard,new_guard);
end;
$migration$;
commit;
