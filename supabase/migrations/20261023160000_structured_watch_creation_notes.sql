begin;
-- Optional non-monitoring note, stored inside the existing signed definition.
-- Keep the original validator OID so existing CHECKs and RPCs use this contract.
do $copy$
begin
 execute replace(pg_get_functiondef('public.valid_structured_watch_definition(jsonb,jsonb)'::regprocedure),
  'FUNCTION public.valid_structured_watch_definition(',
  'FUNCTION public.valid_structured_watch_definition_before_note(');
end $copy$;
revoke all on function public.valid_structured_watch_definition_before_note(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.valid_structured_watch_definition(source jsonb, definition jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
begin
 if octet_length(definition::text)>32768
 or (definition ? 'whyFollowing' and jsonb_typeof(definition->'whyFollowing') is distinct from 'string') then return false;end if;
 return coalesce(public.valid_structured_watch_definition_before_note(source,definition-'whyFollowing'),false);
end $$;
revoke all on function public.valid_structured_watch_definition(jsonb,jsonb) from public,anon;
grant execute on function public.valid_structured_watch_definition(jsonb,jsonb) to authenticated,service_role;
-- No row updates, new tables, consent changes, monitoring or scheduler changes.
notify pgrst,'reload schema';
commit;
