import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Preparation only: emits SQL; never opens a database connection.
export const migrationVersion = '20261001120000';
export const migrationName = 'currency_threshold_watches';
export const migration = readFileSync(new URL(`../supabase/migrations/${migrationVersion}_${migrationName}.sql`, import.meta.url), 'utf8');
export const migrationSha256 = createHash('sha256').update(migration).digest('hex');
const body = migration.replace(/^begin;\s*/, '').replace(/\s*commit;\s*$/, '');
export const releaseSQL = `-- Source migration SHA-256: ${migrationSha256}
-- Execute only after explicit production authorization and runbook preflight.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
do $guard$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260925130000') then
   raise exception 'Missing prerequisite migration: stop';
 end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version >= '${migrationVersion}') then
   raise exception 'Migration already registered or later schema present: stop and verify';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='watches' and column_name='currency_evaluation')
   or to_regprocedure('public.valid_feed_definition(jsonb,jsonb)') is not null
   or to_regprocedure('public.invalidate_currency_evaluation()') is not null then
   raise exception 'Unexpected currency schema: stop and reconcile';
 end if;
 if md5(pg_get_functiondef('public.persist_media_watch(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean)'::regprocedure)) <> 'c9dfbd9127b543e5bd33ce2764eacc1a' then
   raise exception 'Unexpected persistence function: stop';
 end if;
end $guard$;
${body}
insert into supabase_migrations.schema_migrations(version,name,statements)
values('${migrationVersion}','${migrationName}',array[$currency_migration$${body}$currency_migration$]);
notify pgrst, 'reload schema';
commit;
`;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(releaseSQL);
