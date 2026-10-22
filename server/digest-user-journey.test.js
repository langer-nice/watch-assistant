import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
import {createMediaWatchCheckMiddleware} from './media-watch-check-api.js';
import {createCompanyMonitoringCronHandler} from './company-monitoring-cron.js';
import {runStructuredMediaMonitoring} from './structured-media-scheduler.js';
import {processMediaWatchEmailNotifications} from './media-watch-notifications.js';
import {configureAccountStorage} from '../src/js/account-storage.js';
import {generateReport,refreshLatestReport} from '../src/js/report-service.js';
import {createWatchCheckController} from '../src/js/watch-monitoring.js';
import {markUpdatesAsRead} from '../src/js/watch-updates.js';
import {getUserFacingWatchClassification} from '../src/js/report-status.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={CRON_SECRET:'synthetic-only',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',VERCEL_URL:'synthetic-preview.vercel.app',WATCH_APP_BASE_URL:'https://synthetic-preview.vercel.app',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true',STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:'account',STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'owner@example.test',RESEND_API_KEY:'synthetic-only',WATCH_EMAIL_FROM:'notifications@watch.davidlangdesign.com'};

test('complete report and automatic monitoring → durable articles → morning cron → fake provider',async t=>{
 const db=new PGlite(),originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
 globalThis.fetch=()=>assert.fail('External calls forbidden');
 const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 configureAccountStorage({getState:()=>({status:'authenticated',session:{user:{id:owner}}})});
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-18T12:00:00Z')});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;create function public.test_clock() returns timestamptz language sql stable as $$select current_setting('test.clock')::timestamptz$$;`);
  const at=async iso=>{t.mock.timers.setTime(Date.parse(iso));await db.query("select set_config('test.clock',$1,false)",[iso]);};
  await at('2026-10-18T12:00:00Z');
  // Only replace database clock reads; every production function and trigger executes unchanged otherwise.
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const f of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql'))){
   const sql=(await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;','').replace(/\b(?:clock_timestamp|now)\(\)/g,'public.test_clock()');
   await db.exec(sql);
  }
  const as=(role,user,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,user]);return tx.query(sql,args);});
  const svc=(sql,args=[])=>as('service_role',owner,sql,args);
  await db.query("insert into auth.users values($1,'owner@example.test',public.test_clock())",[owner]);
  const row=async id=>(await db.query('select w.*,to_jsonb(s) media_watch_snapshots from watches w left join media_watch_snapshots s on s.watch_id=w.id where w.id=$1',[id])).rows[0];
  const feeds=new Map(),local=new Map(),submitted=[],rpcCalls=[];let loseCompletion=false,closeWindow=false,authFailure=false,recipient='owner@example.test';
  const rpc=async(name,args)=>{
   rpcCalls.push(name);const pairs=Object.entries(args);
   try{
    const r=await svc('select public.'+name+'('+pairs.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result',pairs.map(([,v])=>v));
    if(closeWindow&&name==='get_media_watch_notification_locale'){closeWindow=false;await at('2026-10-19T06:30:00Z');}
    if(loseCompletion&&name==='finish_media_watch_digest'&&args.p_provider){loseCompletion=false;throw Error('Lost response after committed provider completion');}
    return{data:r.rows[0].result};
   }catch(e){return{error:{code:e.code||'SYNTHETIC_LOST_RESPONSE',message:e.message}};}
  };
  const client={rpc,from(){assert.fail('Account digest must not enumerate immediate notifications');},auth:{admin:{getUserById:async()=>authFailure?{error:{code:'SYNTHETIC_AUTH_UNAVAILABLE'}}:{data:{user:{email:recipient,email_confirmed_at:'2026-01-01'}}}}}};
  const create=async(consent=true,user=owner)=>{
   const id=randomUUID(),definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
   if(user!==owner)await db.query("insert into auth.users values($1,'foreign@example.test',public.test_clock()) on conflict do nothing",[user]);
   await svc("select public.persist_structured_watch_with_digest($1,$2,'create',$3,0,'Journey',$4,$5,$6,$7)",[user,id,randomUUID(),source,definition,fingerprint(definition),fingerprint({title:'Journey',definition,source})]);
   await as('authenticated',user,'select public.set_media_watch_email_policy($1,$2,$3)',[id,'daily_digest',consent]);
   await svc('select public.set_structured_media_monitoring($1,$2,$3,true,86400)',[id,user,(await row(id)).media_revision]);
   local.set(id,{...definition,id,title:'Journey',status:'watching',monitoringState:'monitoring',monitoringSource:source,mediaPersistence:{ownerId:user,revision:Number((await row(id)).media_revision)},monitoringAvailability:'saved',updates:[]});
   feeds.set(id,[]);return id;
  };
  const feed=id=>({checkedAt:new Date().toISOString(),source:{title:'Fixture'},items:feeds.get(id)});
  const saveWatch=(id,changes)=>{const w={...local.get(id),...changes};local.set(id,w);return w;};
  const manual=async watch=>{
   const id=watch.id,q={select(){return q;},eq(){return q;},is(){return q;},async range(){return{data:[await row(id)]};}};
   let body;const response={setHeader(){},end(v){body=JSON.parse(v);}};
   await createMediaWatchCheckMiddleware({env,authenticate:async()=>({user:{id:owner},client:{from:()=>q}}),serviceClient:{rpc},fetchFeed:async()=>feed(id)})({method:'POST',url:'/api/media-watches?action=check',body:{id,revision:Number((await row(id)).media_revision)}},response);
   assert.equal(response.statusCode,200,JSON.stringify(body));return body;
  };
  const controller=createWatchCheckController({getWatch:id=>local.get(id),saveWatch,checkStoredWatch:manual});
  const sender=async message=>{submitted.push(message);return{id:'fake-provider-'+submitted.length};};
  const cron=createCompanyMonitoringCronHandler({env,clientFactory:()=>client,structuredRunner:opts=>runStructuredMediaMonitoring({...opts,fetchFeed:async()=>feed(scheduledTarget)}),structuredNotificationProcessor:opts=>processMediaWatchEmailNotifications({...opts,sender}),logger:{}});
  const tick=async scope=>{let body;const response={setHeader(){},end(v){body=JSON.parse(v);}};await cron({method:'GET',url:'/api/cron/company-monitoring?scope='+scope,headers:{authorization:'Bearer '+env.CRON_SECRET}},response);assert.equal(response.statusCode,200,JSON.stringify(body));return body;};
  const article=n=>({id:n,title:'Jannik Sinner '+n,url:'https://example.test/'+n,publishedAt:new Date().toISOString()});
  const notifications=async()=>(await db.query('select watch_id,source_article_id,status,digest_id,submission_started_at from media_watch_notifications order by watch_id,source_article_id')).rows;
  const home=await create(),automatic=await create(),off=await create(false);let scheduledTarget=automatic;
  const report=()=>generateReport({watches:[local.get(home)],checkController:controller,getWatch:id=>local.get(id),saveWatch});
  await t.test('Home/report establishes a silent baseline, then creates Updated and one durable daily notification',async()=>{
   await report();await controller.check(off);await controller.check(automatic);
   await at('2026-10-18T23:50:00Z');feeds.set(home,[article('shared')]);const result=await report();
   assert.equal(result.entries[0].classification,'updated');assert.equal(getUserFacingWatchClassification(local.get(home)),'updated');
   assert.equal((await notifications()).length,1);assert.equal((await notifications())[0].status,'pending');
   assert(rpcCalls.includes('finish_structured_manual_check_with_digest'));
  });
  await t.test('automatic cron accepts the same article independently and consent-OFF stays silent',async()=>{
   feeds.set(automatic,feeds.get(home));feeds.set(off,feeds.get(home));await controller.check(off);
   await at('2026-10-19T00:01:00Z');await db.query('update structured_media_schedules set next_due_at=public.test_clock() where watch_id=$1',[automatic]);
   const result=await tick('structured-media');assert.equal(result.structured.changed,1);assert.equal(result.notifications.digests.status,'outside-morning-window');
   assert.equal((await notifications()).length,2);assert(rpcCalls.includes('finish_structured_check_with_digest'));
  });
  await t.test('Home viewing/read acknowledgement, refresh and later empty checks preserve both pending records across midnight',async()=>{
   const before=await notifications();const w=local.get(home);local.set(home,markUpdatesAsRead(w,w.updates.map(u=>u.id)));
   refreshLatestReport({watches:[local.get(home)]});assert.notEqual(getUserFacingWatchClassification(local.get(home)),'updated');
   feeds.set(home,[]);await report();feeds.set(automatic,[]);await db.query('update structured_media_schedules set next_due_at=public.test_clock() where watch_id=$1',[automatic]);await tick('structured-media');
   assert.deepEqual(await notifications(),before);assert.equal(submitted.length,0);
  });
  await t.test('a closing-window deferral preserves an older frozen digest for the next morning',async()=>{
   await at('2026-10-19T06:29:59Z');closeWindow=true;const result=await tick('structured-media-email-test');
   assert.equal(submitted.length,0);assert.equal(result.notifications.digests.failedCount,0);assert((await notifications()).every(n=>n.status==='pending'));
  });
  await t.test('08:15 prioritizes an older envelope per Watch without failing newer pending articles; hourly and morning retries never duplicate',async()=>{
   await at('2026-10-19T20:00:00Z');feeds.set(home,[article('later')]);await report();
   await at('2026-10-20T06:15:00Z');loseCompletion=true;await tick('structured-media-email-test');
   assert.equal(submitted.length,2);assert.equal(new Set(submitted.map(m=>m.idempotencyKey)).size,2);
   let rows=await notifications();assert.equal(rows.filter(n=>n.status==='sent').length,2);assert.equal(rows.filter(n=>n.status==='pending').length,1);assert.equal(rows.filter(n=>n.status==='failed').length,0);
   await tick('structured-media');await tick('structured-media-email-test');assert.equal(submitted.length,2);
   await at('2026-10-21T06:15:00Z');await tick('structured-media-email-test');assert.equal(submitted.length,3);rows=await notifications();assert(rows.every(n=>n.status==='sent'));
  });
  await t.test('a newly created consented Watch is selected without a Watch allowlist; foreign account is excluded',async()=>{
   await at('2026-10-21T12:00:00Z');const future=await create();await controller.check(future);await at('2026-10-21T12:01:00Z');feeds.set(future,[article('future')]);await controller.check(future);
   const foreign=await create(true,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');await db.query("insert into media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article_position,article) values($1,$2,'foreign','Foreign',1,$3)",[foreign,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{title:'Foreign fixture',url:'https://example.test/foreign'}]);
   await at('2026-10-22T06:15:00Z');await tick('structured-media-email-test');assert.equal(submitted.length,4);assert(submitted.every(m=>m.to==='owner@example.test'));
   assert.equal((await db.query('select status from media_watch_notifications where watch_id=$1',[foreign])).rows[0].status,'pending');
  });
  await t.test('a transient recipient lookup failure before provider submission preserves pending articles for a safe retry',async()=>{
   await at('2026-10-22T12:00:00Z');const retry=await create();await controller.check(retry);
   await at('2026-10-22T12:01:00Z');feeds.set(retry,[article('retry')]);await controller.check(retry);
   await at('2026-10-23T06:15:00Z');const before=submitted.length;authFailure=true;await tick('structured-media-email-test');
   assert.equal(submitted.length,before);assert.equal((await db.query('select status from media_watch_notifications where watch_id=$1',[retry])).rows[0].status,'pending');
   authFailure=false;await tick('structured-media-email-test');assert.equal(submitted.length,before+1);
   await tick('structured-media-email-test');assert.equal(submitted.length,before+1);
  });

  await t.test('daily frequency and approved recipient are mandatory; an expired pre-send claim recovers without duplicate delivery',async()=>{
   await at('2026-10-23T12:00:00Z');const immediate=await create();
   await as('authenticated',owner,'select public.set_media_watch_email_policy($1,$2,true)',[immediate,'immediate']);
   await controller.check(immediate);await at('2026-10-23T12:01:00Z');feeds.set(immediate,[article('immediate')]);await controller.check(immediate);
   assert.equal((await notifications()).filter(n=>n.watch_id===immediate).length,0);
   const recovery=await create();await controller.check(recovery);await at('2026-10-23T12:02:00Z');feeds.set(recovery,[article('recovery')]);await controller.check(recovery);
   await at('2026-10-24T06:15:00Z');const before=submitted.length;recipient='unapproved@example.test';await tick('structured-media-email-test');assert.equal(submitted.length,before);
   assert.equal((await db.query('select status from media_watch_notifications where watch_id=$1',[recovery])).rows[0].status,'pending');recipient='owner@example.test';
   const ids=(await rpc('pending_media_watch_digests',{p_owners:[owner],p_structured:true})).data;
   assert.equal(ids.length,1);assert((await rpc('claim_media_watch_digest',{p_id:ids[0],p_token:randomUUID(),p_owners:[owner],p_structured:true})).data);
   await tick('structured-media-email-test');assert.equal(submitted.length,before);
   await at('2026-10-25T07:15:00Z');await tick('structured-media-email-test');assert.equal(submitted.length,before+1);
   await tick('structured-media-email-test');assert.equal(submitted.length,before+1);
   assert.equal((await db.query('select status from media_watch_notifications where watch_id=$1',[recovery])).rows[0].status,'sent');
  });

 }finally{await db.close();globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;t.mock.timers.reset();}
});
