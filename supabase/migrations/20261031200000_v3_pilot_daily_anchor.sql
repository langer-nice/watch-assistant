begin;
-- Setup and source fetch durations must not drift past tomorrow's existing
-- 06:00 UTC cron. Only the new pilot RPCs change; no global cadence changes.
do $$declare name text; f text;begin
 if to_regprocedure('public.finish_v3_pilot_check(uuid,uuid,jsonb)') is null then return;end if;
 foreach name in array array['finish_v3_pilot_check','fail_v3_pilot_check'] loop
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=name;
 if position('interval ''24 hours''' in f)=0 then raise exception 'Unexpected pilot cadence contract';end if;
 f:=replace(f,'at_time+interval ''24 hours''','((at_time at time zone ''UTC'')::date+1+time ''06:00'') at time zone ''UTC''');
 f:=replace(f,'clock_timestamp()+interval ''24 hours''','((clock_timestamp() at time zone ''UTC'')::date+1+time ''06:00'') at time zone ''UTC''');
 execute f;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
