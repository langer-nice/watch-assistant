import { randomUUID } from 'node:crypto';

const stages=new Set(['request','semantic_extraction','semantic_validation','fidelity_verification','identity_resolution','grounding','watch_contract','normalizer','capability','projection','review']);
const codes=new Set(['INVALID_CREATE_SEMANTIC_FRAME','CREATE_FRAME_CLARIFICATION_REQUIRED','INVALID_CREATE_SEMANTICS','CREATE_SEMANTIC_AMBIGUITY','INVALID_WATCH_CONTRACT','INVALID_CREATE_CONTRACT',
  'CREATE_CLARIFICATION_REQUIRED','INTERPRETATION_FAILED','INVALID_INTERPRETATION_REQUEST','AI_SERVICE_UNAVAILABLE','AI_TIMEOUT',
  'STRUCTURED_FEATURE_UNAVAILABLE','AUTH_REQUIRED','INVALID_SESSION','AUTH_UNAVAILABLE','METHOD_NOT_ALLOWED',
  'MONITORING_PLAN_NOT_SUPPORTED','INVALID_WATCH_DEFINITION']);
const reasons=new Set(['constraint_conflict','schema','comparison_goal','event_goal','subject_goal','source_text','ungrounded_value','value_support','grounded_ambiguity','identity_unresolved','identity_ambiguous','identity_input','identity_reference','pair','comparison_mismatch','multiple_periods','period','date','source_policy','invented_official','unrepresented_requirements','recognition_shape','semantic_contract_mismatch','shape','subject','trigger','source_preference','constraints','numeric_constraint','topic_constraint','constraint_kind',
  'time_scope','ambiguity','subject_required','multiple_subjects','request','url','url_semantics','span','unsupported_clause',
  'subject_mismatch','trigger_mismatch','constraint_mismatch','period_mismatch','source_preference_mismatch','ambiguous_subject',
  'ambiguous_binding','explicit_ambiguity','ungrounded_ambiguity','constraint_clause','version','capability_status','request_mismatch',
  'input_size','technical_hint','evidence_span','subject_kind','identity_conflict','duplicate_subject','url_subject','url_trigger',
  'subject_conflict','trigger_conflict','invented_constraint','period_required','period_conflict','pair_conflict','comparison_conflict',
  'amount_conflict','unit_conflict','extra_constraint','extra_time','source_preference_conflict','input_source_conflict',
  'unrepresented_meaning','constraint_cue','vocabulary_not_supported','duplicate_constraint','derived_evidence','array','text',
  'role_conflict','verifier_invalid','fidelity_rejected','model_call_limit']);
const safeError=e=>({code:codes.has(e?.code)?e.code:e instanceof SyntaxError?'SYNTAX_ERROR':'UNCLASSIFIED_ERROR',
  ...(Array.isArray(e?.fidelity?.reasons)?{fidelity_reasons:e.fidelity.reasons.filter(r=>['MISSING_REQUIREMENT','WRONG_ROLE','INVENTED_REQUIREMENT','UNRESOLVED_AMBIGUITY'].includes(r)).slice(0,4)}:{}),
  ...(reasons.has(e?.reason)||/^evidence_missing:(?:subject\/[0-7]|trigger(?:\/comparison)?|constraints\/[0-7]|time_scope\/[0-3]|source_preference)$/u.test(e?.reason||'')?{reason:e.reason}:{})});
const count=v=>Array.isArray(v)?Math.min(v.length,10000):null;
const known=(v,values)=>values.includes(v)?v:'OTHER';
const safeSummary=fn=>{try{return fn?.();}catch{return undefined;}};

export function createCleanCreateTrace(logger=console,mode='create-core.v1'){
  const correlation_id=randomUUID(),active=[];let last_pass_stage=null,first=null;
  let model_calls=null;const provider_http={};
  const emit=(stage,status,extra={})=>{
    // Serialize ourselves: nested summaries must survive hosted console depth.
    try{logger.info('clean_create_trace',JSON.stringify({correlation_id,mode,stage,status,
      ...(model_calls?{model_calls}:{}),...(Object.keys(provider_http).length?{provider_http}:{}),...extra}));}catch{/* Logging cannot change behavior. */}
  };
  return {
    modelCalls(c){if(c&&Number.isInteger(c.extraction)&&Number.isInteger(c.verification)&&c.extraction>=0&&c.extraction<=1
      &&c.verification>=0&&c.verification<=1&&c.total===c.extraction+c.verification)model_calls={...c};},
    providerStatus(stage,status){if(['extraction','verification'].includes(stage)&&Number.isInteger(status)&&status>=100&&status<=599)provider_http[stage]=status;},
    structure(record){emit('grounding','START',{event:'semantic_frame_structure',safe_summary:record});},
    ambiguity(extracted,grounded,discarded){
      const bounded=n=>Number.isSafeInteger(n)&&n>=0&&n<=4?n:null;
      emit('grounding','START',{event:'ambiguity_filter',safe_summary:{ambiguity_extracted_count:bounded(extracted),
        ambiguity_grounded_count:bounded(grounded),ambiguity_discarded_count:bounded(discarded)}});
    },
    start(stage){if(stages.has(stage)){active.push(stage);emit(stage,'START');}},
    pass(stage,summary){const i=active.lastIndexOf(stage);if(i>=0)active.splice(i,1);last_pass_stage=stage;emit(stage,'PASS',summary?{safe_summary:summary}:{});},
    fail(stage,error){const detail={category:stage,...safeError(error)};if(!first)first={stage,last_pass_stage,...detail};
      const i=active.lastIndexOf(stage);if(i>=0)active.splice(i,1);emit(stage,'FAIL',detail);},
    finish(http_status,response_code){
      if(http_status>=300&&!first)this.fail(active.at(-1)||'request',{code:response_code});
      emit(first?.stage||'review',first?'FAIL':'PASS',{event:'response',http_status,
        last_pass_stage:first?first.last_pass_stage:last_pass_stage,first_fail_stage:first?.stage||null,
        ...(first?{category:first.category,code:first.code,...(first.reason?{reason:first.reason}:{}),
          ...(first.fidelity_reasons?{fidelity_reasons:first.fidelity_reasons}:{})}:{}),
        ...(codes.has(response_code)?{response_code}:{})});
    },
  };
}
export function cleanStage(trace,stage,fn,summary){
  if(!trace)return fn();trace.start(stage);
  try{const value=fn();trace.pass(stage,safeSummary(()=>summary?.(value)));return value;}
  catch(error){trace.fail(stage,error);throw error;}
}
export async function cleanAsyncStage(trace,stage,fn,summary){
  if(!trace)return fn();trace.start(stage);
  try{const value=await fn();trace.pass(stage,safeSummary(()=>summary?.(value)));return value;}
  catch(error){trace.fail(stage,error);throw error;}
}
export const extractionSummary=v=>({subject_present:typeof v?.subject==='string'||typeof v?.subject?.value==='string',trigger_present:typeof v?.trigger==='string'||typeof v?.monitoring_goal?.kind==='string',
  constraint_count:count(v?.constraints),time_scope_count:count(v?.time_scope),source_preference_present:v?.source_preference!=null,
  ambiguity_count:count(v?.ambiguity),fields:v&&typeof v==='object'?Object.keys(v).filter(k=>['subject','trigger','monitoring_goal','comparison','constraints','time_scope','source_preference','ambiguity','unrepresented_requirements'].includes(k)):[]});
export const groundingSummary=v=>({subject_grounded:!!v?.candidate?.subject?.length,trigger_grounded:!!v?.candidate?.trigger,
  constraints_grounded_count:count(v?.candidate?.constraints),time_scope_grounded_count:count(v?.candidate?.time_scope),
  source_grounded:v?.candidate?.source_preference?.policy!=='any'});
export const contractSummary=c=>({version:known(c?.version,['watch-contract.v1']),
  subject_kind:known(c?.subject?.[0]?.kind,['entity','instrument','resource']),
  trigger_kind:known(c?.trigger?.kind,['development','publication','threshold_crossing','resource_change','other']),
  constraint_count:count(c?.constraints),capability_status:known(c?.capability_status,['SUPPORTED','UNSUPPORTED','PARTIALLY_SUPPORTED','UNKNOWN']),
  comparator:c?.trigger?.comparison?known(c.trigger.comparison.comparator,['gt','gte','lt','lte','eq']):null,
  unit:c?.trigger?.comparison?known(c.trigger.comparison.unit,['GBP','EUR']):null,
  ...(typeof c?.trigger?.comparison?.value==='string'&&/^\d{1,12}(?:\.\d{1,12})?$/u.test(c.trigger.comparison.value)?{numeric_value:c.trigger.comparison.value}:{})});
export const projectionSummary=p=>({compatibility:known(p?.status,['COMPATIBLE','SEMANTIC_ONLY','UNSUPPORTED'])});
export const capabilitySummary=c=>({status:known(c?.status,['SUPPORTED','UNSUPPORTED','PARTIALLY_SUPPORTED']),
  adapter:c?.adapter===null?null:known(c?.adapter,['google_news_literal_v1','ecb_reference_v1','bodacc_siren_v1']),unmet_count:count(c?.unmetRequirements)});
