begin;
-- Existing owner-bound policy RPCs remain unchanged for every non-pilot row.
-- Registered pilot currency rows reuse the same policy/consent controls.
do $$declare name text; f text; old text:='w.monitoring_source->>''type''=''currency''';begin
 if to_regclass('public.v3_pilot_watches') is null then return;end if;
 foreach name in array array['get_media_watch_email_policy','set_media_watch_email_policy'] loop
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=name;
 if position(old in f)=0 then raise exception 'Unexpected policy compatibility contract';end if;
 execute replace(f,old,'('||old||' and not exists(select 1 from public.v3_pilot_watches vp where vp.watch_id=w.id and vp.user_id=w.user_id))');
 end loop;
 -- Keep failed attempts countable without storing provider errors or scratch work.
 select pg_get_functiondef('public.fail_v3_pilot_check(uuid,uuid)'::regprocedure) into f;
 if position('update public.structured_media_schedules set lease_token=null' in f)=0 then raise exception 'Unexpected pilot failure contract';end if;
 execute replace(f,'update public.structured_media_schedules set lease_token=null',
 'update public.v3_pilot_watches set history=history||jsonb_build_array(jsonb_build_object(''at'',clock_timestamp(),''status'',''failed'',''error'',''V3_PILOT_CHECK_FAILED'')) where watch_id=p_id; update public.structured_media_schedules set lease_token=null');
end $$;
notify pgrst,'reload schema';
commit;
