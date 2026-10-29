import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planCreateSemantics } from './create-semantic-planner.js';
import { cleanCreateExtraction,cleanCreateRequests } from './test-support/create-semantic-fixtures.js';
import { fixture,individual,predicate } from './test-support/watch-interpretation-fixtures.js';

function options(value=cleanCreateExtraction(0)){
  const calls=[];
  return {calls,apiKey:'offline-fixture-only',fetchImpl:async(url,init)=>{
    calls.push({url,body:JSON.parse(init.body)});return Response.json({output_text:JSON.stringify(value)});
  }};
}
test('one semantic transport call uses six-field schema and existing default model, then deterministic downstream',async()=>{
  const opts=options();const r=await planCreateSemantics(cleanCreateRequests[0],opts);
  assert.equal(r.capability.status,'SUPPORTED');assert.equal(opts.calls.length,1);
  const {body,url}=opts.calls[0];assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(body.store,false);assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.text.format.name,'create_semantic_v1');
  assert.deepEqual(Object.keys(body.text.format.schema.properties),['subject','trigger','constraints','time_scope','source_preference','ambiguity']);
  assert.equal(JSON.parse(body.input).request,cleanCreateRequests[0]);
  assert.equal(body.text.format.strict,true);
  const numeric=body.text.format.schema.properties.constraints.items.anyOf[0].properties.value.pattern;
  assert(new RegExp(numeric).test('1.17'));assert(!new RegExp(numeric).test('1e2'));
  assert.equal(r.token,undefined);assert.equal(r.receipt,undefined);assert.equal(r.executable,false);
});
test('URL uses zero model calls even with no API key; explicit unsupported remains a valid contract',async()=>{
  const r=await planCreateSemantics(cleanCreateRequests[4],{fetchImpl:()=>assert.fail('No model, discovery or URL fetch')});
  assert.equal(r.capability.status,'UNSUPPORTED');assert.equal(r.interpretation,null);
  assert.equal(r.contract.input_source.submitted_url,cleanCreateRequests[4]);
});
test('old graph output and model technical authority are rejected, never reconstructed or retried',async()=>{
  const {originalRequest,...graph}=fixture(cleanCreateRequests[0],[individual('s','Manchester City')],[predicate('n','news_about',['s'])]);
  for(const value of [graph,{...cleanCreateExtraction(0),domain:'media_news'},null]){
    const opts=options(value);await assert.rejects(planCreateSemantics(cleanCreateRequests[0],opts),{code:'INVALID_CREATE_CONTRACT',statusCode:422});
    assert.equal(opts.calls.length,1);
  }
});
test('grounded uncertainty is typed clarification; fabricated semantics stay rejected',async()=>{
  const request='Tell me when there are important new developments about Manchester City or Liverpool.';
  const uncertain={...cleanCreateExtraction(0),subject:'Manchester City or Liverpool',ambiguity:['Manchester City or Liverpool']};
  await assert.rejects(planCreateSemantics(request,options(uncertain)),{code:'CREATE_CLARIFICATION_REQUIRED',statusCode:422});
  const invented={...cleanCreateExtraction(0),constraints:[{kind:'topic',value:'transfers',role:'required'}]};
  await assert.rejects(planCreateSemantics(cleanCreateRequests[0],options(invented)),{code:'INVALID_CREATE_CONTRACT',statusCode:422});
});
test('provider HTTP/network/parse failures remain bounded typed errors with no retries',async()=>{
  for(const [response,code,statusCode]of [
    [()=>new Response('not logged',{status:429}),'AI_SERVICE_UNAVAILABLE',503],
    [()=>{throw Error('network fixture');},'AI_SERVICE_UNAVAILABLE',503],
    [()=>Response.json({output_text:'not JSON'}),'INTERPRETATION_FAILED',502],
    [()=>Response.json({output_text:'x'.repeat(16001)}),'INTERPRETATION_FAILED',502],
  ]){
    let calls=0;
    await assert.rejects(planCreateSemantics(cleanCreateRequests[0],{apiKey:'fixture',fetchImpl:async()=>{calls++;return response();}}),{code,statusCode});
    assert.equal(calls,1);
  }
});
test('single attempt timeout aborts without repair; invalid/configuration inputs make no call',async()=>{
  let signal;
  await assert.rejects(planCreateSemantics(cleanCreateRequests[0],{apiKey:'fixture',timeoutMs:5,
    fetchImpl:async(_,init)=>{signal=init.signal;return new Promise(()=>{});}}),{code:'AI_TIMEOUT',statusCode:504});
  assert.equal(signal.aborted,true);
  await assert.rejects(planCreateSemantics(cleanCreateRequests[0],{}),{code:'AI_SERVICE_UNAVAILABLE',statusCode:503});
  await assert.rejects(planCreateSemantics('',{fetchImpl:()=>assert.fail('No call')}),{code:'INVALID_INTERPRETATION_REQUEST'});
});
test('new entry imports no old bridge, interpreter, reconstruction or graph schema',async()=>{
  const source=await readFile(new URL('./create-semantic-planner.js',import.meta.url),'utf8');
  assert(!/from ['"].*(?:watch-interpreter|create-contract-bridge|watch-interpretation)['"]/u.test(source));
  const planner=await readFile(new URL('./watch-planner.js',import.meta.url),'utf8');
  const branch=planner.slice(planner.indexOf("if (options.mode === 'create-core.v1')"),planner.indexOf("if (options.mode === 'interpretation.v1')"));
  assert(branch.includes('return planCreateSemantics(request, options)'));
  assert(!/interpretWatchRequest|reviewCreateExtraction|createWatchContractFromInterpretation/u.test(branch));
});
