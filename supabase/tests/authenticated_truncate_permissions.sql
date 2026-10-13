-- Run only in an approved disposable database after the revocation migration.
-- No TRUNCATE statement targets copied application tables. All fixtures roll back.
begin;
do $$
declare protected regclass; permission text;
begin
  foreach protected in array array['public.watches'::regclass,
    'public.profiles'::regclass,'public.company_watch_snapshots'::regclass]
  loop
    if has_table_privilege('authenticated',protected,'TRUNCATE')
      or has_table_privilege('anon',protected,'TRUNCATE') then
      raise exception 'TRUNCATE regression on %',protected;
    end if;
    foreach permission in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if not has_table_privilege('authenticated',protected,permission) then
        raise exception 'Lost % permission on %',permission,protected;
      end if;
    end loop;
  end loop;
end $$;

create schema wa_truncate_permission_fixture;
grant usage on schema wa_truncate_permission_fixture to authenticated;
create table wa_truncate_permission_fixture.rows(id integer primary key);
grant select,insert,update,delete on wa_truncate_permission_fixture.rows to authenticated;
set local role authenticated;
insert into wa_truncate_permission_fixture.rows values(1);
update wa_truncate_permission_fixture.rows set id=2 where id=1;
do $$
begin
  if (select count(*) from wa_truncate_permission_fixture.rows)<>1 then
    raise exception 'Synthetic CRUD regression';
  end if;
  begin
    truncate wa_truncate_permission_fixture.rows;
    raise exception 'TRUNCATE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
delete from wa_truncate_permission_fixture.rows where id=2;
reset role;
rollback;
