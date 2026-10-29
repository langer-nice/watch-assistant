import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSemanticFrameSchema,validateCreateSemanticFrame,normalizeCreateSemanticFrame,
  recognizeCreateSemanticFrameOffline,createExactUrlSemanticFrame,canonicalCreateSemanticMeaning } from './create-semantic-frame.js';

const news=(value,support)=>({subject:{kind:'named_entity',value},monitoring_goal:{kind:'ongoing_developments',support,event:null},
  comparison:null,constraints:[],time_scope:[],source_preference:null,ambiguity:[],unrepresented_requirements:[]});
const paraphrases=[
  ['Tell me when there are important new developments about Manchester City.','Manchester City'],
  ['Keep me informed about Man City.','Man City'],
  ['I want news about Man City.','Man City'],
  ['Let me know when there is important news about Man City.','Man City'],
];
const corpus=paraphrases.map(([request,name])=>({request,e:news(name,request)}));
const ms='Tell me when Microsoft publishes its Q3 2026 earnings results.';
corpus.push({request:ms,e:{...news('Microsoft',ms),monitoring_goal:{kind:'event_occurrence',support:ms,event:{kind:'publication',value:'earnings results'}},
  time_scope:[{kind:'quarter',value:'Q3 2026',support:'Q3 2026'}]}});
const sinner='Tell me when there are important new developments about Jannik Sinner.';
corpus.push({request:sinner,e:news('Jannik Sinner',sinner)});
const rate='Tell me when GBP/EUR goes above 1.17.';
corpus.push({request:rate,e:{...news('GBP/EUR',rate),subject:{kind:'metric_pair',value:'GBP/EUR'},
  monitoring_goal:{kind:'threshold_crossing',support:rate,event:null},comparison:{operator:'gt',value:'1.17',support:'above 1.17'}}});
const bbc='https://www.bbc.com/news/topics/c6vgy427vxklt';
corpus.push({request:bbc,e:createExactUrlSemanticFrame(bbc)});
const norm=c=>normalizeCreateSemanticFrame(c.request,c.e);

test('four natural paraphrases share base semantics; raw aliases stay distinct without a trusted resolver',()=>{
  const outputs=corpus.slice(0,4).map(norm),base={...outputs[0].frame,subject:null};
  for(let i=0;i<4;i++){
    assert.deepEqual({...outputs[i].frame,subject:null},base);
    assert.equal(outputs[i].frame.subject.value,paraphrases[i][1]);
    assert.equal(outputs[i].identity.status,'source_mention');
    assert.equal(outputs[i].provenance.find(p=>p.field==='subject').span.text,paraphrases[i][1]);
  }
  assert.notEqual(outputs[0].identity.key,outputs[1].identity.key);
});
test('planned identity interface permits canonical convergence without a production alias table',()=>{
  // Simulates an independently verified Slice 2 identity source. This is not
  // proof of a real alias relation, nor a catalog used by production code.
  const binding=Object.freeze({key:'fixture:verified-identity',label:'Manchester City',referenceVersion:'fixture-only.v1'});
  const resolveIdentity=()=>binding;
  const results=corpus.slice(0,4).map(c=>normalizeCreateSemanticFrame(c.request,c.e,{resolveIdentity}));
  for(const r of results){
    assert.deepEqual(canonicalCreateSemanticMeaning(r),canonicalCreateSemanticMeaning(results[0]));
    assert(r.provenance.some(p=>p.field==='subject_identity'&&p.type==='SERVER_DERIVED'));
  }
  assert.throws(()=>normalizeCreateSemanticFrame(corpus[0].request,corpus[0].e,{resolveIdentity:()=>null}),{reason:'identity_unresolved'});
  // Interface is entity-agnostic, not an alias lookup implemented for Man City.
  const request='Follow information concerning Example Entity.';
  assert.equal(normalizeCreateSemanticFrame(request,news('Example Entity',request),{resolveIdentity:()=>({...binding,label:'Example Entity'})}).identity.key,binding.key);
});
test('same syntax: four different subjects change only identity',()=>{
  for(const value of ['Manchester City','Manchester United','PSG','SpaceX']){
    const request=`Tell me when there are important new developments about ${value}.`,n=normalizeCreateSemanticFrame(request,news(value,request));
    assert.equal(n.frame.subject.value,value);assert.equal(n.frame.monitoring_goal.kind,'ongoing_developments');
    assert.deepEqual(n.frame.constraints,[]);assert.deepEqual(n.frame.time_scope,[]);
  }
});
test('frozen five: common frame retains events, exact currency, period, source and URL',()=>{
  const n=[norm(corpus[0]),...corpus.slice(4).map(norm)];assert.equal(n.length,5);
  assert.equal(n[0].frame.subject.value,'Manchester City');
  assert.deepEqual(n[1].frame.monitoring_goal.event,{kind:'publication',value:'earnings results'});
  assert.deepEqual(n[1].frame.time_scope,[{kind:'quarter',value:'2026-Q3'}]);assert.equal(n[1].frame.source_preference,null);
  assert.equal(n[2].frame.subject.value,'Jannik Sinner');
  assert.deepEqual(n[3].frame.comparison,{operator:'gt',value:'1.17',unit:'EUR'});
  assert.equal(n[4].frame.subject.value,bbc);assert.equal(n[4].defaults.source_policy,'submitted_resource');
  assert.deepEqual(n[4].frame.constraints,[]);
});
const invalid=[
  ['changed entity',0,e=>e.subject.value='Manchester United'],
  ['invented topic',0,e=>e.constraints=[{role:'required',value:'transfers',support:corpus[0].request}]],
  ['source-present invented topic',0,e=>e.constraints=[{role:'required',value:'important new developments',support:corpus[0].request}]],
  ['invented official source',4,e=>e.source_preference={policy:'only',sources:[],official:true,support:ms}],
  ['changed quarter',4,e=>e.time_scope=[{kind:'quarter',value:'Q4 2026',support:'Q4 2026'}]],
  ['changed amount',6,e=>e.comparison.value='1.18'],
  ['changed direction',6,e=>e.comparison.operator='lt'],
  ['invalid goal enum',0,e=>e.monitoring_goal.kind='sports_news'],
  ['incompatible goal/comparison',0,e=>e.comparison={operator:'gt',value:'1.17',support:corpus[0].request}],
  ['extra technical field',0,e=>e.adapter='google_news_literal_v1'],
  ['bad ambiguity object',0,e=>e.ambiguity=[{uncertain:true}]],
  ['fabricated residual',0,e=>e.unrepresented_requirements=['every 5 minutes']],
  ['word substring entity',0,e=>e.subject.value='Man'],
  ['missing required amount',6,e=>e.comparison=null],
  ['wrong subject kind',0,e=>e.subject.kind='resource_url'],
];
for(const [name,index,mutate]of invalid)test(`adversarial rejection: ${name}`,()=>{
  const c=corpus[index],e=structuredClone(c.e);mutate(e);
  assert.throws(()=>normalizeCreateSemanticFrame(c.request,e),err=>['INVALID_CREATE_SEMANTIC_FRAME','CREATE_FRAME_CLARIFICATION_REQUIRED'].includes(err.code));
});
test('false source-present and unsupported model ambiguity does not block clear meaning',()=>{
  for(const support of ['Manchester City','not present']){
    const c=corpus[0],e={...c.e,ambiguity:[{field:'subject',reason:'unresolved_reference',support,alternatives:[]}]};
    const n=normalizeCreateSemanticFrame(c.request,e);assert.deepEqual(n.frame,norm(c).frame);
    assert.equal(n.discarded_ambiguity_count,1);
  }
});
test('genuine alternative subjects, unresolved references and direction conflicts remain blocked',()=>{
  const request='News about Manchester City or Liverpool.',e={...news('Manchester City',request),
    ambiguity:[{field:'subject',reason:'competing_values',support:'Manchester City or Liverpool',alternatives:['Manchester City','Liverpool']}]};
  assert.throws(()=>normalizeCreateSemanticFrame(request,e),{reason:'grounded_ambiguity'});
  const reference='News about her.';
  assert.throws(()=>normalizeCreateSemanticFrame(reference,{...news('her',reference),ambiguity:[{field:'subject',reason:'unresolved_reference',support:'her',alternatives:[]}]}),{reason:'grounded_ambiguity'});
  const r='GBP/EUR above or below 1.17.',v=structuredClone(corpus[6].e);v.monitoring_goal.support=r;v.comparison.support='above or below 1.17';
  assert.throws(()=>normalizeCreateSemanticFrame(r,v),{reason:'comparison_conflict'});
});
test('hidden explicit unsupported requirement is independently surfaced; declared residual cannot disappear',()=>{
  const request='I want news about SpaceX every 5 minutes.',base=news('SpaceX',request);
  for(const e of [base,{...base,unrepresented_requirements:['every 5 minutes']}]){
    assert.throws(()=>normalizeCreateSemanticFrame(request,e),err=>err.reason==='unrepresented_requirements'
      &&err.unrepresented_requirements.includes('every 5 minutes'));
  }
});
test('broad support quotes cannot hide extra values or conflicting directions',()=>{
  for(const request of ['GBP/EUR above 1.17 or below 1.17.','GBP/EUR above 1.17 and 1.18.']){
    const e=structuredClone(corpus[6].e);e.monitoring_goal.support=request;e.comparison.support=request;
    assert.throws(()=>normalizeCreateSemanticFrame(request,e),err=>['comparison_conflict','unrepresented_requirements'].includes(err.reason));
  }
  const request='News about SpaceX, no notifications.';
  assert.throws(()=>normalizeCreateSemanticFrame(request,news('SpaceX',request)),{reason:'unrepresented_requirements'});
});
test('explicit restrictions/source/date have exact provenance and cannot be silently omitted',()=>{
  const request='News about SpaceX, only launches from official sources only.';
  const e={...news('SpaceX',request),constraints:[{role:'required',value:'launches',support:'only launches'}],
    source_preference:{policy:'only',sources:[],official:true,support:'from official sources only'}};
  const n=normalizeCreateSemanticFrame(request,e);assert.equal(n.frame.source_preference.official,true);
  assert.equal(n.frame.constraints[0].value,'launches');
  assert.throws(()=>normalizeCreateSemanticFrame(request,news('SpaceX',request)),{reason:'unrepresented_requirements'});
  const dated='Microsoft earnings results on 2026-07-30.';
  const v={...corpus[4].e,monitoring_goal:{...corpus[4].e.monitoring_goal,support:dated},time_scope:[{kind:'date',value:'2026-07-30',support:'2026-07-30'}]};
  assert.equal(normalizeCreateSemanticFrame(dated,v).frame.time_scope[0].value,'2026-07-30');
});
test('product defaults and derived fields do not fabricate text, cadence or activation permission',()=>{
  const n=norm(corpus[1]);assert.deepEqual(n.defaults,{policy:'create_defaults.v1',monitor_over_time:true,surface_meaningful_changes:true,relevance:'relevant',source_policy:'any'});
  assert(n.provenance.some(p=>p.type==='USER_TEXT_SEMANTIC'));assert(n.provenance.some(p=>p.type==='USER_TEXT_EXACT'));
  for(const p of n.provenance){if(p.type==='PRODUCT_DEFAULT')assert.equal(p.span,undefined);if(p.span)assert.equal(corpus[1].request.slice(p.span.start,p.span.end),p.span.text);}
  const rate=norm(corpus[6]);assert(rate.provenance.some(p=>p.field==='comparison.unit'&&p.type==='SERVER_DERIVED'&&!p.span));
  for(const key of ['cadence','active','notify','adapter','provider'])assert.equal(n.defaults[key],undefined);
});
test('one constrained fixture call for text, zero URL, no repair on malformed output or failure',async()=>{
  let calls=0;
  for(const c of corpus){
    const before=calls;const n=await recognizeCreateSemanticFrameOffline(c.request,{extract:async contract=>{
      calls++;assert.equal(contract.text.format.strict,true);assert.equal(contract.text.format.schema,createSemanticFrameSchema);return structuredClone(c.e);
    }});assert.equal(calls-before,c.request===bbc?0:1);assert.equal(n.frame.subject.value,c.e.subject.value);
  }
  for(const extract of [async()=>{calls++;return {};},async()=>{calls++;throw Error('fixture failure');}]){
    const before=calls;await assert.rejects(recognizeCreateSemanticFrameOffline(corpus[0].request,{extract}));assert.equal(calls-before,1);
  }
  await recognizeCreateSemanticFrameOffline(bbc,{extract:()=>assert.fail('URL has no model call')});
});
test('strict schema rejects model technical authority and is immutable',()=>{
  assert(Object.isFrozen(createSemanticFrameSchema));assert(Object.isFrozen(createSemanticFrameSchema.properties));
  for(const key of ['domain','intent','predicate','provider','persistence','recurrence','subjects','conditions','evidence','identity']){
    assert.throws(()=>validateCreateSemanticFrame({...corpus[0].e,[key]:'forbidden'}),{reason:'schema'});
  }
});
test('determinism: 25 repetitions of eight fixtures preserve semantics, provenance, defaults and input',()=>{
  for(const c of corpus){const before=structuredClone(c.e),expected=norm(c);
    for(let i=0;i<25;i++)assert.deepEqual(norm(c),expected);
    assert.deepEqual(c.e,before);
  }
});
test('isolated source imports only observational metadata, never transport, old graph or downstream execution',async()=>{
  const source=await readFile(new URL('./create-semantic-frame.js',import.meta.url),'utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/gu)].map(m=>m[1]),['./semantic-frame-structure.js']);
  for(const name of ['fetch','normalizeWatchContract','compileMonitoringPlan','resolveWatchContractCapability','groundCreateSemantics'])assert(!new RegExp(`\\b${name}\\s*\\(`,'u').test(source));
  for(const phrase of ['Manchester City','Man City','Keep me informed','Tell me when','I want news','Let me know'])assert(!source.includes(phrase));
});
