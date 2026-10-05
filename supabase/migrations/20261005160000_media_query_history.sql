begin;
-- Extend only the feed validator. The currency dispatcher (including PR #52)
-- and all check/notification functions keep their installed definitions.
alter function public.valid_feed_definition(jsonb,jsonb) rename to valid_feed_definition_v1;
create function public.valid_feed_definition(source jsonb, definition jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare base jsonb := definition; entry jsonb; field text; mention jsonb := definition->'mediaMention';
begin
 if definition->>'inputType'='text' then
  foreach field in array array['topics','exclusions'] loop
   if mention ? field then
    if jsonb_typeof(mention->field) is distinct from 'array' or jsonb_array_length(mention->field) not between 1 and 8 then return false; end if;
    for entry in select value from jsonb_array_elements(mention->field) loop
     if jsonb_typeof(entry) <> 'string' or char_length(btrim(entry #>> '{}')) not between 1 and 200 then return false; end if;
    end loop;
   end if;
  end loop;
  if mention ? 'locale' then
   if jsonb_typeof(mention->'locale') is distinct from 'object' or mention->'locale'='{}'::jsonb
     or (mention->'locale') - array['language','country'] <> '{}'::jsonb
     or (mention->'locale' ? 'language' and coalesce(mention->'locale'->>'language','') not in ('en','fr'))
     or (mention->'locale' ? 'country' and coalesce(mention->'locale'->>'country','') not in ('FR','GB','US')) then return false; end if;
  end if;
  base := jsonb_set(base,'{mediaMention}',mention - array['topics','exclusions','locale']);
 end if;
 return public.valid_feed_definition_v1(source,base) and octet_length(definition::text)<=8000;
end $$;
revoke all on function public.valid_feed_definition(jsonb,jsonb) from public,anon;
grant execute on function public.valid_feed_definition(jsonb,jsonb) to authenticated,service_role;

-- Text-feed edits retain the original baseline and durable article identities.
-- New scopes can discover unseen articles; they never replay known identities.
-- Keep the installed legacy trigger function intact for currency/URL Watches.
drop trigger watches_invalidate_media_baseline on public.watches;
create trigger watches_invalidate_media_baseline before update on public.watches
for each row when (not coalesce(old.type='media_news' and new.type='media_news'
 and old.monitoring_source->>'type'='feed' and new.monitoring_source->>'type'='feed'
 and old.watch_definition->>'inputType'='text' and new.watch_definition->>'inputType'='text',false))
execute function public.invalidate_media_watch_baseline();
create function public.revise_media_query_without_rebaseline() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is distinct from old.user_id then raise exception 'Watch ownership is immutable' using errcode='42501'; end if;
 if new.watch_definition is distinct from old.watch_definition or new.monitoring_source is distinct from old.monitoring_source
  or new.monitoring_state is distinct from old.monitoring_state or new.deleted_at is distinct from old.deleted_at
  or new.title is distinct from old.title or new.media_mutation_id is distinct from old.media_mutation_id then
  new.media_revision := old.media_revision + 1;
  -- Existing cancellation semantics: already submitted/sent events stay intact.
  update public.media_watch_notifications set status='failed',last_error_code='WATCH_CHANGED'
   where watch_id=old.id and status='pending' and submission_started_at is null;
 end if;
 return new;
end $$;
revoke all on function public.revise_media_query_without_rebaseline() from public,anon,authenticated;
create trigger watches_revise_media_query before update on public.watches
for each row when (old.type='media_news' and new.type='media_news'
 and old.monitoring_source->>'type'='feed' and new.monitoring_source->>'type'='feed'
 and old.watch_definition->>'inputType'='text' and new.watch_definition->>'inputType'='text')
execute function public.revise_media_query_without_rebaseline();
notify pgrst, 'reload schema';
commit;
