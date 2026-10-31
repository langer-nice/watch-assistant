import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createReferenceRequest,segmentContent} from './references.mjs';
import {fixtures} from '../../v3-brain/fixtures.mjs';
const input={intent:{canonical_text:'Notify me of new confirmed developments.'},evidence:{id:'original',title:'Official update',content:'Company Alpha has not confirmed ticket sales. Price: 120.00 EUR!\n\nCompany Alpha confirmed a new venue.',source:'Publisher',url:'https://example.com/a?x=1#details',published_at:'2026-10-31'}};
const request=()=>createReferenceRequest(input);
const by=(r,field)=>r.input.evidence.segments.filter(s=>s.field===field);
const output=(refs,extra={})=>({action:'ALERT',evidence_status:'CONFIRMED',reason:'New relevant development.',evidence_refs:refs,condition_check:null,provenance_refs:[],...extra});
for(const field of ['title','content'])test('valid '+field+' claim ref',()=>{const r=request();assert.equal(r.admit(output([by(r,field)[0].id])).evidence_basis[0].field,field);});
test('multiple content refs and title/content combinations are unambiguous',()=>{const r=request(),refs=[...by(r,'title'),...by(r,'content')].map(s=>s.id);assert.equal(r.admit(output(refs)).evidence_basis.length,3);});
test('canonical measurement keeps exact metric and number',()=>{const f=fixtures.find(f=>f.id==='J4'),r=createReferenceRequest(f.input),m=by(r,'measurement')[0];assert.equal(m.text,f.input.evidence.measurement.quote);assert.equal(r.admit(output([m.id])).evidence_basis[0].role,'MEASUREMENT');});
test('provenance is accepted as provenance with a claim',()=>{const r=request(),refs=[by(r,'content')[0].id];assert.equal(r.admit(output(refs,{provenance_refs:[by(r,'source')[0].id]})).evidence_basis[1].role,'PROVENANCE');});
test('source-only ALERT rejects',()=>{const r=request();assert.throws(()=>r.admit(output([by(r,'source')[0].id])),TypeError);});
test('provenance-only NO_ALERT is permitted as before',()=>{const r=request();assert.equal(r.admit(output([],{action:'NO_ALERT',provenance_refs:[by(r,'source')[0].id]})).action,'NO_ALERT');});
for(const [name,value] of [['unknown','e1.content.999'],['malformed',{}],['metadata','retrieved_at'],['traversal','__proto__.content'],['unrelated item','e2.content.1']])test(name+' ref rejects',()=>assert.throws(()=>request().admit(output([value])),TypeError));
test('nonexistent index of correct current item rejects',()=>{const r=request();assert.throws(()=>r.admit(output([r.input.evidence.item+'.content.999'])),TypeError);});
test('duplicates deduplicate deterministically',()=>{const r=request(),id=by(r,'title')[0].id;assert.deepEqual(r.admit(output([id,id])).evidence_refs,[id]);});
test('same text in two segments keeps distinct exact IDs/offsets',()=>{const r=createReferenceRequest({...input,evidence:{...input.evidence,content:'Repeated text.\n\nRepeated text.\n\n'}});const s=by(r,'content');assert.equal(s[0].text,s[1].text);assert.notEqual(s[0].id,s[1].id);assert.notEqual(s[0].start,s[1].start);assert.equal(r.admit(output(s.map(s=>s.id))).evidence_basis.length,2);});
test('punctuation, numbers, negation, exact URL and original evidence are preserved',()=>{const before=structuredClone(input),r=request();assert.equal(by(r,'content').map(s=>s.text).join(''),input.evidence.content);assert.equal(by(r,'url')[0].text,input.evidence.url);assert.deepEqual(input,before);});
test('segmentation deterministic, bounded, lossless, and surrogate-safe',()=>{const text='a'.repeat(799)+'😀 more\r\n\r\nNext paragraph';const s=segmentContent(text);assert.deepEqual(s,segmentContent(text));assert.equal(s.map(s=>s.text).join(''),text);for(const x of s){assert.ok(x.text.length<=800);assert.equal(text.slice(x.start,x.end),x.text);assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(x.text));}});
test('empty title is omitted and excessive segments fail closed',()=>{const r=createReferenceRequest({...input,evidence:{...input.evidence,title:''}});assert.equal(by(r,'title').length,0);assert.throws(()=>segmentContent('a\n\n'.repeat(257)),/segment limit/);});
test('stale refs reject even with byte-identical evidence',()=>{const a=request(),b=request();assert.notEqual(a.input.evidence.item,b.input.evidence.item);assert.throws(()=>b.admit(output([by(a,'title')[0].id])),TypeError);assert.deepEqual(a.resolve([by(a,'title')[0].id],'ALERT'),a.resolve([by(a,'title')[0].id],'ALERT'));});
test('output schema IDs are exact current request enumeration; no quote input accepted',()=>{const r=request();assert.deepEqual(r.response_schema.properties.evidence_refs.items.enum,r.input.evidence.segments.filter(s=>s.role!=='PROVENANCE').map(s=>s.id));assert.ok(!Object.hasOwn(r.response_schema.properties,'evidence_basis'));assert.throws(()=>r.admit({...output([by(r,'title')[0].id]),evidence_basis:[{quote:'Invented'}]}),TypeError);});
test('role cannot be forged through a model field',()=>{const r=request();assert.throws(()=>r.admit(output([{id:by(r,'source')[0].id,role:'CLAIM'}])),TypeError);assert.equal(r.resolve([by(r,'source')[0].id],'NO_ALERT','PROVENANCE')[0].role,'PROVENANCE');});
test('valid but irrelevant claim ref is structurally admissible, not proof of entailment',()=>{const r=request();const result=r.admit(output([by(r,'title')[0].id],{reason:'An unrelated product launched.'}));assert.equal(result.action,'ALERT');});
test('all refs selected is structurally valid, not proof of good selection',()=>{const r=request();assert.equal(r.admit(output(r.input.evidence.segments.filter(s=>s.role!=='PROVENANCE').map(s=>s.id),{provenance_refs:r.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)})).evidence_basis.length,r.input.evidence.segments.length);});
test('strong-unconfirmed qualification remains required',()=>{const r=request(),ids=[by(r,'content')[0].id];assert.throws(()=>r.admit(output(ids,{evidence_status:'STRONG_UNCONFIRMED'})),/qualification/);assert.equal(r.admit(output(ids,{evidence_status:'STRONG_UNCONFIRMED',reason:'Independent reports; official confirmation pending.'})).evidence_status,'STRONG_UNCONFIRMED');});
test('weak evidence cannot ALERT and false material condition cannot ALERT',()=>{const r=request(),ids=[by(r,'content')[0].id];assert.throws(()=>r.admit(output(ids,{evidence_status:'WEAK_UNCONFIRMED'})),/cannot support/);assert.throws(()=>r.admit(output(ids,{condition_check:{required_state:'available now',observed_state:'planned later',condition_satisfied:false}})),/Condition false/);});
test('exact numeric action guard still rejects wrong ALERT',()=>{const f=fixtures.find(f=>f.id==='J5'),r=createReferenceRequest(f.input);assert.throws(()=>r.admit(output([by(r,'content')[0].id])),/exact numeric condition/);});
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const rawRows=read('../paraphrase-stability/results/ledger.json');const historicalInput=read('../paraphrase-stability/paraphrases.json').find(c=>c.id==='P6').input;
for(const key of ['paraphrase-P6','stability-S8-r2'])test(key+' historical support represented without quote reproduction',()=>{
 const raw=rawRows.find(r=>r.key===key).raw,r=createReferenceRequest(historicalInput);const {evidence_basis,...semantic}=raw;
 const result=r.admit({...semantic,evidence_refs:by(r,'content').slice(0,2).map(s=>s.id),provenance_refs:[]});
 for(const k of ['action','evidence_status','reason','novelty_summary','condition_check'])assert.deepEqual(result[k],raw[k]);
 assert.ok(result.evidence_basis[0].text.startsWith('Continental Live,'));assert.ok(result.evidence_basis[1].text.startsWith('Tour Desk,'));
});
// Reviewed fixture support selection for parity controls, not a runtime quote
// fallback: prototype admission itself accepts IDs only.
import {resolveEvidenceBasis} from '../../v3-brain/evidence-basis.mjs';
function selectedRefs(r,evidence,raw){const result={evidence_refs:[],provenance_refs:[]};raw.evidence_basis.forEach(item=>{
 const old=resolveEvidenceBasis(evidence,item);
 const segment=r.input.evidence.segments.find(s=>s.field===old.field&&(old.role==='PROVENANCE'||s.text.includes(old.value)));
 assert.ok(segment,'existing fixture support has a server segment');result[segment.role==='PROVENANCE'?'provenance_refs':'evidence_refs'].push(segment.id);
});return result;}
for(const f of fixtures)test(f.id+' semantic fixture parity with reviewed refs',()=>{
 const r=createReferenceRequest(f.input),{evidence_basis,...semantic}=f.mock;
 const result=r.admit({...semantic,...selectedRefs(r,f.input.evidence,f.mock)});
 for(const key of ['action','evidence_status','reason','novelty_summary'])assert.deepEqual(result[key],f.mock[key]);
 assert.deepEqual(r.input.intent.canonical_text,f.input.intent.canonical_text);
 assert.deepEqual(r.input.prior_state.entries,f.input.prior_state?.entries??[]);
});
const developmentCases=read('../development-gate-v2/cases.json');const developmentRows=read('../development-gate-v2/results/ledger.json');
for(const id of ['R03','R05','R06','R10','R12'])test(id+' historical current-candidate parity',()=>{
 const c=developmentCases.find(c=>c.id===id),raw=developmentRows.find(r=>r.id===id).raw;
 const r=createReferenceRequest({intent:c.intent,evidence:c.evidence,prior_state:c.prior_state}),{evidence_basis,...semantic}=raw;
 const result=r.admit({...semantic,...selectedRefs(r,c.evidence,raw)});
 for(const key of ['action','evidence_status','reason','novelty_summary','condition_check'])assert.deepEqual(result[key],raw[key]);
});
test('exact resource input and outcome are unchanged',()=>{
 const c=read('../paraphrase-stability/paraphrases.json').find(c=>c.id==='P9'),raw=rawRows.find(r=>r.id==='P9').raw,r=createReferenceRequest(c.input);
 const {evidence_basis,...semantic}=raw;
 const result=r.admit({...semantic,...selectedRefs(r,c.input.evidence,raw)});
 assert.equal(result.action,raw.action);assert.deepEqual(r.input.intent.references,c.input.intent.references??[]);
 assert.equal(r.input.intent.canonical_text,c.input.intent.canonical_text);assert.equal(by(r,'url')[0].text,c.input.evidence.url);
});
import {INSTRUCTIONS,ALERT_POLICY,PREVIOUS_ACTION_DEFINITION,prepareReferenceJudgment,judgePreparedReferenceEvidence} from './candidate.mjs';
import {INSTRUCTIONS as OLD} from '../condition-state/candidate.mjs';
test('only action definition changes; other policy and complete condition instructions stay byte-identical',()=>{
 const start=OLD.indexOf('Return only the supplied Judgment schema.'),condition=OLD.indexOf('\nWhen the verified intent depends on a material condition');
 assert.equal(INSTRUCTIONS.slice(0,INSTRUCTIONS.indexOf('Return only the supplied Judgment schema.')).replace(ALERT_POLICY,PREVIOUS_ACTION_DEFINITION),OLD.slice(0,start));assert.equal(INSTRUCTIONS.slice(INSTRUCTIONS.indexOf('\nWhen the verified intent depends on a material condition')),OLD.slice(condition));assert.ok(!INSTRUCTIONS.includes('{quote}'));
});
test('claim and provenance ref arrays cannot exchange roles',()=>{const r=request();assert.throws(()=>r.admit(output([by(r,'source')[0].id])),/role mismatch/);assert.throws(()=>r.admit(output([by(r,'title')[0].id],{provenance_refs:[by(r,'content')[0].id]})),/role mismatch/);});
test('one model invocation, no retry/repair or quote fallback, identical prepared requests',async()=>{
 const p=prepareReferenceJudgment(input),seen=[];for(let i=0;i<3;i++)await judgePreparedReferenceEvidence(p,{model:async req=>{seen.push(JSON.stringify(req));return output([by(p,'content')[0].id]);}});
 assert.equal(seen.length,3);assert.equal(new Set(seen).size,1);
 let calls=0;await assert.rejects(judgePreparedReferenceEvidence(p,{model:async()=>{calls++;return output(['bad']);}}));assert.equal(calls,1);
});
