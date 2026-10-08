begin;
-- Optional origin timestamp for an explicitly reviewed local feed recovery.
-- Wrap only the feed validator; installed currency/PR #52 functions stay intact.
alter function public.valid_feed_definition(jsonb,jsonb) rename to valid_feed_definition_before_local_recovery;
create function public.valid_feed_definition(source jsonb, definition jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
 if definition ? 'localCreatedAt' then
  if jsonb_typeof(definition->'localCreatedAt') is distinct from 'string'
    or (definition->>'localCreatedAt') !~ '^\d{4}-\d{2}-\d{2}T' then return false; end if;
  perform (definition->>'localCreatedAt')::timestamptz;
 end if;
 return public.valid_feed_definition_before_local_recovery(source,definition-'localCreatedAt')
   and octet_length(definition::text)<=8000;
exception when others then return false;
end $$;
revoke all on function public.valid_feed_definition(jsonb,jsonb) from public,anon;
grant execute on function public.valid_feed_definition(jsonb,jsonb) to authenticated,service_role;

create function public.preserve_local_media_creation() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.type='media_news' and new.monitoring_source->>'type'='feed' then
  if TG_OP='UPDATE' then
   if new.watch_definition->'localCreatedAt' is distinct from old.watch_definition->'localCreatedAt' then
    raise exception 'Local creation metadata is immutable' using errcode='22023';
   end if;
  elsif new.watch_definition ? 'localCreatedAt' then
   new.created_at := (new.watch_definition->>'localCreatedAt')::timestamptz;
   if new.created_at > now() or new.created_at < '1970-01-01T00:00:00Z'::timestamptz then
    raise exception 'Invalid local creation date' using errcode='22023';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.preserve_local_media_creation() from public,anon,authenticated;
create trigger watches_preserve_local_media_creation before insert or update on public.watches
for each row execute function public.preserve_local_media_creation();
commit;
