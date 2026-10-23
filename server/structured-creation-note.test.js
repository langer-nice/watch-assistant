import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {createStructuredWatchMiddleware} from './structured-watch-api.js';
import {fingerprint} from './structured-watch-authorization.js';
import {validateWatchDefinition,definitionFromWatch,structuredMonitoringSource} from '../src/js/watch-definition.js';
import {mapMediaReportRow} from '../src/js/media-watch-row.js';

test('optional creation note is signed, persisted and restored; old Watches and criteria stay unchanged',async()=>{
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',oldId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url),migration='20261023160000_structured_watch_creation_notes.sql';
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&f!==migration).sort())await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  await db.query("insert into auth.users values($1,'fixture@example.test')",[owner]);
  const as=(role,sql,params=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,owner]);return tx.query(sql,params);});
  const base=definitions().find(d=>d.plan.domain==='media_news'),source=structuredMonitoringSource(base.plan.criteria),title='Fixture';
  await as('service_role',"select public.persist_structured_watch_v1($1,$2,'create',$3,0,$4,$5,$6,$7,$8)",[owner,oldId,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',title,source,base,fingerprint(base),fingerprint({definition:base,source,title})]);
  const before=(await db.query('select to_jsonb(w) r from public.watches w where id=$1',[oldId])).rows[0].r;
  const oid=(await db.query("select 'public.valid_structured_watch_definition(jsonb,jsonb)'::regprocedure::oid oid")).rows[0].oid;
  await db.exec(await readFile(new URL(migration,dir),'utf8'));
  assert.equal((await db.query("select 'public.valid_structured_watch_definition(jsonb,jsonb)'::regprocedure::oid oid")).rows[0].oid,oid);
  assert.deepEqual((await db.query('select to_jsonb(w) r from public.watches w where id=$1',[oldId])).rows[0].r,before);
  assert.equal((await db.query('select public.valid_structured_watch_definition($1,$2) ok',[source,base])).rows[0].ok,true);
  const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_WATCH_SIGNING_SECRET:'offline-note-fixture-'.repeat(4)};
  let writes=0;
  const handler=createStructuredWatchMiddleware({creationOnly:true,env,authenticate:async()=>({user:{id:owner}}),serviceClient:{rpc:async(name,args)=>{
   writes++;try{const entries=Object.entries(args);const r=await as('service_role','select public.'+name+'('+entries.map(([key],i)=>key+'=> $'+(i+1)).join(',')+') result',entries.map(([,value])=>value));return {data:r.rows[0].result};}catch(error){return {error:{code:error.code,message:error.message}};}
  }}});
  const call=async body=>{let result;const response={setHeader(){},end(text){result=JSON.parse(text);}};await handler({url:'/api/structured-watches',method:'POST',body},response);return {status:response.statusCode,...result};};
  const request={action:'issue',watchId:id,operation:'create',mutationId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',expectedRevision:0,title,interpretation:{...base.interpretation,originalRequest:base.request},plan:(await import('../src/js/watch-capabilities.js')).compileMonitoringPlan({...base.interpretation,originalRequest:base.request},{structured:true}),whyFollowing:'  Ma note personnelle\nÀ conserver 🎾  '};
  const issued=await call(request);assert.equal(issued.status,200);assert.equal(writes,0);
  assert.deepEqual(issued.definition.plan,base.plan);assert.deepEqual(issued.source,source);assert.equal(issued.definition.whyFollowing,request.whyFollowing.trim());
  const confirm={action:'confirm',watchId:id,operation:'create',mutationId:request.mutationId,expectedRevision:0,title,definition:issued.definition,token:issued.token};
  assert.equal((await call({...confirm,definition:{...issued.definition,whyFollowing:'tampered'}})).code,'PLAN_DEFINITION_MISMATCH');assert.equal(writes,0);
  assert.equal((await call(confirm)).status,200);
  const row=(await as('authenticated','select * from public.watches where id=$1',[id])).rows[0];assert.equal(row.monitoring_state,'paused');
  const reopened=mapMediaReportRow(row,owner);assert.equal(reopened.whyFollowing,request.whyFollowing.trim());assert.equal(validateWatchDefinition(definitionFromWatch(reopened),row.monitoring_source).whyFollowing,reopened.whyFollowing);
  assert.equal((await db.query('select public.valid_structured_watch_definition($1,$2) ok',[source,{...base,whyFollowing:42}])).rows[0].ok,false);
  assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
 }finally{await db.close();}
});
