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

test('restricted Staging digest delivery: real SQL scope, exact worker and no immediate fallback',async t=>{
 const db=new PGlite(),originalFetch=globalThis.fetch;
 globalThis.fetch=()=>assert.fail('External services forbidden');
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

   return id;
  };

  const selected=await create(),second=await create(),unrelated=await create(),legacy=await create(false);
  const scoped={...env,STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:[selected,second].join(',')};
  const snapshot=async watch=>(await db.query('select to_jsonb(n) n from public.media_watch_notifications n where watch_id=$1 order by id',[watch])).rows;
  const before=await snapshot(unrelated),legacyBefore=await snapshot(legacy);
  const prep=(watches=[selected,second])=>svc('select public.prepare_scoped_structured_media_digests(0,$1,$2) result',[[owner],watches]).then(r=>r.rows[0].result);
  let tuples;
  await t.test('only selected Watches prepared; other consented and legacy records unchanged',async()=>{
   tuples=await prep();assert.equal(tuples.length,2);assert.deepEqual(new Set(tuples.map(x=>x.watchId)),new Set([selected,second]));
   assert.deepEqual(await snapshot(unrelated),before);assert.deepEqual(await snapshot(legacy),legacyBefore);
   assert.equal((await db.query('select count(*)::int n from public.media_watch_digests where watch_id in ($1,$2)',[unrelated,legacy])).rows[0].n,0);
  });
  await t.test('service-only adapter rejects empty/NULL scope and clients',async()=>{
   await assert.rejects(prep([]),{code:'22023'});await assert.rejects(prep([null]),{code:'22023'});
   await assert.rejects(auth('select public.prepare_scoped_structured_media_digests(0,$1,$2)',[[owner],[selected]]),{code:'42501'});
   assert.equal((await svc('select public.prepare_scoped_structured_media_digests(0,$1,$2) r',[[other],[selected]])).rows[0].r.length,0);
  });
  let calls=0;const names=[];
  const client={from(){assert.fail('Immediate outbox enumeration forbidden');},auth:{admin:{getUserById:async()=>({data:{user:{email:'owner@example.test',email_confirmed_at:'now'}}})}},rpc:async(name,args)=>{
   names.push(name);assert(!['prepare_media_watch_digests','pending_media_watch_digests','claim_media_watch_digest'].includes(name));
   const entries=Object.entries(args);const r=await svc('select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result',entries.map(([,v])=>v));return{data:r.rows[0].result};
  }};
  const sender=async m=>{calls++;assert.equal(m.to,'owner@example.test');return{id:'synthetic-provider'};};
  await t.test('exact selection outside allowlist rejected before database/provider',async()=>{
   const result=await processMediaWatchEmailNotifications({client,env:scoped,sender,digestSelection:{digestId:randomUUID(),watchId:unrelated,ownerId:owner}});
   assert.equal(result.status,'invalid-selection');assert.equal(names.length,0);assert.equal(calls,0);
  });
  await t.test('controlled exact send submits one and leaves the second digest untouched',async()=>{
   const r=await processMediaWatchEmailNotifications({client,env:scoped,sender,digestSelection:tuples[0]});
   assert.equal(r.digests.sentCount,1);assert.equal(calls,1);
   assert.equal((await db.query('select status from public.media_watch_digests where id=$1',[tuples[1].digestId])).rows[0].status,'prepared');
  });
  await t.test('automatic path reuses exact claims and sends only remaining selected digest',async()=>{
   const r=await processMediaWatchEmailNotifications({client,env:scoped,sender});assert.equal(r.digests.sentCount,1);assert.equal(calls,2);
   assert(names.includes('prepare_scoped_structured_media_digests'));assert.deepEqual(await snapshot(unrelated),before);
  });
  await t.test('repeated invocation is silent; no second digest per Watch/day',async()=>{
   assert.equal((await processMediaWatchEmailNotifications({client,env:scoped,sender})).digests.sentCount,0);assert.equal(calls,2);
   assert.equal((await db.query('select count(*)::int n from public.media_watch_digests where watch_id=any($1)',[[selected,second]])).rows[0].n,2);
  });
  await t.test('scoped mode refuses immediate selection and invalid configured scopes',async()=>{
   assert.equal((await processMediaWatchEmailNotifications({client,env:scoped,sender,notificationSelection:{notificationId:randomUUID(),watchId:selected,ownerId:owner}})).status,'invalid-selection');
   for(const value of ['',selected+',bad',selected+','+selected])assert.equal((await processMediaWatchEmailNotifications({client,env:{...scoped,STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:value},sender})).status,'disabled');
   assert.equal(calls,2);
  });
 }finally{globalThis.fetch=originalFetch;await db.close();}
});
