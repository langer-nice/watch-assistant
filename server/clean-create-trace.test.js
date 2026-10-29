import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { format } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createCleanCreateTrace,cleanStage } from './clean-create-trace.js';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { createFrameFixture as cleanCreateExtraction,frameRequests as cleanCreateRequests } from './test-support/create-frame-fixtures.js';
import { normalizeWatchContract } from './watch-contract.js';
import { projectWatchContractToLegacyPlan } from './create-contract-projection.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={VERCEL_ENV:'test',CREATE_CORE_REPLACEMENT_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',
  STRUCTURED_WATCH_BACKEND_ENABLED:'true',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_TEST_USER_IDS:owner};
function capture(){
  const events=[],rendered=[];
  return {events,rendered,logger:{info(label,json){assert.equal(label,'clean_create_trace');events.push(JSON.parse(json));rendered.push(format(label,json));}}};
}
async function invoke(output=cleanCreateExtraction(0),overrides={},body={request:cleanCreateRequests[0],operation:'create'},url='/api/plan-watch?mode=create-core.v1',method='POST'){
  const c=capture();
  const handler=createPlanWatchMiddleware({env,authenticate:async()=>({user:{id:owner}}),apiKey:'fixture-secret',
    fetchImpl:async()=>Response.json({output_text:JSON.stringify(output)}),logger:c.logger,...overrides});
  const req=Readable.from([typeof body==='string'?body:JSON.stringify(body)]);req.url=url;req.method=method;
  const res={setHeader(){},end(s){this.body=JSON.parse(s);}};await handler(req,res);
  return {...c,status:res.statusCode,body:res.body};
}
const first=r=>r.events.find(e=>e.status==='FAIL');
test('successful clean request records actual nested stages and serialized safe summaries',async()=>{
  const r=await invoke();assert.equal(r.status,200);
  assert.deepEqual(r.events.filter(e=>e.status==='PASS'&&!e.event).map(e=>e.stage),[
    'request','semantic_extraction','semantic_validation','grounding','identity_resolution','watch_contract','normalizer','normalizer','normalizer','projection','capability','review']);
  assert.equal(new Set(r.events.map(e=>e.correlation_id)).size,1);
  assert.deepEqual(r.events.at(-1),{correlation_id:r.events[0].correlation_id,mode:'create-core.v1',stage:'review',status:'PASS',
    event:'response',http_status:200,last_pass_stage:'review',first_fail_stage:null});
  assert(r.rendered.some(s=>s.includes('"constraint_count":0')));assert(!r.rendered.some(s=>s.includes('[Object]')));
});
test('semantic extraction provider/parse failures identify extraction and unchanged HTTP',async()=>{
  for(const [fetchImpl,status,code]of [[async()=>new Response('',{status:429}),503,'AI_SERVICE_UNAVAILABLE'],
    [async()=>Response.json({output_text:'not json'}),502,'INTERPRETATION_FAILED']]){
    const r=await invoke(undefined,{fetchImpl});assert.equal(r.status,status);assert.equal(first(r).stage,'semantic_extraction');
    assert.equal(first(r).code,code);assert.equal(r.events.at(-1).http_status,status);
  }
});
test('semantic validation retains exact shape code/field before API wrapping',async()=>{
  const v=cleanCreateExtraction(0);delete v.subject;const r=await invoke(v);
  assert.equal(r.status,422);assert.equal(r.body.code,'INVALID_CREATE_CONTRACT');
  assert.equal(first(r).stage,'semantic_validation');assert.equal(first(r).code,'INVALID_CREATE_SEMANTIC_FRAME');assert.equal(first(r).reason,'schema');
  assert.equal(r.events.at(-1).last_pass_stage,'semantic_extraction');
});
test('grounding wrong identity and invented constraint preserve first stage/reason',async()=>{
  for(const [v,reason]of [[{...cleanCreateExtraction(0),subject:{kind:'named_entity',value:'Liverpool'}},'ungrounded_value'],
    [{...cleanCreateExtraction(0),constraints:[{value:'transfers',role:'required',support:cleanCreateRequests[0]}]},'ungrounded_value']]){
    const r=await invoke(v);assert.equal(r.status,422);assert.equal(first(r).stage,'grounding');assert.equal(first(r).reason,reason);
    assert.equal(r.events.at(-1).last_pass_stage,'semantic_validation');
  }
});
test('normalizer real rejection is distinct from successful grounding/handoff',async()=>{
  const request='Tell me when GBP/EUR goes above 0.';
  const v=cleanCreateExtraction(3);v.monitoring_goal.support=request;v.comparison={operator:'gt',value:'0',support:'above 0'};
  const r=await invoke(v,{}, {operation:'create',request});assert.equal(r.status,422);
  assert.equal(first(r).stage,'normalizer');assert.equal(first(r).reason,'amount_conflict');
  assert.equal(r.events.at(-1).last_pass_stage,'identity_resolution');
});
test('unsupported and partial capability are successful technical traces, not failures',async()=>{
  for(const index of [1,3,4]){
    const r=await invoke(cleanCreateExtraction(index),{}, {operation:'create',request:cleanCreateRequests[index]});
    assert.equal(r.status,200);assert(!first(r));
    assert.equal(r.events.find(e=>e.stage==='capability'&&e.status==='PASS').safe_summary.status,index===3?'PARTIALLY_SUPPORTED':'UNSUPPORTED');
  }
});
test('real projection exception identifies projection before capability outer wrapping',()=>{
  const name='A'.repeat(201),request=`Tell me when there are important new developments about ${name}.`;
  const anchor=(field,text)=>({field,source_id:'request',start:request.indexOf(text),end:request.indexOf(text)+text.length,text});
  const contract=normalizeWatchContract({user_intent_text:request,subject:[{kind:'entity',value:name}],trigger:{kind:'development',target:'important new developments',comparison:null},
    constraints:[],time_scope:[],evidence:[anchor('subject/0',name),anchor('trigger','important new developments')]});
  const c=capture();assert.throws(()=>projectWatchContractToLegacyPlan(contract,createCleanCreateTrace(c.logger)),{code:'INTERPRETATION_FAILED'});
  assert.equal(c.events.find(e=>e.status==='FAIL').stage,'projection');
});
for(const stage of ['watch_contract','capability','review'])test(`${stage}: synthetic construction/boundary exception preserves identity and first failure`,()=>{
  // These simple successful object-construction boundaries have no fault injection hooks.
  const c=capture(),trace=createCleanCreateTrace(c.logger),error=Object.assign(Error('PRIVATE'),{code:'PRIVATE'});
  assert.throws(()=>cleanStage(trace,stage,()=>{throw error;}),e=>e===error);
  trace.finish(422,'INVALID_CREATE_CONTRACT');assert.equal(c.events.at(-1).first_fail_stage,stage);
  assert.equal(c.events.at(-1).code,'UNCLASSIFIED_ERROR');assert(!c.rendered.join('').includes('PRIVATE'));
});
test('all early non-2xx clean responses identify request stage and final code/status',async()=>{
  for(const r of [await invoke(undefined,{},'not JSON'),await invoke(undefined,{},undefined,undefined,'GET'),
    await invoke(undefined,{env:{...env,CREATE_CORE_REPLACEMENT_ENABLED:'false'}}),
    await invoke(undefined,{authenticate:async()=>({user:null})})]){
    assert(r.status>=400);assert.equal(r.events.at(-1).first_fail_stage,'request');
    assert.equal(r.events.at(-1).http_status,r.status);assert(r.events.at(-1).code);assert.equal(r.events.at(-1).last_pass_stage,null);
  }
});
test('privacy, schema-invalid private keys and logger failure never change functional results',async()=>{
  const v={...cleanCreateExtraction(0),['PRIVATE field']:'PRIVATE output'},bad=await invoke(v),yes=await invoke();
  for(const r of [bad,yes])for(const secret of ['Manchester City',cleanCreateRequests[0],owner,'fixture-secret','PRIVATE'])assert(!r.rendered.join('').includes(secret));
  const logger={info(){throw Error('sink failure');}};
  assert.deepEqual((await invoke(undefined,{logger})).body,yes.body);
  assert.deepEqual((await invoke(v,{logger})).body,bad.body);
});
test('legacy mode emits no clean trace; responses with tracing equal untraced planner outputs',async()=>{
  const r=await invoke(undefined,{},undefined,'/api/plan-watch?mode=interpretation.v1','GET');assert.equal(r.events.length,0);
  const {planCreateSemantics}=await import('./create-semantic-planner.js');
  for(const index of [0,1,2,3,4]){
    const options={apiKey:'fixture',fetchImpl:async()=>Response.json({output_text:JSON.stringify(cleanCreateExtraction(index))})};
    const plain=await planCreateSemantics(cleanCreateRequests[index],options);
    const traced=await invoke(cleanCreateExtraction(index),{}, {operation:'create',request:cleanCreateRequests[index]});assert.deepEqual(traced.body,plain);
  }
});
test('provider transport limits and semantic schema remain fixed',async()=>{
  const current=await readFile(new URL('./create-semantic-planner.js',import.meta.url),'utf8');
  assert(current.includes("max_output_tokens:1600,maxOutputBytes:16000"));
  assert(current.includes("schema:createSemanticFrameSchema"));
});
