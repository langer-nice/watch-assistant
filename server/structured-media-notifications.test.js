import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
import {mediaArticleIdentityKeys} from './media-article-identity.js';
import {runStructuredMediaMonitoring} from './structured-media-scheduler.js';
import {processMediaWatchEmailNotifications} from './media-watch-notifications.js';
import {renderMediaWatchEmail} from './media-watch-email.js';
import {structuredMediaNotificationIntentsEnabled,structuredMediaEmailDeliveryAllowed} from './structured-media-notification-gates.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',CRON_SECRET:'synthetic'};
test('atomic structured notification handoff uses existing SQL ledger and outbox',async t=>{
 const db=new PGlite(),original=globalThis.fetch;
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);for(const f of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')&&f<='20261015200000_structured_media_notifications.sql'))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  globalThis.fetch=()=>assert.fail('External service forbidden');
  const svc=(sql,args=[])=>db.transaction(async tx=>{await tx.exec("set local role service_role;select set_config('request.jwt.claim.role','service_role',true)");return tx.query(sql,args);});
  await db.query('insert into auth.users values($1,$2)',[owner,'owner@example.test']);
  const pref=(enabled,user=owner,watch=id)=>db.transaction(async tx=>{await tx.exec("set local role authenticated");await tx.query("select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',$1,true)",[user]);return tx.query('select public.set_structured_media_email_preference($1,$2) enabled',[watch,enabled]);});
  const definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
  await svc("select public.persist_structured_watch_v1($1,$2,'create',$3,0,'Synthetic test',$4,$5,$6,$7)",[owner,id,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',source,definition,fingerprint(definition),fingerprint({definition,source,title:'Synthetic test'})]);
  const row=async()=>(await db.query('select * from public.watches where id=$1',[id])).rows[0];
  const snapshot=async()=>(await db.query('select * from public.media_watch_snapshots where watch_id=$1',[id])).rows[0];
  const outbox=async()=>(await db.query('select * from public.media_watch_notifications order by article_position')).rows;
  const activate=async(active)=>(await svc('select public.set_structured_media_monitoring($1,$2,$3,$4,3600) ok',[id,owner,(await row()).media_revision,active])).rows[0].ok;
  const claim=async()=>{await db.query('update public.structured_media_schedules set next_due_at=now() where watch_id=$1',[id]);return(await svc('select public.claim_structured_media_checks($1,3) result',[[owner]])).rows[0].result[0];};
  const article=n=>{const item={id:'synthetic-'+n,title:'Synthetic Jannik Sinner '+n,url:'https://example.test/'+n,sourceTitle:'Synthetic Publisher',excerpt:'Publisher text',publishedAt:'2026-10-15T00:00:00Z'};return{...item,identityKeys:mediaArticleIdentityKeys(item)};};
  const finish=(lease,items,matching=items,enqueue=true,user=owner)=>svc('select public.finish_structured_media_check_with_notifications($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,$12) result',[id,user,lease.media_revision,lease.lease_token,new Date().toISOString(),'Publisher',source.url,items,lease.media_watch_snapshots?.checked_at||null,lease.media_watch_snapshots?.items||null,matching,enqueue]).then(r=>r.rows[0].result);
  const baseline=article('baseline'),new1=article('new1'),new2=article('new2'),nonmatch=article('nonmatch');
  await t.test('new fixture stays paused, cannot be scheduled even with consent enabled',async()=>{assert.equal((await row()).monitoring_state,'paused');await pref(true);assert.equal(await claim(),undefined);assert.equal((await row()).monitoring_state,'paused');await pref(false);});
  await t.test('consent cannot be written directly or granted by a service/browser with another identity',async()=>{
   await assert.rejects(svc('select public.set_structured_media_email_preference($1,true)',[id]),{code:'42501'});
   await assert.rejects(db.transaction(async tx=>{await tx.exec("set local role authenticated;select set_config('request.jwt.claim.role','authenticated',true)");await tx.query('update public.structured_media_email_preferences set enabled=true where watch_id=$1',[id]);}),{code:'42501'});
   assert.equal((await db.query("select has_function_privilege('anon','public.set_structured_media_email_preference(uuid,boolean)','execute') ok")).rows[0].ok,false);
  });
  await t.test('service-only RPC and private legacy helpers',async()=>{for(const role of ['anon','authenticated','service_role']){const name='public.finish_structured_media_check_with_notifications(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean)';assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,name])).rows[0].ok,role==='service_role');}assert.equal((await db.query("select has_function_privilege('service_role','public.claim_media_watch_email_notification_pre_structured(uuid,uuid)','execute') ok")).rows[0].ok,false);});
  await t.test('empty first baseline creates no historical alerts',async()=>{await activate(true);const r=await finish(await claim(),[]);assert.equal(r.outcome,'baseline');assert.equal((await outbox()).length,0);});
  await t.test('active monitoring without affirmative consent stays silent and remembers identities',async()=>{assert.equal((await db.query('select count(*)::int n from public.structured_media_email_preferences where enabled')).rows[0].n,0);await finish(await claim(),[article('without-consent')]);assert.equal((await outbox()).length,0);});
  await t.test('owner explicitly opts in independently of monitoring; cross-owner change denied',async()=>{const before=await row();assert.equal((await pref(true)).rows[0].enabled,true);assert.equal((await row()).monitoring_state,before.monitoring_state);assert.equal((await row()).media_revision,before.media_revision);await assert.rejects(pref(false,other),{code:'42501'});});
  await t.test('nonmatching observation is remembered without notification',async()=>{await finish(await claim(),[nonmatch],[]);assert.equal((await outbox()).length,0);});
  let lease;
  await t.test('one new match creates one owner-bound durable intent',async()=>{lease=await claim();assert.equal((await finish(lease,[new1])).outcome,'matching-items');const rows=await outbox();assert.equal(rows.length,1);assert.equal(rows[0].user_id,owner);assert.equal(rows[0].source_article_id,new1.identityKeys[0]);assert.equal(rows[0].article.source,'Synthetic Publisher');});
  await t.test('lost-response repeat cannot enqueue twice',async()=>{assert.equal((await finish(lease,[new1])).status,'skipped');assert.equal((await outbox()).length,1);});
  await t.test('known identities and unmatched candidates do not alert',async()=>{const r=await finish(await claim(),[new1,nonmatch],[new1]);assert.equal(r.outcome,'no-new-items');assert.equal((await outbox()).length,1);});
  await t.test('concurrent completion produces one winner and unique outbox row',async()=>{const lease=await claim();const results=await Promise.all([finish(lease,[new2]),finish(lease,[new2])]);assert.deepEqual(results.map(x=>x.status).sort(),['completed','skipped']);assert.equal((await outbox()).length,2);});
  await t.test('wrong owner cannot persist or notify',async()=>{const r=await finish(await claim(),[article('wrong')],undefined,true,other);assert.equal(r.status,'skipped');assert.equal((await outbox()).length,2);});
  // Release the previous valid lease before the next scenario; only local fixture RPC.
  await activate(false);await activate(true);
  await t.test('invalid notification URL rolls back snapshot, identities, outbox and lease release',async()=>{const lease=await claim(),before=await snapshot();const bad={...article('unsafe'),url:'javascript:alert(1)'};await assert.rejects(finish(lease,[bad]),{code:'22023'});assert.deepEqual(await snapshot(),before);assert.equal((await outbox()).length,2);assert.equal((await db.query('select count(*)::int n from public.media_watch_seen_articles where article_key=$1',[bad.identityKeys[0]])).rows[0].n,0);assert.equal((await db.query('select lease_token from public.structured_media_schedules where watch_id=$1',[id])).rows[0].lease_token,lease.lease_token);});
  await activate(false);await activate(true);
  await t.test('multiple matches enqueue independently; disabled intent generation remains silent',async()=>{await finish(await claim(),[article('multi1'),article('multi2')]);const n=(await outbox()).length;assert.equal(n,4);await finish(await claim(),[article('silent')],undefined,false);assert.equal((await outbox()).length,n);});
  await t.test('trusted claim exposes owner and structured discriminator only from saved Watch',async()=>{const n=(await outbox()).find(n=>n.status==='pending');const claimed=(await svc('select public.claim_media_watch_email_notification($1,$2) result',[n.id,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'])).rows[0].result;assert.equal(claimed.user_id,owner);assert.equal(claimed.is_structured,true);assert.equal(claimed.email,undefined);});
  await t.test('opt-out after claim cancels pending intents and blocks submission, without pausing or losing history',async()=>{const n=(await outbox()).find(n=>n.claim_token);const before=await snapshot(),prior=await outbox();await pref(false);assert.equal((await row()).monitoring_state,'monitoring');assert.deepEqual(await snapshot(),before);for(const old of prior){const now=(await outbox()).find(n=>n.id===old.id);assert.equal(now.status,'failed');assert.equal(now.last_error_code,old.status==='pending'?'EMAIL_OPTED_OUT':old.last_error_code);}assert.equal((await svc('select public.begin_media_watch_email_submission($1,$2) ok',[n.id,n.claim_token])).rows[0].ok,false);await pref(true);await finish(await claim(),[article('after-opt-in')]);});
  await t.test('pause cancels pending records and blocks submission after recipient lookup',async()=>{const n=(await outbox()).find(n=>n.status==='pending');await activate(false);assert((await outbox()).every(n=>n.status==='failed'));assert.equal((await outbox()).find(x=>x.id===n.id).last_error_code,'WATCH_CHANGED');assert.equal((await svc('select public.begin_media_watch_email_submission($1,$2) ok',[n.id,n.claim_token])).rows[0].ok,false);assert.equal(await claim(),undefined);});
  await t.test('deleted structured Watch is ineligible for delivery',async()=>{
   await activate(true);await finish(await claim(),[article('before-delete')]);const n=(await outbox()).find(n=>n.status==='pending');
   await db.transaction(async tx=>{await tx.exec("select set_config('request.jwt.claim.role','service_role',true);select set_config('watch_assistant.structured_rpc','persist.v1',true)");await tx.query('update public.watches set deleted_at=now() where id=$1',[id]);});
   assert.equal((await svc('select public.claim_media_watch_email_notification($1,$2) result',[n.id,'ffffffff-ffff-4fff-8fff-ffffffffffff'])).rows[0].result,null);
   assert.equal((await svc('select public.begin_media_watch_email_submission($1,$2) ok',[n.id,'ffffffff-ffff-4fff-8fff-ffffffffffff'])).rows[0].ok,false);
  });
  await t.test('nonempty first baseline suppresses all historical matches',async()=>{
   const second='99999999-9999-4999-8999-999999999999',title='Second synthetic baseline';
   await svc("select public.persist_structured_watch_v1($1,$2,'create',$3,0,$4,$5,$6,$7,$8)",[owner,second,'88888888-8888-4888-8888-888888888888',title,source,definition,fingerprint(definition),fingerprint({definition,source,title})]);
   await pref(true,owner,second);await svc('select public.set_structured_media_monitoring($1,$2,1,true,3600)',[second,owner]);
   const leased=(await svc('select public.claim_structured_media_checks($1,3) result',[[owner]])).rows[0].result;assert.equal(leased.length,1);assert.equal(leased[0].id,second);
   const before=(await outbox()).length;
   const r=(await svc('select public.finish_structured_media_check_with_notifications($1,$2,2,$3,now(),$4,$5,$6,null,null,$6,null,true) result',[second,owner,leased[0].lease_token,'Synthetic',source.url,[baseline]])).rows[0].result;
   assert.equal(r.outcome,'baseline');assert.equal((await outbox()).length,before);
  });
  await t.test('opt-out preserves sent audit, deduplication history and active monitoring',async()=>{
   const second='99999999-9999-4999-8999-999999999999';await db.query('update public.structured_media_schedules set next_due_at=now() where watch_id=$1',[second]);
   const lease=(await svc('select public.claim_structured_media_checks($1,3) result',[[owner]])).rows[0].result[0];assert.equal(lease.id,second);
   const items=[article('sent-audit')];await svc('select public.finish_structured_media_check_with_notifications($1,$2,2,$3,now(),$4,$5,$6,$7,$8,$6,null,true)',[second,owner,lease.lease_token,'Synthetic',source.url,items,lease.media_watch_snapshots.checked_at,lease.media_watch_snapshots.items]);
   const n=(await outbox()).find(n=>n.watch_id===second),token='44444444-4444-4444-8444-444444444444';
   await svc('select public.claim_structured_media_test_email_notification($1,$2,$3)',[n.id,token,[owner]]);assert.equal((await svc('select public.begin_media_watch_email_submission($1,$2) ok',[n.id,token])).rows[0].ok,true);
   assert.equal((await svc('select public.complete_media_watch_email_notification($1,$2,$3) ok',[n.id,token,'synthetic-provider-evidence'])).rows[0].ok,true);
   const sent=(await outbox()).find(x=>x.id===n.id),keys=await db.query('select article_key from public.media_watch_seen_articles where watch_id=$1 order by article_key',[second]);
   await pref(false,owner,second);assert.deepEqual((await outbox()).find(x=>x.id===n.id),sent);assert.equal(sent.status,'sent');assert.deepEqual((await db.query('select article_key from public.media_watch_seen_articles where watch_id=$1 order by article_key',[second])).rows,keys.rows);assert.equal((await db.query('select monitoring_state from public.watches where id=$1',[second])).rows[0].monitoring_state,'monitoring');
  });
  await t.test('legacy SQL claim and submission preserve their existing contract',async()=>{
   const legacy='77777777-7777-4777-8777-777777777777';
   await db.query("insert into public.watches(id,user_id,title,type,category,monitoring_source,watch_definition,monitoring_state,current_status) values($1,$2,'Legacy','media_news','news',$3,$4,'monitoring','watching')",[legacy,owner,source,{inputType:'text',category:'news',request:'Jannik Sinner',mediaMention:{subjects:['Jannik Sinner'],matchMode:'all'}}]);
   const n=(await db.query("insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article) values($1,$2,'legacy-fixture','Legacy',$3) returning id",[legacy,owner,{title:'Legacy fixture',url:'https://example.test/legacy'}])).rows[0];
   assert.equal((await svc('select public.claim_structured_media_test_email_notification($1,$2,$3) result',[n.id,'55555555-5555-4555-8555-555555555555',[owner]])).rows[0].result,null);
   const token='66666666-6666-4666-8666-666666666666';const claimed=(await svc('select public.claim_media_watch_email_notification($1,$2) result',[n.id,token])).rows[0].result;
   assert.equal(claimed.user_id,owner);assert.equal(claimed.is_structured,undefined);
   assert.equal((await svc('select public.begin_media_watch_email_submission($1,$2) ok',[n.id,token])).rows[0].ok,true);
   assert.equal((await svc('select public.get_media_watch_notification_locale($1) locale',[owner])).rows[0].locale,'en');
  });
  assert.equal((await row()).watch_definition.definitionVersion,definition.definitionVersion);
 }finally{globalThis.fetch=original;await db.close();}
});

test('intent and delivery feature gates fail closed and preserve Staging/owner boundary',()=>{
 for(const changes of [{STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:undefined},{VERCEL_ENV:'production'},{SUPABASE_URL:'https://forbidden.example.test'}])assert.equal(structuredMediaNotificationIntentsEnabled({...env,...changes}),false);
 assert.equal(structuredMediaNotificationIntentsEnabled(env),true);assert.equal(structuredMediaEmailDeliveryAllowed(env,owner),false);assert.equal(structuredMediaEmailDeliveryAllowed({...env,STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true'},other),false);
});
test('scheduler selects new atomic RPC only when explicit intent gate is authorized',async()=>{
 for(const enabled of [false,true]){const calls=[];const definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);const client={rpc:async(name,p)=>{calls.push([name,p]);return name==='claim_structured_media_checks'?{data:[{id,user_id:owner,monitoring_state:'monitoring',watch_definition:definition,monitoring_source:source,media_revision:2,lease_token:'synthetic'}]}:{data:{status:'completed',outcome:'baseline'}};}};
 const r=await runStructuredMediaMonitoring({client,env:{...env,STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:enabled?'true':'false'},schedulerAuthorized:true,fetchFeed:async()=>({checkedAt:new Date().toISOString(),source:{title:'Fixture'},items:[]})});assert.equal(r.failed,0);assert.equal(calls[1][0],enabled?'finish_structured_media_check_with_notifications':'finish_structured_media_check');assert.equal(calls[1][1].p_enqueue_notifications,enabled?true:undefined);assert.equal(r.notifications,'disabled');}
});
test('Structured mail without the independent Staging test gate stays disabled',async()=>{
 let touched=0;const result=await processMediaWatchEmailNotifications({env:{...env,MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true'},client:new Proxy({},{get(){touched++;throw Error('Forbidden');}}),sender:()=>assert.fail('Real delivery forbidden')});assert.equal(result.status,'disabled');assert.equal(touched,0);
});
test('Production worker fails closed on a Structured outbox row before recipient lookup',async()=>{
 const failures=[];const query={select(){return this;},eq(){return this;},or(){return this;},order(){return this;},range:async()=>({data:[{id:'synthetic-notification'}]})};
 const client={from:()=>query,auth:{admin:{getUserById:()=>assert.fail('Recipient lookup forbidden')}},rpc:async(name,p)=>name==='claim_media_watch_email_notification'?{data:{is_structured:true,user_id:owner}}:(failures.push(p.p_error_code),{data:true})};
 const result=await processMediaWatchEmailNotifications({client,env:{...env,VERCEL_ENV:'production',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',RESEND_API_KEY:'dummy-offline',WATCH_EMAIL_FROM:'watch@davidlangdesign.com',WATCH_APP_BASE_URL:'https://app.example.test'},sender:()=>assert.fail('Provider forbidden')});
 assert.equal(result.sentCount,0);assert.equal(result.failedCount,1);assert.deepEqual(failures,['STRUCTURED_EMAIL_DISABLED']);assert(!JSON.stringify(result).includes('dummy-offline'));
});
for(const locale of ['fr','en'])test('Structured content reuses safe '+locale+' publisher template',()=>{
 const email=renderMediaWatchEmail({locale,watchId:id,watchTitle:'Jannik <script>',article:{title:'A & B <img>',source:'Publisher',url:'https://example.test/news',publishedAt:'2026-10-15',summary:'Publisher excerpt'},baseUrl:'https://app.example.test'});assert(email.html.includes('lang="'+locale+'"'));assert(!email.html.includes('<script>'));assert(!email.html.includes('<img>'));assert(email.html.includes('&lt;img&gt;'));assert(email.text.includes('Publisher'));assert(email.detailUrl.startsWith('https://app.example.test/'));assert.throws(()=>renderMediaWatchEmail({locale,watchId:id,article:{url:'https://user:password@example.test'},baseUrl:'https://app.example.test'}));
});
