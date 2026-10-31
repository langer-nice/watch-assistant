import {randomBytes} from 'node:crypto';
import {createVerifiedIntent,createEvidence,createPriorState} from '../../v3-brain/input.mjs';
import {ACTIONS,EVIDENCE_STATUSES,PROVENANCE_FIELDS,freeze,object,text,list} from '../../v3-brain/schema.mjs';
import {hasUnconfirmedQualification} from '../../v3-brain/judgment.mjs';
import {guardNumericAction} from '../../v3-brain/validate.mjs';
import {OUTPUT_SCHEMA,createConditionCheck,guardConditionAction} from '../condition-state/candidate.mjs';

export const REFERENCE_INSTRUCTIONS = 'For claim support return evidence_refs containing only supplied title/content/measurement segment IDs. Return provenance_refs separately containing only supplied source/url/published_at IDs. Use empty arrays when no references of a role are selected. Do not reproduce claim quotes or invent references. Title, content and measurement references support claims. Source, url and published_at references are provenance only and cannot alone support ALERT. Select relevant supporting segments; reference validity alone does not establish relevance or entailment.';

// Preserve every UTF-16 source unit. Prefer paragraph boundaries; long paragraphs
// use raw 800-unit chunks, never splitting a surrogate pair. No text rewriting.
export function segmentContent(content) {
  text(content,'content');const result=[];let start=0;
  const boundaries=[...content.matchAll(/\r?\n[\t ]*\r?\n/gu)].map(m=>m.index+m[0].length);boundaries.push(content.length);
  for(const boundary of boundaries){while(start<boundary){let end=Math.min(start+800,boundary);if(end<boundary&&/[\uD800-\uDBFF]/u.test(content[end-1])&&/[\uDC00-\uDFFF]/u.test(content[end]))end--;
    result.push({start,end,text:content.slice(start,end)});start=end;
    if(result.length>256)throw new TypeError('Prototype content segment limit exceeded');
  }}return freeze(result);
}

export function createReferenceRequest(input, {requestNonce = randomBytes(16).toString('hex')} = {}) {
  if (!/^[a-f0-9]{32}$/.test(requestNonce)) throw new TypeError('Invalid request namespace');
  object(input,['intent','evidence','prior_state'],['intent','evidence']);
  const snapshot=freeze({intent:createVerifiedIntent(input.intent),evidence:createEvidence(input.evidence),prior_state:createPriorState(input.prior_state)});
  // Fresh per invocation, not a content hash or persistent evidence ID. Equal
  // evidence in another request must not accidentally authorize stale refs.
  const item='e'+requestNonce;const segments=[];
  const add=(suffix,field,role,value,start=0,end=value.length)=>{if(value.trim())segments.push({id:item+'.'+suffix,evidence_item:item,field,role,text:value,start,end});};
  const e=snapshot.evidence;add('title','title','CLAIM',e.title);
  segmentContent(e.content).forEach((s,i)=>add('content.'+(i+1),'content','CLAIM',s.text,s.start,s.end));
  if(e.measurement)add('measurement','measurement','MEASUREMENT',e.measurement.quote);
  for(const field of PROVENANCE_FIELDS)if(e[field]!==undefined)add(field,field,'PROVENANCE',e[field]);
  const schema=structuredClone(OUTPUT_SCHEMA);
  delete schema.properties.evidence_basis;schema.required=schema.required.filter(k=>k!=='evidence_basis');
  for(const key of ['evidence_refs','provenance_refs']){
    const ids=segments.filter(s=>key==='evidence_refs'?s.role!=='PROVENANCE':s.role==='PROVENANCE').map(s=>s.id);
    schema.required.push(key);schema.properties[key]={type:'array',minItems:0,maxItems:ids.length?512:0,items:{type:'string',enum:ids.length?ids:['NO_REFS_AVAILABLE']}};
  }
  const view=freeze({intent:snapshot.intent,prior_state:snapshot.prior_state,evidence:{item,segments,...(e.measurement?{measurement:e.measurement}:{})}});
  const map=new Map(segments.map(s=>[s.id,freeze(s)]));
  function resolve(refs,action,role='CLAIM'){
    if(!ACTIONS.includes(action))throw new TypeError('Invalid judgment action');list(refs,'evidence_refs',512);
    const resolved=[];for(const ref of new Set(refs)){if(typeof ref!=='string'||!map.has(ref))throw new TypeError('Unknown or malformed evidence reference');const segment=map.get(ref);if((role==='PROVENANCE')!==(segment.role==='PROVENANCE'))throw new TypeError('Reference role mismatch');resolved.push(segment);}
    if(role==='CLAIM'&&action==='ALERT'&&!resolved.some(r=>r.role==='CLAIM'||r.role==='MEASUREMENT'))throw new TypeError('ALERT requires a claim reference');
    return freeze(resolved);
  }
  function admit(output){
    // Candidate admission uses the unchanged semantic guards; only source
    // representation and role validation replace quote resolution.
    object(output,Object.keys(schema.properties),['action','evidence_status','reason','evidence_refs','provenance_refs']);
    if(!EVIDENCE_STATUSES.includes(output.evidence_status))throw new TypeError('Invalid judgment evidence status');
    text(output.reason,'reason');if(output.reason.length>4000)throw new TypeError('Reason too long');
    if(output.novelty_summary!==undefined&&output.novelty_summary!==null){text(output.novelty_summary,'novelty_summary',true);if(output.novelty_summary.length>4000)throw new TypeError('Novelty summary too long');}
    const claims=resolve(output.evidence_refs,output.action),provenance=resolve(output.provenance_refs,'NO_ALERT','PROVENANCE');
    const basis=[...claims,...provenance];if(!basis.length)throw new TypeError('Evidence references required');
    if(output.action==='ALERT'){
      if(!['CONFIRMED','STRONG_UNCONFIRMED'].includes(output.evidence_status))throw new TypeError('Evidence status cannot support ALERT');
      if(output.evidence_status==='STRONG_UNCONFIRMED'&&!hasUnconfirmedQualification(output.reason))throw new TypeError('Unconfirmed ALERT requires explicit qualification');
    }
    const check=createConditionCheck(output.condition_check);guardConditionAction(output,check);guardNumericAction(snapshot,output);
    return freeze({...output,evidence_refs:claims.map(b=>b.id),provenance_refs:provenance.map(b=>b.id),evidence_basis:basis});
  }
  return Object.freeze({input:view,response_schema:freeze(schema),grounding_instructions:REFERENCE_INSTRUCTIONS,resolve,admit});
}
