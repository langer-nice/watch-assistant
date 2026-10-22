import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
import {PGlite} from '@electric-sql/pglite';
import {structuredProductionEnabled,productionExecutionEnabled,productionReportsEnabled} from './structured-production-access.js';
import {structuredCreationEnabled,requireStructuredCreationAccess} from './structured-creation-access.js';
import {structuredMediaNotificationIntentsEnabled,getStructuredMediaStagingEmailConfig} from './structured-media-notification-gates.js';
import {runStructuredMediaMonitoring} from './structured-media-scheduler.js';
import {generateMorningReport} from './morning-report.js';
import {processMediaWatchEmailNotifications} from './media-watch-notifications.js';
import {createCompanyMonitoringCronHandler} from './company-monitoring-cron.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',watch='cccccccc-cccc-4ccc-8ccc-cccccccccccc',watch2='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const prod={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',MORNING_REPORT_PRODUCTION_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'true',CRON_SECRET:'offline'};
test('Production requires explicit gates/project; Staging access and delivery restrictions stay separate',()=>{
 assert(structuredCreationEnabled(prod));assert(productionExecutionEnabled(prod));assert(productionReportsEnabled(prod));requireStructuredCreationAccess({id:owner},prod);
 assert(!structuredProductionEnabled({...prod,STRUCTURED_PRODUCTION_ENABLED:undefined}));assert(!productionReportsEnabled({...prod,MORNING_REPORT_PRODUCTION_ENABLED:undefined}));
 for(const change of [{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'foreign'},{VERCEL_GIT_COMMIT_REF:'other'},{SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co'},{VITE_SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co'},{STRUCTURED_WATCH_TEST_USER_IDS:owner},{STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'test@example.test'}]){
  assert(!structuredProductionEnabled({...prod,...change}));assert(!productionReportsEnabled({...prod,...change}));
 }
 const stage={...prod,STRUCTURED_PRODUCTION_ENABLED:undefined,MORNING_REPORT_PRODUCTION_ENABLED:undefined,VERCEL_ENV:'preview',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_TEST_USER_IDS:owner};
 assert(structuredCreationEnabled(stage));requireStructuredCreationAccess({id:owner},stage);assert.throws(()=>requireStructuredCreationAccess({id:other},stage));
 assert(!structuredCreationEnabled({...stage,STRUCTURED_WATCH_CREATION_ENABLED:undefined}));
 assert(structuredMediaNotificationIntentsEnabled({...prod,WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'}));
 assert.equal(getStructuredMediaStagingEmailConfig(prod),null);
});
test('Production scheduler uses service-derived owners; default OFF never reaches SQL/providers',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='production_watch_owners'?[owner]:[]};}};
 const result=await runStructuredMediaMonitoring({client,env:prod,schedulerAuthorized:true,fetchFeed:()=>assert.fail('No source call for empty claims')});assert.equal(result.claimed,0);
 assert.deepEqual(calls.map(x=>x[0]),['production_watch_owners','claim_structured_media_checks']);assert.deepEqual(calls[1][1].p_owners,[owner]);
 calls.length=0;const disabled={...prod,STRUCTURED_PRODUCTION_ENABLED:undefined};
 assert.equal((await runStructuredMediaMonitoring({client,env:disabled,schedulerAuthorized:true})).status,'environment-blocked');assert.equal(calls.length,0);
 assert.equal((await generateMorningReport({client,env:prod,at:'2026-10-22T06:02Z'})).status,'disabled');assert.equal(calls.length,0);
 await assert.rejects(()=>runStructuredMediaMonitoring({client:{rpc:async()=>({error:{}})},env:prod,schedulerAuthorized:true}));
});
test('Production reporting keeps per-owner contexts and the existing snapshot/save contract',async()=>{
 const writes=[],calls=[];const client={rpc:async(name,args)=>{
  calls.push(name);if(name==='production_watch_owners')return {data:[owner,other]};
  if(name==='morning_report_context')return {data:{pending:0,exists:false,revision:'r',watches:[{id:args.p_owner===owner?watch:watch2,user_id:args.p_owner,type:'company_bodacc',title:'Existing',monitoring_state:'monitoring',current_status:'watching',created_at:'2026-10-01',last_checked_at:'2026-10-22T06:01Z'}]}};
  assert.equal(name,'save_watch_report');writes.push(args);return {data:true};
 }};
 const result=await generateMorningReport({client,env:prod,at:'2026-10-22T06:02Z',schedulerAuthorized:true});assert.equal(result.reports.length,2);assert.deepEqual(writes.map(x=>x.p_report.ownerId),[owner,other]);
 for(const write of writes){assert.equal(write.p_kind,'automatic');assert.equal(write.p_report.origin,'automatic');}
 assert(calls.every(x=>['production_watch_owners','morning_report_context','save_watch_report'].includes(x)));
 await assert.rejects(()=>generateMorningReport({client:{rpc:async name=>({data:name==='production_watch_owners'?[owner]:{pending:0,watches:[{user_id:other}]}})},env:prod,at:'2026-10-22T06:02Z',schedulerAuthorized:true}));
});
test('legacy sender excludes Structured intents even with Production gates OFF; cron authorization is unchanged',async()=>{
 const calls=[];const query=new Proxy({}, {get(_,key){if(key==='then')return(resolve)=>resolve({data:[]});return(...args)=>{calls.push([key,...args]);return query;};}});
 const env={...prod,STRUCTURED_PRODUCTION_ENABLED:undefined,MORNING_REPORT_PRODUCTION_ENABLED:undefined,MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',RESEND_API_KEY:'offline-key',WATCH_EMAIL_FROM:'Watch Assistant <alerts@davidlangdesign.com>',WATCH_APP_BASE_URL:'https://production.example.test'};
 const r=await processMediaWatchEmailNotifications({client:{from:()=>query,rpc:()=>assert.fail('No claim')},env,sender:()=>assert.fail('No sender')});assert.equal(r.sentCount,0);assert(calls.some(([method,path,value])=>method==='is'&&path==='watches.watch_definition->>definitionVersion'&&value===null));
 let reports=0,legacy=0;const handler=createCompanyMonitoringCronHandler({env,clientFactory:()=>({}),runner:async()=>{legacy++;return {};},mediaRunner:async()=>({}),morningReportProcessor:async()=>{reports++;},logger:{info(){},error(){}}});
 const response={setHeader(){},end(){}};await handler({method:'GET',url:'/api/cron/company-monitoring',headers:{authorization:'Bearer wrong'}},response);assert.equal(response.statusCode,401);assert.equal(legacy,0);
 await handler({method:'GET',url:'/api/cron/company-monitoring',headers:{authorization:'Bearer offline'}},response);assert.equal(legacy,1);assert.equal(reports,0);
});
test('Production private report SQL: owner isolation, uniqueness and protected capture',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;create function public.test_production_clock() returns timestamptz language sql as $$select coalesce(nullif(current_setting('test.production_now',true),''),'2026-10-22T06:02Z')::timestamptz$$;`);
  const dir=new URL('../supabase/migrations/',import.meta.url),all=(await readdir(dir)).filter(x=>x.endsWith('.sql')).sort();
  const excluded=['20261017160000','20261018160000','20261020170000','20261022160000'];
  const order=[...all.filter(x=>x<'20261012'),...all.filter(x=>x.startsWith('20261013140000')),...all.filter(x=>x>='20261012'&&!x.startsWith('20261013140000')&&!excluded.some(p=>x.startsWith(p)))];
  for(const file of order){let sql=(await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;','');sql=sql.replaceAll('clock_timestamp()','public.test_production_clock()').replaceAll('now()','public.test_production_clock()');await db.exec(sql);}
  await db.query('insert into auth.users values ($1,$2),($3,$4)',[owner,'owner@example.test',other,'other@example.test']);
  await db.query("insert into public.watches(id,user_id,type,title,siren,monitoring_state,last_checked_at) values($1,$2,'company_bodacc','Existing A','552100554','monitoring','2026-10-22T06:01Z'),($3,$4,'company_bodacc','Existing B','552100554','monitoring','2026-10-22T06:01Z')",[watch,owner,watch2,other]);
  const role=(r,user,sql,args=[])=>db.transaction(async tx=>{await tx.exec(`set local role ${r}`);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[r,user||'']);return tx.query(sql,args);});
  const report={id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',version:2,ownerId:owner,origin:'manual',entries:[],attempts:[],watchIdsConsidered:[watch],watchIdsChecked:[],watchIdsSkipped:[],startedAt:'2026-10-22T06:00Z',completedAt:'2026-10-22T06:01Z'};
  const save=(r,user,value,kind='manual')=>role(r,user,'select public.save_watch_report($1,$2) value',[value,kind]);
  await assert.rejects(()=>save('authenticated',other,report));await assert.rejects(()=>save('authenticated',owner,{...report,watchIdsConsidered:[watch2]}));
  assert.equal((await save('authenticated',owner,report)).rows[0].value,true);
  assert.equal((await role('authenticated',other,'select public.latest_watch_report() value')).rows[0].value,null);
  assert.equal((await role('authenticated',owner,'select public.latest_watch_report() value')).rows[0].value.id,report.id);
  for(const r of ['anon','authenticated','service_role'])await assert.rejects(()=>role(r,owner,'select * from public.watch_reports'));
  await assert.rejects(()=>role('authenticated',owner,"select public.morning_report_context($1,'2026-10-22T06:00Z')",[other]));
  await assert.rejects(()=>role('authenticated',owner,'select public.production_watch_owners()'));await assert.rejects(()=>role('anon',null,'select public.latest_watch_report()'));
  assert.deepEqual((await role('service_role',null,'select public.production_watch_owners() value')).rows[0].value,[owner,other]);
  const context=(await role('service_role',null,"select public.morning_report_context($1,'2026-10-22T06:00Z') value",[owner])).rows[0].value;
  const automatic={...report,id:'ffffffff-ffff-4fff-8fff-ffffffffffff',origin:'automatic',completedAt:'2026-10-22T06:02Z',sourceRevision:context.revision};
  assert.equal((await save('service_role',null,automatic,'automatic')).rows[0].value,true);assert.equal((await save('service_role',null,{...automatic,id:'99999999-9999-4999-8999-999999999999'},'automatic')).rows[0].value,false);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.watch_reports'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await db.query('select count(*)::int count from public.media_watch_notifications')).rows[0].count,0);
  const structuredId='12345678-1234-4234-8234-123456789012',definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria),title='Existing Structured local fixture';
  await role('service_role',null,"select public.persist_structured_watch_v1($1,$2,'create',$3,0,$4,$5,$6,$7,$8)",[owner,structuredId,'88888888-8888-4888-8888-888888888888',title,source,definition,fingerprint(definition),fingerprint({definition,source,title})]);
  await role('service_role',null,'select public.set_structured_media_monitoring($1,$2,1,true,86400)',[structuredId,owner]);
  await role('authenticated',owner,'select public.set_structured_media_email_preference($1,true)',[structuredId]);
  await db.query(`insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article) values($1,$2,'legacy-pending','Existing','{"title":"Legacy","url":"https://example.test/legacy"}'),($3,$2,'structured-pending','Existing','{"title":"Structured","url":"https://example.test/structured"}')`,[watch,owner,structuredId]);
  await role('service_role',null,'select public.maintain_media_watch_notifications(false)');
  const pending=(await db.query('select source_article_id,status from public.media_watch_notifications order by source_article_id')).rows;
  assert.deepEqual(pending,[{source_article_id:'legacy-pending',status:'failed'},{source_article_id:'structured-pending',status:'pending'}]);
  // Production adapters: no legacy enrollment, no historical membership, atomic one/day.
  const svc=async(sql,args=[])=>role('service_role',null,sql,args);
  assert.deepEqual((await role('service_role',null,"select public.prepare_production_structured_digests('2026-10-22T06:00Z',$1) r",[[owner]])).rows[0].r,[]);
  await role('authenticated',owner,"select public.set_media_watch_email_policy($1,'daily_digest',true)",[structuredId]);
  await db.query("select set_config('test.production_now','2026-10-22T06:15Z',false)");
  const since='2026-10-22T06:00Z';
  const add=async(key,stamp)=>db.query(`insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article,created_at) values($1,$2,$3,'Fixture','{"title":"New","url":"https://example.test/new"}',$4)`,[structuredId,owner,key,stamp]);
  await add('historical','2026-10-20T06:15Z');await add('fresh','2026-10-22T06:14Z');
  for(const r of ['anon','authenticated'])await assert.rejects(()=>role(r,owner,'select public.prepare_production_structured_digests($1,$2)',[since,[owner]]));
  assert.deepEqual((await svc('select public.prepare_production_structured_digests($1,$2) r',[since,[other]])).rows[0].r,[]);
  const ids=(await svc('select public.prepare_production_structured_digests($1,$2) r',[since,[owner]])).rows[0].r;assert.equal(ids.length,1);
  const members=(await db.query('select source_article_id from public.media_watch_notifications where digest_id=$1',[ids[0]])).rows;assert.deepEqual(members,[{source_article_id:'fresh'}]);
  const token='99999999-9999-4999-8999-999999999999';
  const claim=async(owners=[owner],cutoff=since)=> (await svc('select public.claim_production_structured_digest($1,$2,$3,$4) r',[ids[0],token,owners,cutoff])).rows[0].r;
  assert.equal(await claim([other]),null);assert.equal(await claim([owner],'2026-10-22T06:15Z'),null);
  const claims=await Promise.all([claim(),claim()]);assert.equal(claims.filter(Boolean).length,1);
  assert.equal((await svc('select public.begin_media_watch_digest($1,$2) r',[ids[0],token])).rows[0].r,true);
  await svc("select public.finish_media_watch_digest($1,$2,null,'EMAIL_DELIVERY_OUTCOME_UNKNOWN')",[ids[0],token]);
  assert.equal(await claim(),null);
  await add('later','2026-10-22T06:16Z');
  assert.deepEqual((await svc('select public.prepare_production_structured_digests($1,$2) r',[since,[owner]])).rows[0].r,[]);
  const independent='23456789-2345-4345-8345-234567890123';
  await svc("select public.persist_structured_watch_v1($1,$2,'create',$3,0,$4,$5,$6,$7,$8)",[other,independent,'77777777-7777-4777-8777-777777777777',title,source,definition,fingerprint(definition),fingerprint({definition,source,title})]);
  await svc('select public.set_structured_media_monitoring($1,$2,1,true,86400)',[independent,other]);
  await role('authenticated',other,"select public.set_media_watch_email_policy($1,'daily_digest',false)",[independent]);
  await db.query(`insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article) values($1,$2,'without-consent','Fixture','{"title":"New","url":"https://example.test/other"}')`,[independent,other]);
  assert.deepEqual((await svc('select public.prepare_production_structured_digests($1,$2) r',[since,[other]])).rows[0].r,[]);
  await role('authenticated',other,"select public.set_media_watch_email_policy($1,'daily_digest',true)",[independent]);
  // Off observations remain terminal; only a subsequent new observation may send.
  await db.query(`insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article) values($1,$2,'after-consent','Fixture','{"title":"New","url":"https://example.test/other-new"}')`,[independent,other]);
  const second=(await svc('select public.prepare_production_structured_digests($1,$2) r',[since,[owner,other]])).rows[0].r;assert.equal(second.length,1);
  const secondClaim=(await svc('select public.claim_production_structured_digest($1,$2,$3,$4) r',[second[0],token,[other],since])).rows[0].r;
  assert.equal(secondClaim.user_id,other);assert.deepEqual(secondClaim.articles.map(a=>a.id),['after-consent']);
  // Previously completed legacy results remain available, explicitly stale/partial
  // at composition; unfinished due Structured leases still block freshness.
  assert((await svc("select public.morning_report_context($1,'2026-10-22T06:00Z') r",[owner])).rows[0].r.pending>0);
 }finally{await db.close();}
});
