import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PILOT_OWNER,PILOT_SPECS,pilotSource,runPilotMonitoring} from './v3-pilot.js';
import {createMediaWatchCheckMiddleware} from './media-watch-check-api.js';
import {createWatchCheckController} from '../src/js/watch-monitoring.js';

const owner=PILOT_OWNER,other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env={V3_PILOT_ENABLED:'true',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true'};
const understanding=text=>({intent:{canonical_text:text,references:[{label:text,source_ref:'raw_input'}],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR'}});
const feed=async()=>({source:{title:'Fixture',url:'https://example.test/feed'},checkedAt:'2026-11-03T10:00:00Z',items:[{id:'article',title:'A material new development was confirmed',excerpt:'A new factual event has occurred.',url:'https://example.test/article',source:'Fixture',publishedAt:'2026-11-03T09:00:00Z'}]});
const currency=async()=>({criteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'},observation:{base:'GBP',quote:'EUR',rate:'1.18',date:'2026-11-03'},checkedAt:'2026-11-03T10:00:00Z'});
const output=(req,{action='NO_ALERT',status='CONFIRMED',reason='No new material development.'}={})=>({action,evidence_status:status,reason,novelty_summary:null,condition_check:null,
 evidence_refs:req.input.evidence.segments.filter(s=>s.role!=='PROVENANCE').map(s=>s.id),provenance_refs:req.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)});
const namespace=value=>JSON.stringify(value).replace(/e[a-f0-9]{32}/g,'REQUEST_NAMESPACE');

test('real manual API and scheduled V3 share judgment, fencing and persistence with manual delivery isolation',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 const dir=new URL('../supabase/migrations/',import.meta.url),files=(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')&&f!=='20261022160000_private_morning_reports.sql');
 for(const f of files.filter(f=>f!=='20261103120000_v3_manual_runtime_context.sql'))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
 const contract=async()=>JSON.stringify((await db.query(`select oid::regprocedure::text name,proacl from pg_proc where oid in ('public.claim_structured_media_manual_check(uuid,uuid,bigint)'::regprocedure,'public.finish_v3_pilot_check(uuid,uuid,jsonb)'::regprocedure,'public.fail_v3_pilot_check(uuid,uuid)'::regprocedure) order by 1`)).rows);
 const acl=await contract();await db.exec(await readFile(new URL('20261103120000_v3_manual_runtime_context.sql',dir),'utf8'));
 await db.exec(await readFile(new URL('20261103120000_v3_manual_runtime_context.sql',dir),'utf8')); // Safe later migration-ledger application.
 await t.test('function signatures and ACL unchanged; migration has no table/RLS/grant statements',async()=>{
  assert.equal(await contract(),acl);const sql=await readFile(new URL('20261103120000_v3_manual_runtime_context.sql',dir),'utf8');assert(!/\b(?:alter table|create table|grant |revoke |create policy)\b/i.test(sql));
 });
 await db.query('insert into auth.users values($1,$2)',[owner,'fixture@example.test']);
 await db.exec("set request.jwt.claim.role='service_role'");
 const calls=[];
 const client={rpc:async(name,p={})=>{calls.push({name,p:structuredClone(p)});const keys=Object.keys(p);try{return {data:(await db.query(`select public.${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) value`,Object.values(p))).rows[0].value};}catch(error){return {error};}},from:table=>{
  const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},is(){return q;},async maybeSingle(){return {data:(await db.query('select * from public.v3_pilot_watches where watch_id=$1 and user_id=$2',[filters.watch_id,filters.user_id])).rows[0]||null};},async range(){return {data:(await db.query('select w.*,to_jsonb(s) media_watch_snapshots from public.watches w left join public.media_watch_snapshots s on s.watch_id=w.id where w.id=$1 and w.user_id=$2 and w.deleted_at is null',[filters.id,filters.user_id])).rows};}};return q;
 }};
 const rpc=async(name,p)=>{const r=await client.rpc(name,p);if(r.error)throw r.error;return r.data;};
 const ids=[];
 for(let i=0;i<4;i++)ids.push(await rpc('create_v3_pilot',{p_slot:i+1,p_understanding:understanding(PILOT_SPECS[i].instruction),p_source:pilotSource(PILOT_SPECS[i])}));
 const initial=await rpc('claim_v3_pilot_checks');
 for(const r of initial)await rpc('finish_v3_pilot_check',{p_id:r.id,p_token:r.token,p_result:{evidence:{id:'baseline',title:'Baseline',content:'Known context',source:'Fixture',url:'https://example.test/feed'},items:[],judgment:null,article:null}});
 for(const text of ['France protests and social movements','Taylor Swift news','French elections'])ids.push(await rpc('create_v3_watch',{p_id:randomUUID(),p_owner:owner,p_instruction:text,p_kind:'FREE_TEXT',p_understanding:understanding(text),p_source:pilotSource({query:text}),p_criteria:null,p_baseline:{evidence:{id:'baseline',url:'https://example.test/feed'},items:[],judgment:null,article:null}}));
 const row=async id=>(await db.query('select * from public.watches where id=$1',[id])).rows[0];
 const schedule=async id=>(await db.query('select * from public.structured_media_schedules where watch_id=$1',[id])).rows[0];
 const count=async table=>(await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
 let model=async req=>output(req),fetchFeed=feed,fetchCurrency=currency;
 const invoke=async(id,{as=owner,revision=1,service=client,authClient=client,outputLocale}={})=>{
  let body;const response={setHeader(){},end(raw){body=JSON.parse(raw);}};
  const handler=createMediaWatchCheckMiddleware({env,authenticate:async()=>({user:{id:as},client:authClient}),serviceClient:service,fetchFeed:(...args)=>fetchFeed(...args),fetchCurrency:(...args)=>fetchCurrency(...args),model:(...args)=>model(...args)});
  await handler({url:'/api/media-watches?action=check',method:'POST',body:{id,revision,...(outputLocale===undefined?{}:{outputLocale})}},response);return {http:response.statusCode,...body};
 };
 for(const [i,name] of ['City','GBP/EUR','Apple','Metallica','France','Taylor','elections'].entries())await t.test(name+' manual reaches V3 Brain once, then shared SQL; due/outbox/report unchanged',async()=>{
  let brains=0,sources=0;model=async req=>{brains++;return output(req);};fetchFeed=async(...args)=>{sources++;return feed(...args);};fetchCurrency=async request=>{sources++;assert.equal(request,'GBP > 1.17 EUR');return currency();};
  const before=await schedule(ids[i]),n=await count('media_watch_notifications'),reports=await count('watch_reports');
  const r=await invoke(ids[i]);assert.equal(r.http,200);assert.equal(brains,1);assert.equal(sources,1);assert.equal(r.outcome,'no-new-items');assert.equal(r.changes.lastCheckAttempt.status,'succeeded');
  const after=await schedule(ids[i]);assert.deepEqual(after.next_due_at,before.next_due_at);assert.equal(after.failures,before.failures);assert.equal(after.lease_token,null);
  assert.equal(await count('media_watch_notifications'),n);assert.equal(await count('watch_reports'),reports);
  assert(!calls.some(c=>/complete_manual_media|complete_currency_watch/.test(c.name)));
 });
 await t.test('semantic input and admitted result parity, varying only request-scoped ref namespace',async()=>{
  const id=ids[4],prior=(await db.query('select * from public.v3_pilot_watches where watch_id=$1',[id])).rows[0];
  let manualInput,scheduledInput;model=async req=>{manualInput=structuredClone(req);return output(req);};await invoke(id);
  const manualResult=calls.findLast(c=>c.name==='finish_v3_pilot_check').p.p_result;
  await db.query('update public.v3_pilot_watches set prior_state=$2,baseline_at=$3,evaluation=$4 where watch_id=$1',[id,prior.prior_state,prior.baseline_at,prior.evaluation]);
  // Only the local fixture is made due; other local schedules remain future.
  await db.query("update public.structured_media_schedules set next_due_at=clock_timestamp()-interval '1 second' where watch_id=$1",[id]);
  const result=await runPilotMonitoring({client,env,schedulerAuthorized:true,feed,currency,model:async req=>{scheduledInput=structuredClone(req);return output(req);}});
  assert.equal(result.completed,1);assert.equal(namespace(manualInput),namespace(scheduledInput));assert.equal(namespace(manualResult),namespace(calls.findLast(c=>c.name==='finish_v3_pilot_check').p.p_result));
 });
 await t.test('French profile scheduled output and current manual UI override share the real API/SQL runtime',async()=>{
  const id=ids[4],prior=(await db.query('select * from public.v3_pilot_watches where watch_id=$1',[id])).rows[0];
  await db.query("update public.profiles set locale='fr' where id=$1",[owner]);
  let brains=0,sources=0;const localized=req=>{brains++;assert.match(req.instructions,/Output locale: French \(fr\)/);return output(req,{action:'ALERT',reason:'Radio France rapporte un nouvel événement confirmé.'});};
  model=localized;fetchFeed=async()=>{sources++;return feed();};
  const manual=await invoke(id,{outputLocale:'fr'});assert.equal(manual.http,200);assert.equal(manual.changes.updates[0].summary,'Radio France rapporte un nouvel événement confirmé.');
  const manualResult=calls.findLast(c=>c.name==='finish_v3_pilot_check').p.p_result;
  await db.query('update public.v3_pilot_watches set prior_state=$2,baseline_at=$3,evaluation=$4 where watch_id=$1',[id,prior.prior_state,prior.baseline_at,prior.evaluation]);
  await db.query("update public.structured_media_schedules set next_due_at=clock_timestamp()-interval '1 second' where watch_id=$1",[id]);
  const scheduled=await runPilotMonitoring({client,env,schedulerAuthorized:true,feed:fetchFeed,currency,model:localized});
  assert.equal(scheduled.completed,1);assert.equal(namespace(manualResult),namespace(calls.findLast(c=>c.name==='finish_v3_pilot_check').p.p_result));
  assert.equal(brains,2);assert.equal(sources,2);
  model=async req=>{assert.match(req.instructions,/Output locale: English \(en\)/);return output(req,{action:'ALERT',reason:'Radio France reports a new confirmed event.'});};
  const english=await invoke(id,{outputLocale:'en'});assert.equal(english.http,200);assert.equal(english.changes.updates[0].summary,'Radio France reports a new confirmed event.');
  await db.query("update public.profiles set locale='en' where id=$1",[owner]);
 });
 await t.test('speculative Metallica preserves STRONG_UNCONFIRMED and manual creates no notification',async()=>{
  fetchFeed=feed;model=async req=>output(req,{action:'ALERT',status:'STRONG_UNCONFIRMED',reason:'Credible reports suggest Metallica may announce new concerts; this remains unconfirmed.'});
  const n=await count('media_watch_notifications'),before=await schedule(ids[3]);const r=await invoke(ids[3]);assert.equal(r.http,200);assert.equal(r.outcome,'matching-items');assert.match(r.changes.updates[0].summary,/unconfirmed/);
  assert.equal(await count('media_watch_notifications'),n);assert.deepEqual((await schedule(ids[3])).next_due_at,before.next_due_at);
 });
 await t.test('completed factual event remains CONFIRMED with truthful persisted manual result',async()=>{
  model=async req=>output(req,{action:'ALERT',reason:'A material new development was confirmed.'});const r=await invoke(ids[2]);assert.equal(r.http,200);assert.equal(r.outcome,'matching-items');assert.equal(r.changes.updates[0].sourceTitle,'A material new development was confirmed.');
  assert.equal((await db.query('select last_judgment from public.v3_pilot_watches where watch_id=$1',[ids[2]])).rows[0].last_judgment.evidence_status,'CONFIRMED');
 });
 for(const [name,stage,fault] of [['source','SOURCE_ACQUISITION',async()=>{throw Error('Fixture source failure');}],['brain','BRAIN_CALL',async()=>{throw Error('Fixture Brain failure');}],['malformed','BRAIN_RESPONSE_VALIDATION',async()=>({})],['refs','EVIDENCE_REF_ADMISSION',async req=>({...output(req),evidence_refs:['invented']})]])await t.test(name+' failure keeps stage/diagnostic and releases manual lease without schedule change',async()=>{
  const before=await schedule(ids[5]);let brains=0;fetchFeed=name==='source'?fault:feed;model=async req=>{brains++;return fault(req);};
  const r=await invoke(ids[5]);assert.equal(r.http,503);assert.equal(r.stage,stage);assert.equal(r.code,'V3_'+stage);assert.match(r.diagnostic_id,/^[a-f0-9-]{36}$/);assert.equal(brains,name==='source'?0:1);
  const after=await schedule(ids[5]);assert.deepEqual(after.next_due_at,before.next_due_at);assert.equal(after.failures,before.failures);assert.equal(after.lease_token,null);
 });
 await t.test('persistence failure stays RESULT_PERSISTENCE with one completion attempt and no retry',async()=>{
  fetchFeed=feed;model=async req=>output(req);let completions=0;
  const r=await invoke(ids[5],{service:{...client,rpc:async(name,p)=>name==='finish_v3_pilot_check'?(completions++,{error:{code:'42501',message:'Fixture persistence failure'}}):client.rpc(name,p)}});
  assert.equal(r.http,503);assert.equal(r.stage,'RESULT_PERSISTENCE');assert.equal(completions,1);
 });
 await t.test('manual/manual and manual/scheduled exclusion; token completes at most once',async()=>{
  const id=ids[6],claim=await rpc('claim_structured_media_manual_check',{p_watch_id:id,p_owner:owner,p_revision:1});assert(claim.v3);
  assert.equal(await rpc('claim_structured_media_manual_check',{p_watch_id:id,p_owner:owner,p_revision:1}),null);
  await db.query("update public.structured_media_schedules set next_due_at=clock_timestamp()-interval '1 second' where watch_id=$1",[id]);assert(!(await rpc('claim_v3_pilot_checks')).some(r=>r.id===id));
  const result={evidence:{id:'once',content:'Fixture',url:'https://example.test/feed'},items:[],judgment:{action:'NO_ALERT',evidence_basis:[]},article:null};
  assert.equal(await rpc('finish_v3_pilot_check',{p_id:id,p_token:claim.lease_token,p_result:result}),true);
  assert.equal(await rpc('finish_v3_pilot_check',{p_id:id,p_token:claim.lease_token,p_result:result}),false);
  const scheduled=(await rpc('claim_v3_pilot_checks')).find(r=>r.id===id);assert(scheduled);assert.equal(await rpc('claim_structured_media_manual_check',{p_watch_id:id,p_owner:owner,p_revision:1}),null);
  await rpc('fail_v3_pilot_check',{p_id:id,p_token:scheduled.token});
 });
 await t.test('rapid UI double click coalesces into one effective manual operation',async()=>{
  let runs=0;const w={...await row(ids[0]),request:'Fixture'};
  const controller=createWatchCheckController({getWatch:()=>w,saveWatch:()=>w,checkStoredWatch:async()=>{runs++;return {outcome:'no-new-items',changes:{},matchedItems:[]};}});
  const a=controller.check(w.id),b=controller.check(w.id);assert.equal(a,b);await Promise.all([a,b]);assert.equal(runs,1);
 });
 await t.test('owner/revision/paused fences and RPC role protection remain',async()=>{
  assert.equal((await invoke(ids[0],{as:other})).http,404);assert.equal((await invoke(ids[0],{revision:2})).http,409);
  assert.equal(await rpc('claim_structured_media_manual_check',{p_watch_id:ids[0],p_owner:other,p_revision:1}),null);
  await db.query("update public.watches set monitoring_state='paused' where id=$1",[ids[0]]);assert.equal(await rpc('claim_structured_media_manual_check',{p_watch_id:ids[0],p_owner:owner,p_revision:1}),null);
  await db.exec("reset role;set role authenticated;set request.jwt.claim.role='authenticated'");
  await assert.rejects(db.query('select public.claim_structured_media_manual_check($1,$2,1)',[ids[0],owner]),/permission denied/);
  await db.exec("reset role;set request.jwt.claim.role='service_role'");
 });
 await t.test('unsupported V3 source fails truthfully and never falls back to legacy',async()=>{
  const invalid={...await row(ids[6]),monitoring_source:{type:'page',url:'https://example.test/page'}};
  const q={select(){return q;},eq(){return q;},is(){return q;},async range(){return {data:[invalid]};}};
  let n=0;fetchFeed=async()=>{n++;throw Error('Should not acquire');};const r=await invoke(ids[6],{authClient:{from:()=>q}});assert.equal(r.http,400);assert.equal(r.code,'INVALID_MONITORING_SOURCE');assert.equal(n,0);
 });
});
