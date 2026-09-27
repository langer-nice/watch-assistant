-- Business conflicts must not trigger PostgREST 14 serialization retries.
-- No Watch rows, state, grants or outbox entries are changed.
begin;
create or replace function public.persist_media_watch(
 p_id uuid, p_title text, p_source jsonb, p_definition jsonb, p_state text,
 p_revision bigint, p_mutation uuid, p_deleted boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target public.watches%rowtype;
begin
 if auth.uid() is null or p_mutation is null or p_revision is null or p_revision < 0 or p_deleted is null
   or p_state is null or p_state not in ('monitoring','paused')
   or not public.valid_media_definition(p_source,p_definition) then
  raise exception 'Invalid media persistence request' using errcode='22023';
 end if;
 -- No upsert: a retry must never replace a newer definition or resurrect a tombstone.
 if p_revision = 0 then
  insert into public.watches(id,user_id,type,title,monitoring_source,watch_definition,monitoring_state,current_status,media_revision,media_mutation_id,deleted_at)
   values(p_id,auth.uid(),'media_news',p_title,p_source,p_definition,p_state,
     case when p_state='paused' then 'paused' else 'watching' end,1,p_mutation,
     case when p_deleted then now() else null end)
   on conflict(id) do nothing;
 end if;
 select * into target from public.watches where id=p_id and user_id=auth.uid() and type='media_news' for update;
 if target.id is null then raise exception 'Media conflict' using errcode='PT409'; end if;
 if target.media_mutation_id = p_mutation then return to_jsonb(target); end if;
 if target.media_revision <> p_revision or target.deleted_at is not null then
  raise exception 'Media conflict' using errcode='PT409';
 end if;
 update public.watches set title=p_title,monitoring_source=p_source,watch_definition=p_definition,
   monitoring_state=p_state,current_status=case when p_state='paused' then 'paused' else 'watching' end,
   media_mutation_id=p_mutation,deleted_at=case when p_deleted then now() else null end
  where id=p_id and user_id=auth.uid() and type='media_news' returning * into target;
 return to_jsonb(target);
end $$;
revoke all on function public.persist_media_watch(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean) from public,anon;
grant execute on function public.persist_media_watch(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean) to authenticated;


commit;
