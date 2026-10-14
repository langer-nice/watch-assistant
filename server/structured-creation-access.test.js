import test from 'node:test';
import assert from 'node:assert/strict';
import { createStructuredWatchMiddleware } from './structured-watch-api.js';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { examples } from './test-support/watch-definition-fixtures.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner};
const invoke=async(handler,url,method='POST',body={request:'Keep me updated on Jannik Sinner.',language:'en'})=>{let payload;const response={setHeader(){},end(raw){payload=JSON.parse(raw);}};await handler({url,method,body},response);return {status:response.statusCode,payload};};
test('public URL/body/local flag guesses cannot bypass default gate or production block',async()=>{
 for(const config of [{},{STRUCTURED_WATCH_BACKEND_ENABLED:'true'},{...env,STRUCTURED_WATCH_CREATION_ENABLED:'false'},{...env,VERCEL_ENV:'production'}]){
  const forbidden=()=>assert.fail('No auth/AI/SQL while gated');
  assert.equal((await invoke(createStructuredWatchMiddleware({env:config,authenticate:forbidden}),'/api/structured-watches')).status,404);
  assert.equal((await invoke(createPlanWatchMiddleware({env:config,authenticate:forbidden,fetchImpl:forbidden}),'/api/plan-watch?mode=interpretation.v1')).status,404);
 }
});
test('every access/interpret/issue/confirm operation authenticates and checks the server allowlist',async()=>{
 for(const user of [{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},null]){
  const authenticate=async()=>{if(!user)throw Object.assign(Error('auth'),{code:'AUTH_REQUIRED',statusCode:401});return {user};};
  const forbidden=()=>assert.fail('No provider or database for unauthorized user');
  const structured=createStructuredWatchMiddleware({env,authenticate,serviceClient:{rpc:forbidden}});
  for(const [method,body] of [['GET',undefined],['POST',{action:'issue'}],['POST',{action:'confirm'}]])assert.equal((await invoke(structured,'/api/structured-watches',method,body)).status,user?403:401);
  assert.equal((await invoke(createPlanWatchMiddleware({env,authenticate,fetchImpl:forbidden}),'/api/plan-watch?mode=interpretation.v1')).status,user?403:401);
 }
});
test('authorized preview access returns only eligibility; interpreter uses one mocked call with exact input',async()=>{
 const authenticate=async()=>({user:{id:owner}});assert.deepEqual((await invoke(createStructuredWatchMiddleware({env,authenticate}),'/api/structured-watches','GET')).payload,{enabled:true});
 const {originalRequest,...output}=examples()[1];output.evidence=output.evidence.map(({path,text})=>({path,quote:text,context:null}));let calls=0;
 const api=createPlanWatchMiddleware({env,authenticate,apiKey:'synthetic',fetchImpl:async(_url,options)=>{calls++;assert.ok(options.body.includes(originalRequest));return Response.json({output_text:JSON.stringify(output)});}});
 const result=await invoke(api,'/api/plan-watch?mode=interpretation.v1','POST',{request:originalRequest,language:'fr'});assert.equal(result.status,200);assert.equal(result.payload.interpretation.originalRequest,originalRequest);assert.equal(calls,1);
});
test('mounted creation-only configuration does not expose generic definition editing',async()=>{
 const {compileMonitoringPlan}=await import('./watch-capabilities.js');const value=examples()[0];
 const handler=createStructuredWatchMiddleware({env:{...env,STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)},creationOnly:true,authenticate:async()=>({user:{id:owner},client:{from:()=>assert.fail('No edit read')}}),serviceClient:{rpc:()=>assert.fail('No edit write')}});
 const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';const result=await invoke(handler,'/api/structured-watches','POST',{action:'issue',watchId:id,mutationId:id,operation:'update',expectedRevision:1,title:'Fixture',interpretation:value,plan:compileMonitoringPlan(value,{structured:true})});assert.equal(result.status,400);assert.equal(result.payload.code,'INVALID_BODY');
});
test('mounted creation-only API rejects structured currency/company creation before issuing authority',async()=>{
 const {compileMonitoringPlan}=await import('./watch-capabilities.js');const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const handler=createStructuredWatchMiddleware({env:{...env,STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)},creationOnly:true,authenticate:async()=>({user:{id:owner}}),serviceClient:{rpc:()=>assert.fail('No other adapter writes')}});
 for(const value of examples().slice(4)){const result=await invoke(handler,'/api/structured-watches','POST',{action:'issue',watchId:id,mutationId:id,operation:'create',expectedRevision:0,title:'Fixture',interpretation:value,plan:compileMonitoringPlan(value,{structured:true})});assert.equal(result.status,422);assert.equal(result.payload.code,'STRUCTURED_ADAPTER_CONFLICT');}
});
