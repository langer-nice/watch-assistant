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

test('account delivery: existing and future consented Watches; no immediate fallback',async t=>{
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

  const madrid=await create(),off=await create();
  await auth('select public.set_media_watch_email_policy($1,$2,false)',[off,'off']);
  const account={...env,STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:'account'};
  const names=[],submitted=[];
  const client={from(){assert.fail('Immediate delivery forbidden');},auth:{admin:{getUserById:async()=>({data:{user:{email:'owner@example.test',email_confirmed_at:'now'}}})}},rpc:async(name,args)=>{
   names.push(name);const entries=Object.entries(args);const r=await svc('select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result',entries.map(([,v])=>v));return {data:r.rows[0].result};
  }};
  const run=()=>processMediaWatchEmailNotifications({client,env:{...account,MEDIA_WATCH_DAILY_DIGEST_ENABLED:'false'},sender:async m=>{submitted.push(m);assert.equal(m.to,'owner@example.test');return{id:'synthetic-only'};}});
  // The wrapper uses the worker's real clock; fix only the worker clock for local tests.
  const {processMediaWatchDigests}=await import('./media-watch-digest.js');
  const deliver=()=>processMediaWatchDigests({client,env:account,now:()=>Date.parse(new Date().toISOString().slice(0,10)+'T06:15:00Z'),sender:async m=>{submitted.push(m);assert.equal(m.to,'owner@example.test');return{id:'synthetic-only'};}});
  await t.test('Real Madrid equivalent consented Watch eligible with actual pending content',async()=>{
   const r=await deliver();assert.equal(r.sentCount,1);assert.equal((await db.query('select status from media_watch_digests where watch_id=$1',[madrid])).rows[0].status,'sent');
  });
  await t.test('consent OFF excluded; other accounts and recipients denied; no immediate fallback',async()=>{
   assert.equal((await db.query('select count(*)::int n from media_watch_digests where watch_id=$1',[off])).rows[0].n,0);
   const {structuredMediaEmailDeliveryAllowed,structuredMediaStagingEmailTestEnabled}=await import('./structured-media-notification-gates.js');
   assert.equal(structuredMediaEmailDeliveryAllowed(account,other,'owner@example.test'),false);
   assert.equal(structuredMediaEmailDeliveryAllowed(account,owner,'other@example.test'),false);
   assert.equal(structuredMediaStagingEmailTestEnabled({...account,STRUCTURED_WATCH_TEST_USER_IDS:owner+','+other}),false);
   const r=await run();assert.equal(r.status,'disabled');
  });
  await t.test('future Watch needs no new ID; no replay of already sent articles',async()=>{
   const future=await create();const r=await deliver();assert.equal(r.sentCount,1);assert.equal(submitted.length,2);
   assert.equal((await db.query('select status from media_watch_digests where watch_id=$1',[future])).rows[0].status,'sent');
   assert.equal((await deliver()).sentCount,0);assert.equal(submitted.length,2);
   assert(names.includes('prepare_media_watch_digests'));assert(!names.includes('prepare_scoped_structured_media_digests'));
  });
 }finally{globalThis.fetch=originalFetch;await db.close();}
});
