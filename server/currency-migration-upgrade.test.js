import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildReleaseSQL, migrationBody, stateHashSQL, migrationVersion } from '../scripts/prepare-currency-migration.mjs';

test('currency release upgrades existing data atomically, retains old RPCs and rejects reapplication', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(directory)).sort().filter(file => file < migrationVersion)) {
      await db.exec((await readFile(new URL(file, directory), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
    }
    const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const source = JSON.stringify({type:'feed',url:'https://news.example/rss'});
    const definition = JSON.stringify({inputType:'text',request:'Elon Musk news',category:'news',mediaMention:{subjects:['Elon Musk'],matchMode:'all'}});
    await db.query('insert into auth.users values($1,$2)', [user,'fixture@example.test']);
    await db.query("insert into public.watches(user_id,title,siren) values($1,'Company fixture','123456789')",[user]);
    const persist = async (revision, title) => db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
      return tx.query("select public.persist_media_watch($1,$2,$3,$4,'monitoring',$5,gen_random_uuid(),false)",[id,title,source,definition,revision]);
    });
    await persist(0,'Feed fixture'); // Compile/use the old function before the migration.
    const rows = async () => (await db.query("select to_jsonb(w)-'currency_evaluation' as data from public.watches w order by id")).rows;
    const before = await rows();
    const policies = await db.query("select * from pg_policies where schemaname='public' order by tablename,policyname");
    const hash = async () => (await db.query(stateHashSQL)).rows[0].hash;
    const beforeHash = await hash();
    await db.exec('begin;' + migrationBody);
    const afterHash = await hash();
    await db.exec('rollback');
    const serverMajor = Number((await db.query("select current_setting('server_version_num')::int / 10000 as major")).rows[0].major);
    const releaseSQL = buildReleaseSQL({ before: beforeHash, after: afterHash, serverMajor });
    for (const mutation of [
      'create schema supabase_migrations;',
      'alter table public.watches add column currency_evaluation jsonb;',
      'drop function public.valid_media_definition(jsonb,jsonb) cascade;',
      'alter table public.watches disable row level security;',
      'grant select on public.media_watch_notifications to anon;',
      'alter table public.watches alter column media_revision drop default;',
    ]) {
      await db.exec('begin;' + mutation);
      await assert.rejects(db.exec(releaseSQL), /stop/i);
      await db.exec('rollback');
      assert.equal(await hash(), beforeHash);
    }
    // Simulate a failure after all DDL, before commit. Everything must roll back.
    await assert.rejects(db.exec(releaseSQL.replace("notify pgrst, 'reload schema';", "select 1/0; notify pgrst, 'reload schema';")));
    await db.exec('rollback');
    assert.equal((await db.query("select to_regprocedure('public.valid_feed_definition(jsonb,jsonb)') as fn")).rows[0].fn,null);
    assert.deepEqual(await rows(),before);
    await db.exec(releaseSQL);
    assert.deepEqual(await rows(),before);
    assert.deepEqual(await db.query("select * from pg_policies where schemaname='public' order by tablename,policyname"),policies);
    assert.equal((await db.query('select count(*)::int as n from public.watches where currency_evaluation is not null')).rows[0].n,0);
    await persist(1,'Old app edit after migration');
    await assert.rejects(persist(1,'Stale old app'), {code:'PT409'});
    const signature = 'public.complete_currency_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint,jsonb)';
    for (const role of ['anon','authenticated','service_role']) {
      const result = await db.query("select has_function_privilege($1,$2,'execute') as allowed",[role,signature]);
      assert.equal(result.rows[0].allowed,role==='service_role');
    }
    const after = await rows();
    await assert.rejects(db.exec(releaseSQL), /Already applied/);
    await db.exec('rollback');
    assert.deepEqual(await rows(),after);
    assert.equal((await db.query("select to_regnamespace('supabase_migrations') as namespace")).rows[0].namespace,null);
    assert.equal(await hash(),afterHash);
    await db.exec(await readFile(new URL('../supabase/tests/currency-release-readonly.sql',import.meta.url),'utf8'));
  } finally { await db.close(); }
});
