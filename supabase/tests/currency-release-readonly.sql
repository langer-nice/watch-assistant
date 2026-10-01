-- Run before AND after in the explicitly verified project. No Watch content or secrets.
begin read only;
set local statement_timeout = '15s';
set local timezone = 'UTC';
select to_regnamespace('supabase_migrations') as migration_namespace,
 to_regclass('supabase_migrations.schema_migrations') as migration_registry;
-- This SQL Editor deployment has no CLI history. Use the generated --preflight
-- or --verify SQL to assert the full reviewed schema, not a historical claim.
select column_name,data_type,is_nullable,column_default from information_schema.columns
 where table_schema='public' and table_name='watches' and column_name='currency_evaluation';
select p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig,p.proacl,
 md5(pg_get_functiondef(p.oid)) as definition_md5
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('valid_media_definition','valid_feed_definition',
 'invalidate_currency_evaluation','complete_currency_watch_check','fail_scheduled_media_watch_check','persist_media_watch')
 order by signature;
select conname,convalidated,pg_get_constraintdef(oid) as definition from pg_constraint
 where conrelid='public.watches'::regclass and conname='watches_media_definition_check';
select tgname,tgenabled,pg_get_triggerdef(oid) as definition from pg_trigger
 where tgrelid='public.watches'::regclass and not tgisinternal order by tgname;
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' order by c.relname;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select grantee,privilege_type from information_schema.column_privileges
 where table_schema='public' and table_name='watches' and column_name='currency_evaluation' order by grantee,privilege_type;
-- Row fingerprints deliberately exclude the newly added nullable column.
select type,count(*) as rows,md5(coalesce(string_agg((to_jsonb(w)-'currency_evaluation')::text,'' order by id),'')) as fingerprint
 from public.watches w group by type order by type;
select status,count(*) from public.media_watch_notifications group by status order by status;
select pg_size_pretty(pg_total_relation_size('public.watches')) as watches_size;
select pid,state,now()-xact_start as transaction_age,pg_blocking_pids(pid) as blockers
 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and (xact_start is not null or cardinality(pg_blocking_pids(pid))>0);
commit;
