import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createV3WatchHandler,V3_ENGINE,v3CurrencyCriteria,v3Capability} from './v3-creation.js';
import {runPilotMonitoring,PILOT_OWNER,PILOT_SPECS,pilotSource} from './v3-pilot.js';
import {createMediaWatchCheckMiddleware} from './media-watch-check-api.js';
import {generateMorningReport} from './morning-report.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env={V3_PILOT_ENABLED:'true',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',MORNING_REPORT_PRODUCTION_ENABLED:'true',CRON_SECRET:'fixture'};
const cases=[
 ['social movements','Keep me updated on important new developments concerning protests, strikes and major social movements in France.',['protests','strikes','major social movements','France']],
 ['City','Keep me updated on important new developments concerning Manchester City.',['Manchester City']],
 ['Gucci','Keep me updated on new Gucci products.',['Gucci']],
 ['Microsoft','Keep me updated on important Microsoft developments.',['Microsoft']],
 ['Apple','Tell me when Apple does something important.',['Apple']],
 ['Metallica','Keep me updated on new Metallica concerts in Europe.',['Metallica','Europe']],
 ['GBP/EUR','Tell me when GBP/EUR goes above 1.17.',['GBP/EUR']],
 ['exact URL','https://example.test/news.rss?region=fr#latest',[]],
];
const ready=(raw,refs=[])=>({intent:{canonical_text:raw,references:refs.map(label=>({label,source_ref:'raw_input'})),explicit_constraints:raw.includes('1.17')?[{kind:'threshold',text:'1.17',source_ref:'raw_input',value:'1.17'},{kind:'comparator',text:'above',source_ref:'raw_input'}]:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Meaningful identified subject and scope.'}});
const feed=async url=>({source:{title:'Existing RSS source',url},checkedAt:'2026-11-01T10:00:00Z',items:[{id:'item',title:'A materially new development',excerpt:'Independent reports describe the new development.',url:'https://example.test/news',publishedAt:'2026-11-01T09:00:00Z',source:'News'}]});
const currency=async()=>({criteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'},observation:{base:'GBP',quote:'EUR',rate:'1.171',date:'2026-11-01'},checkedAt:'2026-11-01T10:00:00Z'});

test('general V3 real API → atomic SQL → engine scheduler → existing delivery and reports',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 await db.exec("create function public.test_v3_clock() returns timestamptz language sql as $$select '2026-11-01T07:16:00Z'::timestamptz$$");
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).sort().filter(x=>x.endsWith('.sql')&&x!=='20261022160000_private_morning_reports.sql'))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;','').replaceAll('clock_timestamp()','public.test_v3_clock()'));
 for(const id of [owner,other,PILOT_OWNER])await db.query('insert into auth.users values($1,$2)',[id,'fixture@example.test']);
 const role=async(r,sql,args=[],sub=owner)=>{await db.exec(`set role ${r};set request.jwt.claim.role='${r}';set request.jwt.claim.sub='${sub}'`);try{return await db.query(sql,args);}finally{await db.exec('reset role;reset request.jwt.claim.role;reset request.jwt.claim.sub');}};
 const rpc=async(name,p={})=>{const keys=Object.keys(p);try{return {data:(await role('service_role',`select public.${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) value`,keys.map(k=>p[k]))).rows[0].value};}catch(error){return {error};}};
 const client={rpc,from:()=>{const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){const a=filters.map(x=>x[1]);return {data:(await db.query('select watch_id,instruction,engine from public.v3_pilot_watches where user_id=$1 and instruction=$2',a)).rows[0]||null};}};return q;}};
 let output,modelCalls=0,sourceCalls=0;const model=async req=>{modelCalls++;assert.deepEqual(req.input.conversation,[]);return output;};
 const api=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,model,feed:async url=>{sourceCalls++;return feed(url);},currency});
 const invoke=async(body,handler=api)=>{let value;const res={setHeader(){},end(raw){value=JSON.parse(raw);}};await handler({method:'POST',body},res);return {http:res.statusCode,...value};};
 const count=async table=>(await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
 const ids=[];
 // Pilot data survives generic creation and remains separately identified.
 for(let i=0;i<4;i++){const text=PILOT_SPECS[i].instruction;const u={intent:ready(text).intent,decision:{status:'READY_TO_MONITOR'}};assert.ok(!(await rpc('create_v3_pilot',{p_slot:i+1,p_understanding:u,p_source:pilotSource(PILOT_SPECS[i])})).error);}
 const pilotSchedules=(await db.query('select * from public.structured_media_schedules order by watch_id')).rows;
 const beforePilot=(await db.query('select watch_id,user_id,slot,engine,instruction,understanding,baseline_at,prior_state from public.v3_pilot_watches where slot is not null order by slot')).rows;
 for(const [name,text,refs] of cases)await t.test(name+' creates through V3 without exact instruction routing',async()=>{
  const id=randomUUID();output=ready(text,refs);const body={watchId:id,instruction:text,captureKind:name==='exact URL'?'URL':'FREE_TEXT'};
  const before=modelCalls;const r=await invoke(body);assert.equal(r.http,200);assert.equal(r.id,id);assert.equal(r.engine,V3_ENGINE);assert.equal(modelCalls,before+1);ids.push(id);
  const row=(await db.query('select w.*,p.understanding,p.capture_kind,p.engine,p.baseline_at from public.watches w join public.v3_pilot_watches p on p.watch_id=w.id where w.id=$1',[id])).rows[0];
  assert.equal(row.user_id,owner);assert.equal(row.watch_definition.request,text);assert.deepEqual(row.understanding.intent,output.intent);assert.equal(row.engine,V3_ENGINE);assert.equal(row.monitoring_state,'monitoring');assert.ok(row.baseline_at);assert.equal(row.last_check_outcome,'baseline');assert.equal(row.capture_kind,body.captureKind);
  assert.equal((await db.query('select count(*)::int n from public.structured_media_schedules where watch_id=$1',[id])).rows[0].n,1);
  if(name==='exact URL')assert.equal(row.understanding.resource.exact_url,text);
  if(name==='GBP/EUR')assert.deepEqual(row.watch_definition.currencyCriteria,{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'});
  const again=await invoke({...body,watchId:randomUUID()});assert.equal(again.id,id);assert.equal(modelCalls,before+1);
 });
 await t.test('pilot records and schedules remain unchanged by creation; baseline creates no notifications',async()=>{
  assert.deepEqual((await db.query('select watch_id,user_id,slot,engine,instruction,understanding,baseline_at,prior_state from public.v3_pilot_watches where slot is not null order by slot')).rows,beforePilot);
  assert.deepEqual((await db.query('select s.* from public.structured_media_schedules s join public.v3_pilot_watches p on p.watch_id=s.watch_id where p.slot is not null order by s.watch_id')).rows,pilotSchedules);
  assert.equal(await count('media_watch_notifications'),0);
 });
 const existingCount=await count('watches');const existingSchedules=await count('structured_media_schedules');
 const noWrite=async()=>{assert.equal(await count('watches'),existingCount);assert.equal(await count('structured_media_schedules'),existingSchedules);};
 await t.test('missing referent clarification cannot persist or schedule',async()=>{
  const text='Tell me when this company changes something.';output={intent:{canonical_text:text,references:[],explicit_constraints:[],unresolved_ambiguities:['Missing company']},decision:{status:'NEEDS_CLARIFICATION',reason:'Company not identified.',clarification_question:'Which company?'}};
  const r=await invoke({watchId:randomUUID(),instruction:text});assert.equal(r.status,'NEEDS_CLARIFICATION');await noWrite();
 });
 await t.test('unsupported booking capability is blocked even if Intent is READY',async()=>{
  const text='Tell me when booking availability opens at https://example.test/flights';output=ready(text,['flights']);
  const r=await invoke({watchId:randomUUID(),instruction:text});assert.equal(r.status,'UNSUPPORTED_FOR_NOW');await noWrite();
 });
 await t.test('provider and baseline acquisition failures leave no partial rows',async()=>{
  const fail=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,model:async()=>{throw Error('Provider down');}});
  assert.equal((await invoke({watchId:randomUUID(),instruction:'Follow another company.'},fail)).http,503);await noWrite();
  output=ready('Follow another company.',['Another company']);
  const failFeed=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,model,feed:async()=>{throw Error('Feed down');}});
  assert.equal((await invoke({watchId:randomUUID(),instruction:'Follow another company.'},failFeed)).http,503);await noWrite();
 });
 await t.test('client cannot supply owner, engine or admitted Intent; auth cannot bypass',async()=>{
  for(const extra of [{owner:other},{engine:V3_ENGINE},{understanding:output}])assert.equal((await invoke({watchId:randomUUID(),instruction:'A request',...extra})).http,400);
  const failAuth=createV3WatchHandler({env,authenticate:async()=>{throw Object.assign(Error('auth'),{statusCode:401,code:'INVALID_SESSION'});}});
  assert.equal((await invoke({watchId:randomUUID(),instruction:'A request'},failAuth)).http,401);await noWrite();
  for(const r of ['anon','authenticated']){
   await assert.rejects(role(r,'select * from public.v3_pilot_watches'),/permission denied/);
   await assert.rejects(role(r,'select public.create_v3_watch($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),other,'A request','FREE_TEXT',{}, {},null,{}]),/permission denied/);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.v3_pilot_watches'::regclass")).rows[0].relrowsecurity,true);
  const foreign=await role('authenticated','select id from public.watches where id=$1',[ids[0]],other);assert.equal(foreign.rows.length,0);
 });
 await t.test('generic V3 manual check cannot accidentally invoke legacy judgment',async()=>{
  const row=(await db.query('select * from public.watches where id=$1',[ids[0]])).rows[0];
  const q={select(){return q;},eq(){return q;},is(){return q;},async range(){return {data:[row]};}};
  const v3={select(){return v3;},eq(){return v3;},async maybeSingle(){return {data:{engine:V3_ENGINE}};}};
  let value;const res={setHeader(){},end(raw){value=JSON.parse(raw);}};
  const check=createMediaWatchCheckMiddleware({env,authenticate:async()=>({user:{id:owner},client:{from:()=>q}}),serviceClient:{from:()=>v3,rpc:()=>assert.fail('No legacy claim')},fetchFeed:()=>assert.fail('No legacy source check')});
  await check({url:'/api/media-watches?action=check',method:'POST',body:{id:ids[0],revision:1}},res);
  assert.equal(res.statusCode,409);assert.equal(value.code,'V3_SCHEDULED_CHECK_ONLY');
 });
 await t.test('atomic rejection does not leave a Watch or schedule',async()=>{
  const args={p_id:randomUUID(),p_owner:owner,p_instruction:'Bad baseline',p_kind:'FREE_TEXT',p_understanding:output,p_source:pilotSource({query:'Another company'}),p_criteria:null,p_baseline:{evidence:{id:'baseline'},items:[],judgment:{action:'ALERT'},article:null}};
  assert.ok((await rpc('create_v3_watch',args)).error);await noWrite();
 });
 await t.test('generic engine selects V3 Brain; original text is not the selector; existing outbox reused',async()=>{
  await db.query("update public.structured_media_schedules set next_due_at='2026-11-01T07:15:00Z' where watch_id=any($1::uuid[])",[ids]);
  // Existing pilot schedules excluded here to leave the baseline cohort unchanged.
  await db.exec("update public.structured_media_schedules s set next_due_at=clock_timestamp()+interval '1 day' from public.v3_pilot_watches p where p.watch_id=s.watch_id and p.slot is not null");
  let calls=0;const result=await runPilotMonitoring({client,env,schedulerAuthorized:true,feed,currency,model:async req=>{calls++;return {action:'ALERT',evidence_status:'STRONG_UNCONFIRMED',reason:'Credible materially new independently corroborated reports, not officially confirmed.',novelty_summary:'A new report.',condition_check:null,evidence_refs:req.input.evidence.segments.filter(s=>['CLAIM','MEASUREMENT'].includes(s.role)).map(s=>s.id),provenance_refs:req.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)};}});
  // Currency baseline is already above threshold, so a second ALERT is fenced.
  assert.equal(result.claimed,8);assert.equal(result.completed,7);assert.equal(result.failed,1);assert.equal(calls,8);
  const n=(await db.query('select * from public.media_watch_notifications')).rows;assert.equal(n.length,7);assert.ok(n.every(n=>n.user_id===owner&&n.delivery_mode==='daily_digest'&&n.status==='pending'));
  const digest=await rpc('prepare_production_structured_digests',{p_since:'2026-10-30T00:00:00Z',p_owners:[owner]});assert.ok(!digest.error);assert.ok(digest.data.length>0);
 });
 await t.test('NO_ALERT creates no delivery; report consumes generic V3 metadata',async()=>{
  const prior=await count('media_watch_notifications');await db.query("update public.structured_media_schedules set next_due_at='2026-11-01T07:15:00Z' where watch_id=$1",[ids[0]]);
  const r=await runPilotMonitoring({client,env,schedulerAuthorized:true,feed,currency,model:async req=>({action:'NO_ALERT',evidence_status:'STRONG_UNCONFIRMED',reason:'Already represented in prior state.',novelty_summary:null,condition_check:null,evidence_refs:req.input.evidence.segments.filter(s=>s.role==='CLAIM').map(s=>s.id),provenance_refs:[]})});assert.equal(r.completed,1);assert.equal(await count('media_watch_notifications'),prior);
  let saved;const rows=(await db.query('select * from public.watches where id=$1',[ids[0]])).rows;
  const reportClient={from:()=>({select:()=>({eq:async(k,v)=>({data:(await db.query('select watch_id,engine from public.v3_pilot_watches where user_id=$1',[v])).rows})})}),rpc:async(name,p)=>{if(name==='production_watch_owners')return {data:[owner]};if(name==='morning_report_context')return {data:{pending:0,exists:false,watches:rows,revision:'generic-v3'}};if(name==='save_watch_report'){saved=p.p_report;return {data:true};}throw Error(name);}};
  await generateMorningReport({client:reportClient,env,schedulerAuthorized:true,at:Date.parse('2026-11-01T07:10:00Z')});assert.ok(saved.watchIdsConsidered.includes(ids[0]));
 });
});

test('capability connector retains exact comparison and rejects unimplemented conditions',()=>{
 assert.deepEqual(v3CurrencyCriteria(cases[6][1]),{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'});
 assert.equal(v3CurrencyCriteria('Tell me when GBP/EUR goes below 1.17.'),null);
 const text='Tell me when GBP/EUR goes below 1.17.';assert.equal(v3Capability({raw_input:text},ready(text)).decision.status,'UNSUPPORTED_FOR_NOW');
});
