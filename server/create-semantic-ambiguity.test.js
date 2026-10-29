import test from 'node:test';
import assert from 'node:assert/strict';
import { groundCreateSemantics,isGroundedCreateAmbiguity } from './create-semantic-grounding.js';
import { createExactUrlSemanticExtraction } from './create-semantic-extraction.js';
import { createCleanCreateTrace } from './clean-create-trace.js';
import { planCreateSemantics } from './create-semantic-planner.js';
import { cleanCreateExtraction,cleanCreateRequests } from './test-support/create-semantic-fixtures.js';
import { createFrameFixture } from './test-support/create-frame-fixtures.js';

const capture=()=>{
  const events=[];return {events,trace:createCleanCreateTrace({info:(_,json)=>events.push(JSON.parse(json))})};
};
for(const index of [0,2])test(`${index===0?'Man City':'Jannik'}: false source-span and invented ambiguity leave exact semantics unchanged`,()=>{
  const request=cleanCreateRequests[index],base=cleanCreateExtraction(index),expected=groundCreateSemantics(request,base);
  for(const claim of [base.subject,'important new developments','Named subject might mean something else','Unspecified official source']){
    const e={...base,ambiguity:[claim]},before=structuredClone(e),c=capture();
    assert.equal(isGroundedCreateAmbiguity(request,claim),false);
    assert.deepEqual(groundCreateSemantics(request,e,c.trace),expected);assert.deepEqual(e,before);
    assert.deepEqual(c.events.find(e=>e.event==='ambiguity_filter').safe_summary,
      {ambiguity_extracted_count:1,ambiguity_grounded_count:0,ambiguity_discarded_count:1});
    assert(!JSON.stringify(c.events).includes(claim));
  }
});

const real=[
  ['multiple possible subjects','Tell me when there are important new developments about Manchester City or Liverpool.',
    {...cleanCreateExtraction(0),subject:'Manchester City or Liverpool'},'Manchester City or Liverpool'],
  ['direction','Tell me when GBP/EUR goes above or below 1.17.',cleanCreateExtraction(3),'above or below'],
  ['conflicting periods','Tell me when Microsoft publishes its Q3 2026 Q4 2026 earnings results.',
    {...cleanCreateExtraction(1),time_scope:['Q3 2026','Q4 2026']},'Q3 2026 Q4 2026'],
  ['unresolved reference','Tell me when there are important new developments about her.',
    {...cleanCreateExtraction(2),subject:'her'},'her'],
  ['explicit uncertainty','Tell me when there are important new developments about either Paris or London.',
    {...cleanCreateExtraction(0),subject:'either Paris or London'},'either Paris or London'],
];
for(const [name,request,base,claim]of real)test(`real ${name}: declared uncertainty remains blocking`,()=>{
  const e={...base,ambiguity:[claim]},c=capture();
  assert.equal(isGroundedCreateAmbiguity(request,claim),true);
  assert.throws(()=>groundCreateSemantics(request,e,c.trace),{code:'CREATE_SEMANTIC_AMBIGUITY',reason:'explicit_ambiguity'});
  assert.deepEqual(c.events.find(e=>e.event==='ambiguity_filter').safe_summary,
    {ambiguity_extracted_count:1,ambiguity_grounded_count:1,ambiguity_discarded_count:0});
  assert.equal(c.events.find(e=>e.status==='FAIL').stage,'grounding');
  assert(!c.events.some(e=>e.stage==='watch_contract'));
});
test('invented official-source claim is removed, but an invented source policy still rejects',()=>{
  const request=cleanCreateRequests[1],base=cleanCreateExtraction(1),ambiguity=['official-source identity is uncertain'];
  assert.deepEqual(groundCreateSemantics(request,{...base,ambiguity}),groundCreateSemantics(request,base));
  assert.throws(()=>groundCreateSemantics(request,{...base,ambiguity,source_preference:'from official sources only'}),
    {code:'INVALID_CREATE_SEMANTICS',reason:'source_preference_mismatch'});
});
test('discarding an ambiguity never repairs invalid roles, constraints or unsupported requests',()=>{
  for(const extra of [{subject:'Liverpool'},{trigger:'transfers'},
    {constraints:[{kind:'topic',role:'required',value:'transfers'}]},
    {time_scope:['Q4 2026']},{subject:null}]){
    assert.throws(()=>groundCreateSemantics(cleanCreateRequests[0],{...cleanCreateExtraction(0),...extra,ambiguity:['invented uncertainty']}),
      {code:'INVALID_CREATE_SEMANTICS'});
  }
  assert.throws(()=>groundCreateSemantics('Watch something.',{...cleanCreateExtraction(0),ambiguity:['something']}),
    {code:'CREATE_SEMANTIC_AMBIGUITY',reason:'explicit_ambiguity'});
  assert.throws(()=>groundCreateSemantics('Monitor price crossing about GBP/EUR.',{
    ...cleanCreateExtraction(0),subject:'GBP/EUR',trigger:'price crossing',ambiguity:['price crossing']}),
    {code:'CREATE_SEMANTIC_AMBIGUITY',reason:'explicit_ambiguity'});
});
test('malformed ambiguity retains exact validation failure before filtering',()=>{
  for(const ambiguity of [[{}],[{field:'subject',alternatives:['A','B']}],[''],[' private '],null,'subject',Array(5).fill('claim')]){
    const c=capture();assert.throws(()=>groundCreateSemantics(cleanCreateRequests[0],{...cleanCreateExtraction(0),ambiguity},c.trace),
      {code:'INVALID_CREATE_SEMANTICS',reason:'ambiguity'});
    assert(!c.events.some(e=>e.event==='ambiguity_filter'));
  }
});
test('no ambiguity and exact URL semantics retain original handoff; URL bytes are not prose uncertainty',()=>{
  const url='https://example.com/or/and?Q3=2026#either';
  const e=createExactUrlSemanticExtraction(url),baseline=groundCreateSemantics(url,e);
  assert.deepEqual(groundCreateSemantics(url,{...e,ambiguity:['or']}),baseline);
  for(let i=0;i<4;i++){
    const base=cleanCreateExtraction(i),c=capture();
    assert.deepEqual(groundCreateSemantics(cleanCreateRequests[i],base,c.trace),groundCreateSemantics(cleanCreateRequests[i],base));
    assert.deepEqual(c.events.find(e=>e.event==='ambiguity_filter').safe_summary,
      {ambiguity_extracted_count:0,ambiguity_grounded_count:0,ambiguity_discarded_count:0});
  }
});
test('all five frozen planner outcomes unchanged with false ambiguity and numeric/URL preservation',async()=>{
  for(let i=0;i<5;i++){
    const e=createFrameFixture(i),opts=value=>({apiKey:'offline',fetchImpl:async()=>Response.json({output_text:JSON.stringify(value)})});
    const baseline=await planCreateSemantics(cleanCreateRequests[i],opts(e));
    const actual=await planCreateSemantics(cleanCreateRequests[i],opts(e?{...e,ambiguity:[{field:'subject',reason:'unresolved_reference',support:'unsupported uncertainty',alternatives:[]}]}:null));
    // Original extraction/provenance is retained in the transient recognition
    // envelope; compare canonical downstream semantics rather than raw input.
    const semantic=c=>{const {recognition,...rest}=c;return rest;};
    assert.deepEqual(semantic(actual.contract),semantic(baseline.contract));
    assert.deepEqual(actual.capability,baseline.capability);
    assert.equal(actual.capability.status,['SUPPORTED','UNSUPPORTED','SUPPORTED','PARTIALLY_SUPPORTED','UNSUPPORTED'][i]);
    if(i===3)assert.deepEqual(actual.contract.trigger.comparison,{comparator:'gt',value:'1.17',unit:'EUR'});
    if(i===4)assert.equal(actual.contract.input_source.submitted_url,cleanCreateRequests[4]);
  }
});
