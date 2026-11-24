import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {processMediaWatchDigests,renderMediaWatchDigest} from './media-watch-digest.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const activation='2030-11-20T08:00:00Z',since='2030-11-01T00:00:00Z';
const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true',RESEND_API_KEY:'offline',WATCH_EMAIL_FROM:'Watch Assistant <alerts@davidlangdesign.com>',WATCH_APP_BASE_URL:'https://watch-assistant-omega.vercel.app',STRUCTURED_MEDIA_PRODUCTION_DIGEST_ENABLED:'true',STRUCTURED_MEDIA_PRODUCTION_DIGEST_ELIGIBLE_AFTER:since,STRUCTURED_MEDIA_RECOVERY_ENABLED:'true',STRUCTURED_MEDIA_RECOVERY_SINCE:activation};
test('bounded recovery uses real isolated SQL and fake providers only',async t=>{
 const db=new PGlite();const originalFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('External requests forbidden');
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create function public.recovery_test_clock() returns timestamptz language sql as $$select current_setting('test.clock')::timestamptz$$;
 set test.clock='2030-11-20T08:00:00Z';`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const name of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')&&f!=='20261022160000_private_morning_reports.sql'))await db.exec((await readFile(new URL(name,dir),'utf8')).replace('create extension if not exists pgcrypto;','').replaceAll('clock_timestamp()','public.recovery_test_clock()'));
 await db.exec("set test.clock='2030-11-24T07:16:00Z'");
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'fixture@example.test',now()),($2,'other@example.test',now())",[owner,other]);
 const svc=(sql,args=[])=>db.transaction(async tx=>{await tx.exec("set local role service_role;set local request.jwt.claim.role='service_role'");return tx.query(sql,args);});
 const call=async(name,args)=>{const entries=Object.entries(args);const q=await svc('select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result',entries.map(([,v])=>v));return q.rows[0].result;};
 const make=async({at='2030-11-23T06:35:00Z',published='2030-11-23T06:00:00Z',user=owner}={})=>{
  const watch=randomUUID(),id=randomUUID(),identity=randomUUID(),article={title:'A new confirmed result '+id,summary:'A new confirmed result '+id,url:'https://example.test/'+id,publishedAt:published,source:'Fixture'};
  await db.query("insert into public.watches(id,user_id,type,title,watch_definition,monitoring_source,monitoring_state,current_status,last_checked_at,last_change_item_id,last_change_url,last_change_summary) values($1,$2,'media_news','Fixture',$3,$4,'monitoring','watching','2030-11-24T06:35:00Z',$5,$6,$7)",[watch,user,{inputType:'text',category:'news',request:'Fixture',mediaMention:{subjects:['Fixture'],matchMode:'all'}},{type:'feed',url:'https://example.test/feed'},identity,article.url,article.summary]);
  await db.query("insert into public.v3_pilot_watches(watch_id,user_id,engine,instruction,understanding,last_judgment) values($1,$2,'wa-v3-evidence-refs.v1',$3,'{}',$4)",[watch,user,id,{action:'NO_ALERT',evidence_status:'CONFIRMED',condition_check:null}]);
  await db.query("insert into public.media_watch_email_policies(watch_id,user_id,mode,enabled,eligible_after) values($1,$2,'daily_digest',true,'2030-11-01')",[watch,user]);
  await db.query("insert into public.media_watch_notifications(id,watch_id,user_id,source_article_id,watch_title,article,article_position,created_at) values($1,$2,$3,$4,'Fixture',$5,0,$6)",[id,watch,user,identity,article,at]);
  return {id,watch,identity,article,user};
 };
 const eligible=x=>call('notification_recovery_eligible',{p_id:x.id,p_owner:x.user,p_since:since,p_activation:activation});
 const prep=()=>call('prepare_production_recovery_digests',{p_owners:[owner],p_since:since,p_activation:activation});
 const claim=(id,token=randomUUID(),owners=[owner])=>call('claim_production_recovery_digest',{p_id:id,p_token:token,p_owners:owners,p_since:since,p_activation:activation});
 const begin=(id,token)=>call('begin_production_recovery_digest',{p_id:id,p_token:token,p_owners:[owner],p_since:since,p_activation:activation});
 const disable=async x=>db.query("update public.watches set monitoring_state='paused' where id=$1",[x.watch]);
 for(const [label,change] of [
 ['already delivered',x=>db.query("update public.media_watch_notifications set status='sent',sent_at=now(),provider_message_id='fake' where id=$1",[x.id])],
 ['uncertain submission',x=>db.query("update public.media_watch_notifications set submission_started_at=now(),attempt_count=1,claim_token=gen_random_uuid(),claimed_at=now() where id=$1",[x.id])],
 ['intentional suppression',x=>db.query("update public.media_watch_notifications set last_error_code='EMAIL_OPTED_OUT' where id=$1",[x.id])],
 ['withdrawn consent',x=>db.query('update public.media_watch_email_policies set enabled=false where watch_id=$1',[x.watch])],
 ['changed preference',x=>db.query("update public.media_watch_email_policies set mode='immediate' where watch_id=$1",[x.watch])],
 ['paused Watch',disable],
 ['deleted Watch',x=>db.query('update public.watches set deleted_at=now() where id=$1',[x.watch])],
 ['superseded development',x=>db.query("update public.watches set last_change_item_id='newer-development' where id=$1",[x.watch])],
 ['no check after missed daily opportunity',x=>db.query("update public.watches set last_checked_at='2030-11-23T06:35:01Z' where id=$1",[x.watch])],
 ['failed current check',x=>db.query("update public.watches set last_check_error_code='V3_PILOT_CHECK_FAILED' where id=$1",[x.watch])],
 ['condition no longer met',x=>db.query(`update public.v3_pilot_watches set last_judgment='{"action":"NO_ALERT","condition_check":{"condition_satisfied":false}}' where watch_id=$1`,[x.watch])],
 ['unknown current relevance',x=>db.query(`update public.v3_pilot_watches set last_judgment='{"action":"NO_ALERT","evidence_status":"INSUFFICIENT"}' where watch_id=$1`,[x.watch])],
 ['unknown source URL',async x=>{await db.query("update public.media_watch_notifications set article=article-'url' where id=$1",[x.id]);await db.query('update public.watches set last_change_url=null where id=$1',[x.watch]);}],
 ['unknown source date',x=>db.query("update public.media_watch_notifications set article=article-'publishedAt' where id=$1",[x.id])],
 ['malformed source date',x=>db.query(`update public.media_watch_notifications set article=jsonb_set(article,'{publishedAt}','"private invalid"') where id=$1`,[x.id])],
 ])await t.test(label+' remains unsent',async()=>{const x=await make();assert(await eligible(x));await change(x);assert.equal(await eligible(x),false);await disable(x);});
 await t.test('normal daily eligibility unchanged; grace and historical boundaries fail closed',async()=>{
  for(const args of [{at:'2030-11-24T06:35:00Z',published:'2030-11-24T06:00:00Z'},{at:'2030-11-21T06:35:00Z',published:'2030-11-21T06:00:00Z'},{at:'2026-11-12T06:35:00Z',published:'2026-11-11T06:00:00Z'},{published:'2030-04-21T06:00:00Z'}]){const x=await make(args);assert.equal(await eligible(x),false);await disable(x);}
  const x=await make({at:'2030-11-24T06:35:00Z',published:'2030-11-24T06:00:00Z'});const ids=await call('prepare_production_structured_digests',{p_owners:[owner],p_since:since});assert.equal(ids.length,1);const d=await call('claim_production_structured_digest',{p_id:ids[0],p_token:randomUUID(),p_owners:[owner],p_since:since});assert(d&&!d.recovery);await disable(x);
 });
 await t.test('seven pre-activation historical rows remain byte-for-byte unchanged',async()=>{
  const rows=[];for(const day of [12,12,12,19,19,21,21])rows.push(await make({at:`2026-11-${day}T06:35:00Z`,published:`2026-11-${day}T06:00:00Z`}));
  const ids=rows.map(x=>x.id),before=JSON.stringify((await db.query('select * from public.media_watch_notifications where id=any($1) order by id',[ids])).rows);
  await prep();assert.equal(before,JSON.stringify((await db.query('select * from public.media_watch_notifications where id=any($1) order by id',[ids])).rows));
  for(const x of rows){assert.equal(await eligible(x),false);await disable(x);}
 });
 await t.test('immutable migration floor and missing/future activation cannot reopen backlog',async()=>{const x=await make();for(const value of [null,'2020-01-01T00:00:00Z','2031-01-01T00:00:00Z'])assert.equal(await call('notification_recovery_eligible',{p_id:x.id,p_owner:x.user,p_since:since,p_activation:value}),false);await disable(x);});
 await t.test('same development already delivered under a different identity is excluded',async()=>{const x=await make();await db.query("insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article,article_position,status,sent_at,provider_message_id,created_at) values($1,$2,'different-identity','Fixture',$3,0,'sent',now(),'fake','2030-11-23T09:00Z')",[x.watch,x.user,x.article]);assert.equal(await eligible(x),false);await disable(x);});
 await t.test('disabled and removed accounts cannot recover',async()=>{const x=await make();await db.query("update auth.users set banned_until='2031-01-01' where id=$1",[owner]);assert.equal(await eligible(x),false);await db.query('update auth.users set banned_until=null,deleted_at=now() where id=$1',[owner]);assert.equal(await eligible(x),false);await db.query('update auth.users set deleted_at=null where id=$1',[owner]);await disable(x);});
 await t.test('atomic preparation rollback leaves original notification pending',async()=>{const x=await make();await db.exec(`create function public.reject_recovery_fixture() returns trigger language plpgsql as $$begin raise exception 'simulated database outage';end$$;create trigger reject_recovery_fixture before update of digest_id on public.media_watch_notifications for each row execute function public.reject_recovery_fixture();`);await assert.rejects(prep(),/simulated database outage/);const row=(await db.query('select digest_id,status from public.media_watch_notifications where id=$1',[x.id])).rows[0];assert.deepEqual(row,{digest_id:null,status:'pending'});await db.exec('drop trigger reject_recovery_fixture on public.media_watch_notifications;drop function public.reject_recovery_fixture()');await disable(x);});
 await t.test('normal preparation missed one day; concurrent recovery workers and repeated claims are idempotent',async()=>{
  const x=await make(),foreign=await make({user:other});const snapshot=JSON.stringify((await db.query('select * from public.media_watch_notifications where id=$1',[foreign.id])).rows);
  const [a,b]=await Promise.all([prep(),prep()]);const id=a[0]||b[0];assert(id);assert.equal(new Set([...a,...b]).size,1);assert.equal((await prep())[0],id);
  assert.equal(await claim(id,randomUUID(),[other]),null);
  const token=randomUUID();const [one,two]=await Promise.all([claim(id,token),claim(id)]);assert.equal([one,two].filter(Boolean).length,1);assert(one.recovery);assert.equal(one.articles[0].article.publishedAt,x.article.publishedAt);
  assert.equal(await call('claim_media_watch_digest',{p_id:id,p_token:randomUUID(),p_owners:[owner],p_structured:true}),null);
  assert.equal(snapshot,JSON.stringify((await db.query('select * from public.media_watch_notifications where id=$1',[foreign.id])).rows));
  await db.query("update public.media_watch_digests set claimed_at='2030-11-24T06:00Z' where id=$1",[id]);const retry=randomUUID();assert(await claim(id,retry));assert(await begin(id,retry));
  assert.equal(await claim(id),null);await call('finish_media_watch_digest',{p_id:id,p_token:retry,p_provider:'fake-accepted',p_error:null});assert.equal(await claim(id),null);assert.equal(await eligible(x),false);await disable(x);await disable(foreign);
 });
 await t.test('rechecks consent and supersession after claim before submission',async()=>{const x=await make();const [id]=await prep(),token=randomUUID();assert(await claim(id,token));await db.query("update public.watches set last_change_item_id='newer' where id=$1",[x.watch]);assert.equal(await begin(id,token),false);assert.equal((await db.query('select attempt_count from public.media_watch_notifications where id=$1',[x.id])).rows[0].attempt_count,0);await disable(x);});
 await t.test('crash after begin remains uncertain and never automatically retries',async()=>{const x=await make();const [id]=await prep(),token=randomUUID();assert(await claim(id,token));assert(await begin(id,token));await db.query("update public.media_watch_digests set claimed_at='2030-11-23' where id=$1",[id]);assert.equal(await claim(id),null);assert.equal(await eligible(x),false);await disable(x);});
 await t.test('RPCs are not callable by authenticated or anonymous roles',async()=>{for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(db.query('select public.prepare_production_recovery_digests($1,$2,$3)',[[owner],since,activation]),/permission denied/);await assert.rejects(db.query('select public.fail_v3_pilot_check_diagnostic($1,$2,$3)',[owner,other,{}]),/permission denied/);}finally{await db.exec('reset role');}}});
 await t.test('durable diagnostics: sanitized stages, fenced attempts, retry state and historical compatibility',async()=>{
  const x=await make();await db.query("update public.v3_pilot_watches set history='[{\"at\":\"2030-11-22T06:00:00Z\",\"status\":\"failed\",\"error\":\"V3_PILOT_CHECK_FAILED\"}]' where watch_id=$1",[x.watch]);
  for(const [stage,code,category,kind] of [['SOURCE_ACQUISITION','EMPTY_FEED','Error','scheduled'],['BRAIN_CALL','ETIMEDOUT','TimeoutError','scheduled'],['BRAIN_CALL','HTTP_429','Error','scheduled'],['EVIDENCE_REF_ADMISSION','INVALID_RESPONSE','TypeError','scheduled'],['RESULT_PERSISTENCE','42501','Error','scheduled'],['UNKNOWN','TIMEOUT','AbortError','manual']]){
   const token=randomUUID(),attempt=randomUUID();await db.query("insert into public.structured_media_schedules(watch_id,lease_token,lease_until,lease_kind) values($1,$2,'2030-11-24T08:00Z',$3) on conflict(watch_id) do update set lease_token=excluded.lease_token,lease_until=excluded.lease_until,lease_kind=excluded.lease_kind",[x.watch,token,kind]);
   const payload={attempt_id:attempt,context_id:randomUUID(),stage,error_code:code,category,secret:'sk-secret JWT credential private article',stack:'private'};
   await call('fail_v3_pilot_check_diagnostic',{p_id:x.watch,p_token:randomUUID(),p_diagnostic:payload});
   const before=(await db.query('select history from public.v3_pilot_watches where watch_id=$1',[x.watch])).rows[0].history.length;
   await call('fail_v3_pilot_check_diagnostic',{p_id:x.watch,p_token:token,p_diagnostic:payload});
   const h=(await db.query('select history from public.v3_pilot_watches where watch_id=$1',[x.watch])).rows[0].history;
   assert.equal(h.length,before+1);assert.equal(h[0].diagnostic,undefined);assert.equal(h.at(-1).error,'V3_PILOT_CHECK_FAILED');assert.equal(h.at(-1).diagnostic.stage,stage);assert.equal(h.at(-1).diagnostic.error_code,code);assert.equal(h.at(-1).diagnostic.attempt_id,attempt);assert.equal(h.at(-1).diagnostic.retry_scheduled,kind==='scheduled');assert(!JSON.stringify(h).includes('sk-secret'));
   await call('fail_v3_pilot_check_diagnostic',{p_id:x.watch,p_token:token,p_diagnostic:payload});assert.equal((await db.query('select jsonb_array_length(history) n from public.v3_pilot_watches where watch_id=$1',[x.watch])).rows[0].n,h.length);
  }
  const token=randomUUID();await db.query("update public.structured_media_schedules set lease_token=$2,lease_kind='scheduled' where watch_id=$1",[x.watch,token]);await call('fail_v3_pilot_check_diagnostic',{p_id:x.watch,p_token:token,p_diagnostic:{stage:'sk-private Bearer eyJhbGciOiJIUzI1NiJ9.private.signature postgres://user:password@host/db private@example.test private content',category:'sk-private Bearer eyJhbGciOiJIUzI1NiJ9.private.signature postgres://user:password@host/db private@example.test private content',error_code:'sk-private Bearer eyJhbGciOiJIUzI1NiJ9.private.signature postgres://user:password@host/db private@example.test private content',attempt_id:'sk-private Bearer eyJhbGciOiJIUzI1NiJ9.private.signature postgres://user:password@host/db private@example.test private content',context_id:'sk-private Bearer eyJhbGciOiJIUzI1NiJ9.private.signature postgres://user:password@host/db private@example.test private content',timestamp:'sk-private Bearer eyJhbGciOiJIUzI1NiJ9.private.signature postgres://user:password@host/db private@example.test private content',watch_id:'sk-private Bearer eyJhbGciOiJIUzI1NiJ9.private.signature postgres://user:password@host/db private@example.test private content',raw_response:{authorization:'sk-private Bearer eyJhbGciOiJIUzI1NiJ9.private.signature postgres://user:password@host/db private@example.test private content'}}});
  const d=(await db.query("select history->-1->'diagnostic' d from public.v3_pilot_watches where watch_id=$1",[x.watch])).rows[0].d;assert.equal(d.stage,'UNKNOWN');assert.equal(d.category,'Error');assert.equal(d.error_code,'V3_PILOT_CHECK_FAILED');assert.equal(d.attempt_id,null);assert.equal(d.context_id,null);assert(!JSON.stringify(d).includes('private'));assert(!JSON.stringify(d).includes('Bearer'));assert(!JSON.stringify(d).includes('postgres://'));assert.match(d.timestamp,/Z$/);assert.equal(d.watch_id,x.watch);await disable(x);
 });
 await t.test('crash after provider acceptance, with and without committed acknowledgment, never resends',async()=>{
  for(const committed of [false,true]){
   const x=await make();let sends=0;
   const client={rpc:async(name,args)=>{if(name==='production_watch_owners')return{data:[owner]};if(name==='get_media_watch_notification_locale')return{data:'en'};if(name==='finish_media_watch_digest'){if(committed&&args.p_provider)await call(name,args);return{error:{code:'NETWORK_ERROR'}};}return{data:await call(name,args)};},auth:{admin:{getUserById:async()=>({data:{user:{id:owner,email:'fixture@example.test',email_confirmed_at:'now'}}})}}};
   const run=()=>processMediaWatchDigests({client,env,structuredProduction:true,now:()=>Date.parse('2030-11-24T07:16:00Z'),sender:async()=>{sends++;return{id:'fake-provider-accepted'};}});
   await run();await run();assert.equal(sends,1);const row=(await db.query('select status,attempt_count from public.media_watch_notifications where id=$1',[x.id])).rows[0];assert.equal(row.attempt_count,1);assert.equal(row.status,committed?'sent':'pending');assert.equal(await eligible(x),false);await disable(x);
  }
 });
 await t.test('one failed Watch and a recovery SQL outage do not block normal digest delivery',async()=>{
  const failed=await make();await db.query("update public.watches set last_check_error_code='V3_PILOT_CHECK_FAILED' where id=$1",[failed.watch]);
  const x=await make({at:'2030-11-24T06:35:00Z',published:'2030-11-24T06:00:00Z'});let sends=0;
  const client={rpc:async(name,args)=>{if(name==='production_watch_owners')return{data:[owner]};if(name==='get_media_watch_notification_locale')return{data:'en'};if(name==='prepare_production_recovery_digests')return{error:{code:'NETWORK_ERROR'}};return{data:await call(name,args)};},auth:{admin:{getUserById:async()=>({data:{user:{id:owner,email:'fixture@example.test',email_confirmed_at:'now'}}})}}};
  const result=await processMediaWatchDigests({client,env,structuredProduction:true,now:()=>Date.parse('2030-11-24T07:16:00Z'),sender:async()=>{sends++;return{id:'fake-normal'};}});assert.equal(sends,1);assert.equal(result.sentCount,1);assert.equal(result.recoveryStatus,'unavailable');assert.equal((await db.query('select status from public.media_watch_notifications where id=$1',[failed.id])).rows[0].status,'pending');await disable(x);await disable(failed);
 });
 // Exercise orchestration against the same SQL; email transport is entirely injected.
 await t.test('owner outage then next cron recovers once with delayed label and persistent submission state',async()=>{
  const x=await make();let ownerFailure=true,sends=0;const messages=[];
  const client={rpc:async(name,args)=>{if(name==='production_watch_owners')return ownerFailure?{error:{code:'PGRST303',message:'JWT expired'}}:{data:[owner]};if(name==='get_media_watch_notification_locale')return{data:'fr'};try{return{data:await call(name,args)}}catch(error){return{error}}},auth:{admin:{getUserById:async()=>({data:{user:{id:owner,email:'fixture@example.test',email_confirmed_at:'now'}}})}}};
  const run=(changes={})=>processMediaWatchDigests({client,env:{...env,...changes},structuredProduction:true,now:()=>Date.parse('2030-11-24T07:16:00Z'),sender:async message=>{sends++;messages.push(message);return{id:'fake-recovery-accepted'};}});
  const log=console.error;console.error=()=>{};try{await assert.rejects(run());}finally{console.error=log;}assert.equal(sends,0);assert(await eligible(x));ownerFailure=false;
  assert.equal((await run({STRUCTURED_MEDIA_RECOVERY_ENABLED:'false'})).sentCount,0);assert.equal((await run()).sentCount,1);assert.equal((await run()).sentCount,0);assert.equal(sends,1);
  assert.match(messages[0].subject,/Notification différée/);assert.match(messages[0].text,/2030-11-23/);assert(!messages[0].text.includes('nouveaux articles'));await disable(x);
 });
 }finally{globalThis.fetch=originalFetch;await db.close();}
});
test('normal digest rendering is unchanged; delayed content escapes untrusted text',()=>{const args={locale:'en',watchId:owner,watchTitle:'<Fixture>',period:'2030-11-24',baseUrl:'https://example.test',articles:[{id:'source',article:{title:'<News>',url:'https://example.test/news',publishedAt:'2030-11-23T06:00:00Z'}}]};assert.match(renderMediaWatchDigest(args).subject,/Your daily update/);const delayed=renderMediaWatchDigest({...args,delayedDetectedAt:'2030-11-23T06:35:00Z'});assert.match(delayed.subject,/Delayed notification/);assert(!delayed.html.includes('<News>'));});
