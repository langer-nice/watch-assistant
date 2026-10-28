import test from 'node:test';
import assert from 'node:assert/strict';
import { format } from 'node:util';
import { createWatchContractFromInterpretation } from './create-contract-bridge.js';
import { createCoreTrace } from './create-core-trace.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';

const request='Tell me when there are important new developments about Manchester City.';
const phrase='important new developments';
function raw(){
  const {originalRequest,...v}=fixture(request,[individual('s','Manchester City')],[predicate('n','news_about',['s'])]);
  v.evidence=v.evidence.map(({path,text})=>({path,quote:text,context:null}));return v;
}
function run(v){
  const events=[],rendered=[];
  const trace=createCoreTrace({info(...args){events.push(args[1]);rendered.push(format(...args));}});
  let result,error,plain,plainError;
  try{result=createWatchContractFromInterpretation(v,request,trace);}catch(e){error=e;}
  try{plain=createWatchContractFromInterpretation(v,request);}catch(e){plainError=e;}
  assert.deepEqual(result,plain);assert.equal(error?.code,plainError?.code);assert.equal(error?.statusCode,plainError?.statusCode);
  return {result,error,rendered,summary:events.find(e=>e.stage==='contract_bridge'&&e.status!=='START').summary};
}
const failing=v=>{const r=run(v);assert.equal(r.error?.code,'INVALID_CREATE_CONTRACT');assert.equal(r.summary.finalPredicate,'binding_source_span_match');return r;};
test('correct path and content, including existing Man City fixture, still PASS without failure-only counters',()=>{
  const r=run(raw());assert(r.result);assert.equal(r.summary.expectedEvidencePath,undefined);
});
test('expected path absent with matching content at another valid structural path',()=>{
  const v=raw();v.evidence[1].path='/topics/0';v.topics=[{label:phrase,role:'required'}];
  const {summary:s}=failing(v);assert.equal(s.expectedPathPresent,false);assert.equal(s.expectedPathMatchCount,0);
  assert.equal(s.contentMatchAnyPath,true);assert.equal(s.sameContentDifferentPathCount,1);
  assert.deepEqual(s.availableEvidencePaths,['/subjects/0/label','/topics/0']);
});
test('expected path present but content mismatches',()=>{
  const v=raw();v.evidence[1].quote='Manchester City';const {summary:s}=failing(v);
  assert.equal(s.expectedPathPresent,true);assert.equal(s.expectedPathMatchCount,1);
  assert.equal(s.contentMatchAnyPath,false);assert.equal(s.expectedPathContentMatch,false);
  assert.equal(s.samePathDifferentContentCount,1);assert.equal(s.expectedPathContentMatchCount,0);
});
test('same content under another path distinguishes it from wrong content at expected path',()=>{
  const v=raw();v.evidence[1].quote='Manchester City';v.topics=[{label:phrase,role:'required'}];
  v.evidence.push({path:'/topics/0',quote:phrase,context:request});const {summary:s}=failing(v);
  assert.equal(s.expectedPathPresent,true);assert.equal(s.contentMatchAnyPath,true);
  assert.equal(s.samePathDifferentContentCount,1);assert.equal(s.sameContentDifferentPathCount,1);
  assert.equal(s.contextPresentCount,1);assert.equal(s.quotePresentCount,3);assert.equal(s.spanPresentCount,3);
});
test('both path and content absent are separately visible',()=>{
  const v=raw();v.evidence.pop();const {summary:s}=failing(v);
  assert.equal(s.expectedPathPresent,false);assert.equal(s.contentMatchAnyPath,false);
  assert.equal(s.sameContentDifferentPathCount,0);assert.equal(s.samePathDifferentContentCount,0);
});
test('flat fields survive actual Node console rendering and contain no request/quote/context/model text',()=>{
  const v=raw();v.evidence[1].quote='Manchester City';const r=failing(v);
  const log=r.rendered.find(s=>s.includes("finalPredicate: 'binding_source_span_match'"));
  assert(log.includes("expectedEvidencePath: '/conditions/0'"));assert(log.includes('expectedPathPresent: true'));
  assert(log.includes('contentMatchAnyPath: false'));assert(log.includes('samePathDifferentContentCount: 1'));
  assert(log.includes("availableEvidencePaths: [ '/subjects/0/label', '/conditions/0' ]"));
  for(const text of [request,phrase,'Manchester City',JSON.stringify(v)])assert(!log.includes(text));
});
