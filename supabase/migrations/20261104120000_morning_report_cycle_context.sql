begin;
-- Existing report RPCs only. No tables, grants, RLS, schedule writes or changes
-- to save_watch_report's owner/revision locks and immutable daily persistence.
do $report$
declare signature text; installed text; marker text; from_index integer; to_index integer;
begin
 foreach signature in array array['public.morning_report_context(timestamptz)','public.morning_report_context(uuid,timestamptz)'] loop
  if to_regprocedure(signature) is null then continue; end if;
  select pg_get_functiondef(to_regprocedure(signature)) into installed;
  if position('''_morning_schedule''' in installed)>0 then continue; end if;
  marker:='''company_watch_snapshots'',(select to_jsonb(c) from public.company_watch_snapshots c where c.watch_id=w.id)';
  if position(marker in installed)=0 then raise exception 'Unexpected report row context'; end if;
  installed:=replace(installed,marker,marker||',
 ''_morning_schedule'',(select jsonb_build_object(''next_due_at'',s.next_due_at,''interval_seconds'',s.interval_seconds,''failures'',s.failures)
 from public.structured_media_schedules s where s.watch_id=w.id)');
  from_index:=position(' select count(*) into pending_count' in installed);
  to_index:=position(' return jsonb_build_object' in installed);
  if from_index=0 or to_index<=from_index then raise exception 'Unexpected report pending context'; end if;
  -- Await actual in-flight work only. Failed/missed cycles produce a usable
  -- partial owner report instead of blocking every successful Watch.
  installed:=substring(installed from 1 for from_index-1)||' select count(*) into pending_count from public.watches w
 join public.structured_media_schedules s on s.watch_id=w.id
 where w.user_id=owner_id and w.deleted_at is null and w.monitoring_state=''monitoring''
 and s.lease_until>clock_timestamp();
'||substring(installed from to_index);
  execute installed;
 end loop;
end $report$;
commit;
