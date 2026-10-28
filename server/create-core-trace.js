import { randomUUID } from 'node:crypto';

const fields=['schemaVersion','language','intent','domain','subjects','conditions','condition','topics','temporal','geographic','exclusions','recurrence','ambiguities','unresolvedRequirements','evidence'];
const arrays=['subjects','conditions','topics','temporal','geographic','exclusions','ambiguities','unresolvedRequirements','evidence'];
const enums={language:['en','fr','mixed','und'],intent:['ongoing_news','event','numeric_condition','change','unknown'],
  domain:['media_news','currency','official_company','ticket_availability','other','unknown'],
  recurrence:['unspecified','once','crossing','per_observation','per_new_item']};
const codes=new Set(['INVALID_CREATE_CONTRACT','CREATE_CLARIFICATION_REQUIRED','INVALID_WATCH_CONTRACT','INTERPRETATION_FAILED',
  'INVALID_INTERPRETATION_REQUEST','AI_SERVICE_UNAVAILABLE','AI_TIMEOUT','STRUCTURED_FEATURE_UNAVAILABLE','AUTH_REQUIRED',
  'INVALID_SESSION','AUTH_UNAVAILABLE','MONITORING_PLAN_NOT_SUPPORTED','INVALID_WATCH_DEFINITION','METHOD_NOT_ALLOWED']);
const reasons=new Set(['shape','version','capability_status','request_mismatch','input_size','technical_hint','evidence_span','subject_required',
  'subject_kind','identity_conflict','duplicate_subject','url_subject','url_trigger','subject_conflict','trigger_conflict','invented_constraint',
  'period_required','period_conflict','pair_conflict','comparison_conflict','amount_conflict','unit_conflict','extra_constraint','extra_time',
  'source_preference_conflict','input_source_conflict','unrepresented_meaning','constraint_cue','constraint_kind','vocabulary_not_supported',
  'duplicate_constraint','derived_evidence','array','text']);
const stages=new Set(['request_received','create_core_route_selected','provider_call','provider_output_parse','interpretation_candidate',
  'contract_bridge','normalizer','projection','capability_resolution','review_response','request_completed']);
const category=stage=>({request_received:'REQUEST',create_core_route_selected:'ROUTING',provider_call:'PROVIDER_CALL',
  provider_output_parse:'PROVIDER_OUTPUT_PARSE',interpretation_candidate:'INTERPRETATION_CANDIDATE',contract_bridge:'CONTRACT_BRIDGE',
  normalizer:'NORMALIZER',projection:'PROJECTION',capability_resolution:'CAPABILITY_RESOLUTION',review_response:'REVIEW_RESPONSE'}[stage]||'APPLICATION');
const safeError=e=>({code:codes.has(e?.code)?e.code:e instanceof SyntaxError?'SYNTAX_ERROR':'UNCLASSIFIED_ERROR',
  ...(reasons.has(e?.reason)||/^evidence_missing:(?:subject\/[0-7]|trigger(?:\/comparison)?|constraints\/[0-7]|time_scope\/[0-3]|source_preference)$/u.test(e?.reason||'')?{reason:e.reason}:{}),
  ...(Number.isInteger(e?.providerStatus)&&e.providerStatus>=100&&e.providerStatus<=599?{providerStatus:e.providerStatus}:{})});

// Only known field names, enum values and bounded counts; never text/quotes/IDs.
export const summarizeCreateExtraction=value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return {object:false};
  const known=Object.keys(value).filter(k=>fields.includes(k));
  const result={object:true,presentFields:known,missingFields:fields.filter(k=>!Object.hasOwn(value,k)),
    nullFields:known.filter(k=>value[k]===null),unknownKeyCount:Math.min(10000,Object.keys(value).length-known.length),
    versionValid:value.schemaVersion==='interpretation.v1',arrayLengths:{}};
  for(const k of arrays)if(Array.isArray(value[k]))result.arrayLengths[k]=Math.min(10000,value[k].length);
  for(const[k,allowed]of Object.entries(enums))if(Object.hasOwn(value,k))result[k]=allowed.includes(value[k])?value[k]:'OTHER';
  for(const [key,source,allowed] of [['subjectKinds','subjects',['individual','open_group','closed_group']],
    ['conditionKinds','conditions',['news_about','mentions_together','event','relationship','numeric','topic','temporal','geographic']],
    ['conditionOps','conditions',['predicate','and','or','not']]]){
    if(Array.isArray(value[source]))result[key]=value[source].slice(0,32).map(v=>{
      const item=key==='conditionOps'?v?.op:v?.kind;return allowed.includes(item)?item:'OTHER';
    });
  }
  return result;
};

export function createCoreTrace(logger=console) {
  const correlationId=randomUUID();let lastSuccessfulStage=null,firstFailure=null;
  const active=[];
  const emit=(stage,status,extra={})=>{
    try{logger.info('create_core_trace',{correlationId,mode:'create-core.v1',stage,status,...extra});}catch{/* Logging must not change behavior. */}
  };
  return {
    start(stage){if(!stages.has(stage))return;active.push(stage);emit(stage,'START');},
    pass(stage,summary){lastSuccessfulStage=stage;active.splice(active.lastIndexOf(stage),1);emit(stage,'PASS',summary?{summary}:{});},
    fail(stage,error,summary){
      const detail={category:category(stage),...safeError(error)};
      if(!firstFailure)firstFailure={stage,lastSuccessfulStage,...detail};
      const i=active.lastIndexOf(stage);if(i>=0)active.splice(i,1);
      emit(stage,'FAIL',{...detail,...(summary?{summary}:{})});
    },
    finish(httpStatus,error){
      if(error&&!firstFailure)this.fail(active.at(-1)||'create_core_route_selected',error);
      emit('request_completed',error?'FAIL':'PASS',{httpStatus,lastSuccessfulStage,
        ...(firstFailure?{firstFailingStage:firstFailure.stage,lastSuccessfulStage:firstFailure.lastSuccessfulStage,
          category:firstFailure.category,code:firstFailure.code,...(firstFailure.reason?{reason:firstFailure.reason}:{})}:{})});
    },
  };
}

const summarySafely=fn=>{try{return fn?.();}catch{return undefined;}};
export function traceCreateStage(trace,stage,fn,summary) {
  if(!trace)return fn();
  trace.start(stage);
  try{const value=fn();trace.pass(stage,summarySafely(summary));return value;}
  catch(error){trace.fail(stage,error,summarySafely(summary));throw error;}
}
export async function traceCreateAsyncStage(trace,stage,fn,summary) {
  if(!trace)return fn();
  trace.start(stage);
  try{const value=await fn();trace.pass(stage,summarySafely(summary));return value;}
  catch(error){trace.fail(stage,error,summarySafely(summary));throw error;}
}
