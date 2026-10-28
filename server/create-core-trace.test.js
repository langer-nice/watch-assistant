import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createCoreTrace, traceCreateStage, summarizeCreateExtraction } from './create-core-trace.js';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { reviewCreateExtraction, createWatchContractFromInterpretation } from './create-contract-bridge.js';
import { normalizeWatchContract } from './watch-contract.js';
import { projectWatchContractToLegacyPlan } from './create-contract-projection.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';

const request='Tell me when there are important new developments about Manchester City.';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={VERCEL_ENV:'test',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',CREATE_CORE_REPLACEMENT_ENABLED:'true',
  STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner};
const raw=()=>{
  const {originalRequest,...v}=fixture(request,[individual('s','Manchester City')],[predicate('n','news_about',['s'])]);
  v.evidence=v.evidence.map(({path,text})=>({path,quote:text,context:null}));return v;
};
const capture=()=>{
  const events=[];const logger={info(label,data){assert.equal(label,'create_core_trace');events.push(data);}};
  return {events,logger,trace:createCoreTrace(logger)};
};
async function invoke(output=raw(),overrides={},body={request,language:'en',operation:'create'}){
  const c=capture();
  const handler=createPlanWatchMiddleware({env,authenticate:async()=>({user:{id:owner}}),apiKey:'fixture-only',
    fetchImpl:async()=>Response.json({output_text:JSON.stringify(output)}),logger:c.logger,...overrides});
  const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.url='/api/plan-watch?mode=create-core.v1';
  const res={setHeader(){},end(s){this.body=JSON.parse(s);}};
  await handler(req,res);return {...c,status:res.statusCode,body:res.body};
}
const firstFailure=events=>events.find(e=>e.status==='FAIL');

test('successful mocked flow emits ordered actual boundaries and preserves functional API output',async()=>{
  const r=await invoke();assert.equal(r.status,200);
  assert.deepEqual(r.body,reviewCreateExtraction(raw(),request));
  const pass=r.events.filter(e=>e.status==='PASS').map(e=>e.stage);
  assert.deepEqual(pass,['request_received','create_core_route_selected','provider_call','provider_output_parse','interpretation_candidate',
    'normalizer','contract_bridge','normalizer','normalizer','projection','capability_resolution','review_response','request_completed']);
  assert.equal(new Set(r.events.map(e=>e.correlationId)).size,1);
  assert(r.events.every(e=>e.mode==='create-core.v1'));
});

test('provider HTTP failure identifies provider stage, status and final unchanged API error',async()=>{
  const r=await invoke(raw(),{fetchImpl:async()=>new Response('never logged',{status:429})});
  assert.equal(r.status,503);assert.equal(r.body.code,'AI_SERVICE_UNAVAILABLE');
  assert.equal(firstFailure(r.events).stage,'provider_call');assert.equal(firstFailure(r.events).providerStatus,429);
  assert.equal(r.events.at(-1).httpStatus,503);assert.equal(r.events.at(-1).firstFailingStage,'provider_call');
});

test('provider parse failure identifies parser while preserving existing 502 response',async()=>{
  const r=await invoke(raw(),{fetchImpl:async()=>Response.json({output_text:'{raw prompt secret parse failure'})});
  assert.equal(r.status,502);assert.equal(r.body.code,'INTERPRETATION_FAILED');
  assert.equal(firstFailure(r.events).stage,'provider_output_parse');assert.equal(firstFailure(r.events).code,'SYNTAX_ERROR');
  assert.equal(r.events.at(-1).lastSuccessfulStage,'provider_call');
  assert(!JSON.stringify(r.events).includes('raw prompt secret'));
});

test('candidate shape failure is distinct from bridge failure',async()=>{
  const r=await invoke(null);assert.equal(r.status,502);assert.equal(firstFailure(r.events).stage,'interpretation_candidate');
});

test('bridge schema failure identifies bridge and bounded structure only',async()=>{
  const v=raw();delete v.subjects;const r=await invoke(v);
  assert.equal(r.status,422);assert.equal(r.body.code,'INVALID_CREATE_CONTRACT');
  const e=firstFailure(r.events);assert.equal(e.stage,'contract_bridge');assert.equal(e.summary.check,'output_schema');
  assert(e.summary.missingFields.includes('subjects'));
});

test('normalizer failure survives bridge error wrapping as the first failing stage',async()=>{
  const v=raw();v.topics=[{label:'Manchester City',role:'required'}];
  v.evidence.push({path:'/topics/0',quote:'Manchester City',context:null});
  const r=await invoke(v);assert.equal(r.status,422);assert.equal(r.body.code,'INVALID_CREATE_CONTRACT');
  assert.equal(firstFailure(r.events).stage,'normalizer');assert.equal(firstFailure(r.events).reason,'invented_constraint');
  assert.equal(r.events.at(-1).firstFailingStage,'normalizer');
});

test('projection boundary identifies downstream validation failure without altering rejection',()=>{
  const label='A'.repeat(201),original=`Tell me when there are important new developments about ${label}.`;
  const span=(field,text)=>({field,source_id:'request',start:original.indexOf(text),end:original.indexOf(text)+text.length,text});
  const contract=normalizeWatchContract({user_intent_text:original,subject:[{kind:'entity',value:label}],
    trigger:{kind:'development',target:'important new developments',comparison:null},constraints:[],time_scope:[],
    evidence:[span('subject/0',label),span('trigger','important new developments')]});
  const c=capture();
  assert.throws(()=>projectWatchContractToLegacyPlan(contract),{code:'INTERPRETATION_FAILED'});
  assert.throws(()=>projectWatchContractToLegacyPlan(contract,c.trace),{code:'INTERPRETATION_FAILED'});
  assert.equal(firstFailure(c.events).stage,'projection');
});

for(const stage of ['capability_resolution','review_response'])test(`${stage} wrapper identifies synthetic boundary exception and rethrows the identical error`,()=>{
  // These pure successful functions have no injectable failures. Exercise their
  // exact shared tracing wrapper rather than adding production fault hooks.
  const c=capture(),error=Object.assign(Error('SECRET request/model body'),{code:'private-secret-code',reason:'private-secret-reason'});
  assert.throws(()=>traceCreateStage(c.trace,stage,()=>{throw error;}),e=>e===error);
  assert.equal(firstFailure(c.events).stage,stage);assert.equal(firstFailure(c.events).code,'UNCLASSIFIED_ERROR');
  assert(!JSON.stringify(c.events).includes('SECRET'));assert(!JSON.stringify(c.events).includes('private-secret'));
});

test('raw prompt, output, names, quotes, account data, credentials and unknown keys never enter logs',async()=>{
  const v=raw(),r=await invoke(v);const serialized=JSON.stringify(r.events);
  for(const value of [request,'Manchester City',owner,'fixture-only',JSON.stringify(v)])assert(!serialized.includes(value));
  const summary=summarizeCreateExtraction({...v,['SECRET full prompt key']:'SECRET model body',language:'SECRET locale'});
  assert(!JSON.stringify(summary).includes('SECRET'));assert.equal(summary.language,'OTHER');assert.equal(summary.unknownKeyCount,1);
  assert.equal(summary.arrayLengths.subjects,1);
});

test('logger failure cannot alter accepted/rejected API behavior',async()=>{
  const logger={info(){throw Error('log sink unavailable');}};
  const yes=await invoke(raw(),{logger});assert.equal(yes.status,200);assert.deepEqual(yes.body,reviewCreateExtraction(raw(),request));
  const v=raw();delete v.subjects;const no=await invoke(v,{logger});assert.equal(no.status,422);assert.equal(no.body.code,'INVALID_CREATE_CONTRACT');
});

test('new-mode routing/method errors emit final stage/status; legacy mode emits no Create trace',async()=>{
  const r=await invoke(raw(),{}, {request,operation:'update'});
  assert.equal(r.status,400);assert.equal(r.events.at(-1).firstFailingStage,'create_core_route_selected');
  const c=capture(),res={setHeader(){},end(s){this.body=JSON.parse(s);}};
  const handler=createPlanWatchMiddleware({env,logger:c.logger});
  await handler({url:'/api/plan-watch?mode=create-core.v1',method:'GET'},res);
  assert.equal(res.statusCode,405);assert.equal(c.events.at(-1).httpStatus,405);
  c.events.length=0;
  await handler({url:'/api/plan-watch?mode=interpretation.v1',method:'GET'},res);
  assert.equal(res.statusCode,405);assert.equal(c.events.length,0);
});
