import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {morningReportWindow,generateMorningReport,runMorningBatches} from './morning-report.js';
import {parisDigestWindow} from './media-watch-digest.js';
const owner='4eee8bb6-21c1-46c2-b150-0fa8981a0aef',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true',STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:'account'};
test('08:15 lower bound and CET/CEST transitions',()=>{
 for(const [date,hour] of [['2026-10-22','06'],['2026-10-25','07'],['2027-03-28','06']]){
  assert.equal(parisDigestWindow(`${date}T${hour}:00:00Z`).open,false);
  assert.equal(parisDigestWindow(`${date}T${hour}:14:59Z`).open,false);
  assert.equal(parisDigestWindow(`${date}T${hour}:15:00Z`).open,true);
  assert.equal(parisDigestWindow(`${date}T${hour}:30:00Z`).open,false);
  assert.equal(morningReportWindow(`${date}T${hour}:15:00Z`).cutoff,`${date}T${hour}:00:00.000Z`);
 }
});
test('automatic composition awaits completion, drains only existing due leases, and writes only report RPC',async()=>{
 let batches=0;const summary=await runMorningBatches({run:async()=>({claimed:++batches<3?3:1,failed:0,changed:1}),args:{},at:'2026-10-22T06:00:00Z'});
 assert.equal(batches,3);assert.equal(summary.claimed,7);
 const writes=[];let pending=1;
 const client={rpc:async(name,args)=>{
  if(name==='morning_report_context')return {data:{pending,exists:false,revision:'fixed',watches:[{id,user_id:owner,type:'media_news',title:'Synthetic',watch_definition:{},monitoring_source:{type:'feed',url:'https://example.test/feed'},monitoring_state:'monitoring',current_status:'updated',created_at:'2026-09-01',last_checked_at:'2026-10-22T06:01:00Z',last_change_item_id:'article1',last_change_title:'A meaningful headline',last_change_summary:'A source summary',media_last_change_detected_at:'2026-10-22T06:01:00Z'}]}};
  assert.equal(name,'save_watch_report');writes.push(args);return {data:true};
 }};
 assert.equal((await generateMorningReport({client,env,at:'2026-10-22T06:02:00Z'})).status,'awaiting-completed-checks');assert.equal(writes.length,0);
 pending=0;assert.equal((await generateMorningReport({client,env,at:'2026-10-22T06:02:00Z'})).status,'generated');
 assert.equal(writes[0].p_report.entries[0].classification,'updated');assert.equal(writes[0].p_report.entries[0].checkedAt,'2026-10-22T06:01:00Z');
 assert.equal((await generateMorningReport({client:{rpc:()=>assert.fail('Production must not query')},env:{...env,VERCEL_ENV:'production'},at:'2026-10-22T06:02:00Z'})).status,'disabled');
});
test('private SQL persistence, owner isolation, immutable daily report, no grants or notification mutations',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;create function public.test_morning_clock() returns timestamptz language sql as $$select '2026-10-22T06:02:00Z'::timestamptz$$;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const f of (await readdir(dir)).sort().filter(x=>x.endsWith('.sql')))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;','').replaceAll('clock_timestamp()',f==='20261022160000_private_morning_reports.sql'?'public.test_morning_clock()':'clock_timestamp()'));
  await db.query('insert into auth.users values ($1,$2),($3,$4)',[owner,'owner@example.test',other,'other@example.test']);
  await db.query("insert into public.watches(id,user_id,type,title,monitoring_state,watch_definition,monitoring_source,last_checked_at,siren) values($1,$2,'company_bodacc','Synthetic','monitoring',null,null,'2026-10-22T06:01Z','552100554')",[id,owner]);
  const role=(r,user,sql,args=[])=>db.transaction(async tx=>{await tx.exec(`set local role ${r}`);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[r,user||'']);return tx.query(sql,args);});
  await db.query("insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article) values($1,$2,'article-pending','Synthetic','{\"title\":\"Preserve this pending article\",\"url\":\"https://example.test/article\"}')",[id,owner]);
  const before=(await db.query('select to_jsonb(w) row from public.watches w')).rows;
  const pending=(await db.query('select * from public.media_watch_notifications')).rows;
  const context=(await role('service_role',null,"select public.morning_report_context('2026-10-22T06:00Z') value")).rows[0].value;
  const report={version:2,id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',ownerId:owner,origin:'automatic',startedAt:'2026-10-22T06:00Z',completedAt:'2026-10-22T06:02Z',entries:[],attempts:[],watchIdsConsidered:[id],watchIdsChecked:[id],watchIdsSkipped:[],sourceRevision:context.revision};
  assert.equal((await role('service_role',null,'select public.save_watch_report($1,$2) ok',[report,'automatic'])).rows[0].ok,true);
  assert.equal((await role('service_role',null,'select public.save_watch_report($1,$2) ok',[{...report,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},'automatic'])).rows[0].ok,false);
  assert.equal((await role('authenticated',owner,'select public.latest_watch_report() value')).rows[0].value.id,report.id);
  assert.equal((await role('authenticated',other,'select public.latest_watch_report() value')).rows[0].value,null);
  await assert.rejects(role('authenticated',other,'select public.save_watch_report($1,$2)',[{...report,origin:'manual'},'manual']),/denied/);
  await assert.rejects(role('authenticated',owner,'select public.save_watch_report($1,$2)',[report,'automatic']),/denied/);
  const manual={...report,origin:'manual',id:'ffffffff-ffff-4fff-8fff-ffffffffffff'};
  assert.equal((await role('authenticated',owner,'select public.save_watch_report($1,$2) ok',[manual,'manual'])).rows[0].ok,true);
  await assert.rejects(role('authenticated',owner,'select public.morning_report_context(now())'),/permission denied/);
  for(const r of ['anon','authenticated','service_role'])await assert.rejects(role(r,owner,'select * from public.watch_reports'),/permission denied/);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.watch_reports'::regclass")).rows[0].relrowsecurity,true);
  assert.deepEqual((await db.query('select to_jsonb(w) row from public.watches w')).rows,before);
  assert.deepEqual((await db.query('select * from public.media_watch_notifications')).rows,pending);
 }finally{await db.close();}
});
