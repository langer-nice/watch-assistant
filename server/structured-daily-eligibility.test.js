import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const migration='20261024110000_structured_daily_morning_eligibility.sql';
test('daily Structured checks join the next Paris morning batch without changing backoff, leases or notifications',async t=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).sort().filter(f=>f.endsWith('.sql')&&f<migration))await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  // Isolated fixture clock only; deployed SQL continues to use clock_timestamp().
  await db.exec(`create function public.fixture_clock() returns timestamptz language sql volatile as $$select current_setting('fixture.clock')::timestamptz$$;`);
  const clock=at=>db.query("select set_config('fixture.clock',$1,false)",[at]);
  for(const name of ['set_structured_media_monitoring','claim_structured_media_checks','finish_structured_media_check']){
   const f=(await db.query('select pg_get_functiondef(oid) body from pg_proc where pronamespace=\'public\'::regnamespace and proname=$1',[name])).rows[0].body;
   await db.exec(f.replaceAll('clock_timestamp()','public.fixture_clock()'));
  }
  await db.query("insert into auth.users values($1,'offline@example.test')",[owner]);
  const svc=(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.query("select set_config('request.jwt.claim.role','service_role',true)");return tx.query(sql,args);});
  const definition=definitions().find(d=>d.plan.domain==='media_news'),source=structuredMonitoringSource(definition.plan.criteria);
  let serial=0;
  const create=async at=>{
   await clock(at);const id=`cccccccc-cccc-4ccc-8ccc-${String(++serial).padStart(12,'0')}`;
   await svc("select public.persist_structured_watch_v1($1,$2,'create',$3,0,'Offline fixture',$4,$5,$6,$7)",[owner,id,id,source,definition,fingerprint(definition),fingerprint({definition,source,title:'Offline fixture'})]);
   await svc('select public.set_structured_media_monitoring($1,$2,1,true,86400)',[id,owner]);return id;
  };
  const claim=async(owners=[owner])=>(await svc('select public.claim_structured_media_checks($1,10) rows',[owners])).rows[0].rows;
  const finish=async(lease,at,error=null)=>{
   await clock(at);const prior=(await db.query('select checked_at,items from public.media_watch_snapshots where watch_id=$1',[lease.id])).rows[0];
   const r=(await svc("select public.finish_structured_media_check($1,$2,$3,$4,$5,'Offline','https://example.test', '[]'::jsonb,$6,$7,'[]'::jsonb,$8) r",[lease.id,owner,lease.media_revision,lease.lease_token,at,prior?.checked_at||null,prior?.items||null,error])).rows[0].r;return r;
  };
  const before=await create('2026-10-23T05:00:00Z');assert.equal((await finish((await claim())[0],'2026-10-23T05:00:01Z')).status,'completed');
  const evening=await create('2026-10-23T17:22:33Z');assert.equal((await finish((await claim())[0],'2026-10-23T17:22:34Z')).status,'completed');
  await clock('2026-10-24T06:00:00Z');
  await t.test('old rule proves the evening baseline misses Day 2 morning',async()=>{
   const leases=await claim();assert.deepEqual(leases.map(w=>w.id),[before]);await db.query('update public.structured_media_schedules set lease_token=null,lease_until=null,lease_revision=null,lease_kind=null');
  });
  const rowsBefore=(await db.query('select jsonb_agg(to_jsonb(w) order by id) rows from public.watches w')).rows[0].rows;
  const oid=(await db.query("select 'public.claim_structured_media_checks(uuid[],integer)'::regprocedure::oid oid")).rows[0].oid;
  await db.exec((await readFile(new URL(migration,dir),'utf8')).replaceAll('clock_timestamp()','public.fixture_clock()'));
  assert.equal((await db.query("select 'public.claim_structured_media_checks(uuid[],integer)'::regprocedure::oid oid")).rows[0].oid,oid);
  assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(w) order by id) rows from public.watches w')).rows[0].rows,rowsBefore);
  await t.test('before- and after-morning baselines are eligible at Day 2 morning',async()=>{
   const leases=await claim();assert.deepEqual(new Set(leases.map(w=>w.id)),new Set([before,evening]));assert.deepEqual(await claim(),[]);
   for(const lease of leases)assert.equal((await finish(lease,'2026-10-24T06:00:30Z')).status,'completed');
  });
  await t.test('same-day 08:15 retry cannot duplicate a successful 08:00 daily check',async()=>{
   await clock('2026-10-24T06:15:00Z');assert.deepEqual(await claim(),[]);
  });
  await t.test('Paris calendar rule handles the autumn and spring clock changes',async()=>{
   for(const [at,completion]of [['2026-10-25T07:00:00Z','2026-10-25T07:00:30Z'],['2027-03-28T06:00:00Z','2027-03-28T06:00:30Z']]){
    await clock(at);const leases=await claim();assert.equal(leases.length,2);for(const lease of leases)await finish(lease,completion);
    await clock(completion);assert.deepEqual(await claim(),[]);
   }
  });
  await t.test('paused, deleted, wrong-owner, retry-backoff and other intervals remain excluded',async()=>{
   await clock('2027-03-29T06:00:00Z');
   await db.query("update public.structured_media_schedules set failures=1,next_due_at='2027-03-29T06:05Z' where watch_id=$1",[before]);
   await db.query("update public.structured_media_schedules set interval_seconds=604800,next_due_at='2027-04-02T06:00Z' where watch_id=$1",[evening]);
   assert.deepEqual(await claim(),[]);assert.deepEqual(await claim([other]),[]);
   await clock('2027-03-29T06:05:01Z');const [retry]=await claim();assert.equal(retry.id,before);await finish(retry,'2027-03-29T06:05:30Z','TIMEOUT');
   assert.deepEqual(await claim(),[]);
   const paused=await create('2027-03-28T17:00Z');await svc('select public.set_structured_media_monitoring($1,$2,2,false)',[paused,owner]);
   const deleted=await create('2027-03-28T17:01Z');await db.exec("select set_config('watch_assistant.structured_rpc','persist.v1',false)");await db.query('update public.watches set deleted_at=now() where id=$1',[deleted]);
   await clock('2027-03-29T06:00Z');assert.deepEqual(await claim(),[]);
  });
  await t.test('service-only access and no notification/digest side effects are preserved',async()=>{
   for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.claim_structured_media_checks(uuid[],integer)','EXECUTE') allowed",[role])).rows[0].allowed,false);
   assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.media_watch_digests')).rows[0].n,0);
  });
 }finally{await db.close();}
});
