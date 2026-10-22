import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { definitions } from './test-support/watch-definition-fixtures.js';
import { structuredMonitoringSource } from '../src/js/watch-definition.js';
import { fingerprint } from './structured-watch-authorization.js';
import { mediaArticleIdentityKeys } from './media-article-identity.js';

const directory=new URL('../supabase/migrations/',import.meta.url),migration='20261012160000_structured_media_completion.sql';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc',mutation='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
test('isolated PostgreSQL result boundary preserves structured approval and existing lifecycle',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
   grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  for(const file of (await readdir(directory)).sort().filter(f=>f.endsWith('.sql')&&f<=migration))await db.exec((await readFile(new URL(file,directory),'utf8')).replace('create extension if not exists pgcrypto;',''));
  await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,'fixture@example.test',other,'other@example.test']);
  const scoped=(role,user,sql,args=[])=>db.transaction(async tx=>{await tx.exec(`set local role ${role}`);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,user]);return args.length ? tx.query(sql,args) : tx.exec(sql);});
  const service=(sql,args=[])=>scoped('service_role','',sql,args);
  const definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
  await service('select public.persist_structured_watch_v1($1,$2,\'create\',$3,0,\'Fixture\',$4,$5,$6,$7)',[owner,id,mutation,source,definition,fingerprint(definition),fingerprint({definition,source,title:'Fixture'})]);
  const row=async()=>(await db.query('select * from public.watches where id=$1',[id])).rows[0];
  const snapshot=async()=>(await db.query('select * from public.media_watch_snapshots where watch_id=$1',[id])).rows[0];
  const item=(n)=>{const a={id:`article-${n}`,title:`Jannik Sinner ${n}`,url:`https://example.test/${n}`,excerpt:'News',publishedAt:'2026-10-12T12:00:00Z'};return {...a,identityKeys:mediaArticleIdentityKeys(a)};};
  const completeSQL='select public.complete_manual_media_watch_check($1,$2,\'News\',$3,$4,$5,$6,$7,$8,$9,$10) result';
  const complete=async(items,at,prior=undefined,rev=1,user=owner)=>{const before=prior===undefined?await snapshot():prior;return (await service(completeSQL,[id,at,source.url,items.map(i=>i.id),items,before?.checked_at||null,before?.items||null,items,rev,user])).rows[0].result;};
  await t.test('RPC grants and private engines prevent direct or untrusted structured writes',async()=>{
   for(const name of ['complete_manual_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,jsonb,bigint,uuid)','complete_scheduled_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint)','fail_manual_media_watch_check(uuid,uuid,bigint,timestamptz,text)']){
    for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,'public.'+name])).rows[0].ok,role==='service_role');
   }
   assert.equal((await db.query("select has_function_privilege('service_role','public.validate_structured_media_completion(uuid)','execute') ok")).rows[0].ok,false);
   assert.equal((await db.query("select has_function_privilege('service_role','public.complete_manual_media_watch_check_pre_v1(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,jsonb,bigint,uuid)','execute') ok")).rows[0].ok,false);
   await assert.rejects(service('update public.watches set last_check_error_code=\'FAILED\' where id=$1',[id]),{code:'42501'});
   await scoped('authenticated',owner,"select set_config('watch_assistant.structured_rpc','monitor.v1',true);update public.watches set title='Forged'");assert.equal((await row()).title,'Fixture');
   for(const assignment of ["watch_definition=jsonb_set(watch_definition,'{request}','\"Forged\"')","monitoring_source='{}'","user_id='"+other+"'","monitoring_state='monitoring'","media_revision=2","title='Changed'","media_mutation_id=null","deleted_at=now()"]){
    await assert.rejects(db.transaction(async tx=>{await tx.exec("set local role service_role;select set_config('request.jwt.claim.role','service_role',true);select set_config('watch_assistant.structured_rpc','monitor.v1',true)");return tx.exec('update public.watches set '+assignment);}),{code:'42501'});
   }
   const funcs=(await db.query("select proconfig from pg_proc where proname in ('validate_structured_media_completion','complete_manual_media_watch_check','complete_scheduled_media_watch_check','fail_manual_media_watch_check')")).rows;assert.equal(funcs.length,4);funcs.forEach(f=>assert.ok(f.proconfig.includes('search_path=""')));
  });
  const before=await row();
  await t.test('paused manual baseline retains first context with no alerts or activation',async()=>{
   const result=await complete([item(1)],'2026-10-12T13:00:00Z');assert.equal(result.outcome,'baseline');assert.deepEqual(result.matchedItems,[]);const s=await snapshot();assert.deepEqual(s.initial_items,[item(1)]);assert.equal((await row()).monitoring_state,'paused');
   assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
  });
  let earlier;
  await t.test('new matches persist; identity duplicates/no-change preserve unread latest and first context',async()=>{
   earlier=await snapshot();assert.equal((await complete([item(2)],'2026-10-12T14:00:00Z')).outcome,'matching-items');const updated=await row();assert.equal(updated.last_change_item_id,item(2).identityKeys[0]);assert.equal(updated.current_status,'updated');
   assert.equal((await complete([{...item(2),id:'different-feed-id'}],'2026-10-12T15:00:00Z')).outcome,'no-new-items');assert.equal((await row()).last_change_item_id,updated.last_change_item_id);assert.equal((await row()).current_status,'updated');assert.deepEqual((await snapshot()).initial_items,[item(1)]);
   assert.equal((await complete([item(1)],'2026-10-12T16:00:00Z')).outcome,'no-new-items');assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
  });
  await t.test('owner/revision/snapshot CAS prevents stale completion or failure from replacing success',async()=>{
   const s=await snapshot();assert.equal((await complete([item(3)],'2026-10-12T17:00:00Z',earlier)).status,'skipped');assert.equal((await complete([item(3)],'2026-10-12T17:00:00Z',s,2)).status,'skipped');assert.equal((await complete([item(3)],'2026-10-12T17:00:00Z',s,1,other)).status,'skipped');assert.deepEqual(await snapshot(),s);
   await service('select public.fail_manual_media_watch_check($1,$2,1,$3,\'PROVIDER_FAILED\')',[id,owner,s.checked_at]);assert.equal((await row()).last_check_error_code,'PROVIDER_FAILED');assert.deepEqual(await snapshot(),s);
   await service('select public.fail_manual_media_watch_check($1,$2,1,$3,\'STALE_FAILED\')',[id,owner,earlier.checked_at]);assert.equal((await row()).last_check_error_code,'PROVIDER_FAILED');
   await complete([item(4)],'2026-10-12T18:00:00Z');assert.equal((await row()).last_check_error_code,null);
  });
  const schedule=(items,at,prior,rev=1)=>service('select public.complete_scheduled_media_watch_check($1,$2,\'News\',$3,$4,$5,$6,$7,\'matching-items\',$8,true,$9) result',[id,at,source.url,items.map(i=>i.id),items,prior?.checked_at||null,prior?.items||null,items,rev]);
  await t.test('paused structured scheduled completion cannot enqueue or bypass eligibility',async()=>{
   const s=await snapshot();assert.equal((await schedule([item(5)],'2026-10-12T19:00:00Z',s)).rows[0].result,'skipped');assert.deepEqual(await snapshot(),s);assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
   const after=await row();for(const key of ['id','user_id','title','type','request','watch_definition','monitoring_source','media_revision','media_mutation_id','monitoring_state'])assert.deepEqual(after[key],before[key]);
  });
  await t.test('only local fixture activation exercises unchanged scheduled outbox/dedup safeguards',async()=>{
   // Test-only DDL in this private disposable database; deployment constraints stay intact.
   await db.exec('alter table public.watches drop constraint watches_structured_definition_check;alter table public.watches disable trigger watches_guard_structured_write;');
   await db.query("update public.watches set monitoring_state='monitoring' where id=$1",[id]);
   await db.exec('alter table public.watches enable trigger watches_guard_structured_write;');
   const revision=(await row()).media_revision;const s=await snapshot();assert.equal((await schedule([{...item(5),publishedAt:'2026-10-12T14:00:00Z'}],'2026-10-12T19:00:00Z',s,revision)).rows[0].result,'changed');
   assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,1);
   assert.equal((await schedule([{...item(5),id:'another-id'}],'2026-10-12T20:00:00Z',await snapshot(),revision)).rows[0].result,'unchanged');assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,1);
  });
 }finally{await db.close();}
});
