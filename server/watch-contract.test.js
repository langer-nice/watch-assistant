import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWatchContract, watchContractSemanticFingerprint } from './watch-contract.js';
import { projectWatchContractToLegacyPlan } from './create-contract-projection.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';
import { compileMonitoringPlan } from '../src/js/watch-capabilities.js';
import { validateInterpretation } from '../src/js/watch-interpretation.js';
import { createWatchDefinition, validateWatchDefinition, structuredMonitoringSource } from '../src/js/watch-definition.js';

const requests = [
  'Tell me when there are important new developments about Manchester City.',
  'Tell me when Microsoft publishes its Q3 2026 earnings results.',
  'Tell me when there are important new developments about Jannik Sinner.',
  'Tell me when GBP/EUR goes above 1.17.',
  'https://www.bbc.com/news/topics/c6vgy427vxklt',
];
const source = () => ({policy:'any',urls:[],official:false});
const binding = (request,field,text,occurrence=0) => {
  let start = -1;
  for(let i=0;i<=occurrence;i++) start=request.indexOf(text,start+1);
  assert(start>=0,`fixture text absent: ${text}`);
  return {field,source_id:'request',start,end:start+text.length,text};
};
function candidate(index) {
  const request=requests[index], value=['Manchester City','Microsoft','Jannik Sinner','GBP/EUR',request][index];
  const kind=index===3?'instrument':index===4?'resource':'entity';
  const trigger=index===1?{kind:'publication',target:'earnings results',comparison:null}
    :index===3?{kind:'threshold_crossing',target:'exchange_rate',comparison:{comparator:'>',value:'1.17',unit:'EUR'}}
    :index===4?{kind:'resource_change',target:request,comparison:null}
    :{kind:'development',target:'important new developments',comparison:null};
  const triggerText=index===1?'publishes its Q3 2026 earnings results':index===3?'goes above 1.17'
    :index===4?request:'important new developments';
  const evidence=[binding(request,'subject/0',value),binding(request,'trigger',triggerText)];
  if(index===1)evidence.push(binding(request,'time_scope/0','Q3 2026'));
  if(index===3)evidence.push(binding(request,'trigger/comparison','1.17'));
  return {user_intent_text:request,subject:[{kind,value}],trigger,constraints:[],
    time_scope:index===1?[{kind:'period',value:'Q3 2026',basis:'unspecified'}]:[],
    source_preference:index===4?{policy:'only',urls:[request],official:false}:source(),evidence};
}
const rejected = (value,reason) => assert.throws(()=>normalizeWatchContract(value),
  e=>e.code==='INVALID_WATCH_CONTRACT'&&(!reason||e.reason===reason));
const inventedTopic = index => {
  const c=candidate(index);c.constraints=[{kind:'topic',value:'important new developments',role:'required'}];
  c.evidence.push(binding(c.user_intent_text,'constraints/0','important new developments'));return c;
};

// Explicitly counted synthetic corpus: 11 accepted/convergent, 5 safely rejected.
const variants = [
  ...requests.map((_,i)=>({name:`reference ${i+1}`,input:candidate(i),reference:i})),
  ...[0,2].map(i=>({name:`generic required-topic ${i}`,input:inventedTopic(i),reference:i})),
  ...['media_news','official_company','other'].map(domain=>{
    const input=candidate(1);input.technical={domain,intent:'event',predicate:'official_company_announcement'};
    input.trigger={kind:'event',target:'official_company_announcement',comparison:null};
    return {name:`Microsoft technical ${domain}`,input,reference:1};
  }),
  (()=>{const input=candidate(1);input.trigger={kind:'news_about',target:'earnings_release',comparison:null};
    return {name:'Microsoft news view',input,reference:1};})(),
  (()=>{const input=candidate(1);input.source_preference={policy:'only',urls:[],official:true};
    return {name:'invented official restriction',input,reject:true};})(),
  (()=>{const input=candidate(0);input.constraints=[{kind:'topic',value:'transfers',role:'required'}];
    input.evidence.push(binding(input.user_intent_text,'constraints/0','important new developments'));
    return {name:'invented transfers',input,reject:true};})(),
  (()=>{const input=candidate(1);input.time_scope[0].value='Q4 2026';return {name:'wrong period',input,reject:true};})(),
  (()=>{const input=candidate(3);input.trigger.comparison.comparator='gte';return {name:'wrong comparator',input,reject:true};})(),
  (()=>{const input=candidate(4);input.source_preference.urls=['https://news.google.com/'];return {name:'source substitution',input,reject:true};})(),
];

test('counted corpus: 16 synthetic variants, 11 converge, 5 reject; no input mutation',()=>{
  let converged=0,safe=0;
  for(const v of variants){
    const before=structuredClone(v.input);
    if(v.reject){rejected(v.input);safe++;}
    else {assert.deepEqual(normalizeWatchContract(v.input),normalizeWatchContract(candidate(v.reference)),v.name);converged++;}
    assert.deepEqual(v.input,before,v.name);
  }
  assert.equal(variants.length,16);assert.equal(converged,11);assert.equal(safe,5);
});

for(const index of [0,2]) test(`${index===0?'Man City':'Jannik'} canonical meaning and generic topic repair`,()=>{
  const c=normalizeWatchContract(candidate(index));
  assert.equal(c.subject[0].value,index===0?'Manchester City':'Jannik Sinner');
  assert.deepEqual(c.trigger,{kind:'development',target:'important_new_developments',comparison:null});
  assert.deepEqual(c.constraints,[]);assert.equal(c.capability_status,'SUPPORTED');
  assert.deepEqual(normalizeWatchContract(inventedTopic(index)),c);
});

test('Microsoft: valid publication and exact period, never official-only from entity/type hints',()=>{
  const c=normalizeWatchContract(candidate(1));
  assert.equal(c.subject[0].value,'Microsoft');assert.equal(c.trigger.kind,'publication');
  assert.equal(c.trigger.target,'earnings_results_publication');
  assert.deepEqual(c.time_scope,[{kind:'period',value:'2026-Q3',basis:'unspecified'}]);
  assert.deepEqual(c.source_preference,source());assert.equal(c.capability_status,'UNSUPPORTED');
});

test('GBP/EUR decimal and comparator normalize without floating-point coercion',()=>{
  const input=candidate(3);input.trigger.comparison.value='01.1700';
  const c=normalizeWatchContract(input);
  assert.deepEqual(c.trigger.comparison,{comparator:'gt',value:'1.17',unit:'EUR'});
  assert.equal(c.subject[0].value,'GBP/EUR');assert.equal(c.trigger.kind,'threshold_crossing');
  assert.equal(c.capability_status,'UNKNOWN');
  for(const value of [1.17,'1.170000000001','1e0','NaN']){
    const bad=candidate(3);bad.trigger.comparison.value=value;rejected(bad);
  }
  const precise=candidate(3);precise.user_intent_text='Tell me when GBP/EUR goes above 1.170000000001.';
  precise.evidence=[binding(precise.user_intent_text,'subject/0','GBP/EUR'),binding(precise.user_intent_text,'trigger','goes above 1.170000000001'),binding(precise.user_intent_text,'trigger/comparison','1.170000000001')];
  precise.trigger.comparison.value='1.170000000001';
  assert.equal(normalizeWatchContract(precise).trigger.comparison.value,'1.170000000001');
});

test('BBC URL exact resource constraint, no invented topic and no claimed capability',()=>{
  const c=normalizeWatchContract(candidate(4));
  assert.equal(c.input_source.submitted_url,requests[4]);
  assert.deepEqual(c.source_preference,{policy:'only',urls:[requests[4]],official:false});
  assert.equal(c.subject[0].value,requests[4]);assert.deepEqual(c.constraints,[]);
  assert.equal(c.capability_status,'UNKNOWN');
  const input=candidate(4);input.subject[0].value='Jannik Sinner';rejected(input);
});

test('URL percent-encoding, case, query order and fragment remain exact',()=>{
  const url='https://EXAMPLE.com/%7eNews?b=2&a=1#Topic';
  const c=candidate(4);c.user_intent_text=url;c.subject[0].value=url;c.trigger.target=url;
  c.source_preference={policy:'only',urls:[url],official:false};
  c.evidence=[binding(url,'subject/0',url),binding(url,'trigger',url)];
  assert.equal(normalizeWatchContract(c).input_source.submitted_url,url);
});

test('ground every output span and require candidate subject/trigger/period/numeric bindings',()=>{
  for(let i=0;i<5;i++){
    const input=candidate(i),c=normalizeWatchContract(input);
    for(const e of c.evidence)assert.equal(c.user_intent_text.slice(e.start,e.end),e.text);
    for(const field of input.evidence.map(e=>e.field)){
      const bad=candidate(i);bad.evidence=bad.evidence.filter(e=>e.field!==field);rejected(bad);
    }
  }
  for(const mutate of [
    c=>{c.subject[0].value='Liverpool';},
    c=>{c.evidence[0].start++;},
    c=>{c.evidence[0].end=9999;},
    c=>{c.evidence[0].source_id='model_memory';},
    c=>{c.evidence[0].field='adapter';},
    c=>{c.user_intent_text+=' only transfers';},
    c=>{c.trigger.target='health';},
  ]){const c=candidate(0);mutate(c);rejected(c);}
  const c=candidate(0);assert.throws(()=>normalizeWatchContract(c,{request:requests[2]}),{code:'INVALID_WATCH_CONTRACT'});
});

test('unknown meaning remains valid and preserves explicit focus, restriction and source policy',()=>{
  const request='Monitor flight availability about Paris, only direct flights, including morning departures from official sources only.';
  const c={user_intent_text:request,subject:[{kind:'entity',value:'Paris'}],
    trigger:{kind:'other',target:'flight availability',comparison:null},
    constraints:[{kind:'topic',value:'direct flights',role:'required'},{kind:'topic',value:'morning departures',role:'focus'}],
    time_scope:[],source_preference:{policy:'only',urls:[],official:true},
    evidence:[binding(request,'subject/0','Paris'),binding(request,'trigger','flight availability'),
      binding(request,'constraints/0','direct flights'),binding(request,'constraints/1','morning departures'),binding(request,'source_preference','from official sources only')]};
  const n=normalizeWatchContract(c);assert.deepEqual(n.constraints,c.constraints);assert.equal(n.capability_status,'UNKNOWN');
  assert.deepEqual(normalizeWatchContract(n),n);
  const lost=structuredClone(c);lost.constraints=[];rejected(lost,'unrepresented_meaning');
  const altered=structuredClone(c);altered.constraints[0].role='focus';rejected(altered,'constraint_cue');
  const ungrounded=structuredClone(c);ungrounded.evidence.pop();rejected(ungrounded);
});

test('repeated text uses source spans, not a unique-quote requirement',()=>{
  const request='Tell me when there are news about news.';
  const c=candidate(0);c.user_intent_text=request;c.subject[0].value='news';
  c.trigger.target='news';c.evidence=[binding(request,'subject/0','news',1),binding(request,'trigger','news',0)];
  const n=normalizeWatchContract(c);assert.equal(n.evidence.find(e=>e.field==='subject/0').start,request.lastIndexOf('news'));
  assert.deepEqual(normalizeWatchContract(n),n);
});

test('five reference contracts are idempotent including full evidence and capability status',()=>{
  for(let i=0;i<5;i++){
    const c=normalizeWatchContract(candidate(i));assert.deepEqual(normalizeWatchContract(c),c);
    const tampered=structuredClone(c);tampered.capability_status='SUPPORTED';
    assert.equal(normalizeWatchContract(tampered).capability_status,c.capability_status);
  }
});

test('equivalent wording has equal semantic fingerprints; changed values do not',()=>{
  const a=candidate(0),b=candidate(0);
  b.user_intent_text='Tell me when there are news about Manchester City.';b.trigger={kind:'news_about',target:'news',comparison:null};
  b.evidence=[binding(b.user_intent_text,'subject/0','Manchester City'),binding(b.user_intent_text,'trigger','news')];
  assert.equal(watchContractSemanticFingerprint(a),watchContractSemanticFingerprint(b));
  assert.notEqual(watchContractSemanticFingerprint(a),watchContractSemanticFingerprint(candidate(2)));
});

test('media projection passes unchanged compiler/definition/source validators with existing execution criteria',()=>{
  for(const index of [0,2]){
    const p=projectWatchContractToLegacyPlan(candidate(index));assert.equal(p.status,'COMPATIBLE');
    const label=index===0?'Manchester City':'Jannik Sinner';
    const before=fixture(requests[index],[individual('s1',label,index===0?'organization':'person')],[predicate('c1','news_about',['s1'])]);
    const legacyPlan=compileMonitoringPlan(before,{structured:true});
    assert.deepEqual(p.plan.criteria,legacyPlan.criteria);
    assert.deepEqual(p.source,structuredMonitoringSource(legacyPlan.criteria));
    assert.equal(p.plan.adapter,legacyPlan.adapter);assert.deepEqual(p.plan.limitations,legacyPlan.limitations);
    assert.deepEqual(validateWatchDefinition(p.definition,p.source),p.definition);
    assert.equal(p.persistence_authorized,false);
    assert.deepEqual(projectWatchContractToLegacyPlan(normalizeWatchContract(candidate(index))),p);
  }
});

test('Microsoft projection is valid semantics, consistently unsupported event/period, no narrowed plan',()=>{
  const p=projectWatchContractToLegacyPlan(candidate(1));assert.equal(p.status,'SEMANTIC_ONLY');
  assert.deepEqual(validateInterpretation(p.interpretation),p.interpretation);
  assert.equal(p.interpretation.domain,'media_news');assert.equal(p.interpretation.conditions[0].value,'earnings_results_publication');
  assert.equal(p.interpretation.temporal[0].text,'Q3 2026');
  assert(p.assessment.issues.some(i=>i.code==='unsupported_event_detection'));
  assert(p.assessment.issues.some(i=>i.code==='unsupported_temporal_constraint'));
  assert.equal(p.plan,null);assert.equal(p.definition,null);assert.equal(p.capability_status,'UNSUPPORTED');
  assert.deepEqual(projectWatchContractToLegacyPlan(candidate(1)),p);
});

test('currency projection is validator-compatible but recurrence remains a disclosed compiler limitation',()=>{
  const p=projectWatchContractToLegacyPlan(candidate(3));assert.equal(p.status,'SEMANTIC_ONLY');
  assert.deepEqual(validateInterpretation(p.interpretation),p.interpretation);
  const n=p.interpretation.conditions[0];assert.equal(n.operator,'gt');assert.equal(n.amount,'1.17');
  assert.deepEqual(p.interpretation.subjects.map(s=>s.canonicalCode),['GBP','EUR']);
  assert.equal(p.interpretation.recurrence,'unspecified');assert.equal(p.assessment.status,'clarification_required');
  assert(p.assessment.clarifications.some(c=>c.code==='ambiguous_recurrence'));
  assert.equal(p.plan,null);assert.equal(p.definition,null);assert.equal(p.capability_status,'UNKNOWN');
});

test('URL has no lossless old definition projection; never substitutes a news feed',()=>{
  const p=projectWatchContractToLegacyPlan(candidate(4));assert.equal(p.status,'UNSUPPORTED');
  assert.equal(p.interpretation,null);assert.equal(p.plan,null);assert.equal(p.source,null);
  assert.equal(p.assessment.issues[0].code,'CREATE_FORMAT_UNSUPPORTED');
});

test('all five projections are deterministic and validate input before compiling',()=>{
  for(let i=0;i<5;i++)assert.deepEqual(projectWatchContractToLegacyPlan(candidate(i)),projectWatchContractToLegacyPlan(candidate(i)));
  const c=normalizeWatchContract(candidate(0));c.subject[0].value='Other club';
  assert.throws(()=>projectWatchContractToLegacyPlan(c),{code:'INVALID_WATCH_CONTRACT'});
});

test('legacy persisted-definition compatibility is exercised without any persistence call',()=>{
  const p=projectWatchContractToLegacyPlan(candidate(0));
  assert.deepEqual(createWatchDefinition(p.interpretation,p.plan),p.definition);
  const bad=structuredClone(p.definition);bad.plan.criteria.subjects=['Liverpool'];
  assert.throws(()=>validateWatchDefinition(bad,p.source));
});

test('offline helpers cannot invoke a provider or persistence service',()=>{
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=()=>{calls++;throw Error('Network forbidden in Slice 1');};
  try {for(let i=0;i<5;i++)projectWatchContractToLegacyPlan(candidate(i));}
  finally {globalThis.fetch=previous;}
  assert.equal(calls,0);
});
