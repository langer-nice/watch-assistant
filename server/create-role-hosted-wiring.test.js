import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanWatchHandler } from '../api/plan-watch.js';
import { CREATE_AB_MODE,CREATE_AB_PREVIEW_BRANCH,CREATE_AB_STAGING_URL,CREATE_AB_DISABLED_FLAGS,createABPreviewEnabled } from './create-role-access.js';
import { createRoleProvider,createRoleModelBudget } from './create-role-provider.js';
import { roleFrozen,roleRequests,fidelityPass,fidelityFail } from './test-support/create-role-fixtures.js';
import { createFrameFixture } from './test-support/create-frame-fixtures.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const preview={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:CREATE_AB_PREVIEW_BRANCH,VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',
  CREATE_ROLE_AWARE_AB_ENABLED:'true',SUPABASE_URL:CREATE_AB_STAGING_URL,VITE_SUPABASE_URL:CREATE_AB_STAGING_URL,
  STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,
  ...Object.fromEntries(CREATE_AB_DISABLED_FLAGS.map(k=>[k,'false']))};
async function dispatch({env=preview,request=roleRequests.news,verdict=fidelityPass(),candidate=roleFrozen(0),mode=CREATE_AB_MODE,operation='create',extra={},providerStatus=200}={}){
  const calls=[],trace=[];
  const handler=createPlanWatchHandler({env,apiKey:'fixture-only',authenticate:async()=>({user:{id:owner}}),logger:{info:(_,s)=>trace.push(JSON.parse(s))},
    fetchImpl:async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');
      const body=JSON.parse(init.body);calls.push(body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
      if(mode===CREATE_AB_MODE)assert.equal(init.redirect,'error');
      assert.equal(JSON.parse(body.input).request,request);
      if(providerStatus!==200)return new Response('fixture private error',{status:providerStatus});
      return Response.json({output_text:JSON.stringify(body.text.format.name==='create_fidelity_v1'?verdict:candidate)});
    }});
  let result;const res={setHeader(){},end(s){result=JSON.parse(s);}};
  await handler({url:`/api/plan-watch${mode?'?mode='+mode:''}`,method:'POST',body:{request,operation,language:'en',...extra}},res);
  return {status:res.statusCode,body:result,calls,trace};
}
test('real hosted handler selects explicit A+B mode and two constrained provider requests',async()=>{
  const r=await dispatch();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.mode,CREATE_AB_MODE);
  assert.equal(r.body.capability.status,'SUPPORTED');assert.equal(r.calls.length,2);
  assert.equal(r.calls[0].text.format.name,'create_role_v1');assert.equal(r.calls[1].text.format.name,'create_fidelity_v1');
  assert.deepEqual(Object.keys(JSON.parse(r.calls[1].input)),['request','proposed_contract','provenance_summary']);
  assert.deepEqual(r.trace.at(-1).model_calls,{extraction:1,verification:1,total:2});
  assert.deepEqual(r.trace.at(-1).provider_http,{extraction:200,verification:200});assert.equal(r.trace.at(-1).mode,CREATE_AB_MODE);
  assert(!JSON.stringify(r.trace).includes('fixture-only'));assert(!JSON.stringify(r.trace).includes(roleRequests.news));
});
test('verifier FAIL blocks downstream, without a third provider call',async()=>{
  const r=await dispatch({verdict:fidelityFail('MISSING_REQUIREMENT')});assert.equal(r.status,422);assert.equal(r.calls.length,2);
  assert.equal(r.body.code,'CREATE_CLARIFICATION_REQUIRED');assert.equal(r.trace.at(-1).first_fail_stage,'fidelity_verification');
  assert.deepEqual(r.trace.at(-1).fidelity_reasons,['MISSING_REQUIREMENT']);assert.equal(r.trace.at(-1).model_calls.total,2);
  assert(!r.trace.some(x=>['capability','projection','watch_contract'].includes(x.stage)));
});
test('exact URL bypasses both provider calls and preserves existing unsupported capability',async()=>{
  const r=await dispatch({request:roleRequests.url});assert.equal(r.status,200);assert.equal(r.calls.length,0);
  assert.equal(r.body.contract.input_source.submitted_url,roleRequests.url);assert.equal(r.body.capability.status,'UNSUPPORTED');
  assert.deepEqual(r.trace.at(-1).model_calls,{extraction:0,verification:0,total:0});
});
test('Preview gate fails closed on every isolation requirement; Production cannot enable A+B',async()=>{
  assert.equal(createABPreviewEnabled(preview),true);
  for(const key of ['CREATE_ROLE_AWARE_AB_ENABLED','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_PROJECT_ID','SUPABASE_URL','VITE_SUPABASE_URL',...CREATE_AB_DISABLED_FLAGS]){
    const env={...preview};delete env[key];const r=await dispatch({env});assert.equal(r.status,404,key);assert.equal(r.calls.length,0);
  }
  const r=await dispatch({env:{...preview,VERCEL_ENV:'production'}});assert.equal(r.status,404);assert.equal(r.calls.length,0);
});
test('local/test new mode remains explicit; legacy and existing Create-core dispatch are unchanged',async()=>{
  const local={...preview,VERCEL_ENV:'test',CREATE_CORE_REPLACEMENT_ENABLED:'true'};
  const ab=await dispatch({env:local});assert.equal(ab.status,200);assert.equal(ab.calls.length,2);
  const old=await dispatch({env:local,mode:'create-core.v1',candidate:createFrameFixture(0)});
  assert.equal(old.status,200);assert.equal(old.body.mode,'create-core.v1');assert.equal(old.calls.length,1);
  assert.equal(old.calls[0].text.format.name,'create_semantic_frame_v1');
  const prod=await dispatch({env:{...preview,VERCEL_ENV:'production'},mode:null,request:'Monitor company SIREN 905266524'});
  assert.equal(prod.status,200);assert.equal(prod.calls.length,0);assert.equal(prod.body.connector,'bodacc');
});
test('malformed extraction, provider error and invalid verifier do not retry',async()=>{
  const bad=await dispatch({candidate:{...roleFrozen(0),adapter:'bad'}});assert.equal(bad.status,422);assert.equal(bad.calls.length,1);
  const down=await dispatch({providerStatus:429});assert.equal(down.status,503);assert.equal(down.calls.length,1);
  assert.equal(down.trace.at(-1).provider_http.extraction,429);
  const rewrite=await dispatch({verdict:{...fidelityPass(),rewrite:{}}});assert.equal(rewrite.status,422);assert.equal(rewrite.calls.length,2);
});
test('public request cannot replace proposed contract, inject PASS, or use edit operation',async()=>{
  for(const args of [{extra:{verdict:'PASS'}},{extra:{roleAwareLocalTransport:{}}},{extra:{proposed_contract:{}}},{operation:'update'}]){
    const r=await dispatch(args);assert.equal(r.status,400);assert.equal(r.calls.length,0);
  }
});
test('hard budgets reject duplicate or third calls before provider HTTP invocation',async()=>{
  const budget=createRoleModelBudget();budget.take('extraction');budget.take('verification');
  assert.throws(()=>budget.take('extraction'),{reason:'model_call_limit'});assert.equal(budget.snapshot().total,2);
  let http=0;const p=createRoleProvider({apiKey:'fixture',fetchImpl:async()=>{http++;return Response.json({output_text:'{}'});}});
  const call={instructions:'fixture',input:{},format:{type:'json_schema',name:'fixture',strict:true,schema:{type:'object',properties:{},required:[],additionalProperties:false}}};
  await p.complete({...call,stage:'extraction'});await p.complete({...call,stage:'verification'});
  assert.throws(()=>p.complete({...call,stage:'verification'}),{reason:'model_call_limit'});assert.equal(http,2);
});
