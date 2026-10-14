import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStructuredWatchMiddleware } from './structured-watch-api.js';
import { examples } from './test-support/watch-definition-fixtures.js';
import { compileMonitoringPlan } from './watch-capabilities.js';
import { authorizationError } from './structured-watch-authorization.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',watchId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',mutationId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const issueBody = (index=0) => ({action:'issue',watchId,mutationId,operation:'create',expectedRevision:0,title:'Fixture',
  interpretation:examples()[index],plan:compileMonitoringPlan(examples()[index],{structured:true})});
const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner+',bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)};
const invoke = async (handler,body,url='/api/structured-watches') => {
  let output; const headers={}; const response={setHeader(k,v){headers[k]=v;},end(value){output=JSON.parse(value);}};
  await handler({method:'POST',url,body,headers:{}},response);
  return {status:response.statusCode,body:output,headers};
};
const harness = () => {
  const state={owner,clock:Date.UTC(2026,9,12),authCalls:0,rpcCalls:[],failure:null,prior:null};
  const handler=createStructuredWatchMiddleware({env,now:()=>state.clock,authenticate:async()=>{
    state.authCalls++; if (!state.owner) throw authorizationError('AUTH_REQUIRED',401);
    const query={select(){return query;},eq(){return query;},is(){return query;},async range(){return {data:state.prior?[state.prior]:[],error:null};}};
    return {user:{id:state.owner},client:{from:()=>query}};
  },serviceClient:{async rpc(name,p){
    state.rpcCalls.push([name,p]); if(state.failure)return{error:state.failure};
    return{data:{id:p.p_id,ownerId:p.p_owner,mutationId:p.p_mutation,operation:p.p_operation,expectedRevision:p.p_revision,revision:p.p_revision+1,
      definitionFingerprint:p.p_definition_fingerprint,payloadFingerprint:p.p_payload_fingerprint,monitoringState:'paused'},error:null};
  }}});
  return {state,handler};
};
const confirmation = (issued,override={}) => ({action:'confirm',watchId,mutationId,operation:'create',expectedRevision:0,title:'Fixture',token:issued.body.token,definition:issued.body.definition,...override});
test('authenticated issue and confirm are independent, deterministic and require no AI/source calls', async()=>{
  const {state,handler}=harness(); const en=await invoke(handler,issueBody());const fr=await invoke(handler,issueBody(1));
  assert.equal(en.status,200);assert.deepEqual(en.body.definition.plan.criteria,fr.body.definition.plan.criteria);
  assert.equal(en.body.definition.request,issueBody().interpretation.originalRequest);
  assert.equal(state.rpcCalls.length,0);assert.equal(en.body.executable,false);assert.equal(en.headers['Cache-Control'],'no-store, private');
  const saved=await invoke(handler,confirmation(en));assert.equal(saved.status,200);assert.equal(saved.body.receipt.monitoringState,'paused');
  assert.equal(state.authCalls,3);assert.equal(state.rpcCalls.length,1);assert.equal(JSON.stringify(state.rpcCalls).includes(en.body.token),false);
});
test('missing authentication/configuration and the disabled backend cannot persist',async()=>{
  const {state,handler}=harness();state.owner=null;
  assert.equal((await invoke(handler,issueBody())).body.code,'AUTH_REQUIRED');assert.equal(state.rpcCalls.length,0);
  const disabled=createStructuredWatchMiddleware({env:{},authenticate:()=>{throw Error('unexpected auth');}});
  assert.equal((await invoke(disabled,issueBody())).body.code,'STRUCTURED_BACKEND_DISABLED');
  const missing=createStructuredWatchMiddleware({env:{SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner},authenticate:async()=>({user:{id:owner}})});
  assert.equal((await invoke(missing,issueBody())).body.code,'SERVER_NOT_CONFIGURED');
});
test('missing authorization, cross-user confirmation, expired tokens and altered bindings cause no writes',async()=>{
  const {state,handler}=harness();const issued=await invoke(handler,issueBody());
  const missing=confirmation(issued);delete missing.token;assert.equal((await invoke(handler,missing)).body.code,'INVALID_BODY');
  for(const [override,code] of [[{token:'forged'},'INVALID_PLAN_AUTHORIZATION'],[{title:'Altered'},'PLAN_DEFINITION_MISMATCH'],
    [{watchId:mutationId},'PLAN_WATCH_MISMATCH'],[{mutationId:watchId},'PLAN_MUTATION_MISMATCH'],
    [{operation:'update',expectedRevision:1},'PLAN_OPERATION_MISMATCH']]) assert.equal((await invoke(handler,confirmation(issued,override))).body.code,code);
  state.owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';assert.equal((await invoke(handler,confirmation(issued))).body.code,'PLAN_OWNER_MISMATCH');
  state.owner=owner;state.clock+=300000;assert.equal((await invoke(handler,confirmation(issued))).body.code,'EXPIRED_PLAN_AUTHORIZATION');assert.equal(state.rpcCalls.length,0);
});
test('altered criteria, unsupported plans, invalid evidence and unknown schemas fail before persistence',async()=>{
  const {state,handler}=harness();const issued=await invoke(handler,issueBody());
  for(const mutate of [v=>{v.plan.criteria.subjects=['Prada'];},v=>{v.definitionVersion='future';},v=>{delete v.metadata;}]){
    const definition=structuredClone(issued.body.definition);mutate(definition);assert.ok((await invoke(handler,confirmation(issued,{definition}))).status>=400);
  }
  const evidence=issueBody();evidence.interpretation.evidence[0].text='invented';assert.equal((await invoke(handler,evidence)).body.code,'INVALID_STRUCTURED_INTERPRETATION');
  const unsupported=issueBody();unsupported.plan.adapter='unapproved';assert.ok((await invoke(handler,unsupported)).status>=400);
  const constraint=issueBody();constraint.interpretation.originalRequest+=' From France.';
  constraint.interpretation.geographic=[{label:'France',appliesTo:'source'}];
  const start=constraint.interpretation.originalRequest.indexOf('France');
  constraint.interpretation.evidence.push({path:'/geographic/0',start,end:start+6,text:'France'});
  assert.equal((await invoke(handler,constraint)).body.code,'MONITORING_PLAN_NOT_SUPPORTED');
  assert.equal((await invoke(handler,{...issueBody(),source:{url:'https://attacker.test'}})).body.code,'INVALID_BODY');assert.equal(state.rpcCalls.length,0);
});
test('update authorization requires an owned structured inactive row; confirmation binds revision',async()=>{
  const {state,handler}=harness();const created=await invoke(handler,issueBody());
  const update={...issueBody(),operation:'update',expectedRevision:1,mutationId:watchId};
  assert.equal((await invoke(handler,update)).body.code,'WATCH_CONFLICT');
  state.prior={watch_definition:created.body.definition,monitoring_source:created.body.source,monitoring_state:'paused'};
  const issued=await invoke(handler,update);assert.equal(issued.status,200);
  const confirm=confirmation(issued,{operation:'update',expectedRevision:1,mutationId:watchId});
  const missing={...confirm};delete missing.token;assert.equal((await invoke(handler,missing)).body.code,'INVALID_BODY');
  assert.equal((await invoke(handler,{...confirm,expectedRevision:2})).body.code,'PLAN_REVISION_MISMATCH');
  assert.equal((await invoke(handler,confirm)).status,200);
});
test('database conflicts/failures are safe and never automatically retried',async()=>{
  const {state,handler}=harness();const issued=await invoke(handler,issueBody());
  for(const error of [{code:'PT409',message:'STRUCTURED_REVISION_CONFLICT'},{code:'XX000',message:'private SQL detail'}]){
    state.failure=error;const before=state.rpcCalls.length;const result=await invoke(handler,confirmation(issued));
    assert.equal(state.rpcCalls.length,before+1);assert.equal(JSON.stringify(result).includes('private SQL detail'),false);assert.ok(result.status>=400);
  }
});
test('tokens are body-only and mounted endpoints retain server-only configuration',async()=>{
  const {handler}=harness();assert.equal((await invoke(handler,issueBody(),'/api/structured-watches?token=bad')).body.code,'INVALID_BODY');
  for(const file of ['../api/media-watches.js'])assert.doesNotMatch(await readFile(new URL(file,import.meta.url),'utf8'),/createStructuredWatchMiddleware/);
  assert.match(await readFile(new URL('../vite.config.js',import.meta.url),'utf8'),/VITE_STRUCTURED_WATCH_SIGNING_SECRET is forbidden/);
});
