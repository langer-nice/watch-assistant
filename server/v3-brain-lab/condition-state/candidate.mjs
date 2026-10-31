import {BASELINE_INSTRUCTIONS} from '../grounding-development/baseline.mjs';
import {JUDGMENT_SCHEMA,freeze,object,text} from '../../v3-brain/schema.mjs';
import {judgeEvidence} from '../../v3-brain/brain.mjs';

// Existing semantics/grounding prompt retained verbatim; one small generic,
// visible state comparison is added in the same judgment, not a reasoning trace.
export const INSTRUCTIONS = BASELINE_INSTRUCTIONS + `
When the verified intent depends on a material condition or state, include a concise condition_check with required_state, observed_state and condition_satisfied. Describe only the required fact and the fact established by the supplied evidence; no reasoning steps or added user requirements. If there is no material condition, use null.
Compare the complete required state with the observed state, preserving timing, completion, conjunction, thresholds, duration and scope. An announcement or intention establishes a planned state, not an observed completed state. Passage of a scheduled date alone does not establish that the state actually occurred or still holds. Do not treat related or partial evidence as establishing the whole requirement.
condition_satisfied is true only when supplied evidence establishes the complete material requirement in the required way; false when supplied facts establish it is unmet; null when missing or conflicting information leaves satisfaction unknown. Do not invent satisfaction. An ALERT must satisfy the material requirement as well as all existing relevance, novelty and evidence rules. A false condition forbids ALERT; a true condition does not require ALERT. Unknown satisfaction does not license assuming the requirement is met. Evidence status remains separate: established official schedules or facts may be CONFIRMED while the required condition is unmet or unknown.
Keep required_state and observed_state short and inspectable. Return the existing Judgment fields plus condition_check only.`;

const stateText={type:'string',minLength:1,maxLength:600};
export const CONDITION_SCHEMA=freeze({type:['object','null'],additionalProperties:false,properties:{
 required_state:stateText,observed_state:stateText,condition_satisfied:{type:['boolean','null']},
},required:['required_state','observed_state','condition_satisfied']});
export const OUTPUT_SCHEMA=freeze({...structuredClone(JUDGMENT_SCHEMA),
 properties:{...structuredClone(JUDGMENT_SCHEMA.properties),condition_check:CONDITION_SCHEMA},
 required:[...JUDGMENT_SCHEMA.required,'condition_check'],
});
export function createConditionCheck(value){
 if(value===undefined||value===null)return undefined;
 object(value,['required_state','observed_state','condition_satisfied']);
 for(const key of ['required_state','observed_state']){text(value[key],key);if(value[key].length>600)throw new TypeError('Condition state is too long');}
 if(value.condition_satisfied!==null&&typeof value.condition_satisfied!=='boolean')throw new TypeError('Condition satisfaction must be boolean or null');
 return freeze({...value});
}
export function guardConditionAction(judgment,check){
 if(check?.condition_satisfied===false&&judgment.action==='ALERT')throw new TypeError('Condition false cannot support ALERT');
}
export async function judgeConditionEvidence(input,{model}={}){
 if(typeof model!=='function')throw new TypeError('Explicit condition judgment model required');
 let check;
 const judgment=await judgeEvidence(input,{model:async request=>{
  const output=await model(freeze({...request,instructions:INSTRUCTIONS,response_schema:OUTPUT_SCHEMA}));
  object(output,[...Object.keys(JUDGMENT_SCHEMA.properties),'condition_check'],['action','evidence_status','reason','evidence_basis']);
  check=createConditionCheck(output.condition_check);
  // Only the extra optional representation is separated. Existing action/status,
  // grounding, qualification, novelty and exact arithmetic admission is reused.
  const {condition_check,...base}=output;
  return base;
 }});
 guardConditionAction(judgment,check); // Reject inconsistency; never repair action.
 return freeze({...judgment,...(check?{condition_check:check}:{})});
}
