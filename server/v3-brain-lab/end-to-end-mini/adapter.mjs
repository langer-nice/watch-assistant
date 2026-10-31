import {createVerifiedIntent,createEvidence,createPriorState} from '../../v3-brain/input.mjs';
import {freeze} from '../../v3-brain/schema.mjs';
export function toBrainInput(understanding,evidence,prior_state){
 if(understanding.decision.status!=='READY_TO_MONITOR')throw new TypeError('Brain requires READY_TO_MONITOR');
 if(understanding.intent.unresolved_ambiguities?.length)throw new TypeError('Unresolved Intent cannot reach Brain');
 const intent=structuredClone(understanding.intent);
 // Preserve model meaning verbatim. Carry the already-authoritative Capture
 // resource envelope when the model legitimately omitted duplicate metadata.
 // This is structural identity propagation, never inferred semantic narrowing.
 if(understanding.resource){
  const {source_ref,exact_url}=understanding.resource;
  intent.references??=[];
  if(!intent.references.some(r=>r.exact_url===exact_url))intent.references.push({label:'Captured exact resource',source_ref,exact_url});
 }
 // No inferred numeric_condition, rewriting, case-specific defaults or repairs.
 return freeze({intent:createVerifiedIntent(intent),evidence:createEvidence(evidence),prior_state:createPriorState(prior_state)});
}
