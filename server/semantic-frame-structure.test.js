import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { withSemanticFrameStructure } from './semantic-frame-structure.js';
import { normalizeCreateSemanticFrame } from './create-semantic-frame.js';
import { createCleanCreateTrace } from './clean-create-trace.js';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { planCreateSemantics } from './create-semantic-planner.js';
import { frameRequests,createFrameFixture,newsFrame } from './test-support/create-frame-fixtures.js';
const capture=()=>{const records=[];return {records,trace:{structure:r=>records.push(r)}};};
function observed(request,frame){const c=capture();let value,error;try{value=withSemanticFrameStructure(request,frame,c.trace,()=>normalizeCreateSemanticFrame(request,frame));}catch(e){error=e;}return {...c,value,error};}
const row=(c,field)=>c.records.find(r=>r.event==='frame_field'&&r.field===field).items[0];
test('exact subject metadata records counts and offsets without its value',()=>{
  const c=observed(frameRequests[0],createFrameFixture(0)),r=row(c,'subject');
  assert.equal(c.error,undefined);assert.equal(r.provenance,'USER_TEXT_EXACT');assert.equal(r.exactMatchCount,1);
  assert.equal(r.supportStart,frameRequests[0].indexOf('Manchester City'));assert.equal(r.supportEnd,r.supportStart+15);
  assert.equal(r.boundaryCheckPassed,true);assert.equal(r.groundingResult,'ACCEPTED');
});
test('goal summary separates safe semantic enum from exact support metadata',()=>{
  const c=observed(frameRequests[0],createFrameFixture(0)),r=row(c,'monitoring_goal');
  assert.equal(r.enum,'ongoing_developments');assert.equal(r.provenance,'USER_TEXT_SEMANTIC');
  assert.equal(r.supportLength,frameRequests[0].length);assert.equal(r.exactMatchCount,1);assert.equal(r.normalizedMatchCount,null);
});
test('product defaults do not fabricate source lookups or spans',()=>{
  const c=observed(frameRequests[0],createFrameFixture(0)),defaults=c.records.filter(r=>r.provenance==='PRODUCT_DEFAULT');
  assert.equal(defaults.length,4);for(const d of defaults){assert.equal(d.spanRequired,false);assert.equal(d.exactMatchCount,null);assert.equal(d.supportStart,null);}
});
test('derived unit records derivation metadata rather than text matching',()=>{
  const c=observed(frameRequests[3],createFrameFixture(3));
  const r=c.records.find(r=>r.field==='comparison.unit');assert.equal(r.provenance,'SERVER_DERIVED');
  assert.equal(r.derivationRule,'ordered_pair_quote_unit.v1');assert.equal(r.exactMatchCount,null);assert.equal(r.spanRequired,false);
});
test('numeric source value has an exact match count and no normalized-match invention',()=>{
  const c=observed(frameRequests[3],createFrameFixture(3)),r=row(c,'comparison').valueMetadata;
  assert.equal(r.exactMatchCount,1);assert.equal(r.supportLength,4);assert.equal(r.normalizedMatchCount,null);
});
test('missing support remains a schema rejection and is visible under the right field',()=>{
  const f=createFrameFixture(0);delete f.monitoring_goal.support;const c=observed(frameRequests[0],f);
  assert.equal(c.error.reason,'schema');assert.equal(row(c,'monitoring_goal').supportPresent,false);
  assert(!c.records.some(r=>r.event==='quote_rejection'));
});
test('wrong support identifies its field/provenance and rejected exact lookup',()=>{
  const f=createFrameFixture(0);f.monitoring_goal.support='PRIVATE_WRONG_SUPPORT';const c=observed(frameRequests[0],f);
  assert.equal(c.error.reason,'ungrounded_value');const r=c.records.find(r=>r.event==='quote_rejection');
  assert.equal(r.field,'monitoring_goal');assert.equal(r.itemIndex,null);assert.equal(r.provenance,'USER_TEXT_SEMANTIC');
  assert.equal(r.exactMatchCount,0);assert.equal(r.boundaryCheckPassed,false);assert.equal(r.roleCheckPassed,null);
  assert.equal(r.rejectionReason,'ungrounded_value');assert.equal(r.rejectionCode,'INVALID_CREATE_SEMANTIC_FRAME');
});
test('list rejection carries its item index, separate support and value outcome',()=>{
  const request='News about Example, only launches, excluding mergers.',f=newsFrame('Example',request);
  f.constraints=[{role:'required',value:'launches',support:'only launches'},{role:'excluded',value:'mergers',support:'PRIVATE_WRONG_SUPPORT'}];
  const c=observed(request,f),r=c.records.find(r=>r.event==='quote_rejection');
  assert.equal(r.field,'constraints');assert.equal(r.itemIndex,1);
  const items=c.records.find(r=>r.field==='constraints'&&r.event==='frame_field').items;
  assert.equal(items.length,2);assert.equal(items[0].roleCheckPassed,true);assert.equal(items[1].groundingResult,'REJECTED');
});
test('boundary failure differs from absent text, and accepted offsets skip embedded matches',()=>{
  const f=createFrameFixture(0);f.subject.value='Man';const bad=observed(frameRequests[0],f);
  const rejected=bad.records.find(r=>r.event==='quote_rejection');
  assert.equal(rejected.field,'subject');assert.equal(rejected.exactMatchCount,1);
  assert.equal(rejected.boundaryCheckPassed,false);assert.equal(rejected.supportStart,null);
  const request='News about ExampleX and Example.',yes=observed(request,newsFrame('Example',request));
  const r=row(yes,'subject');assert.equal(r.exactMatchCount,2);assert.equal(r.supportStart,request.lastIndexOf('Example'));
});
test('raw request/support/entity/model output never enters structural logs',()=>{
  const request='News about PRIVATE_SUBJECT_92.',f=newsFrame('PRIVATE_SUBJECT_92',request);
  const yes=observed(request,f),bad=structuredClone(f);bad.monitoring_goal.support='PRIVATE_WRONG_SUPPORT';
  const records=[...yes.records,...observed(request,bad).records];const text=JSON.stringify(records);
  for(const secret of [request,'PRIVATE_SUBJECT_92','PRIVATE_WRONG_SUPPORT',JSON.stringify(f)])assert(!text.includes(secret));
  const malformed=structuredClone(f);malformed.monitoring_goal.kind='PRIVATE_KIND';malformed.extra='PRIVATE_EXTRA';
  assert(!JSON.stringify(observed(request,malformed).records).includes('PRIVATE'));
});
test('all frozen values/provenance/errors are unchanged with diagnostics or a broken sink',()=>{
  for(let i=0;i<4;i++){
    const request=frameRequests[i],f=createFrameFixture(i),before=structuredClone(f),plain=normalizeCreateSemanticFrame(request,f);
    assert.deepEqual(observed(request,f).value,plain);assert.deepEqual(f,before);
    assert.deepEqual(withSemanticFrameStructure(request,f,{structure(){throw Error('sink');}},()=>normalizeCreateSemanticFrame(request,f)),plain);
  }
  const sentinel=Error('same identity'),c=capture();assert.throws(()=>withSemanticFrameStructure(frameRequests[0],createFrameFixture(0),c.trace,()=>{throw sentinel;}),e=>e===sentinel);
  const f=createFrameFixture(0);f.subject.value='Wrong';const a=observed(frameRequests[0],f);
  assert.throws(()=>normalizeCreateSemanticFrame(frameRequests[0],f),e=>e.code===a.error.code&&e.reason===a.error.reason);
});
test('diagnostic tracing preserves real middleware HTTP/body outcomes',async()=>{
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',env={VERCEL_ENV:'test',CREATE_CORE_REPLACEMENT_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',
    STRUCTURED_WATCH_BACKEND_ENABLED:'true',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_TEST_USER_IDS:owner};
  for(const index of [0,1,2,3,4]){
    const f=createFrameFixture(index),opts={apiKey:'fixture',fetchImpl:async()=>Response.json({output_text:JSON.stringify(f)})};
    const plain=await planCreateSemantics(frameRequests[index],opts),events=[];
    const handler=createPlanWatchMiddleware({...opts,env,authenticate:async()=>({user:{id:owner}}),logger:{info:(_,s)=>events.push(JSON.parse(s))}});
    const req=Readable.from([JSON.stringify({request:frameRequests[index],operation:'create'})]);req.url='/api/plan-watch?mode=create-core.v1';req.method='POST';
    const res={setHeader(){},end(s){this.body=JSON.parse(s);}};await handler(req,res);
    assert.equal(res.statusCode,200);assert.deepEqual(res.body,plain);
    assert(events.some(e=>e.event==='semantic_frame_structure'));assert(events.some(e=>e.event==='response'&&e.http_status===200));
  }
  const f=createFrameFixture(0);f.monitoring_goal.support='PRIVATE_WRONG_SUPPORT';
  const opts={apiKey:'fixture',fetchImpl:async()=>Response.json({output_text:JSON.stringify(f)})};
  await assert.rejects(planCreateSemantics(frameRequests[0],opts),{code:'INVALID_CREATE_CONTRACT',statusCode:422});
  const handler=createPlanWatchMiddleware({...opts,env,authenticate:async()=>({user:{id:owner}}),logger:{info(){throw Error('sink failure');}}});
  const req=Readable.from([JSON.stringify({request:frameRequests[0],operation:'create'})]);req.url='/api/plan-watch?mode=create-core.v1';req.method='POST';
  const res={setHeader(){},end(s){this.body=JSON.parse(s);}};await handler(req,res);
  assert.equal(res.statusCode,422);assert.equal(res.body.code,'INVALID_CREATE_CONTRACT');
});
