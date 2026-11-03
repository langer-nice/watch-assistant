import test from 'node:test';
import assert from 'node:assert/strict';
import {runPilotMonitoring,evaluatePilot,PILOT_ENGINE,PILOT_OWNER,PILOT_SPECS} from './v3-pilot.js';
import {createBrainModel} from './v3-brain/provider.mjs';
import {fetchAndNormalizeFeed} from './check-watch-api.js';
import {diagnosticInvocationId,withV3ScheduledDiagnostics,markV3Stage,recordV3Failure} from './v3-scheduled-diagnostics.js';
import {getMonitoringFailureMessageKey} from '../src/js/watch-monitoring-errors.js';

const id='6344ff8d-2fbd-466e-8790-bdcfe698ff5c';
const env={V3_PILOT_ENABLED:'true',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true'};
const row={id,user_id:PILOT_OWNER,slot:4,engine:PILOT_ENGINE,instruction:PILOT_SPECS[3].instruction,baseline_at:'2026-10-31T19:00:00Z',prior_state:{entries:[]},understanding:{intent:{canonical_text:PILOT_SPECS[3].instruction,references:[{label:'Metallica',source_ref:'raw_input'}],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR'}}};
const feedResult={source:{title:'Fixture',url:'https://example.test/feed'},checkedAt:'2026-11-02T06:35:00Z',items:[{id:'article',title:'Metallica report',excerpt:'An offline report.',url:'https://example.test/article',publishedAt:'2026-11-01T15:00:00Z',source:'Fixture'}]};
const good=req=>({action:'NO_ALERT',evidence_status:'INSUFFICIENT',reason:'No qualifying new development.',novelty_summary:null,condition_check:null,evidence_refs:req.input.evidence.segments.filter(s=>s.role==='CLAIM').map(s=>s.id),provenance_refs:req.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)});
async function capture(run){const logs=[];const previous=console.error;console.error=(event,payload)=>logs.push({event,...payload});try{return {value:await run(),logs};}finally{console.error=previous;}}
async function execute(kind){
 const calls=[],requests=[];let feedCalls=0,brainCalls=0;
 const client={rpc:async(name,payload)=>{calls.push({name,payload});if(name==='get_media_watch_notification_locale')return {data:'en'};if(name==='claim_v3_pilot_checks')return {data:[{...row,token:'lease-not-for-logs'}]};if(name==='finish_v3_pilot_check'){if(kind==='persistence')throw Object.assign(Error('private SQL credential=secret'),{code:'42501'});if(kind==='returned-sql-error')return {error:{code:'42501',message:'private SQL data'}};return {data:true};}if(name==='fail_v3_pilot_check')return {data:null};throw Error(name);}};
 const result=await capture(()=>runPilotMonitoring({client,env,schedulerAuthorized:true,feed:async()=>{feedCalls++;if(kind==='source')throw Object.assign(Error('The feed request timed out.'),{code:'TIMEOUT'});return kind==='normalization'?{...feedResult,items:[]}:structuredClone(feedResult);},model:async req=>{brainCalls++;requests.push(req);if(kind==='brain')throw Object.assign(Error('private provider body'),{providerStatus:429});if(kind==='validation')return {};if(kind==='refs')return {...good(req),evidence_refs:['invented']};return good(req);}}));
 return {...result,calls,requests,feedCalls,brainCalls};
}
test('scheduled failures record exact stages while preserving summary, calls and failure RPC',async()=>{
 for(const [kind,stage,brain,refs,persist] of [['source','SOURCE_ACQUISITION',false,false,false],['normalization','EVIDENCE_NORMALIZATION',false,false,false],['brain','BRAIN_CALL',true,false,false],['validation','BRAIN_RESPONSE_VALIDATION',true,false,false],['refs','EVIDENCE_REF_ADMISSION',true,true,false],['persistence','RESULT_PERSISTENCE',true,true,true],['returned-sql-error','RESULT_PERSISTENCE',true,true,true]]){
  const r=await execute(kind);assert.deepEqual(r.value,{status:'partial-success',claimed:1,completed:0,failed:1});assert.equal(r.logs.length,1);
  const d=r.logs[0];assert.equal(d.stage,stage);assert.equal(d.watch_id,id);assert.equal(d.engine,PILOT_ENGINE);assert.equal(d.invocation_type,'scheduled');assert.equal(d.Brain_reached,brain);assert.equal(d.refs_admission_reached,refs);assert.equal(d.persistence_attempted,persist);assert.equal(d.persistence_succeeded,false);assert.equal(r.feedCalls,1);assert.equal(r.brainCalls,brain?1:0);
  assert.deepEqual(r.calls.at(-1),{name:'fail_v3_pilot_check',payload:{p_id:id,p_token:'lease-not-for-logs'}});assert.equal(r.calls.filter(c=>c.name==='finish_v3_pilot_check').length,persist?1:0);
  for(const k of ['diagnostic_id','check_attempt_id','invocation_id'])assert.match(d[k],/^[a-f0-9-]{36}$/);assert(!JSON.stringify(r.logs).includes('lease-not-for-logs'));
  if(persist)assert.equal(d.error_code,'42501');if(kind==='brain')assert.equal(d.provider_http_status,429);
 }
});
test('success has no failure diagnostic and uses unchanged Brain and persistence payloads',async()=>{
 const r=await execute('success');assert.deepEqual(r.value,{status:'success',claimed:1,completed:1,failed:0});assert.equal(r.logs.length,0);assert.equal(r.feedCalls,1);assert.equal(r.brainCalls,1);assert.equal(r.calls.length,3);
 const saved=r.calls.find(c=>c.name==='finish_v3_pilot_check');assert.deepEqual(Object.keys(saved.payload),['p_id','p_token','p_result']);assert.equal(saved.payload.p_id,id);assert.equal(saved.payload.p_token,'lease-not-for-logs');
 const direct=await evaluatePilot(row,{feed:async()=>structuredClone(feedResult),model:async req=>{const actual=structuredClone(req),expected=structuredClone(r.requests[0]);const normalize=v=>JSON.stringify(v).replace(/e[a-f0-9]{32}/g,'REF');assert.equal(normalize(actual),normalize(expected));return good(req);}});
 const normalize=v=>JSON.stringify(v).replace(/e[a-f0-9]{32}/g,'REF');assert.equal(normalize(saved.payload.p_result),normalize(direct));
});
test('non scheduled evaluator/manual context emits no diagnostic; public error copy stays unchanged',async()=>{
 const r=await capture(()=>evaluatePilot(row,{feed:async()=>structuredClone(feedResult),model:async()=>({})}).catch(e=>e));assert(r.value instanceof Error);assert.equal(r.logs.length,0);
 const disabled=await capture(()=>runPilotMonitoring({env,schedulerAuthorized:false}));assert.deepEqual(disabled.value,{status:'disabled',claimed:0});assert.equal(disabled.logs.length,0);
 assert.equal(getMonitoringFailureMessageKey('V3_PILOT_CHECK_FAILED'),'detail.checkFailed');assert.equal(getMonitoringFailureMessageKey('CHECK_FAILED'),'detail.checkFailure.temporary');
});
test('provider request is unchanged; malformed JSON is response validation, not transport',async()=>{
 const requests=[];const model=createBrainModel({apiKey:'sk-test-secret',fetchImpl:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({status:'completed',output_text:'{bad-json'}),{status:200});}});
 const r=await capture(()=>withV3ScheduledDiagnostics({invocation_id:diagnosticInvocationId(),watch_id:id,engine:PILOT_ENGINE},async()=>{try{markV3Stage('BRAIN_CALL');await model({instructions:'unchanged instructions',input:{test:true},response_schema:{type:'object'}});}catch(e){recordV3Failure(e);}}));
 assert.equal(requests.length,1);assert.equal(requests[0].url,'https://api.openai.com/v1/responses');assert.equal(requests[0].options.headers.Authorization,'Bearer sk-test-secret');assert.deepEqual(JSON.parse(requests[0].options.body),{model:'gpt-5.6-luna',store:false,instructions:'unchanged instructions',input:'{"test":true}',reasoning:{effort:'low'},max_output_tokens:3000,text:{verbosity:'low',format:{type:'json_schema',name:'v3_brain_judgment',strict:true,schema:{type:'object'}}}});
 assert.equal(r.logs[0].stage,'BRAIN_RESPONSE_VALIDATION');assert.equal(r.logs[0].provider_http_status,200);assert(!JSON.stringify(r.logs).includes('sk-test-secret'));
});
test('real acquisition parser boundary and HTTP status are observed without retry',async()=>{
 let requests=0;const r=await capture(()=>withV3ScheduledDiagnostics({invocation_id:diagnosticInvocationId(),watch_id:id,engine:PILOT_ENGINE},async()=>{try{markV3Stage('SOURCE_ACQUISITION');await fetchAndNormalizeFeed('https://example.test/feed',{lookup:async()=>[{address:'93.184.216.34',family:4}],fetchImpl:async()=>{requests++;return new Response('<rss><broken>',{status:200,headers:{'content-type':'application/xml'}});}});}catch(e){recordV3Failure(e);}}));
 assert.equal(requests,1);assert.equal(r.logs.length,1);assert.equal(r.logs[0].stage,'EVIDENCE_NORMALIZATION');assert.equal(r.logs[0].provider_http_status,200);
});
test('arbitrary exception contents, credentials and private source text are not logged; logger errors are inert',async()=>{
 const secret='sk-secret Authorization: Bearer eyJtoken cookie=private user article content';
 const r=await capture(()=>withV3ScheduledDiagnostics({invocation_id:diagnosticInvocationId(),watch_id:id,engine:PILOT_ENGINE},async()=>recordV3Failure(Object.assign(Error(secret),{name:secret,code:secret,providerCode:secret,cause:{name:secret,code:secret},headers:{authorization:secret},body:secret}))));
 const logged=JSON.stringify(r.logs);assert(!logged.includes(secret));assert(!logged.includes('eyJtoken'));assert.equal(r.logs[0].error_message,'[redacted: unrecognized error message]');assert.equal(r.logs[0].error_code,null);
 const prev=console.error;console.error=()=>{throw Error('Logger unavailable');};try{await withV3ScheduledDiagnostics({invocation_id:diagnosticInvocationId(),watch_id:id,engine:PILOT_ENGINE},async()=>recordV3Failure(Error(secret)));}finally{console.error=prev;}
});
test('concurrent scheduled contexts keep Watch and invocation correlation isolated',async()=>{
 const invocation_id=diagnosticInvocationId(),other='ee7ab4fd-c271-49ff-ab43-f41bb7d482e3';const r=await capture(()=>Promise.all([id,other].map(watch_id=>withV3ScheduledDiagnostics({invocation_id,watch_id,engine:PILOT_ENGINE},async()=>{await Promise.resolve();markV3Stage(watch_id===id?'SOURCE_ACQUISITION':'RESULT_PERSISTENCE');recordV3Failure(Error('Pilot completion fenced'));}))));
 assert.equal(new Set(r.logs.map(l=>l.diagnostic_id)).size,2);assert(r.logs.every(l=>l.invocation_id===invocation_id));assert.equal(r.logs.find(l=>l.watch_id===id).stage,'SOURCE_ACQUISITION');assert.equal(r.logs.find(l=>l.watch_id===other).stage,'RESULT_PERSISTENCE');
});
test('claim errors retain the existing thrown failure and do not start source/model work',async()=>{
 let calls=0;
 const r=await capture(()=>runPilotMonitoring({env,schedulerAuthorized:true,client:{rpc:async()=>{calls++;return {error:{code:'42501',message:'private database detail'}};}}}).catch(e=>e));
 assert.equal(calls,1);assert.equal(r.value.message,'Pilot claim failed');assert.equal(r.logs.length,1);assert.equal(r.logs[0].stage,'WATCH_LOAD');assert.equal(r.logs[0].watch_id,null);assert.equal(r.logs[0].error_code,'42501');assert.equal(r.logs[0].Brain_reached,false);
});
test('baseline call count and product failure survive unavailable diagnostic logging',async()=>{
 let calls=0;const baseline=await capture(()=>evaluatePilot({...row,baseline_at:null},{feed:async()=>structuredClone(feedResult),model:async()=>{calls++;throw Error('must not call');}}));
 assert.equal(calls,0);assert.equal(baseline.value.judgment,null);assert.equal(baseline.logs.length,0);
 const previous=console.error;console.error=()=>{throw Error('logger down');};let failures=0;
 try{const result=await runPilotMonitoring({env,schedulerAuthorized:true,client:{rpc:async name=>name==='claim_v3_pilot_checks'?{data:[row]}:name==='get_media_watch_notification_locale'?{data:'en'}:(failures++,{data:null})},model:good,feed:async()=>{throw Error('source down');}});assert.equal(result.failed,1);assert.equal(failures,1);}finally{console.error=previous;}
});
