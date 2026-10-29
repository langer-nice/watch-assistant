import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCreateMonitoringGoal,createRoleContractSchema,normalizeCreateRoleContract,createExactUrlRoleContract } from './create-role-contract.js';
import { createFidelityInput,validateCreateFidelity } from './create-fidelity-verifier.js';
import { roleRequests,roleFrozen,roleComplex,roleNews,roleLiteral,fidelityNegativeFixtures } from './test-support/create-role-fixtures.js';
import { frameRequests } from './test-support/create-frame-fixtures.js';

test('A represents frozen five and new roles, retaining every fixture value and occurrence',()=>{
  for(let i=0;i<5;i++){const g=normalizeCreateRoleContract(frameRequests[i],roleFrozen(i));
    assert.equal(g.coverage.semantic_completeness,'NOT_EVALUATED');
    for(const p of g.provenance.filter(p=>p.span))assert.equal(frameRequests[i].slice(p.span.start,p.span.end),p.span.text);
    assert(g.provenance.some(p=>p.type==='PRODUCT_DEFAULT'&&!Object.hasOwn(p,'span')));
  }
  const multi=normalizeCreateRoleContract(roleRequests.multi,roleComplex('multi'));
  assert.deepEqual(multi.semantic.subjects.map(s=>s.value),['Gucci','Chanel']);assert.equal(multi.semantic.target.value,'new products');
  const exclusion=normalizeCreateRoleContract(roleRequests.exclusion,roleComplex('exclusion'));
  assert.equal(exclusion.semantic.exclusions[0].value,'perfumes');
  const condition=normalizeCreateRoleContract(roleRequests.condition,roleComplex('condition'));
  assert.equal(condition.semantic.conditions[0].value,'available in France');assert.equal(condition.semantic.event.value,'released');
  const threshold=normalizeCreateRoleContract(roleRequests.threshold,roleFrozen(3));
  assert.deepEqual(threshold.derived.comparison,{value:'1.17',unit:'EUR',operator:'gt'});
  assert.equal(normalizeCreateRoleContract(roleRequests.microsoft,roleFrozen(1)).derived.period,'2026-Q3');
});
const structuralMutations=[
  ['wrong literal',0,c=>c.subjects[0].value='Other'],
  ['wrong numeric',3,c=>c.comparison.value='1.18'],
  ['wrong comparator',3,c=>c.comparison.operator='lt'],
  ['wrong quarter',1,c=>c.time_scope[0].value='Q4 2026'],
  ['fabricated source literal',0,c=>c.source_preference={role:'source_preference',value:'official website',selection:c.subjects[0].selection,policy:'only',official:true}],
  ['malformed role',0,c=>c.subjects[0].role='target'],
  ['event in comparison',1,c=>{c.comparison=c.event;c.event=null;}],
  ['condition in exclusion','condition',c=>{c.exclusions=c.conditions;c.conditions=[];}],
  ['exclusion in event','exclusion',c=>{c.event=c.exclusions[0];c.exclusions=[];c.monitoring_goal='event_occurrence';}],
  ['unsupported assertion',0,c=>c.adapter='invented'],
  ['duplicate subject',0,c=>c.subjects.push(structuredClone(c.subjects[0]))],
  ['invalid enum',0,c=>c.monitoring_goal='invented'],
  ['invalid selection',0,c=>c.subjects[0].selection.last=511],
  ['conflicting role binding',0,c=>{c.exclusions=[{...c.subjects[0],role:'exclusion'}];delete c.exclusions[0].kind;}],
];
for(const [name,index,mutate]of structuralMutations)test(`A rejects ${name} before B`,()=>{
  const request=typeof index==='number'?frameRequests[index]:roleRequests[index];
  const c=typeof index==='number'?roleFrozen(index):roleComplex(index);mutate(c);
  assert.throws(()=>normalizeCreateRoleContract(request,c),{code:'INVALID_CREATE_CONTRACT'});
});
test('A does not fabricate an independent completeness claim for structurally valid omissions',()=>{
  for(const row of fidelityNegativeFixtures()){
    const c=normalizeCreateRoleContract(row.request,row.candidate);
    assert.equal(c.coverage.semantic_completeness,'NOT_EVALUATED');
    assert.equal(c.coverage.semantic_role_fidelity,'NOT_EVALUATED');
  }
});
test('source occurrence is preserved and selectors cannot silently bind another occurrence',()=>{
  const request='Alpha and Alpha';const c=roleNews(request,'Alpha');c.subjects[0].selection={first:2,last:2};
  const g=normalizeCreateRoleContract(request,c);assert.equal(g.provenance[0].span.start,10);
  c.subjects[0].selection={first:1,last:1};assert.throws(()=>normalizeCreateRoleContract(request,c));
});
test('schema is flat, bounded, strict and has eleven model fields without model support/IDs',()=>{
  assert.equal(Object.keys(createRoleContractSchema.properties).length,11);
  assert(!Object.hasOwn(createRoleContractSchema.properties,'monitoring_goal'));
  assert.equal(createRoleContractSchema.additionalProperties,false);
  const schema=JSON.stringify(createRoleContractSchema);assert(!/"(?:support|id|edges|nodes|adapter|provider|capability)"/u.test(schema));
  assert(Object.isFrozen(createRoleContractSchema));
});
test('server derives all four goals only from source-validated immutable primary roles',()=>{
  const expected=['ongoing_developments','event_occurrence','ongoing_developments','threshold_crossing','source_change'];
  for(let i=0;i<5;i++){
    const c=normalizeCreateRoleContract(frameRequests[i],roleFrozen(i));
    assert.equal(c.semantic.monitoring_goal,expected[i]);assert.equal(deriveCreateMonitoringGoal(c.semantic),expected[i]);
    assert(Object.isFrozen(c.semantic));assert(Object.isFrozen(c.semantic.subjects));
    assert.deepEqual(c.provenance.find(p=>p.field==='monitoring_goal').type,'SERVER_DERIVED');
    assert.throws(()=>deriveCreateMonitoringGoal(roleFrozen(i)),{reason:'unadmitted_roles'});
    assert.throws(()=>deriveCreateMonitoringGoal(structuredClone(c.semantic)),{reason:'unadmitted_roles'});
  }
});
test('unadmitted/invalid event and comparison cannot authorize goal derivation',()=>{
  for(const i of [1,3]){
    const c=roleFrozen(i),field=i===1?'event':'comparison';c[field].value='invented absent literal';
    assert.throws(()=>normalizeCreateRoleContract(frameRequests[i],c),{reason:'ungrounded_value'});
    assert.throws(()=>deriveCreateMonitoringGoal(c),{reason:'unadmitted_roles'});
  }
  const c=roleFrozen(3);c.comparison.operator='lt';
  assert.throws(()=>normalizeCreateRoleContract(frameRequests[3],c),{reason:'comparison_conflict'});
  const e=roleFrozen(1);e.event.kind='invented';
  assert.throws(()=>normalizeCreateRoleContract(frameRequests[1],e),{reason:'schema'});
});
test('four Stage A fixtures and unrelated subject identities derive ongoing without name logic',()=>{
  for(const subject of ['Manchester City','Manchester United','PSG','SpaceX','Unrelated Example']){
    const r=`Tell me when there are important new developments about ${subject}.`;
    assert.equal(normalizeCreateRoleContract(r,roleNews(r,subject)).semantic.monitoring_goal,'ongoing_developments');
  }
});
test('determinism: 25 repetitions of eight fixtures preserve semantics, provenance, defaults and selectors',()=>{
  const cases=[...frameRequests.map((request,i)=>({request,c:roleFrozen(i)})),...['multi','exclusion','condition'].map(which=>({request:roleRequests[which],c:roleComplex(which)}))];
  for(const {request,c}of cases){const before=structuredClone(c),expected=normalizeCreateRoleContract(request,c);
    for(let i=0;i<25;i++)assert.deepEqual(normalizeCreateRoleContract(request,c),expected);assert.deepEqual(c,before);}
});
test('B input exposes original request and canonical proposals, never technical execution',()=>{
  const input=createFidelityInput(normalizeCreateRoleContract(roleRequests.multi,roleComplex('multi')));
  assert.deepEqual(Object.keys(input),['request','proposed_contract','provenance_summary']);
  assert.equal(input.provenance_summary.semantic_completeness,'NOT_EVALUATED');
  assert(input.provenance_summary.bindings.length<=64);
  const second=input.provenance_summary.bindings.find(b=>b.field==='subjects/1');
  assert.equal(input.request.slice(second.start,second.end),'Chanel');assert.equal(second.role,'subject');
  assert(!/"(?:compiler|adapter|provider|persistence|conditions_graph)"/u.test(JSON.stringify(input)));
});
test('B tiny schema rejects rewrite, contradictions, duplicate reasons, unknown verdict and empty FAIL',()=>{
  for(const r of [{verdict:'PASS',reasons:[],rewrite:{}},{verdict:'PASS',reasons:['WRONG_ROLE']},{verdict:'FAIL',reasons:[]},
    {verdict:'FAIL',reasons:['WRONG_ROLE','WRONG_ROLE']},{verdict:'MAYBE',reasons:[]},{verdict:'FAIL',reasons:['UNKNOWN']}]){
    assert.throws(()=>validateCreateFidelity(r),{code:'CREATE_CLARIFICATION_REQUIRED'});
  }
  assert.deepEqual(validateCreateFidelity({verdict:'PASS',reasons:[]}),{verdict:'PASS',reasons:[]});
  assert.deepEqual(createExactUrlRoleContract(roleRequests.url),roleFrozen(4));
});
