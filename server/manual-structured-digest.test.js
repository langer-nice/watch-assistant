import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
import {createMediaWatchCheckMiddleware} from './media-watch-check-api.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true',STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'true'};
test('manual report preserves consented daily articles atomically without delivery',async t=>{
 const db=new PGlite(),fetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('No external services');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);for(const f of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  const as=(role,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,owner]);return tx.query(sql,args);});
  const svc=(sql,args)=>as('service_role',sql,args);
  await db.query("insert into auth.users values($1,'fixture@example.test')",[owner]);
  const row=async id=>(await db.query('select w.*,to_jsonb(s) media_watch_snapshots from watches w left join media_watch_snapshots s on s.watch_id=w.id where w.id=$1',[id])).rows[0];
  const rpc=async(name,args)=>{const pairs=Object.entries(args);const r=await svc('select public.'+name+'('+pairs.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result',pairs.map(([,v])=>v));return{data:r.rows[0].result};};
  const create=async consent=>{const id=randomUUID(),definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);await svc("select public.persist_structured_watch_with_digest($1,$2,'create',$3,0,'Fixture',$4,$5,$6,$7)",[owner,id,randomUUID(),source,definition,fingerprint(definition),fingerprint({title:'Fixture',definition,source})]);await as('authenticated','select public.set_media_watch_email_policy($1,$2,$3)',[id,'daily_digest',consent]);await svc('select public.set_structured_media_monitoring($1,$2,$3,true,86400)',[id,owner,(await row(id)).media_revision]);return id;};
  let items=[];
  const check=async(id,extra={})=>{const q={select(){return q;},eq(){return q;},is(){return q;},async range(){return{data:[await row(id)]};}};const api=createMediaWatchCheckMiddleware({env:{...env,...extra},authenticate:async()=>({user:{id:owner},client:{from:()=>q}}),serviceClient:{rpc},fetchFeed:async()=>({checkedAt:new Date().toISOString(),source:{title:'Fixture'},items})});let body;const response={setHeader(){},end(v){body=JSON.parse(v);}};await api({method:'POST',url:'/api/media-watches?action=check',body:{id,revision:Number((await row(id)).media_revision)}},response);assert.equal(response.statusCode,200,JSON.stringify(body));return body;};
  const count=async id=>(await db.query('select count(*)::int n from media_watch_notifications where watch_id=$1',[id])).rows[0].n;
  const article=n=>({id:n,title:'Jannik Sinner '+n,url:'https://example.test/'+n,publishedAt:new Date().toISOString()});
  const first=await create(true),second=await create(true),off=await create(false);
  await t.test('baseline silent; separate Watches retain the same new article independently',async()=>{for(const id of[first,second,off])await check(id);items=[article('new')];for(const id of[first,second,off])await check(id);assert.equal(await count(first),1);assert.equal(await count(second),1);assert.equal(await count(off),0);});
  await t.test('repeat checks cannot duplicate or remove pending members',async()=>{await check(first);assert.equal(await count(first),1);assert.equal((await db.query('select status from media_watch_notifications where watch_id=$1',[first])).rows[0].status,'pending');assert.equal((await db.query('select count(*)::int n from media_watch_digests')).rows[0].n,0);});
  await t.test('enqueue failure rolls back the identity ledger, allowing the legitimate next check',async()=>{items=[article('atomic')];await db.exec("create function reject_fixture() returns trigger language plpgsql as $$begin raise exception 'fixture rejection';end$$;create trigger reject_fixture before insert on media_watch_notifications for each row execute function reject_fixture();");await assert.rejects(check(second));await db.exec('drop trigger reject_fixture on media_watch_notifications');await check(second);assert.equal(await count(second),2);});
  await t.test('disabled intent gate and paused Watches stay silent; roles cannot call adapter',async()=>{items=[article('disabled')];await check(first,{STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'false'});assert.equal(await count(first),1);await svc('select public.set_structured_media_monitoring($1,$2,$3,false,86400)',[second,owner,(await row(second)).media_revision]);items=[article('paused')];await check(second);assert.equal(await count(second),2);for(const role of['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.finish_structured_manual_check_with_digest(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean)','execute') ok",[role])).rows[0].ok,false);});
 }finally{await db.close();globalThis.fetch=fetch;}
});
