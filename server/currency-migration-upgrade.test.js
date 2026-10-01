import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { releaseSQL, migrationVersion } from '../scripts/prepare-currency-migration.mjs';

test('currency release upgrades existing data atomically, retains old RPCs and rejects reapplication', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(directory)).sort().filter(file => file < migrationVersion)) {
      await db.exec((await readFile(new URL(file, directory), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
      await db.query('insert into supabase_migrations.schema_migrations(version,name) values ($1,$2)', [file.split('_')[0], file]);
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
    // Simulate a failure after all DDL, before registration/commit. Everything must roll back.
    await assert.rejects(db.exec(releaseSQL.replace('insert into supabase_migrations.schema_migrations(version,name,statements)', 'select 1/0; insert into supabase_migrations.schema_migrations(version,name,statements)')));
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
    await assert.rejects(db.exec(releaseSQL), /already registered/);
    await db.exec('rollback');
    assert.deepEqual(await rows(),after);
    assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations where version=$1',[migrationVersion])).rows[0].n,1);
    await db.exec(await readFile(new URL('../supabase/tests/currency-release-readonly.sql',import.meta.url),'utf8'));
  } finally { await db.close(); }
});
