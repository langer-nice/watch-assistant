import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSemanticExtractionSchema,validateCreateSemanticExtraction,createExactUrlSemanticExtraction } from './create-semantic-extraction.js';
import { groundCreateSemantics } from './create-semantic-grounding.js';

const extraction=(subject,trigger,extra={})=>({subject,trigger,constraints:[],time_scope:[],source_preference:null,ambiguity:[],...extra});
const cases=[
  {name:'Man City',request:'Tell me when there are important new developments about Manchester City.',
    e:extraction('Manchester City','important new developments'),subject:'Manchester City',kind:'entity',trigger:'development'},
  {name:'Microsoft',request:'Tell me when Microsoft publishes its Q3 2026 earnings results.',
    e:extraction('Microsoft','publishes earnings results',{time_scope:['Q3 2026']}),subject:'Microsoft',kind:'entity',trigger:'publication'},
  {name:'Jannik Sinner',request:'Tell me when there are important new developments about Jannik Sinner.',
    e:extraction('Jannik Sinner','important new developments'),subject:'Jannik Sinner',kind:'entity',trigger:'development'},
  {name:'GBP/EUR',request:'Tell me when GBP/EUR goes above 1.17.',
    e:extraction('GBP/EUR','threshold crossing',{constraints:[{kind:'numeric',comparator:'gt',value:'1.17'}]}),subject:'GBP/EUR',kind:'instrument',trigger:'threshold_crossing'},
  {name:'BBC URL',request:'https://www.bbc.com/news/topics/c6vgy427vxklt',subject:'https://www.bbc.com/news/topics/c6vgy427vxklt',kind:'resource',trigger:'resource_change'},
];
cases[4].e=createExactUrlSemanticExtraction(cases[4].request);
const ground=(i,e=cases[i].e,request=cases[i].request)=>groundCreateSemantics(request,e);
function verifySpans(candidate){
  for(const e of candidate.evidence){
    assert.equal(e.source_id,'request');assert(Number.isInteger(e.start)&&Number.isInteger(e.end));
    assert.equal(candidate.user_intent_text.slice(e.start,e.end),e.text);assert(e.start<e.end);
  }
}
for(const [i,c]of cases.entries())test(`${c.name}: small extraction to grounded handoff`,()=>{
  const before=JSON.stringify(c.e);const {candidate,ambiguity}=ground(i);
  assert.deepEqual(candidate.subject,[{kind:c.kind,value:c.subject}]);assert.equal(candidate.trigger.kind,c.trigger);
  assert.equal(candidate.user_intent_text,c.request);assert.deepEqual(candidate.constraints,[]);assert.deepEqual(ambiguity,[]);
  verifySpans(candidate);assert.equal(JSON.stringify(c.e),before);
  if(i===1){assert.equal(candidate.time_scope[0].value,'Q3 2026');assert.equal(candidate.source_preference.official,false);
    assert.equal(candidate.evidence.find(e=>e.field==='trigger').text,'publishes its Q3 2026 earnings results');}
  if(i===3)assert.deepEqual(candidate.trigger.comparison,{comparator:'gt',value:'1.17',unit:'EUR'});
  if(i===4){assert.equal(candidate.input_source.submitted_url,c.request);assert.deepEqual(candidate.source_preference,{policy:'only',urls:[c.request],official:false});}
});

const badCases=[
  ['Man City invented required topic',0,v=>v.constraints.push({kind:'topic',value:'transfers',role:'required'})],
  ['Microsoft invented official-only',1,v=>v.source_preference='from official sources only'],
  ['Microsoft wrong quarter',1,v=>v.time_scope=['Q4 2026']],
  ['Jannik different identity',2,v=>v.subject='Roger Federer'],
  ['GBP/EUR wrong threshold',3,v=>v.constraints[0].value='1.18'],
  ['GBP/EUR wrong direction',3,v=>v.constraints[0].comparator='lt'],
  ['URL fabricated topic',4,v=>v.subject='UK politics'],
  ['conflicting multiple subjects',0,v=>v.subject=['Manchester City','Liverpool']],
  ['malformed numeric constraint',3,v=>v.constraints[0].value='1e2'],
  ['malformed quarter',1,v=>v.time_scope=['Q5 2026']],
  ['missing required subject',0,v=>v.subject=null],
  ['missing required field',0,v=>delete v.trigger],
  ['ambiguous claim',0,v=>v.ambiguity=['Manchester City']],
  ['fabricated ambiguity',0,v=>v.ambiguity=['not in this request']],
  ['source-backed but invented trigger topic',0,v=>v.constraints.push({kind:'topic',value:'important new developments',role:'required'})],
  ['URL substituted source',4,v=>v.source_preference='https://example.com/'],
  ['numeric model unit field forbidden',3,v=>v.constraints[0].unit='GBP'],
];
for(const [name,i,mutate]of badCases)test(`reject: ${name}`,()=>{
  const v=structuredClone(cases[i].e);mutate(v);
  assert.throws(()=>ground(i,v),e=>['INVALID_CREATE_SEMANTICS','CREATE_SEMANTIC_AMBIGUITY'].includes(e.code));
});
test('conflicting subjects and ambiguity hidden as certainty fail as ambiguity',()=>{
  const v=structuredClone(cases[0].e);v.subject=['Manchester City','Liverpool'];
  assert.throws(()=>ground(0,v),{code:'CREATE_SEMANTIC_AMBIGUITY'});
  const request='Tell me when there are important new developments about Manchester City or Liverpool.';
  assert.throws(()=>groundCreateSemantics(request,extraction('Manchester City or Liverpool','important new developments')),
    {code:'CREATE_SEMANTIC_AMBIGUITY'});
});
test('old graph, technical choices, evidence paths and model IDs are not accepted',()=>{
  for(const field of ['subjects','conditions','unresolvedRequirements','recurrence','domain','intent','predicate','adapter','provider','persistenceType','evidence','id']){
    const v={...cases[0].e,[field]:'untrusted'};assert.throws(()=>ground(0,v),{code:'INVALID_CREATE_SEMANTICS'});
  }
});
test('determinism: 20 repeated runs per frozen input have zero semantic/evidence/offset drift',()=>{
  for(let i=0;i<cases.length;i++){
    const expected=JSON.stringify(ground(i));
    for(let run=0;run<20;run++)assert.equal(JSON.stringify(ground(i)),expected);
  }
});
test('equivalent grounded trigger forms converge without reconstructed graph',()=>{
  const e={...cases[1].e,trigger:'publishes its Q3 2026 earnings results'};assert.deepEqual(ground(1,e),ground(1));
  const n={...cases[3].e,trigger:'goes above 1.17',constraints:[{value:'1.1700',kind:'numeric',comparator:'gt'}]};
  assert.deepEqual(ground(3,n),ground(3));
});
test('explicit constraints/source get server anchors; grammatical role resolves repeated words',()=>{
  const request='Monitor flight availability about Paris, only direct flights from official sources only.';
  const e=extraction('Paris','flight availability',{constraints:[{kind:'topic',value:'direct flights',role:'required'}],source_preference:'from official sources only'});
  const c=groundCreateSemantics(request,e).candidate;verifySpans(c);
  assert.deepEqual(c.constraints,[{kind:'topic',value:'direct flights',role:'required'}]);assert.equal(c.source_preference.official,true);
  assert.equal(c.evidence.find(e=>e.field==='source_preference').text,'from official sources only');
  const repeated='Tell me when there are news about news.';
  const r=groundCreateSemantics(repeated,extraction('news','news')).candidate;
  assert.equal(r.evidence.find(e=>e.field==='subject/0').start,repeated.lastIndexOf('news'));
  assert.equal(r.evidence.find(e=>e.field==='trigger').start,repeated.indexOf('news'));
});
test('all explicit constraints are accounted for, not dropped; negation and extra clauses do not pass',()=>{
  const request='Monitor flight availability about Paris, only direct flights from official sources only.';
  assert.throws(()=>groundCreateSemantics(request,extraction('Paris','flight availability')),{code:'INVALID_CREATE_SEMANTICS'});
  for(const request of ['Tell me when there are important new developments about Manchester City, but not Liverpool.',
    'Tell me when there are important new developments about Manchester City. Also track Liverpool.']){
    assert.throws(()=>groundCreateSemantics(request,cases[0].e),{code:'INVALID_CREATE_SEMANTICS'});
  }
});
test('multiple valid literal role delimiters fail rather than choosing a substring binding',()=>{
  const request='Monitor news about news about Paris.';
  assert.throws(()=>groundCreateSemantics(request,extraction('news about Paris','news')),
    {code:'CREATE_SEMANTIC_AMBIGUITY',reason:'ambiguous_binding'});
});
test('decimal precision, direction, pair ordering and URL bytes are source-derived',()=>{
  const r='Tell me when EUR/GBP goes below 1.170000000001.';
  const e=extraction('EUR/GBP','threshold crossing',{constraints:[{kind:'numeric',comparator:'lt',value:'1.170000000001'}]});
  const c=groundCreateSemantics(r,e).candidate;assert.deepEqual(c.trigger.comparison,{comparator:'lt',value:'1.170000000001',unit:'GBP'});verifySpans(c);
  const url='https://example.com/a%2Fb?x=1&x=2#Fragment';
  assert.equal(groundCreateSemantics(url,createExactUrlSemanticExtraction(url)).candidate.input_source.submitted_url,url);
});
test('contract handoff uses only existing candidate keys and source-owned evidence; no downstream call',()=>{
  const keys=['user_intent_text','subject','trigger','constraints','time_scope','source_preference','input_source','evidence'];
  for(let i=0;i<cases.length;i++)assert.deepEqual(Object.keys(ground(i).candidate),keys);
  assert.deepEqual(Object.keys(createSemanticExtractionSchema.properties),['subject','trigger','constraints','time_scope','source_preference','ambiguity']);
  assert.equal(createSemanticExtractionSchema.additionalProperties,false);assert(Object.isFrozen(createSemanticExtractionSchema));
  assert.notEqual(validateCreateSemanticExtraction(cases[0].e),cases[0].e);
});
test('helper source imports only the new semantic boundary, never old graph, downstream or transport',async()=>{
  const extractionSource=await readFile(new URL('./create-semantic-extraction.js',import.meta.url),'utf8');
  const groundingSource=await readFile(new URL('./create-semantic-grounding.js',import.meta.url),'utf8');
  assert(!/^import\s/m.test(extractionSource));
  const imports=[...groundingSource.matchAll(/from '([^']+)'/gu)].map(m=>m[1]);
  assert.deepEqual(imports,['./create-semantic-extraction.js']);
  for(const source of [extractionSource,groundingSource]){
    assert(!/\b(?:fetch|normalizeWatchContract|compileMonitoringPlan|resolveWatchContractCapability)\s*\(/u.test(source));
  }
});
