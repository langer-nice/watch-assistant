import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
import {PILOT_OWNER,PILOT_SPECS,pilotSource,preparePilot,evaluatePilot,PILOT_ENGINE,connectorCurrencyRequest} from './v3-pilot.js';
const understanding=(text)=>({capture_id:'capture',intent:{canonical_text:text,references:[],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR'}});
test('private pilot SQL: auth, atomic slots, baseline, fence, outbox and pause',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;create function public.test_pilot_clock() returns timestamptz language sql as $$select '2026-10-31T07:16:00Z'::timestamptz$$;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).sort().filter(x=>x.endsWith('.sql')&&x!=='20261022160000_private_morning_reports.sql'))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;','').replaceAll('clock_timestamp()','public.test_pilot_clock()'));
 await db.query('insert into auth.users values($1,$2)',[PILOT_OWNER,'pilot@example.test']);
 const role=async(r,sql,args=[])=>{await db.exec(`set role ${r};set request.jwt.claim.role='${r}'`);try{return await db.query(sql,args);}finally{await db.exec('reset role;reset request.jwt.claim.role');}};
 await assert.rejects(role('authenticated','select public.create_v3_pilot(1,$1,$2)',[understanding(PILOT_SPECS[0].instruction),pilotSource(PILOT_SPECS[0])]),/permission denied/);
 const ids=[];
 for(let i=0;i<4;i++){
 const args=[i+1,understanding(PILOT_SPECS[i].instruction),pilotSource(PILOT_SPECS[i])];
 const id=(await role('service_role','select public.create_v3_pilot($1,$2,$3) id',args)).rows[0].id;ids.push(id);
 assert.equal((await role('service_role','select public.create_v3_pilot($1,$2,$3) id',args)).rows[0].id,id);
 }
 assert.equal((await db.query('select count(*)::int n from public.watches')).rows[0].n,4);
 let claimed=(await role('service_role','select public.claim_v3_pilot_checks() rows')).rows[0].rows;assert.equal(claimed.length,4);assert.deepEqual(claimed.find(r=>r.slot===2).criteria,{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'});
 const results=claimed.map((r,i)=>({evidence:{id:'baseline-'+i,title:'Baseline',content:'Known development',source:'Test',url:'https://example.test/feed'},items:[{id:'baseline-'+i,title:'Known development',url:'https://example.test/article',publishedAt:'2026-10-31T00:00:00Z'}],judgment:null,article:null}));
 for(let i=0;i<claimed.length;i++)assert.equal((await role('service_role','select public.finish_v3_pilot_check($1,$2,$3) ok',[claimed[i].id,claimed[i].token,results[i]])).rows[0].ok,true);
 assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
 assert.equal(new Date((await db.query('select next_due_at from public.structured_media_schedules limit 1')).rows[0].next_due_at).toISOString(),'2026-11-01T06:00:00.000Z');
 await db.exec("update public.structured_media_schedules set next_due_at='2026-10-31T07:15:00Z'");
 claimed=(await role('service_role','select public.claim_v3_pilot_checks() rows')).rows[0].rows;
 const r=claimed[0],base=results[0];
 const alert={...base,evidence:{...base.evidence,id:'new-event'},judgment:{action:'ALERT',evidence_status:'CONFIRMED',evidence_basis:[{quote:'A new development'}]},article:{title:'CONFIRMED: A new development',url:'https://example.test/new',publishedAt:'2026-10-31T00:00:00Z',source:'Test'}};
 assert.equal((await role('service_role','select public.finish_v3_pilot_check($1,$2,$3) ok',[r.id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',alert])).rows[0].ok,false);
 assert.equal((await role('service_role','select public.finish_v3_pilot_check($1,$2,$3) ok',[r.id,r.token,alert])).rows[0].ok,true);
 const n=(await db.query('select * from public.media_watch_notifications')).rows;assert.equal(n.length,1);assert.equal(n[0].delivery_mode,'daily_digest');assert.equal(n[0].status,'pending');
 assert.equal((await role('service_role','select public.finish_v3_pilot_check($1,$2,$3) ok',[r.id,r.token,alert])).rows[0].ok,false);
 const prepared=(await role('service_role',"select public.prepare_production_structured_digests('2026-10-30T00:00:00Z',array[$1]::uuid[]) ids",[PILOT_OWNER])).rows[0].ids;assert.equal(prepared.length,1);
 const claimedDigest=(await role('service_role',"select public.claim_production_structured_digest($1,$2,array[$3]::uuid[],'2026-10-30T00:00:00Z') value",[prepared[0],'dddddddd-dddd-4ddd-8ddd-dddddddddddd',PILOT_OWNER])).rows[0].value;
 assert.equal(claimedDigest.is_structured,true);assert.equal(claimedDigest.articles.length,1);
 await db.query("update public.watches set monitoring_state='paused' where id=$1",[r.id]);
 assert.equal((await role('service_role','select public.media_digest_consent($1,$2) ok',[r.id,PILOT_OWNER])).rows[0].ok,false);
 for(const r of ['anon','authenticated'])await assert.rejects(role(r,'select * from public.v3_pilot_watches'),/permission denied/);
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.v3_pilot_watches'::regclass")).rows[0].relrowsecurity,true);
 }finally{await db.close();}
});

const readyModel=async req=>({intent:{canonical_text:req.input.capture.raw_input,references:[{label:req.input.capture.raw_input.includes('Metallica')?'Metallica':req.input.capture.raw_input.includes('Apple')?'Apple':req.input.capture.raw_input.includes('GBP')?'GBP/EUR':'Manchester City',source_ref:'raw_input'}],explicit_constraints:[{kind:'condition',text:req.input.capture.raw_input,source_ref:'raw_input'}],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'The identified subject and condition are operationally complete.'}});
test('all four exact captures reach the validated Intent boundary once without resource invention',async()=>{
 for(const spec of PILOT_SPECS){let calls=0;const r=await preparePilot(spec.instruction,{model:async req=>{calls++;assert.equal(req.input.capture.raw_input,spec.instruction);return readyModel(req);}});assert.equal(calls,1);assert.equal(r.instruction,spec.instruction);assert.equal(r.understanding.intent.explicit_constraints[0].text,spec.instruction);assert.ok(r.understanding.intent.references.every(x=>!x.exact_url));}
});
const rowFor=async slot=>({slot,criteria:slot===2?{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'}:null,user_id:PILOT_OWNER,engine:PILOT_ENGINE,instruction:PILOT_SPECS[slot-1].instruction,understanding:(await preparePilot(PILOT_SPECS[slot-1].instruction,{model:readyModel})).understanding,baseline_at:'2026-10-30T00:00:00Z',prior_state:{entries:[]}});
const modelFor=(action,status,reason)=>async req=>({action,evidence_status:status,reason,novelty_summary:action==='ALERT'?'A new development':null,condition_check:null,evidence_refs:req.input.evidence.segments.filter(x=>x.role==='CLAIM'||x.role==='MEASUREMENT').map(x=>x.id),provenance_refs:req.input.evidence.segments.filter(x=>x.role==='PROVENANCE').map(x=>x.id)});
const feedFor=(title,excerpt,source='Apple Newsroom')=>async()=>({source:{title:source,url:'https://example.test/feed'},checkedAt:'2026-10-31T00:00:00Z',items:[{id:'article-1',title,excerpt,url:'https://example.test/article',source,publishedAt:'2026-10-31T00:00:00Z'}]});
test('news adapter preserves refs, confirmed/duplicate actions and announcement scope without extra calls',async()=>{
 for(const [slot,title,excerpt,action] of [[1,'Manchester City appoint new coach','The club confirmed a new coach.','ALERT'],[1,'Manchester City appoint new coach','Already known appointment.','NO_ALERT'],[3,'Apple announces a new MacBook','Apple today introduced a new Mac.','ALERT'],[3,'Apple announces a new iPhone','No Mac product announced.','NO_ALERT'],[3,'Old Mac launch revisited','The product was announced previously.','NO_ALERT']]){
 let calls=0;const r=await evaluatePilot(await rowFor(slot),{feed:feedFor(title,excerpt),model:async req=>{calls++;return modelFor(action,'CONFIRMED','The supplied evidence supports the selected action.')(req);}});assert.equal(calls,1);assert.equal(r.judgment.action,action);assert.equal(!!r.article,action==='ALERT');assert.ok(r.judgment.evidence_basis.every(x=>typeof x.text==='string'));}
});
test('currency comparison is exact: 1.169 and equality cannot alert; 1.171 can',async()=>{
 for(const rate of ['1.169','1.170','1.171']){
 const currency=async request=>{assert.equal(request,'GBP > 1.17 EUR');return {criteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'},observation:{base:'GBP',quote:'EUR',rate,date:'2026-10-31'},checkedAt:'2026-10-31T00:00:00Z'};};
 const expected=rate==='1.171'?'ALERT':'NO_ALERT';
 const r=await evaluatePilot(await rowFor(2),{currency,model:modelFor(expected,'CONFIRMED','The exact comparison and prior state determine this observation.')});assert.equal(r.judgment.action,expected);assert.equal(!!r.article,expected==='ALERT');
 if(expected==='NO_ALERT')await assert.rejects(evaluatePilot(await rowFor(2),{currency,model:modelFor('ALERT','CONFIRMED','Attempted invalid alert.')}),/Numeric condition/);
 }
});
test('Metallica strong, weak and duplicate admissions preserve qualification and prior state',async()=>{
 for(const [action,status,reason] of [['ALERT','STRONG_UNCONFIRMED','Credible independent reports suggest new dates; not officially confirmed.'],['NO_ALERT','WEAK_UNCONFIRMED','A single anonymous rumor is insufficient.'],['NO_ALERT','STRONG_UNCONFIRMED','These unconfirmed reports were already alerted.']]){
 const row=await rowFor(4);row.prior_state={entries:[{id:'prior',fact:'Earlier Europe 2027 reports',alerted:true}]};
 const r=await evaluatePilot(row,{feed:feedFor('Metallica Europe 2027 reports','Two separate publications report possible concerts.','News reports'),model:async req=>{assert.equal(req.input.prior_state.entries[0].alerted,true);return modelFor(action,status,reason)(req);}});assert.equal(r.judgment.evidence_status,status);assert.equal(!!r.article,action==='ALERT');if(r.article)assert.match(r.article.title,/Unconfirmed reports/);
 }
});
test('baseline makes no judgment call and bad refs cannot reach delivery',async()=>{
 const row=await rowFor(3);row.baseline_at=null;const result=await evaluatePilot(row,{feed:feedFor('Known Mac','Existing product.'),model:()=>{throw Error('Model must not run');}});assert.equal(result.judgment,null);assert.equal(result.article,null);
 row.baseline_at='2026-10-30T00:00:00Z';await assert.rejects(evaluatePilot(row,{feed:feedFor('New Mac','Apple introduced a Mac.'),model:async()=>({action:'ALERT',evidence_status:'CONFIRMED',reason:'New Mac.',evidence_refs:['invented'],provenance_refs:[]})}),/reference/i);
});

test('pilot creation capability is private and scoped to the authenticated owner',async()=>{
 const {createStructuredWatchMiddleware}=await import('./structured-watch-api.js');
 const env={V3_PILOT_ENABLED:'true',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true'};
 for(const id of [PILOT_OWNER,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']){
 let body;const res={setHeader(){},end(text){body=JSON.parse(text);}};
 await createStructuredWatchMiddleware({env,authenticate:async()=>({user:{id},client:{}})})({method:'GET',url:'/api/structured-watches'},res);
 assert.equal(res.statusCode,200);assert.equal(body.v3Pilot===true,id===PILOT_OWNER);assert.ok(!JSON.stringify(body).includes(PILOT_OWNER));
 }
 const browserCode=await readFile(new URL('../src/js/structured-watch-creation.js',import.meta.url),'utf8');assert.ok(!browserCode.includes(PILOT_OWNER));for(const spec of PILOT_SPECS)assert.ok(!browserCode.includes(spec.instruction));
});

test('typed currency bridge uses the real ECB parser without rewriting Capture',async()=>{
 const {fetchCurrencyRate}=await import('./currency-rate.js');
 const {parseCurrencyRequest}=await import('../src/js/currency-watch.js');
 assert.equal(parseCurrencyRequest(PILOT_SPECS[1].instruction),null);
 const row=await rowFor(2);row.baseline_at=null;let requests=0;
 const result=await evaluatePilot(row,{currency:request=>fetchCurrencyRate(request,{now:()=>new Date('2026-10-31T18:00:00Z'),fetchImpl:async()=>{requests++;return new Response('<Envelope><Cube><Cube time="2026-10-30"><Cube currency="GBP" rate="0.83380"/></Cube></Cube></Envelope>',{status:200});}}),model:()=>assert.fail('Baseline must not call Brain')});
 assert.equal(requests,1);assert.equal(result.evaluation.operator,'gt');assert.equal(result.evaluation.target,'1.17');assert.equal(result.evaluation.met,true);assert.equal(result.article,null);assert.equal(row.understanding.intent.canonical_text,PILOT_SPECS[1].instruction);
 assert.throws(()=>connectorCurrencyRequest({base:'GBP',quote:'EUR',operator:'lt',target:'1.17'}),/criteria/);
});

test('only authenticated pilot rows receive typed read compatibility; legacy parsing stays unchanged',async()=>{
 const {createMediaWatchMiddleware}=await import('./media-watch-api.js');
 const {mapMediaReportRow}=await import('../src/js/media-watch-row.js');
 const {currencyCriteriaFor,parseCurrencyRequest}=await import('../src/js/currency-watch.js');
 const {mediaWatchDefinition}=await import('../src/js/media-watch-definition.js');
 const id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const definition={inputType:'text',request:PILOT_SPECS[1].instruction,category:'finance',currencyCriteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'},currencyRevision:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',currencyLanguage:'en',currencyPolicy:'crossing'};
 const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co'};
 for(const owner of [PILOT_OWNER,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']){
  const row={id,user_id:owner,title:'GBP/EUR > 1.17',watch_definition:definition,monitoring_source:pilotSource(PILOT_SPECS[1]),monitoring_state:'monitoring',current_status:'watching',created_at:'2026-10-31T00:00:00Z'};
  const query={select(){return this;},eq(key,value){if(key==='user_id')assert.equal(value,owner);return this;},order(){return this;},async range(){return {data:[row],error:null};}};
  const handler=createMediaWatchMiddleware({env,authenticate:async()=>({user:{id:owner},client:{from:()=>query}}),serviceClient:{from:()=>({select:()=>({eq:async(key,value)=>{assert.equal(key,'user_id');assert.equal(value,PILOT_OWNER);return {data:[{watch_id:id,engine:PILOT_ENGINE}],error:null};}})})}});
  let body;const res={setHeader(){},end(text){body=JSON.parse(text);}};await handler({url:'/api/media-watches',method:'GET'},res);assert.equal(res.statusCode,200);
  const watch=mapMediaReportRow(body.watches[0],owner);
  if(owner===PILOT_OWNER){assert.deepEqual(currencyCriteriaFor(watch),definition.currencyCriteria);assert.equal(mediaWatchDefinition(watch).watch_definition.request,definition.request);}else assert.equal(watch.v3Engine,undefined);
 }
 assert.equal(parseCurrencyRequest(PILOT_SPECS[1].instruction),null);
});

test('Morning Brief reuses pilot read metadata without changing stored snapshots or selecting deleted rows',async()=>{
 const {generateMorningReport}=await import('./morning-report.js');
 const id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';let saved;
 const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',MORNING_REPORT_PRODUCTION_ENABLED:'true'};
 const row={id,user_id:PILOT_OWNER,title:'GBP/EUR > 1.17',type:'media_news',watch_definition:{inputType:'text',request:PILOT_SPECS[1].instruction,category:'finance',currencyCriteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'},currencyRevision:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',currencyPolicy:'crossing'},monitoring_source:pilotSource(PILOT_SPECS[1]),monitoring_state:'monitoring',current_status:'watching',created_at:'2026-10-30T00:00:00Z',last_checked_at:'2026-10-31T07:05:00Z',last_check_outcome:'baseline'};
 const original=structuredClone(row);
 const client={from:()=>({select:()=>({eq:async()=>({data:[{watch_id:id,engine:PILOT_ENGINE}],error:null})})}),rpc:async(name,p)=>{if(name==='production_watch_owners')return {data:[PILOT_OWNER]};if(name==='morning_report_context')return {data:{pending:0,exists:false,watches:[row],revision:'unchanged-source-revision'}};if(name==='save_watch_report'){saved=p.p_report;return {data:true};}assert.fail(name);}};
 await generateMorningReport({client,env,schedulerAuthorized:true,at:Date.parse('2026-10-31T07:10:00Z')});
 assert.ok(saved.watchIdsConsidered.includes(id));assert.ok(saved.entries.some(e=>e.watchId===id));assert.equal(saved.sourceRevision,'unchanged-source-revision');assert.deepEqual(row,original);
});
