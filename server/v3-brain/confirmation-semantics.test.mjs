import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONFIRMATION_GUIDANCE} from './confirmation-semantics.mjs';
import {INSTRUCTIONS as base} from './prompt.mjs';
import {INSTRUCTIONS as active,judgeReferenceEvidence} from '../v3-brain-lab/evidence-ref-candidate/candidate.mjs';
import {evaluateV3Source} from '../v3-pilot.js';
import {renderMediaWatchDigest} from '../media-watch-digest.js';

const cases=JSON.parse(readFileSync(new URL('./confirmation-cases.json',import.meta.url)));
const understanding=c=>({intent:{canonical_text:c.instruction,references:[],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR'}});
const answer=(c,request)=>({action:c.action,evidence_status:c.status,reason:c.reason,novelty_summary:c.action==='ALERT'?'A new evidenced development.':null,condition_check:c.condition_check||null,evidence_refs:request.input.evidence.segments.filter(s=>s.role==='CLAIM').map(s=>s.id),provenance_refs:request.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)});
const unsupported=/(?:official confirmation (?:is )?(?:pending|awaited)|awaiting official confirmation|yet to be officially confirmed|pending official verification|not yet officially confirmed)/i;

test('active and base prompts share generic completed-fact and grounded-qualification guidance',()=>{
 for(const prompt of [base,active])assert(prompt.includes(CONFIRMATION_GUIDANCE));
 for(const phrase of ['an official source is not mandatory','Neither a completed-sounding claim','Future, expected, planned or speculative','without establishing that its future event has occurred','Absence of an official source is not evidence'])assert(CONFIRMATION_GUIDANCE.includes(phrase));
 assert(!/\b(?:sport|football|Manchester City|BBC|Metallica)\b/i.test(CONFIRMATION_GUIDANCE));
 assert(active.includes('STRONG_UNCONFIRMED alone never forces ALERT'));
 assert(!base.includes('reason must explicitly explain that credible reports support the development but official confirmation is absent or pending'));
});

for(const c of cases)test(c.id+' contract fixture preserves status, source refs and presentation in one call',async()=>{
 let calls=0,requests=0;
 const item={id:c.id,title:c.title,excerpt:c.content,url:'https://example.test/'+c.id,source:'Supplied evidence',publishedAt:'2026-11-02T06:00:00Z'};
 const result=await evaluateV3Source({id:'fixture',engine:'wa-v3-evidence-refs.v1',understanding:understanding(c),baseline_at:'2026-11-01T06:00:00Z',prior_state:{entries:[]}},{type:'feed',url:'https://example.test/feed'},{feed:async()=>{requests++;return {source:{title:'Fixture',url:'https://example.test/feed'},checkedAt:'2026-11-02T06:35:00Z',items:[item]};},model:async request=>{calls++;assert(request.instructions.includes(CONFIRMATION_GUIDANCE));return answer(c,request);}});
 assert.equal(calls,1);assert.equal(requests,1);assert.equal(result.judgment.action,c.action);assert.equal(result.judgment.evidence_status,c.status);assert(!unsupported.test(result.judgment.reason));
 if(c.action==='ALERT'){
  assert.equal(result.article.title,c.reason.slice(0,300));assert.equal(result.article.summary,c.reason);assert(!result.article.title.startsWith('Unconfirmed reports:'));
  const email=renderMediaWatchDigest({locale:'en',watchId:'fixture',watchTitle:'Fixture Watch',period:'2026-11-02',articles:[{id:c.id,article:result.article}],baseUrl:'https://example.test'});
  assert(email.text.includes(result.article.title));assert(!email.text.includes('Unconfirmed reports:'));assert(!unsupported.test(email.text));
 }else assert.equal(result.article,null);
 if(c.id==='future-reports')assert.match(result.article.title,/unconfirmed/i);
 if(c.condition_check)assert.deepEqual(result.judgment.condition_check,c.condition_check);
});

test('single sufficient direct source is allowed, without making source count a confirmation rule',async()=>{
 const c={...cases.find(c=>c.id==='published-observation'),content:'One dated final reference table directly records EUR/GBP = 0.83580.',status:'CONFIRMED'};
 const input={intent:understanding(c).intent,evidence:{id:'one',title:c.title,content:c.content,source:'One reference table',url:'https://example.test/table'},prior_state:{entries:[]}};
 const result=await judgeReferenceEvidence(input,{model:async request=>answer(c,request)});assert.equal(result.evidence_status,'CONFIRMED');
 assert.equal(cases.find(c=>c.id==='single-limited').status,'INSUFFICIENT');
});

test('qualification stays explicit and existing refs, false-condition and no-alert guards are unchanged',async()=>{
 const c=cases.find(c=>c.id==='future-reports');const input={intent:understanding(c).intent,evidence:{id:'future',title:c.title,content:c.content},prior_state:{entries:[]}};
 await assert.rejects(judgeReferenceEvidence(input,{model:async request=>({...answer(c,request),reason:'The event will happen.'})}),/qualification/);
 await assert.rejects(judgeReferenceEvidence(input,{model:async request=>({...answer(c,request),evidence_refs:['invented']})}),/reference/i);
 await assert.rejects(judgeReferenceEvidence(input,{model:async request=>({...answer(c,request),condition_check:{required_state:'completed',observed_state:'planned',condition_satisfied:false}})}),/Condition false/);
});
