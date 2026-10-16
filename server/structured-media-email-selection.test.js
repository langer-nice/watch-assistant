import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
import {processMediaWatchEmailNotifications} from './media-watch-notifications.js';
import {createCompanyMonitoringCronHandler} from './company-monitoring-cron.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const watchId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',otherWatch='dddddddd-dddd-4ddd-8ddd-dddddddddddd',legacyWatch='ffffffff-ffff-4fff-8fff-ffffffffffff';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const selection={notificationId:ids[1],watchId,ownerId:owner};
const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',VERCEL_URL:'synthetic-preview.vercel.app',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'owner@example.test',RESEND_API_KEY:'dummy-offline',WATCH_EMAIL_FROM:'watch@davidlangdesign.com',WATCH_APP_BASE_URL:'https://synthetic-preview.vercel.app'};

test('exact Structured selection uses real SQL claim and worker with three eligible records',async t=>{
 const db=new PGlite(),original=globalThis.fetch;let totalMockSubmissions=0,criticalMockSubmissions=0,claims=0,submissions=0;
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const f of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')&&f<='20261015200000_structured_media_notifications.sql'))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  globalThis.fetch=()=>assert.fail('Real network/Resend forbidden');
  const svc=(sql,args=[])=>db.transaction(async tx=>{await tx.exec("set local role service_role;select set_config('request.jwt.claim.role','service_role',true)");return tx.query(sql,args);});
  await db.query("insert into auth.users values($1,'owner@example.test',now()),($2,'other@example.test',now())",[owner,other]);
  const definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
  await svc("select public.persist_structured_watch_v1($1,$2,'create',$3,0,'Synthetic selector fixture',$4,$5,$6,$7)",[owner,watchId,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',source,definition,fingerprint(definition),fingerprint({source,definition,title:'Synthetic selector fixture'})]);
  const pref=enabled=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',$1,true)",[owner]);return tx.query('select public.set_structured_media_email_preference($1,$2)',[watchId,enabled]);});
  const active=async enabled=>{const w=(await db.query('select media_revision from public.watches where id=$1',[watchId])).rows[0];await svc('select public.set_structured_media_monitoring($1,$2,$3,$4,3600)',[watchId,owner,w.media_revision,enabled]);};
  await pref(true);await active(true);
  await db.query("insert into public.watches(id,user_id,title,type,category,monitoring_source,watch_definition,monitoring_state,current_status) values($1,$2,'Synthetic legacy','media_news','news',$3,$4,'monitoring','watching')",[legacyWatch,owner,source,{inputType:'text',category:'news',request:'Jannik Sinner',mediaMention:{subjects:['Jannik Sinner'],matchMode:'all'}}]);
  await svc("select public.persist_structured_watch_v1($1,$2,'create',$3,0,'Other synthetic Structured Watch',$4,$5,$6,$7)",[owner,otherWatch,'99999999-9999-4999-8999-999999999999',source,definition,fingerprint(definition),fingerprint({source,definition,title:'Other synthetic Structured Watch'})]);
  const seed=async()=>{for(let i=0;i<3;i++)await db.query("insert into public.media_watch_notifications(id,watch_id,user_id,source_article_id,watch_title,article,article_position) values($1,$2,$3,$4,'Synthetic selector fixture',$5,$6)",[ids[i],watchId,owner,'synthetic-'+i,{title:'Synthetic Jannik Sinner '+i,url:'https://example.test/selector/'+i,source:'Synthetic Test Publisher'},i]);};
  const rows=async()=>(await db.query('select * from public.media_watch_notifications order by id')).rows;
  const reset=async()=>{await pref(true);await active(true);await db.query("update auth.users set email='owner@example.test',email_confirmed_at=now() where id=$1",[owner]);await db.exec('delete from public.media_watch_notifications');await seed();claims=0;submissions=0;};
  const client={
   from(table){assert.equal(table,'media_watch_notifications');const predicates=[],args=[];const add=(sql,v)=>{args.push(v);predicates.push(sql.replace('?',String(args.length)));};
    const columns={status:'n.status',id:'n.id',watch_id:'n.watch_id',user_id:'n.user_id','watches.user_id':'w.user_id','watches.type':'w.type','watches.watch_definition->>definitionVersion':"w.watch_definition->>'definitionVersion'"};
    const q={select(){return q;},eq(k,v){assert(columns[k]);add(columns[k]+'=$?',v);return q;},in(k,v){assert.equal(k,'watches.user_id');add('w.user_id=any($?::uuid[])',v);return q;},is(k,v){assert.equal(k,'submission_started_at');assert.equal(v,null);predicates.push('n.submission_started_at is null');return q;},or(x){const prefix='claim_token.is.null,claimed_at.lt.';assert(x.startsWith(prefix));add('(n.claim_token is null or n.claimed_at<$?::timestamptz)',x.slice(prefix.length));return q;},order(){return q;},async range(a,b){assert.equal(a,0);assert.equal(b,0);return{data:(await db.query('select n.id from public.media_watch_notifications n join public.watches w on w.id=n.watch_id where '+predicates.join(' and ')+' order by n.created_at,n.watch_id,n.article_position,n.id limit 1',args)).rows,error:null};}};return q;
   },
   auth:{admin:{async getUserById(user){return{data:{user:(await db.query('select id,email,email_confirmed_at from auth.users where id=$1',[user])).rows[0]},error:null};}}},
   async rpc(name,p){assert(['claim_structured_media_test_email_notification','get_media_watch_notification_locale','begin_media_watch_email_submission','complete_media_watch_email_notification','fail_media_watch_email_notification'].includes(name));
    const meta=(await db.query("select proargnames from pg_proc where pronamespace='public'::regnamespace and proname=$1",[name])).rows;assert.equal(meta.length,1);const keys=meta[0].proargnames;assert.equal(keys.length,Object.keys(p).length);
    const result=(await svc('select public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)).join(',')+') result',keys.map(k=>p[k]))).rows[0].result;
    if(name==='claim_structured_media_test_email_notification'&&result)claims++;if(name==='begin_media_watch_email_submission'&&result)submissions++;
    return{data:result,error:null};
   }
  };
  const sender=async message=>{totalMockSubmissions++;assert.equal(message.to,'owner@example.test');return{id:'synthetic-provider'};};
  const run=(options={})=>processMediaWatchEmailNotifications({client,env,sender,notificationSelection:selection,...options});
  await t.test('select middle of three, claim/send once and leave other two byte-for-byte unchanged',async()=>{
   await reset();const before=await rows();assert.equal(before.filter(n=>n.status==='pending').length,3);const n=totalMockSubmissions,r=await run();criticalMockSubmissions=totalMockSubmissions-n;assert.equal(criticalMockSubmissions,1);assert.equal(r.sentCount,1);assert.equal(claims,1);assert.equal(submissions,1);const after=await rows();assert.equal(after[1].status,'sent');assert.equal(after[1].watch_id,watchId);assert.equal(after[1].user_id,owner);assert.deepEqual(after[0],before[0]);assert.deepEqual(after[2],before[2]);
  });
  for(const scenario of ['unknown','cancelled','delivered','claimed','uncertain-pending','uncertain-failed','another-owner','another-watch','legacy'])await t.test('zero claims, no fallback: '+scenario,async()=>{
   await reset();let wanted={...selection};
   if(scenario==='unknown')wanted.notificationId='99999999-9999-4999-8999-999999999999';
   if(scenario==='cancelled')await db.query("update public.media_watch_notifications set status='failed',last_error_code='WATCH_CHANGED' where id=$1",[ids[1]]);
   if(scenario==='delivered')await db.query("update public.media_watch_notifications set status='sent',sent_at=now(),provider_message_id='synthetic-sent' where id=$1",[ids[1]]);
   if(scenario==='claimed')await db.query('update public.media_watch_notifications set claim_token=$2,claimed_at=now() where id=$1',[ids[1],other]);
   if(scenario.startsWith('uncertain'))await db.query("update public.media_watch_notifications set status=$2,claim_token=$3,claimed_at=now()-interval '1 hour',submission_started_at=now()-interval '1 hour',attempt_count=1,last_error_code='EMAIL_DELIVERY_OUTCOME_UNKNOWN' where id=$1",[ids[1],scenario==='uncertain-pending'?'pending':'failed',other]);
   if(scenario==='another-owner')await db.query('update public.media_watch_notifications set user_id=$2 where id=$1',[ids[1],other]);
   if(scenario==='another-watch'||scenario==='legacy')await db.query('update public.media_watch_notifications set watch_id=$2 where id=$1',[ids[1],scenario==='legacy'?legacyWatch:otherWatch]);
   if(scenario==='legacy')wanted.watchId=legacyWatch;
   const before=await rows(),n=totalMockSubmissions;const r=await run({notificationSelection:wanted});assert.equal(claims,0);assert.equal(r.sentCount,0);assert.equal(totalMockSubmissions,n);assert.deepEqual(await rows(),before);
  });
  for(const scenario of ['missing-consent','opt-out','paused','unconfirmed','invalid-recipient','outside-allowlist'])await t.test('existing eligibility/recipient guard: '+scenario,async()=>{
   await reset();if(scenario==='missing-consent')await db.query('delete from public.structured_media_email_preferences where watch_id=$1',[watchId]);if(scenario==='opt-out')await pref(false);if(scenario==='paused')await active(false);
   if(scenario==='unconfirmed')await db.query('update auth.users set email_confirmed_at=null where id=$1',[owner]);if(scenario==='invalid-recipient')await db.query('update auth.users set email=null where id=$1',[owner]);if(scenario==='outside-allowlist')await db.query("update auth.users set email='outside@example.test' where id=$1",[owner]);
   const n=totalMockSubmissions,r=await run();assert.equal(r.sentCount,0);assert.equal(totalMockSubmissions,n);assert.equal(submissions,0);
  });
  for(const changes of [{STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'false'},{SUPABASE_URL:'https://wrong.example.test'},{VERCEL_GIT_COMMIT_REF:'wrong'},{VERCEL_ENV:'production'}])await t.test('selector scope rejected before SQL: '+Object.keys(changes)[0],async()=>{
   const forbidden=new Proxy({},{get(){assert.fail('Outbox access forbidden');}});const n=totalMockSubmissions;const r=await run({client:forbidden,env:{...env,...changes}});assert.equal(r.sentCount,0);assert.equal(totalMockSubmissions,n);
  });
  await t.test('unknown/partial/malformed selector never falls back',async()=>{for(const wanted of [null,{}, {...selection,notificationId:'invalid'}, {...selection,ownerId:other}, {...selection,extra:true}]){const forbidden=new Proxy({},{get(){assert.fail('Outbox access forbidden');}});assert.equal((await run({client:forbidden,notificationSelection:wanted})).status,'invalid-selection');}});
  await t.test('inconsistent lookup response cannot claim another ID',async()=>{await reset();const before=await rows();const q={select(){return q;},eq(){return q;},in(){return q;},is(){return q;},or(){return q;},order(){return q;},range:async()=>({data:[{id:ids[0]}],error:null})};await assert.rejects(run({client:{...client,from:()=>q}}),{code:'DATABASE_ERROR'});assert.equal(claims,0);assert.deepEqual(await rows(),before);});
  await t.test('atomic concurrent exact claims yield one provider mock submission',async()=>{await reset();const n=totalMockSubmissions;await Promise.all([run(),run()]);assert.equal(totalMockSubmissions-n,1);assert.equal(claims,1);assert.equal((await rows())[1].status,'sent');assert.equal((await rows()).filter(n=>n.status==='pending').length,2);});
  await t.test('expired pre-submission claim retains existing safe recovery semantics',async()=>{await reset();await db.query("update public.media_watch_notifications set claim_token=$2,claimed_at=now()-interval '1 hour' where id=$1",[ids[1],other]);assert.equal((await run()).sentCount,1);});
  for(const code of ['EMAIL_PROVIDER_RETRYABLE','EMAIL_DELIVERY_OUTCOME_UNKNOWN'])await t.test('provider '+code+' stays terminal, no blind resend',async()=>{await reset();let sends=0;const fail=async()=>{sends++;totalMockSubmissions++;throw Object.assign(Error('synthetic-private-detail'),{code});};await run({sender:fail});await run({sender:fail});assert.equal(sends,1);assert.equal((await rows())[1].status,'failed');assert.equal((await rows())[1].last_error_code,code);assert.equal((await rows())[0].status,'pending');assert.equal((await rows())[2].status,'pending');});
  await t.test('normal no-ID Staging worker retains first eligible selection',async()=>{await reset();const r=await run({notificationSelection:undefined});assert.equal(r.sentCount,1);assert.equal((await rows())[0].status,'sent');assert.equal((await rows())[1].status,'pending');});
  await t.test('existing SQL claim permission stays service-only',async()=>{for(const role of ['anon','authenticated'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);return tx.query('select public.claim_structured_media_test_email_notification($1,$2,$3)',[ids[1],other,[owner]]);}),{code:'42501'});});
  t.diagnostic(JSON.stringify({criticalMockSubmissions,totalMockSubmissions,realProviderSubmissions:0,migrationRequired:false}));
 }finally{globalThis.fetch=original;await db.close();}
});

const query=new URLSearchParams({scope:'structured-media-email-test',...selection}).toString();
for(const [name,url,changes,authorization,status] of [
 ['authorized exact selector','?'+query,{},'Bearer synthetic',200],
 ['unauthenticated','?'+query,{},'Bearer wrong',401],
 ['wrong branch','?'+query,{VERCEL_GIT_COMMIT_REF:'other'},'Bearer synthetic',404],
 ['Production','?'+query,{VERCEL_ENV:'production'},'Bearer synthetic',404],
 ['outside delivery-only scope','?'+query.replace('structured-media-email-test','structured-media'),{},'Bearer synthetic',400],
 ['duplicate ID','?'+query+'&notificationId='+ids[0],{},'Bearer synthetic',400],
 ['partial selector','?scope=structured-media-email-test&notificationId='+ids[0],{},'Bearer synthetic',400],
])test('authenticated existing route: '+name,async()=>{
 let calls=0,body;const handler=createCompanyMonitoringCronHandler({env:{...env,...changes,CRON_SECRET:'synthetic'},clientFactory:()=>({}),runner:()=>assert.fail('No legacy processing'),mediaRunner:()=>assert.fail('No unrelated processing'),structuredRunner:()=>assert.fail('No monitoring'),structuredNotificationProcessor:async p=>{calls++;assert.deepEqual(p.notificationSelection,selection);return{status:'success',sentCount:1};}});
 const response={setHeader(){},end(raw){body=JSON.parse(raw);}};await handler({method:'GET',url:'/api/cron/company-monitoring'+url,headers:{authorization}},response);assert.equal(response.statusCode,status);assert.equal(calls,status===200?1:0);if(status===200)assert.equal(body.notifications.sentCount,1);
});
