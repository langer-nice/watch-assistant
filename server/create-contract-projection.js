import { cleanStage,projectionSummary,contractSummary } from './clean-create-trace.js';
// Temporary, pure compatibility boundary. Existing compiler/validators unchanged.
import { normalizeWatchContract } from './watch-contract.js';
import { validateInterpretation } from '../src/js/watch-interpretation.js';
import { assessCapabilities, compileMonitoringPlan } from '../src/js/watch-capabilities.js';
import { createWatchDefinition, validateWatchDefinition, structuredMonitoringSource } from '../src/js/watch-definition.js';

export function projectWatchContractToLegacyPlan(input,trace) {
  return cleanStage(trace,'projection',()=>{
  const c = cleanStage(trace,'normalizer',()=>normalizeWatchContract(input),contractSummary);
  const result = (status, interpretation, assessment, plan = null, definition = null, source = null) => ({
    status, capability_status: c.capability_status, interpretation, assessment, plan, definition, source,
    // Compatibility here is NOT permission to save, activate or claim API support.
    persistence_authorized: false,
  });
  if (c.input_source.kind === 'url' || c.trigger.kind === 'other' || c.constraints.length
    || c.source_preference.policy !== 'any') return result('UNSUPPORTED',null,{
    status:'unsupported',issues:[{code:'CREATE_FORMAT_UNSUPPORTED',field:'contract'}],plan:null,
  });
  const currency = c.trigger.kind === 'threshold_crossing';
  const event = c.trigger.kind === 'publication';
  const individual = (id,label,type,canonicalCode=null) => ({id,kind:'individual',type,label,canonicalCode,
    membership:[],members:[],quantifier:null});
  // Entity type is descriptive, never adapter selection. Literal name monitoring
  // needs no inferred person/company classification: use the supported topic type.
  const subjects = currency ? c.subject[0].value.split('/').map((code,i)=>individual(`s${i+1}`,code,'currency',code))
    : c.subject.map((s,i)=>individual(`s${i+1}`,s.value,'topic'));
  const n = {id:'c1',op:'predicate',kind:currency?'numeric':event?'event':'news_about',
    subjects:subjects.map(s=>s.id),value:currency?'exchange_rate':event?c.trigger.target:null,
    operator:currency?c.trigger.comparison.comparator:null,amount:currency?c.trigger.comparison.value:null,
    unit:currency?c.trigger.comparison.unit:null};
  const request = c.user_intent_text;
  const span = (path,start,end) => ({path,start,end,text:request.slice(start,end)});
  const evidence = subjects.map((s,i)=>{
    const bound = c.evidence.find(e=>e.field===`subject/${currency?0:i}`);
    const start = bound.start + bound.text.indexOf(s.label);
    return span(`/subjects/${i}/label`,start,start+s.label.length);
  });
  // Full immutable request grounds the condition, without manufactured quotes.
  evidence.push(span('/conditions/0',0,request.length));
  const temporal = c.time_scope.map((_,i)=>{
    const e=c.evidence.find(e=>e.field===`time_scope/${i}`);
    evidence.push(span(`/temporal/${i}`,e.start,e.end));
    return {text:e.text,relation:'unspecified',start:null,end:null,timezone:null};
  });
  const interpretation = validateInterpretation({schemaVersion:'interpretation.v1',originalRequest:request,language:'en',
    domain:currency?'currency':'media_news',intent:currency?'numeric_condition':event?'event':'ongoing_news',
    subjects,conditions:[n],condition:'c1',topics:[],temporal,geographic:[],exclusions:[],recurrence:'unspecified',
    ambiguities:[],unresolvedRequirements:[],evidence});
  const assessment = assessCapabilities(interpretation,{structured:true});
  // Earnings and currency still have valid downstream semantic shapes even
  // when the unchanged compiler cannot make an executable plan.
  if (assessment.status !== 'supported') return result('SEMANTIC_ONLY',interpretation,assessment);
  const plan = compileMonitoringPlan(interpretation,{structured:true});
  const definition = createWatchDefinition(interpretation,plan);
  const source = structuredMonitoringSource(plan.criteria);
  validateWatchDefinition(definition,source);
  return result('COMPATIBLE',interpretation,assessment,plan,definition,source);
  },projectionSummary);
}
