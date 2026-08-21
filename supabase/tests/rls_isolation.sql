-- Run after `supabase db reset` with:
-- psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'user-a@example.test', '', now()),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'user-b@example.test', '', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

insert into public.watches (user_id, title, siren)
values ('00000000-0000-4000-8000-00000000000a', 'User A Watch', '111111111');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);

insert into public.watches (user_id, title, siren)
values ('00000000-0000-4000-8000-00000000000b', 'User B Watch', '222222222');

do $$
begin
  if (select count(*) from public.watches) <> 1 then
    raise exception 'RLS isolation failed: user B can read another user row';
  end if;

  update public.watches set title = 'Cross-user update'
  where user_id = '00000000-0000-4000-8000-00000000000a';
  if found then
    raise exception 'RLS isolation failed: user B modified user A row';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.watches (user_id, title, siren)
    values ('00000000-0000-4000-8000-00000000000a', 'Forged owner', '333333333');
    raise exception 'RLS isolation failed: user B inserted a row for user A';
  exception
    when insufficient_privilege or check_violation then null;
  end;
end;
$$;

rollback;
