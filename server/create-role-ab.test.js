import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { createStructuredWatchMiddleware } from './structured-watch-api.js';
import { planRoleAwareCreate } from './create-role-planner.js';
import { watchContractSemanticFingerprint } from './watch-contract.js';
import { resolveWatchContractCapability } from './create-contract-capability.js';
import { roleRequests,roleNews,roleFrozen,roleComplex,roleLiteral,fidelityPass,fidelityNegativeFixtures } from './test-support/create-role-fixtures.js';
import { frameRequests } from './test-support/create-frame-fixtures.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={VERCEL_ENV:'test',CREATE_CORE_REPLACEMENT_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',
  SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_TEST_USER_IDS:owner,
  STRUCTURED_WATCH_SIGNING_SECRET:'isolated-local-ab-fixture-secret-'.repeat(2)};
// An explicitly injected, server-only reference fixture. No production alias
// dictionary and no claim of an integrated real-world reference source.
const alias={key:'fixture:manchester-city',label:'Manchester City',mentions:['Manchester City','Man City'],referenceVersion:'offline.v1',sourceUrl:'https://fixture.invalid/identity'};
const verifiedIdentityLookup=s=>alias.mentions.includes(s)?[alias]:[];
async function harness(t){
  const state={calls:[],events:[],request:null,candidate:null,verdict:fidelityPass(),writes:0};
  const transport={async complete(call){
    state.calls.push(structuredClone({...call,signal:undefined}));assert.equal(call.format.strict,true);
    assert.equal(call.input.request,state.request);
    if(call.stage==='extraction'){
      assert.equal(call.format.name,'create_role_v1');assert(Array.isArray(call.input.source_tokens));
      assert(!Object.hasOwn(call.input,'verdict'));return structuredClone(state.candidate);
    }
    assert.equal(call.stage,'verification');assert.equal(call.format.name,'create_fidelity_v1');
    assert.deepEqual(Object.keys(call.input),['request','proposed_contract','provenance_summary']);
    assert.deepEqual(call.input.proposed_contract.subjects,state.candidate.subjects);
    assert.equal(call.input.provenance_summary.semantic_completeness,'NOT_EVALUATED');
    assert(!Object.hasOwn(call.input,'extraction_reasoning'));return structuredClone(state.verdict);
  }};
  const authenticate=async()=>({user:{id:owner}}),events=state.events;
  const plan=createPlanWatchMiddleware({env,authenticate,verifiedIdentityLookup,roleAwareLocalTransport:transport,
    logger:{info:(_,json)=>events.push(JSON.parse(json))},fetchImpl:()=>assert.fail('No live HTTP/provider fallback')});
  const receipts=new Map();
  const save=createStructuredWatchMiddleware({env,authenticate,verifiedIdentityLookup,creationOnly:true,serviceClient:{async rpc(name,p){
    assert.equal(name,'persist_structured_watch_v1');state.writes++;
    const receipt={id:p.p_id,ownerId:p.p_owner,mutationId:p.p_mutation,operation:p.p_operation,expectedRevision:p.p_revision,
      revision:1,definitionFingerprint:p.p_definition_fingerprint,payloadFingerprint:p.p_payload_fingerprint,monitoringState:'paused'};
    receipts.set(p.p_mutation,receipt);return {data:receipt};
  }}});
  const server=createServer(async(req,res)=>{try{await (req.url.startsWith('/api/plan-watch')?plan:save)(req,res,()=>{res.statusCode=404;res.end();});}
    catch{res.statusCode=500;res.end(JSON.stringify({code:'UNEXPECTED_TEST_FAILURE'}));}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const post=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};};
  const create=async(request,candidate,verdict=fidelityPass())=>{
    Object.assign(state,{request,candidate,verdict});const calls=state.calls.length,event=events.length;
    const result=await post('/api/plan-watch?mode=create-core.v1',{operation:'create',request,language:'en'});
    return {...result,calls:state.calls.slice(calls),trace:events.slice(event)};
  };
  return {state,post,create};
}
test('A+B core gate: 39 real loopback API attempts, 72 mocked completions, zero drift',async t=>{
  const h=await harness(t),rows=[];
  const groups=[['syntax',['Manchester City','Manchester United','PSG','SpaceX'].map(subject=>({request:`Tell me when there are important new developments about ${subject}.`,subject}))],
    ['paraphrase',[
      {request:frameRequests[0],subject:'Manchester City'},
      {request:'Keep me informed about Man City.',subject:'Man City'},
      {request:'I want news about Man City.',subject:'Man City'},
      {request:'Let me know when there is important news about Man City.',subject:'Man City'},
    ]],['frozen',frameRequests.map((request,index)=>({request,index}))]];
  let paraphrase;
  const saveResults=[];
  for(const [group,cases]of groups)for(const [index,c]of cases.entries()){
    let first;
    for(let run=1;run<=3;run++){
      const candidate=group==='frozen'?roleFrozen(c.index):roleNews(c.request,c.subject),before=structuredClone(candidate);
      const result=await h.create(c.request,candidate);assert.equal(result.status,200,JSON.stringify(result.body));
      assert.deepEqual(candidate,before);assert.deepEqual(result.body.fidelity,fidelityPass());
      const contract=result.body.contract,fp=watchContractSemanticFingerprint(contract,{verifiedIdentityLookup});
      const expected=group==='frozen'?['SUPPORTED','UNSUPPORTED','SUPPORTED','PARTIALLY_SUPPORTED','UNSUPPORTED'][c.index]:'SUPPORTED';
      assert.equal(result.body.capability.status,expected);
      const meaning={fp,goal:result.body.semanticContract.semantic.monitoring_goal,capability:expected};
      if(first)assert.deepEqual(meaning,first);else first=meaning;
      if(group!=='frozen')assert.equal(meaning.goal,'ongoing_developments');
      if(group==='paraphrase'){if(paraphrase)assert.equal(fp,paraphrase);else paraphrase=fp;}
      assert.equal(result.calls.length,group==='frozen'&&c.index===4?0:2);
      assert(!result.trace.some(e=>e.status==='FAIL'));
      assert(result.trace.some(e=>e.stage==='fidelity_verification'&&e.status==='PASS'));
      assert.equal(result.trace.at(-1).last_pass_stage,'review');
      if(group==='frozen'&&c.index===1){assert.equal(contract.time_scope[0].value,'2026-Q3');assert.equal(contract.source_preference.official,false);}
      if(group==='frozen'&&c.index===3)assert.deepEqual(contract.trigger.comparison,{comparator:'gt',value:'1.17',unit:'EUR'});
      if(group==='frozen'&&c.index===4)assert.equal(contract.input_source.submitted_url,c.request);
      rows.push({group,case:index+1,run,http:result.status,correlation:result.trace[0].correlation_id,goal:meaning.goal,
        capability:expected,fingerprint:fp,mockedCalls:result.calls.length,comparison:contract.trigger.comparison,url:contract.input_source.submitted_url});
      if(group==='frozen'&&run===1&&[0,2].includes(c.index))saveResults.push(result.body);
    }
  }
  assert.equal(rows.length,39);assert.equal(h.state.calls.length,72);
  // Existing normalizer -> capability -> projection -> compiler -> signed
  // review -> paused persistence boundary, all local; no downstream rewrite.
  for(const [index,r]of saveResults.entries()){
    const resolved=resolveWatchContractCapability(r.contract,undefined,{verifiedIdentityLookup});assert.equal(resolved.saveEligible,true);
    const base={watchId:`cccccccc-cccc-4ccc-8ccc-${String(index+1).padStart(12,'0')}`,mutationId:`dddddddd-dddd-4ddd-8ddd-${String(index+1).padStart(12,'0')}`,
      operation:'create',expectedRevision:0,title:'Offline A+B fixture'};
    const issue=await h.post('/api/structured-watches',{...base,action:'issue',interpretation:resolved.projection.interpretation,plan:resolved.projection.plan,createContract:r.contract});
    assert.equal(issue.status,200,JSON.stringify(issue.body));assert.equal(h.state.writes,index);
    const tampered=structuredClone(issue.body.definition);tampered.schemaVersion='forged';
    const denied=await h.post('/api/structured-watches',{...base,action:'confirm',token:issue.body.token,definition:tampered});assert(denied.status>=400);assert.equal(h.state.writes,index);
    const confirm=await h.post('/api/structured-watches',{...base,action:'confirm',token:issue.body.token,definition:issue.body.definition});
    assert.equal(confirm.status,200,JSON.stringify(confirm.body));assert.equal(confirm.body.receipt.monitoringState,'paused');
  }
  assert.equal(h.state.writes,2);
  console.log('AB_LOCAL_CORE_ATTEMPTS '+JSON.stringify(rows));
});
test('A+B role matrix: three valid richer contracts retained; fifteen fidelity FAILs stop before downstream',async t=>{
  const h=await harness(t),rows=[];
  for(const which of ['multi','exclusion','condition']){
    const r=await h.create(roleRequests[which],roleComplex(which));assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(r.body.capability.status,'UNSUPPORTED');assert.equal(r.body.capability.saveEligible,false);assert.equal(r.body.contract,null);
    assert.deepEqual(r.body.semanticContract.semantic,roleComplex(which));assert.equal(r.calls.length,2);
    assert(!r.trace.some(e=>['capability','projection'].includes(e.stage)));
    rows.push({name:which,http:r.status,verdict:'PASS',capability:r.body.capability.status,rolesPreserved:true});
  }
  for(const row of fidelityNegativeFixtures()){
    const r=await h.create(row.request,row.candidate,row.verdict);assert.equal(r.status,422,`${row.name}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code,'CREATE_CLARIFICATION_REQUIRED');assert.equal(r.calls.length,2);
    assert(!r.trace.some(e=>['watch_contract','capability','projection','review'].includes(e.stage)&&!e.event));
    const failed=r.trace.find(e=>e.stage==='fidelity_verification'&&e.status==='FAIL');assert(failed,row.name);
    assert.deepEqual(failed.fidelity_reasons,[row.reason]);assert.equal(r.trace.at(-1).first_fail_stage,'fidelity_verification');
    rows.push({name:row.name,http:r.status,verdict:'FAIL',reason:row.reason,downstream:false});
  }
  assert.equal(fidelityNegativeFixtures().length,15);assert.equal(h.state.writes,0);
  console.log('AB_LOCAL_ROLE_ATTEMPTS '+JSON.stringify(rows));
});
test('deterministic rejection consumes extraction only; invalid verifier cannot authorize downstream',async t=>{
  const h=await harness(t);
  for(const mutate of [c=>c.subjects[0].value='Absent',c=>c.subjects.push(structuredClone(c.subjects[0])),c=>c.monitoring_goal='bad']){
    const c=roleFrozen(0);mutate(c);const r=await h.create(frameRequests[0],c);
    assert.equal(r.status,422);assert.equal(r.calls.length,1);assert(!r.trace.some(e=>e.stage==='fidelity_verification'));
  }
  for(const verdict of [{verdict:'PASS',reasons:[],rewrite:{}},{verdict:'PASS',reasons:['WRONG_ROLE']},{verdict:'FAIL',reasons:[]},null]){
    const r=await h.create(frameRequests[0],roleFrozen(0),verdict);assert.equal(r.status,422);assert.equal(r.calls.length,2);
    assert(!r.trace.some(e=>['normalizer','watch_contract','projection'].includes(e.stage)));
  }
});
test('represented ambiguity/residual blocks even after a fixture PASS; transport cannot mutate candidate',async t=>{
  const h=await harness(t);
  const request='News about Alpha or Beta.',c=roleNews(request,'Alpha');c.ambiguity=[roleLiteral(request,'ambiguity',request,{reason:'competing_values'})];
  const r=await h.create(request,c);assert.equal(r.status,422);assert.equal(r.calls.length,2);assert(!r.trace.some(e=>e.stage==='normalizer'));
  const residualRequest='News about Alpha every five minutes.',residual=roleNews(residualRequest,'Alpha');
  residual.unrepresented_requirements=[roleLiteral(residualRequest,'unrepresented_requirement','every five minutes')];
  const s=await h.create(residualRequest,residual);assert.equal(s.status,422);assert(!s.trace.some(e=>e.stage==='normalizer'));
  const original=roleFrozen(0);
  const result=await planRoleAwareCreate(frameRequests[0],{env,roleAwareLocalTransport:{complete(call){
    if(call.stage==='extraction')return original;call.input.proposed_contract.subjects[0].value='Mutated by transport';return fidelityPass();
  }}});
  assert.equal(result.semanticContract.semantic.subjects[0].value,'Manchester City');assert.equal(original.subjects[0].value,'Manchester City');
});
test('no default provider, no retry on transport failure/timeout, no hosted seam',async()=>{
  await assert.rejects(planRoleAwareCreate(frameRequests[0],{env}),{code:'AI_SERVICE_UNAVAILABLE'});
  for(const failedStage of ['extraction','verification']){
    let calls=0;await assert.rejects(planRoleAwareCreate(frameRequests[0],{env,roleAwareLocalTransport:{complete(call){calls++;
      if(call.stage===failedStage)throw Error('fixture failure');return roleFrozen(0);}}}),{code:'AI_SERVICE_UNAVAILABLE'});
    assert.equal(calls,failedStage==='extraction'?1:2);
  }
  let count=0,signal;
  await assert.rejects(planRoleAwareCreate(frameRequests[0],{env,timeoutMs:5,roleAwareLocalTransport:{complete(call){
    count++;if(call.stage==='extraction')return roleFrozen(0);signal=call.signal;return new Promise(()=>{});
  }}}),{code:'AI_TIMEOUT'});assert.equal(count,2);assert.equal(signal.aborted,true);
  await assert.rejects(planRoleAwareCreate(frameRequests[0],{env:{VERCEL_ENV:'preview'},roleAwareLocalTransport:{complete(){assert.fail('No hosted seam');}}}),{code:'STRUCTURED_FEATURE_UNAVAILABLE'});
  const url=await planRoleAwareCreate(roleRequests.url,{env});assert.equal(url.contract.input_source.submitted_url,roleRequests.url);
});
test('observability never logs request text, candidate prose or verifier extra output',async t=>{
  const h=await harness(t),c=roleFrozen(0);c.monitoring_goal={arbitrary:'DO_NOT_LOG_FIXTURE'};
  const r=await h.create(frameRequests[0],c);assert.equal(r.status,422);
  const log=JSON.stringify(r.trace);assert(!log.includes('DO_NOT_LOG_FIXTURE'));assert(!log.includes(frameRequests[0]));
});
