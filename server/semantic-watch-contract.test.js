import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSemanticWatchContract } from './semantic-watch-contract.js';
import { normalizeWatchContract } from './watch-contract.js';
import { resolveCreateSubjectIdentity } from './create-subject-identity.js';
import { resolveWatchContractCapability } from './create-contract-capability.js';
import { createExactUrlSemanticFrame } from './create-semantic-frame.js';
import { createFrameFixture,frameRequests,newsFrame } from './test-support/create-frame-fixtures.js';
const build=(i,frame=createFrameFixture(i))=>normalizeSemanticWatchContract({version:'create-frame.v1',request:frameRequests[i],frame:i===4?createExactUrlSemanticFrame(frameRequests[4]):frame});
test('semantic vocabulary bypasses closed clauses and contracts revalidate idempotently',()=>{
  for(const request of ['Keep me informed about Example Entity.','I want news about Example Entity.','Example Entity: tell me what matters.']){
    const c=normalizeSemanticWatchContract({version:'create-frame.v1',request,frame:newsFrame('Example Entity',request)});
    assert.equal(c.trigger.kind,'development');assert.deepEqual(normalizeWatchContract(JSON.parse(JSON.stringify(c))),c);
    assert.equal(resolveWatchContractCapability(c).status,'SUPPORTED');
    const tampered=structuredClone(c);tampered.subject[0].value='Other';assert.throws(()=>normalizeWatchContract(tampered),{reason:'semantic_contract_mismatch'});
  }
});
test('old normalizer still rejects these clauses and old authority has no semantic bypass flag',()=>{
  const c=build(0),old=structuredClone(c);delete old.recognition;old.subject[0].identity='manchester city';
  assert.equal(normalizeWatchContract(old).trigger.kind,'development');
  old.user_intent_text='I want news about Manchester City.';old.evidence=[];
  assert.throws(()=>normalizeWatchContract(old),{code:'INVALID_WATCH_CONTRACT'});
  assert.throws(()=>normalizeWatchContract({...old,alreadyValidated:true}),{reason:'shape'});
});
test('five semantic mappings preserve existing capability decisions, exact comparison and resource',()=>{
  const states=['SUPPORTED','UNSUPPORTED','SUPPORTED','PARTIALLY_SUPPORTED','UNSUPPORTED'];
  for(let i=0;i<5;i++){
    const c=build(i);assert.deepEqual(normalizeWatchContract(c),c);assert.equal(resolveWatchContractCapability(c).status,states[i]);
    if(i===1){assert.equal(c.trigger.target,'earnings_results_publication');assert.equal(c.time_scope[0].value,'2026-Q3');assert.equal(c.source_preference.official,false);}
    if(i===3)assert.deepEqual(c.trigger.comparison,{comparator:'gt',value:'1.17',unit:'EUR'});
    if(i===4)assert.equal(c.input_source.submitted_url,frameRequests[4]);
  }
});
for(const [name,mutate]of [
  ['enum',f=>f.monitoring_goal.kind='bad'],['comparison',f=>f.comparison={operator:'gt',value:'1',support:frameRequests[0]}],
  ['event',f=>{f.monitoring_goal.kind='event_occurrence';}],
  ['source',f=>f.source_preference={policy:'only',sources:[],official:true,support:frameRequests[0]}],
  ['hidden requirement',f=>f.unrepresented_requirements=['new developments']],
  ['entity',f=>f.subject.value='Manchester United'],
])test(`semantic normalizer safety: ${name}`,()=>{const f=createFrameFixture(0);mutate(f);assert.throws(()=>build(0,f));});
test('identity: exact/unverified never expand, verified aliases are deterministic, ambiguity blocks',()=>{
  assert.equal(resolveCreateSubjectIdentity('Short Name').status,'EXACT');
  assert.equal(resolveCreateSubjectIdentity('Short Name',{verifiedLookup:()=>[]}).status,'UNRESOLVED');
  const record={key:'reference:1',label:'Canonical Entity',mentions:['Short Name','Canonical Entity'],referenceVersion:'test-only.v1',sourceUrl:'https://reference.invalid/1'};
  const verifiedLookup=()=>[record];
  const a=resolveCreateSubjectIdentity('Short Name',{verifiedLookup}),b=resolveCreateSubjectIdentity('Canonical Entity',{verifiedLookup});
  assert.equal(a.key,b.key);assert.equal(a.status,'RESOLVED');assert.deepEqual(a,resolveCreateSubjectIdentity('Short Name',{verifiedLookup}));
  assert.throws(()=>resolveCreateSubjectIdentity('Other',{verifiedLookup}),{reason:'identity_reference'});
  assert.equal(resolveCreateSubjectIdentity('Short Name',{verifiedLookup:()=>[record,{...record,key:'reference:2'}]}).status,'AMBIGUOUS');
});
test('raw client identity/provenance/technical hints are rederived and rejected when tampered',()=>{
  const c=build(0);
  for(const mutate of [x=>x.recognition.identity.key='forged',x=>x.recognition.defaults.relevance='all',x=>x.capability_status='UNSUPPORTED',x=>x.trigger.target='transfers']){
    const v=structuredClone(c);mutate(v);assert.throws(()=>normalizeWatchContract(v),{reason:'semantic_contract_mismatch'});
  }
});
test('real frame ambiguity blocks before a semantic Watch Contract is constructed',()=>{
  const request='News about Alpha or Beta.',frame=newsFrame('Alpha',request);
  frame.ambiguity=[{field:'subject',reason:'competing_values',support:'Alpha or Beta',alternatives:['Alpha','Beta']}];
  assert.throws(()=>normalizeSemanticWatchContract({version:'create-frame.v1',request,frame}),{reason:'grounded_ambiguity'});
});
test('resource identity preserves exact URL bytes, including case, query ordering and fragment',()=>{
  const request='https://example.com/A%2Fb?Q=One&Q=two#Upper';
  const c=normalizeSemanticWatchContract({version:'create-frame.v1',request,frame:createExactUrlSemanticFrame(request)});
  assert.equal(c.subject[0].identity,request);assert.equal(c.input_source.submitted_url,request);
  assert.deepEqual(normalizeWatchContract(c),c);
});
test('verified identity must be supplied again at an untrusted serialization boundary',()=>{
  const request='News about Short Name.',frame=newsFrame('Short Name',request);
  const record={key:'reference:1',label:'Canonical Entity',mentions:['Short Name'],referenceVersion:'test-only.v1',sourceUrl:'https://reference.invalid/1'};
  const context={verifiedIdentityLookup:()=>[record]};
  const c=normalizeSemanticWatchContract({version:'create-frame.v1',request,frame},context);
  assert.deepEqual(normalizeWatchContract(JSON.parse(JSON.stringify(c)),context),c);
  assert.throws(()=>normalizeWatchContract(JSON.parse(JSON.stringify(c))),{reason:'semantic_contract_mismatch'});
});
test('contradictory explicit topic roles cannot survive semantic normalization',()=>{
  const request='News about Example, only launches and without launches.',frame=newsFrame('Example',request);
  frame.constraints=[{role:'required',value:'launches',support:'only launches'},{role:'excluded',value:'launches',support:'without launches'}];
  assert.throws(()=>normalizeSemanticWatchContract({version:'create-frame.v1',request,frame}),{reason:'constraint_conflict'});
});
