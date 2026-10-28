import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';
import { createWatchContractFromInterpretation } from './create-contract-bridge.js';
import { createCoreTrace } from './create-core-trace.js';

const request='Tell me when there are important new developments about Manchester City.';
function raw(text=request,value=null){
  const event=text.includes('earnings');
  const {originalRequest,...v}=fixture(text,[individual('s',event?'Microsoft':'Manchester City')],
    [predicate('n',event?'event':'news_about',['s'],value)],event?{temporal:[{text:'Q3 2026',relation:'unspecified',start:null,end:null,timezone:null}]}:{});
  v.evidence=v.evidence.map(({path,text})=>({path,quote:text,context:null}));return v;
}
function run(v,text=request){
  const events=[],trace=createCoreTrace({info(_,data){events.push(data);}});
  let result,error,plain,plainError;
  try{result=createWatchContractFromInterpretation(v,text,trace);}catch(e){error=e;}
  try{plain=createWatchContractFromInterpretation(v,text);}catch(e){plainError=e;}
  assert.deepEqual(result,plain);
  assert.equal(error?.code,plainError?.code);assert.equal(error?.statusCode,plainError?.statusCode);
  const entry=events.find(e=>e.stage==='contract_bridge'&&e.status!=='START');
  return {events,result,error,summary:entry.summary};
}
const rejected=(r,name)=>{assert.equal(r.error?.code,'INVALID_CREATE_CONTRACT');assert.equal(r.summary.finalRejectionPredicate,name);};

test('exact source evidence and allowed non-null earnings value still PASS with parity',()=>{
  const text='Tell me when Microsoft publishes its Q3 2026 earnings results.';
  const r=run(raw(text,'earnings_results_publication'),text);
  assert(r.result);assert.equal(r.summary.finalRejectionPredicate,null);
  assert(r.summary.predicateDiagnostics.some(p=>p.predicate==='binding_source_span_match'&&p.exactMatchFound&&!p.conditionValueIsNull));
});
test('existing Man City null-valued condition PASS; null is required, not a rejection by itself',()=>{
  const r=run(raw());assert(r.result);assert.equal(r.summary.finalRejectionPredicate,null);
  const p=r.summary.predicateDiagnostics.find(p=>p.binding==='condition'&&p.predicate.startsWith('news_'));
  assert.equal(p.conditionValueIsNull,true);assert.equal(p.predicateResult,true);assert.equal(p.exactMatchFound,true);
});
test('exact match with non-null Man City condition identifies combined guard rather than stale binding marker',()=>{
  const r=run(raw(request,'important new developments'));rejected(r,'news_condition_kind_null_value_and_phrase');
  const p=r.summary.predicateDiagnostics.at(-1);
  assert.equal(p.predicateResult,false);assert.equal(p.conditionValueIsNull,false);
  assert.equal(p.exactMatchFound,true);assert.equal(p.kindIsNewsAbout,true);assert.equal(p.phrasePresent,true);
});
test('null value plus invalid condition kind identifies actual combined rejection',()=>{
  const v=raw();v.conditions[0].kind='event';const r=run(v);rejected(r,'news_condition_kind_null_value_and_phrase');
  const p=r.summary.predicateDiagnostics.at(-1);assert.equal(p.conditionValueIsNull,true);assert.equal(p.kindIsNewsAbout,false);
});
test('no matching exact subject quote identifies binding mismatch despite resolved path',()=>{
  const v=raw();v.evidence[0].quote=request;const r=run(v);rejected(r,'binding_source_span_match');
  const p=r.summary.predicateDiagnostics.at(-1);assert.equal(p.binding,'subject');assert.equal(p.exactMatchFound,false);
  assert.equal(p.evidenceReferenceResolved,true);assert.equal(p.matchingEvidenceCount,0);
});
test('missing field evidence reference identifies unresolved binding with zero matches',()=>{
  const v=raw();v.evidence.shift();const r=run(v);rejected(r,'binding_source_span_match');
  const p=r.summary.predicateDiagnostics.at(-1);assert.equal(p.evidenceReferencePresent,false);assert.equal(p.evidenceReferenceResolved,false);
});
test('unknown evidence path identifies path rejection without exposing arbitrary path',()=>{
  const v=raw();v.evidence[0].path='/subjects/9/label';const r=run(v);rejected(r,'evidence_path_allowed');
  const p=r.summary.predicateDiagnostics.at(-1);assert.equal(p.evidenceReferencePresent,true);assert.equal(p.evidenceReferenceResolved,false);
  assert(!JSON.stringify(r.events).includes('SECRET'));
});
test('unresolved subject ID identifies references guard; missing root reference stays rejected',()=>{
  for(const change of [v=>v.conditions[0].subjects=['missing'],v=>v.condition=null]){const v=raw();change(v);rejected(run(v),'condition_subject_references_valid');}
});
test('unbound context and fabricated quotes preserve rejection and expose only booleans',()=>{
  for(const change of [v=>v.evidence[0].quote='SECRET fabricated',v=>v.evidence[0].context='SECRET context']){
    const v=raw();change(v);const r=run(v);rejected(r,'evidence_context_and_quote_source_match');
    assert(!JSON.stringify(r.events).includes('SECRET'));
  }
});
test('diagnostics never contain request, subject, quotes, context or arbitrary condition value',()=>{
  const v=raw(request,'SECRET condition value');const r=run(v);const logs=JSON.stringify(r.events);
  for(const text of [request,'Manchester City','SECRET condition value'])assert(!logs.includes(text));
  assert(r.summary.predicateDiagnostics.every(p=>p.sourceKind==='request'));
});
