import {INSTRUCTIONS as LEGACY} from '../condition-state/candidate.mjs';
import {freeze} from '../../v3-brain/schema.mjs';
import {createReferenceRequest,REFERENCE_INSTRUCTIONS} from './references.mjs';
const start=LEGACY.indexOf('Return only the supplied Judgment schema.');
const end=LEGACY.indexOf('\nWhen the verified intent depends on a material condition',start);
if(start<0||end<0)throw new Error('Grounding-only prompt boundary missing');
export const PREVIOUS_ACTION_DEFINITION="ALERT means a relevant, important, genuinely new development satisfies the user's constraints.";
export const ALERT_POLICY="ALERT means a relevant, materially new development is useful for the user to know now; it is a notification-value decision, not a declaration of official confirmation. Credible independent corroborated reports can themselves be that development before the reported event is officially confirmed; use STRONG_UNCONFIRMED with the existing explicit qualification. Do not turn an ordinary follow request into a confirmation-only or completed-event requirement absent from the user's intent. STRONG_UNCONFIRMED alone never forces ALERT: relevance, materiality, novelty, duplicate suppression, exclusions and actual user conditions still apply.";
if(!LEGACY.slice(0,start).includes(PREVIOUS_ACTION_DEFINITION))throw new Error('Action-definition boundary missing');
export const INSTRUCTIONS=LEGACY.slice(0,start).replace(PREVIOUS_ACTION_DEFINITION,ALERT_POLICY)+'Return only the supplied Judgment schema. '+REFERENCE_INSTRUCTIONS+' Give a concise reason and optional novelty_summary; do not invent facts.'+LEGACY.slice(end);
export const NAME='WA V3 SIMPLE CONDITION-AWARE CANDIDATE — EVIDENCE REFS';
export function prepareReferenceJudgment(input,options){return createReferenceRequest(input,options);}
export async function judgePreparedReferenceEvidence(prepared,{model}={}){
 if(typeof model!=='function')throw new TypeError('Explicit judgment model required');
 const output=await model(freeze({instructions:INSTRUCTIONS,input:prepared.input,response_schema:prepared.response_schema}));
 return prepared.admit(output);
}
export async function judgeReferenceEvidence(input,{model}={}){return judgePreparedReferenceEvidence(prepareReferenceJudgment(input),{model});}
