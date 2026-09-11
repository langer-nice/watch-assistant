-- Run after applying all migrations with:
-- psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/company_watch_rls.sql
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('10000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'company-a@example.test', '', now()),
  ('10000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'company-b@example.test', '', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-00000000000a', true);

insert into public.watches (id, user_id, type, title, siren, company_name)
values (
  '20000000-0000-4000-8000-00000000000a',
  '10000000-0000-4000-8000-00000000000a',
  'company_bodacc', 'Company A', '111111111', 'Company A'
);
insert into public.company_watch_snapshots (
  watch_id, user_id, checked_at, source_title, source_url, item_ids, items
) values (
  '20000000-0000-4000-8000-00000000000a',
  '10000000-0000-4000-8000-00000000000a',
  now(), 'BODACC', 'https://www.bodacc.fr', array['a-1'], '[{"id":"a-1"}]'::jsonb
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-00000000000b', true);

insert into public.watches (id, user_id, type, title, siren, company_name)
values (
  '20000000-0000-4000-8000-00000000000b',
  '10000000-0000-4000-8000-00000000000b',
  'company_bodacc', 'Company B', '222222222', 'Company B'
);
insert into public.company_watch_snapshots (
  watch_id, user_id, checked_at, source_title, source_url, item_ids, items
) values (
  '20000000-0000-4000-8000-00000000000b',
  '10000000-0000-4000-8000-00000000000b',
  now(), 'BODACC', 'https://www.bodacc.fr', array['b-1'], '[{"id":"b-1"}]'::jsonb
);

do $$
begin
  if (select count(*) from public.watches where type = 'company_bodacc') <> 1 then
    raise exception 'Company RLS failed: user B can read user A Watch';
  end if;
  if (select count(*) from public.company_watch_snapshots) <> 1 then
    raise exception 'Company RLS failed: user B can read user A snapshot';
  end if;

  update public.watches set title = 'Company B updated', category = 'finance'
  where id = '20000000-0000-4000-8000-00000000000b';
  if not found then
    raise exception 'Company RLS failed: user B cannot update own Watch';
  end if;
  if (select category from public.watches
      where id = '20000000-0000-4000-8000-00000000000b') <> 'finance' then
    raise exception 'Company category persistence failed for the owning user';
  end if;

  update public.watches set title = 'Cross-user update', category = 'news'
  where id = '20000000-0000-4000-8000-00000000000a';
  if found then
    raise exception 'Company RLS failed: user B modified user A Watch';
  end if;

  if public.claim_company_watch_check('20000000-0000-4000-8000-00000000000a') then
    raise exception 'Company RLS failed: user B claimed user A check';
  end if;
end;
$$;

do $$
begin
  begin
    update public.watches set category = 'Finance'
    where id = '20000000-0000-4000-8000-00000000000b';
    raise exception 'Company category constraint accepted a localized label';
  exception when check_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.company_watch_snapshots (
      watch_id, user_id, checked_at, source_title, source_url, item_ids, items
    ) values (
      '20000000-0000-4000-8000-00000000000a',
      '10000000-0000-4000-8000-00000000000b',
      now(), 'BODACC', 'https://www.bodacc.fr', '{}', '[]'::jsonb
    );
    raise exception 'Company RLS failed: user B attached a snapshot to user A Watch';
  exception
    when insufficient_privilege or check_violation or unique_violation then null;
  end;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.company_watch_notifications (
  id, watch_id, user_id, source_event_id, company_name, event
) values (
  '30000000-0000-4000-8000-00000000000a',
  '20000000-0000-4000-8000-00000000000a',
  '10000000-0000-4000-8000-00000000000a',
  'event-a', 'Company A', '{"title":"Official event","source":"BODACC"}'::jsonb
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-00000000000b', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    perform 1 from public.company_watch_notifications limit 1;
    raise exception 'Notification RLS failed: browser role can read the outbox';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.company_watch_notifications (
      watch_id, user_id, source_event_id, company_name, event
    ) values (
      '20000000-0000-4000-8000-00000000000b',
      '10000000-0000-4000-8000-00000000000b',
      'forged-event', 'Company B', '{"title":"Forged"}'::jsonb
    );
    raise exception 'Notification RLS failed: browser role can create email jobs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_company_watch_email_notification(
      '30000000-0000-4000-8000-00000000000a',
      '40000000-0000-4000-8000-00000000000a'
    );
    raise exception 'Notification RLS failed: browser role can claim email jobs';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  begin
    perform 1 from public.watches limit 1;
    raise exception 'Company RLS failed: anonymous role can read Watches';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.company_watch_snapshots limit 1;
    raise exception 'Company RLS failed: anonymous role can read snapshots';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
