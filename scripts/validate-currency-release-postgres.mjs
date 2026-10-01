// Opt-in integration test against the isolated restored production database.
// No remote host, credentials, HTTP integrations, or production changes are allowed.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { releaseSQL, stateHashSQL, buildCheckSQL, manifest } from './prepare-currency-migration.mjs';

const socket = process.env.WATCH_RESTORE_SOCKET;
if (!socket?.startsWith('/')) throw new Error('WATCH_RESTORE_SOCKET must be a private local Unix socket directory');
const psql = process.env.PSQL_PATH || 'psql';
const name = `currency_release_test_${Date.now()}`;
const env = { ...process.env, PGHOST: socket, PGPORT: '55447', PGUSER: 'backup_verifier', PGDATABASE: 'postgres', PGSSLMODE: 'disable' };
delete env.PGPASSWORD; delete env.PGSERVICE; delete env.PGOPTIONS; delete env.PGHOSTADDR;
const run = (sql, { database = name, failure } = {}) => {
  try {
    const output = execFileSync(psql, ['-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1', '--dbname', database], {
      input: sql, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (failure) assert.fail('Expected release refusal');
    return output;
  } catch (error) {
    if (!failure || !error.status) throw error;
    assert.match(String(error.stderr), failure);
  }
};
assert.equal(run("select current_user='backup_verifier' and inet_server_addr() is null and current_setting('listen_addresses')='';", { database: 'postgres' }), 't');
run(`create database ${name} template postgres; alter database ${name} owner to postgres;`, { database: 'postgres' });
try {
  const hash = () => run('set search_path=public,pg_catalog;' + stateHashSQL + ';');
  assert.equal(hash(), manifest.before.md5, 'Restored database must match the audited production baseline');
  const rows = () => run("set timezone='UTC';select md5(coalesce(string_agg((to_jsonb(w)-'currency_evaluation')::text,'' order by id),'')) from public.watches w;");
  const dataQueries = run("select format('select %L, count(*), md5(coalesce(string_agg((to_jsonb(t)-%L)::text, %L order by (to_jsonb(t)-%L)::text collate \"C\"), %L)) from %I.%I t', schemaname||'.'||tablename, case when schemaname='public' and tablename='watches' then 'currency_evaluation' else '__no_excluded_column__' end, '', case when schemaname='public' and tablename='watches' then 'currency_evaluation' else '__no_excluded_column__' end, '', schemaname, tablename) from pg_tables where schemaname in ('public','auth') order by schemaname,tablename;");
  const allData = () => run("set timezone='UTC';" + dataQueries.split('\n').join(';') + ';');
  const beforeData = allData();
  const before = rows();
  const mutations = [
    'create schema supabase_migrations;',
    'alter table public.watches add column currency_evaluation jsonb;',
    'drop function public.valid_media_definition(jsonb,jsonb) cascade;',
    'alter table public.watches disable row level security;',
    'grant select on public.media_watch_notifications to anon;',
    'alter table public.watches alter column media_revision drop default;',
    "create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin return new; end $$;",
  ];
  for (const mutation of mutations) {
    run('begin;' + mutation + releaseSQL, { failure: /stop/i });
    assert.equal(hash(), manifest.before.md5);
  }
  run('set role postgres;' + releaseSQL.replace("notify pgrst, 'reload schema';", 'select 1/0;'), { failure: /division by zero/ });
  assert.equal(hash(), manifest.before.md5);
  assert.equal(rows(), before);
  assert.equal(allData(), beforeData);
  run('set role postgres;' + releaseSQL);
  run(buildCheckSQL(manifest.after.md5));
  assert.equal(rows(), before);
  assert.equal(allData(), beforeData);
  run(releaseSQL, { failure: /Already applied/ });
  assert.equal(hash(), manifest.after.md5);
  // Old deployed persistence RPC remains usable after schema-first release.
  // Fixture creation and edit run locally and roll back; no notification RPC is invoked.
  const user = randomUUID(); const watch = randomUUID();
  const source = JSON.stringify({ type: 'feed', url: 'https://example.test/rss' });
  const definition = JSON.stringify({ inputType: 'text', request: 'Fixture news', category: 'news', mediaMention: { subjects: ['Fixture'], matchMode: 'all' } });
  run(`begin;
    insert into auth.users(id,email) values('${user}','fixture@example.test');
    set local role authenticated;
    select set_config('request.jwt.claim.sub','${user}',true);
    select set_config('request.jwt.claim.role','authenticated',true);
    select public.persist_media_watch('${watch}','Fixture','${source}','${definition}','monitoring',0,gen_random_uuid(),false)->>'media_revision';
    select public.persist_media_watch('${watch}','Edited fixture','${source}','${definition}','monitoring',1,gen_random_uuid(),false)->>'media_revision';
    rollback;`);
  assert.equal(rows(), before);
  assert.equal(allData(), beforeData);
  console.log('PASS restored PostgreSQL 17: 7 incompatible prerequisites refused; failed DDL rolled back; exact migration and postflight passed; repeat refused; all public/Auth table data preserved; old RPC create/edit passed.');
} finally {
  run(`drop database ${name};`, { database: 'postgres' });
}
