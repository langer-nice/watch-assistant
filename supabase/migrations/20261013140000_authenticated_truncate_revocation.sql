-- RLS and row triggers do not restrict TRUNCATE. Preserve ordinary CRUD/RPC grants.
-- Rehearse/apply this security prerequisite before the structured migrations;
-- its new timestamp does not authorize replaying older, schema-equivalent SQL.
begin;

revoke truncate on table public.watches, public.profiles,
  public.company_watch_snapshots from authenticated;

-- Fail atomically rather than silently changing PUBLIC or inherited-role grants.
do $$
declare protected regclass;
begin
  foreach protected in array array['public.watches'::regclass,
    'public.profiles'::regclass,'public.company_watch_snapshots'::regclass]
  loop
    if has_table_privilege('authenticated',protected,'TRUNCATE')
      or has_table_privilege('anon',protected,'TRUNCATE') then
      raise exception 'Unexpected effective TRUNCATE privilege on %',protected
        using errcode='42501';
    end if;
  end loop;
end $$;

commit;
