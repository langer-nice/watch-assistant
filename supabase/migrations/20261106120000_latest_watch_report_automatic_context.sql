begin;

do $migration$
begin
  if to_regprocedure('public.latest_watch_report()') is null then return; end if;
  -- Preserve the existing response fields and ACL. Attach the independent
  -- automatic snapshot when the newest report is manual.
  execute $definition$
    create or replace function public.latest_watch_report() returns jsonb
    language plpgsql security definer set search_path='' as $function$
    declare owner_id uuid := auth.uid(); latest jsonb; latest_kind text; automatic jsonb;
    begin
      if auth.role() is distinct from 'authenticated' or owner_id is null then
        raise exception 'Authenticated owner required' using errcode='42501';
      end if;
      select report, kind into latest, latest_kind from public.watch_reports
        where user_id=owner_id order by completed_at desc,created_at desc limit 1;
      if latest_kind is distinct from 'manual' then return latest; end if;
      select report into automatic from public.watch_reports
        where user_id=owner_id and kind='automatic' order by completed_at desc,created_at desc limit 1;
      return case when automatic is null then latest
        else latest || jsonb_build_object('automaticReport',automatic) end;
    end $function$;
  $definition$;
end $migration$;

commit;
