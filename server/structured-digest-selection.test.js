import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
import {processMediaWatchDigests} from './media-watch-digest.js';
import {processMediaWatchEmailNotifications} from './media-watch-notifications.js';
import {createCompanyMonitoringCronHandler} from './company-monitoring-cron.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env={CRON_SECRET:'synthetic-only',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',VERCEL_URL:'synthetic-preview.vercel.app',WATCH_APP_BASE_URL:'https://synthetic-preview.vercel.app',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'owner@example.test',RESEND_API_KEY:'synthetic-not-real',WATCH_EMAIL_FROM:'notifications@watch.davidlangdesign.com',MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true',MEDIA_WATCH_DIGEST_SEND_HOUR_UTC:'0'};
const tuple=()=>({digestId:randomUUID(),watchId:randomUUID(),ownerId:owner});
const forbidden=new Proxy({},{get(){assert.fail('No database access allowed');}});

test('exact digest rejects malformed tuples, mixed selectors, disabled gates and Production before SQL',async()=>{
 const selection=tuple(),sender=()=>assert.fail('No provider');
 for(const digestSelection of [null,{},[],{...selection,digestId:'bad'},{...selection,ownerId:other},{...selection,extra:1},{watchId:selection.watchId,ownerId:owner}]){
  assert.equal((await processMediaWatchEmailNotifications({client:forbidden,env,digestSelection,sender})).status,'invalid-selection');
  assert.equal((await processMediaWatchDigests({client:forbidden,env,digestSelection,sender})).status,'invalid-selection');
 }
 assert.equal((await processMediaWatchEmailNotifications({client:forbidden,env,digestSelection:selection,notificationSelection:{},sender})).status,'invalid-selection');
 for(const changes of [{VERCEL_ENV:'production'},{SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co'},{VERCEL_PROJECT_ID:'wrong'},{VERCEL_GIT_COMMIT_REF:'wrong'},{WATCH_APP_BASE_URL:'https://wrong.example.test'},{STRUCTURED_WATCH_BACKEND_ENABLED:'false'},{STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'false'},{STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'false'},{WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},{MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},{MEDIA_WATCH_DAILY_DIGEST_ENABLED:'false'},{MEDIA_WATCH_DIGEST_SEND_HOUR_UTC:'24'},{STRUCTURED_WATCH_TEST_USER_IDS:other},{STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:''}]){
  for(const process of [processMediaWatchDigests,processMediaWatchEmailNotifications]){
   const result=await process({client:forbidden,env:{...env,...changes},digestSelection:selection,sender});
   assert(['disabled','invalid-selection'].includes(result.status),JSON.stringify(changes));
  }
 }
});

test('existing authenticated endpoint routes exact digest only, preserving immediate and no-selector contracts',async()=>{
 const selection=tuple();let calls=0,received;
 const handler=createCompanyMonitoringCronHandler({env,clientFactory:()=>{calls++;return forbidden;},structuredNotificationProcessor:async options=>{received=options;return{status:'success'};},logger:{error(){}}});
 const invoke=async(query,authorization='Bearer synthetic-only',method='GET')=>{let body;const response={setHeader(){},end(value){body=JSON.parse(value);}};await handler({url:'/?scope=structured-media-email-test'+query,headers:{authorization},method},response);return{status:response.statusCode,body};};
 const q='&'+new URLSearchParams(selection);
 assert.equal((await invoke(q)).status,200);assert.deepEqual(received.digestSelection,selection);assert.equal(received.notificationSelection,undefined);
 assert.equal((await invoke('&'+new URLSearchParams({notificationId:selection.digestId,watchId:selection.watchId,ownerId:owner}))).status,200);assert.equal(received.notificationSelection.notificationId,selection.digestId);assert.equal(received.digestSelection,undefined);
 assert.equal((await invoke('')).status,200);assert.equal(received.digestSelection,undefined);assert.equal(received.notificationSelection,undefined);
 const before=calls;
 for(const suffix of [q+'&notificationId='+randomUUID(),q+'&digestId='+randomUUID(),'&digestId='+selection.digestId,'&watchId='+selection.watchId,q.replace(owner,other),q.replace(selection.digestId,'bad')]){
  const result=await invoke(suffix);
  assert.equal(result.status,400);
 }
 assert.equal(calls,before);
 assert.equal((await invoke(q,'Bearer wrong')).status,401);assert.equal((await invoke(q,undefined,'POST')).status,405);
 let status;await handler({url:'/?scope=structured-media'+q,headers:{authorization:'Bearer synthetic-only'}},{setHeader(){},end(){status=this.statusCode;}});assert.equal(status,400);
});

test('exact selection with real isolated SQL: ownership, eligibility, atomic claim and no fallback',async t=>{
 const db=new PGlite(),fetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('External requests forbidden');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const f of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  const as=(role,user,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,user]);return tx.query(sql,args);});
  const svc=(sql,args)=>as('service_role',owner,sql,args),auth=(sql,args)=>as('authenticated',owner,sql,args);
  await db.query("insert into auth.users values($1,'owner@example.test',now()),($2,'other@example.test',now())",[owner,other]);
  const create=async(structured=true)=>{
   const id=randomUUID(),mutation=randomUUID(),definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
   if(structured){await svc("select public.persist_structured_watch_with_digest($1,$2,'create',$3,0,'Fixture',$4,$5,$6,$7)",[owner,id,mutation,source,definition,fingerprint(definition),fingerprint({title:'Fixture',definition,source})]);await auth('select public.set_media_watch_email_policy($1,$2,true)',[id,'daily_digest']);const revision=(await db.query('select media_revision from public.watches where id=$1',[id])).rows[0].media_revision;await svc('select public.set_structured_media_monitoring($1,$2,$3,true,3600)',[id,owner,revision]);}
   else{await auth("select public.persist_media_watch_with_digest($1,'Fixture',$2,$3,'monitoring',0,$4,false)",[id,source,{inputType:'text',category:'news',request:'Jannik Sinner',mediaMention:{subjects:['Jannik Sinner'],matchMode:'all'}},mutation]);await auth('select public.set_media_watch_email_policy($1,$2,true)',[id,'daily_digest']);}
   await db.query("insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article,article_position,created_at) values($1,$2,$3,'Fixture',$4,1,clock_timestamp())",[id,owner,'id:'+id,{title:'Jannik Sinner news',url:'https://example.test/'+id,source:'Publisher'}]);
   await svc('select public.prepare_media_watch_digests(0,$1,$2)',[[owner],structured]);
   const digest=(await db.query('select id from public.media_watch_digests where watch_id=$1',[id])).rows[0];assert(digest);
   return{digestId:digest.id,watchId:id,ownerId:owner};
  };
  let providerCalls=0,email='owner@example.test',confirmed=true;const rpcCalls=[];
  const client={from(){assert.fail('Exact digest must never scan immediate outbox');},auth:{admin:{getUserById:async()=>({data:{user:{email,email_confirmed_at:confirmed?'now':null}}})}},rpc:async(name,args)=>{
   rpcCalls.push(name);assert(!['prepare_media_watch_digests','pending_media_watch_digests','claim_media_watch_digest'].includes(name),'No batch fallback');
   assert(/^[a-z_]+$/.test(name));const entries=Object.entries(args);assert(entries.every(([key])=>/^[a-z_]+$/.test(key)));
   const q=await svc('select public.'+name+'('+entries.map(([key],i)=>key+'=> $'+(i+1)).join(',')+') result',entries.map(([,v])=>v));return{data:q.rows[0].result};
  }};
  const sender=async message=>{providerCalls++;assert.equal(message.to,'owner@example.test');assert.match(message.idempotencyKey,/^watch-digest-[a-f0-9]{64}$/);return{id:'synthetic-provider'};};
  const run=(selection,options={})=>processMediaWatchEmailNotifications({client,env,sender,digestSelection:selection,...options});
  const snapshot=async()=>({digests:(await db.query('select * from public.media_watch_digests order by id')).rows,notifications:(await db.query('select * from public.media_watch_notifications order by id')).rows});
  const unchanged=async(selection)=>{const before=await snapshot(),calls=providerCalls;const r=await run(selection);assert.equal(r.digests.claimedCount,0);assert.equal(providerCalls,calls);assert.deepEqual(await snapshot(),before);};
  const selections=[await create(),await create(),await create()];
  await t.test('three eligible digests: exact tuple sends one, leaves other digests/articles byte-for-byte unchanged',async()=>{
   const before=await snapshot(),selected=selections[1];assert.equal(before.digests.length,3);
   const result=await run(Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,v.toUpperCase()])));
   assert.equal(result.digests.sentCount,1);assert.equal(providerCalls,1);const after=await snapshot();
   for(const key of ['digests','notifications'])assert.deepEqual(after[key].filter(r=>r.watch_id!==selected.watchId),before[key].filter(r=>r.watch_id!==selected.watchId));
   assert.equal(after.digests.find(d=>d.id===selected.digestId).status,'sent');assert(!rpcCalls.includes('prepare_media_watch_digests'));
  });
  await t.test('absent digest, wrong Watch/owner and previously submitted digest cause no mutation or fallback',async()=>{
   await unchanged({...selections[0],digestId:randomUUID()});await unchanged({...selections[0],watchId:selections[2].watchId});
   const before=await snapshot();await run({...selections[0],ownerId:other},{env:{...env,STRUCTURED_WATCH_TEST_USER_IDS:owner+','+other}});assert.deepEqual(await snapshot(),before);
   await unchanged(selections[1]);
  });
  for(const status of ['cancelled','claimed','submitting','failed'])await t.test(status+' digest cannot be reclaimed, including expired claim',async()=>{
   const s=await create();await db.query("update public.media_watch_digests set status=$2,claim_token=$3,claimed_at=now()-interval '1 hour',submission_started_at=case when $2='submitting' then now() else null end where id=$1",[s.digestId,status,randomUUID()]);await unchanged(s);
  });
  for(const kind of ['consent','frequency','paused','future','no-articles','legacy'])await t.test('ineligible '+kind+' rejected without touching any row',async()=>{
   const s=await create(kind!=='legacy');
   if(kind==='consent')await db.query('update public.media_watch_email_policies set enabled=false where watch_id=$1',[s.watchId]);
   if(kind==='frequency')await db.query("update public.media_watch_email_policies set mode='immediate' where watch_id=$1",[s.watchId]);
   if(kind==='paused'){const revision=(await db.query('select media_revision from public.watches where id=$1',[s.watchId])).rows[0].media_revision;assert.equal((await svc('select public.set_structured_media_monitoring($1,$2,$3,false,3600) ok',[s.watchId,owner,revision])).rows[0].ok,true);}
   if(kind==='future')await db.query('update public.media_watch_digests set period=period+1 where id=$1',[s.digestId]);
   if(kind==='no-articles')await db.query("update public.media_watch_notifications set status='failed' where digest_id=$1",[s.digestId]);
   await unchanged(s);
  });
  await t.test('claim rejects null owner allowlist and invalid send hour without mutation',async()=>{
   const s=await create(),before=await snapshot();
   for(const [owners,hour] of [[null,0],[[other],0],[[owner],null],[[owner],24]])assert.equal((await svc('select public.claim_structured_media_test_digest($1,$2,$3,$4,$5,$6) result',[s.digestId,s.watchId,owner,randomUUID(),owners,hour])).rows[0].result,null);
   assert.deepEqual(await snapshot(),before);
  });
  await t.test('missing claim RPC fails closed without fallback or provider submission',async()=>{
   const s=await create(),before=await snapshot(),calls=providerCalls;let rpcCount=0;
   const result=await run(s,{client:{...client,rpc:async name=>{rpcCount++;assert.equal(name,'claim_structured_media_test_digest');return{error:{code:'PGRST202'}};}}});
   assert.equal(result.digests.failedCount,1);assert.equal(rpcCount,1);assert.equal(providerCalls,calls);assert.deepEqual(await snapshot(),before);
  });
  await t.test('concurrent exact deliveries have one claim and one mocked provider submission',async()=>{
   const s=await create(),before=providerCalls,results=await Promise.all([run(s),run(s)]);
   assert.equal(results.reduce((n,r)=>n+r.digests.sentCount,0),1);assert.equal(providerCalls-before,1);
  });
  for(const code of ['EMAIL_PROVIDER_RETRYABLE','EMAIL_DELIVERY_OUTCOME_UNKNOWN'])await t.test(code+' becomes terminal and exact retry never calls provider again',async()=>{
   const s=await create();let calls=0;const fail=async()=>{calls++;throw Object.assign(Error('Synthetic provider failure'),{code});};
   const result=await run(s,{sender:fail});assert.equal(result.digests.failedCount,1);assert.equal(calls,1);
   assert.equal((await db.query('select status from public.media_watch_digests where id=$1',[s.digestId])).rows[0].status,'failed');
   await run(s,{sender:fail});assert.equal(calls,1);
  });
  for(const kind of ['allowlist','unconfirmed'])await t.test('recipient '+kind+' blocks provider after exact claim',async()=>{
   const s=await create(),before=providerCalls;email=kind==='allowlist'?'other@example.test':'owner@example.test';confirmed=kind!=='unconfirmed';
   assert.equal((await run(s)).digests.failedCount,1);assert.equal(providerCalls,before);email='owner@example.test';confirmed=true;
  });
  await t.test('consent revoked after claim prevents submission at existing SQL boundary',async()=>{
   const s=await create(),before=providerCalls;const wrapped={...client,auth:{admin:{getUserById:async()=>{await auth('select public.set_structured_media_email_preference($1,false)',[s.watchId]);return{data:{user:{email:'owner@example.test',email_confirmed_at:'now'}}};}}}};
   assert.equal((await run(s,{client:wrapped})).digests.failedCount,1);assert.equal(providerCalls,before);
  });
  await t.test('new RPC is service-only; digest table grants stay closed to all clients',async()=>{
   const signature='public.claim_structured_media_test_digest(uuid,uuid,uuid,uuid,uuid[],integer)';
   for(const role of ['anon','authenticated','service_role']){
    assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,signature])).rows[0].ok,role==='service_role');
    assert.equal((await db.query("select has_table_privilege($1,'public.media_watch_digests','select') ok",[role])).rows[0].ok,false);
   }
   for(const role of ['anon','authenticated'])await assert.rejects(as(role,owner,'select public.claim_structured_media_test_digest($1,$2,$3,$4,$5,0)',[selections[0].digestId,selections[0].watchId,owner,randomUUID(),[owner]]),{code:'42501'});
  });
 }finally{globalThis.fetch=fetch;await db.close();}
});
