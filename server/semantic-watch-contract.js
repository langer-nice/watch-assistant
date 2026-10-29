import { normalizeCreateSemanticFrame } from './create-semantic-frame.js';
import { resolveCreateSubjectIdentity } from './create-subject-identity.js';
import { cleanStage,contractSummary } from './clean-create-trace.js';
import { normalizeDecimal } from '../src/js/currency-watch.js';

const fail=reason=>{throw Object.assign(Error('Invalid semantic Watch Contract'),{code:'INVALID_WATCH_CONTRACT',reason});};
export const isSemanticWatchContract=c=>c!==null&&typeof c==='object'&&Object.hasOwn(c,'recognition');
const equal=(a,b)=>{
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
};
/** New Create authority only. A serialized contract is NOT already trusted:
 * reconstruct every field from the strict source frame and server identity
 * dependency, then compare. No public alreadyValidated bypass or old grammar. */
export function normalizeSemanticWatchContract(input,{request,verifiedIdentityLookup,cleanTrace}={}){
  const isContract=isSemanticWatchContract(input);
  const source=isContract?{version:input.recognition?.version,request:input.recognition?.request,frame:input.recognition?.frame}:input;
  if(!source||Object.keys(source).sort().join(',')!=='frame,request,version'||source.version!=='create-frame.v1')fail('recognition_shape');
  if(request!==undefined&&request!==source.request)fail('request_mismatch');
  let identity=null;
  // Shape/source validation precedes identity lookup. Grounding is repeated
  // deterministically after resolution to attach server-owned identity evidence.
  const grounded=cleanStage(cleanTrace,'grounding',()=>normalizeCreateSemanticFrame(source.request,source.frame));
  if(grounded.frame.subject.kind==='named_entity'){
    identity=cleanStage(cleanTrace,'identity_resolution',()=>{
      const result=resolveCreateSubjectIdentity(grounded.frame.subject.value,{verifiedLookup:verifiedIdentityLookup});
      if(result.status==='AMBIGUOUS')throw Object.assign(Error('Ambiguous identity'),{code:'CREATE_FRAME_CLARIFICATION_REQUIRED',reason:'identity_ambiguous'});
      return result;
    },x=>({status:x.status}));
    if(identity.status==='RESOLVED')grounded.provenance.push({field:'subject.canonical_identity',type:'SERVER_DERIVED',
      rule:'verified_identity_reference.v1',referenceVersion:identity.referenceVersion});
  }else cleanStage(cleanTrace,'identity_resolution',()=>({status:'EXACT'}),x=>({status:x.status}));
  const g=grounded.frame,kind=g.monitoring_goal.kind;
  if(g.constraints.some(c=>g.constraints.some(other=>c.role==='excluded'&&other.role!=='excluded'
    &&c.value.normalize('NFKC').toLowerCase()===other.value.normalize('NFKC').toLowerCase())))fail('constraint_conflict');
  const evidence=[],anchor=(field,span)=>evidence.push({field,source_id:'request',start:span.start,end:span.end,text:span.text,rule:null});
  const bound=field=>grounded.provenance.find(p=>p.field===field&&p.span)?.span;
  anchor('subject/0',bound('subject'));anchor('trigger',bound('monitoring_goal'));
  const subjectKind={named_entity:'entity',metric_pair:'instrument',resource_url:'resource'}[g.subject.kind];
  const subject=[{kind:subjectKind,value:g.subject.value,identity:g.subject.kind==='resource_url'?g.subject.value:identity?.key||grounded.identity.key}];
  let trigger;
  if(kind==='ongoing_developments')trigger={kind:'development',target:'important_new_developments',comparison:null};
  else if(kind==='event_occurrence'){
    const earnings=g.monitoring_goal.event.kind==='publication'&&/^earnings (?:results|report)$/u.test(g.monitoring_goal.event.value);
    trigger={kind:earnings?'publication':'other',target:earnings?'earnings_results_publication':g.monitoring_goal.event.value,comparison:null};
  }
  else if(kind==='threshold_crossing'){
    try{if(normalizeDecimal(g.comparison.value)!==g.comparison.value)fail('amount_conflict');}catch{fail('amount_conflict');}
    trigger={kind:'threshold_crossing',target:'exchange_rate',comparison:{comparator:g.comparison.operator,value:g.comparison.value,unit:g.comparison.unit}};
    anchor('trigger/comparison',bound('comparison.value'));
  }else trigger={kind:'resource_change',target:g.subject.value,comparison:null};
  const constraints=g.constraints.map((c,i)=>{
    anchor(`constraints/${i}`,grounded.provenance.find(p=>p.field==='constraints.value'&&p.span.text===c.value).span);
    return {kind:c.role==='excluded'?'exclude':'topic',value:c.value,role:c.role};
  });
  const time_scope=g.time_scope.map((t,i)=>{
    anchor(`time_scope/${i}`,grounded.provenance.filter(p=>p.field==='time_scope.value')[i].span);
    return {kind:t.kind==='quarter'?'period':'date',value:t.value,basis:'unspecified'};
  });
  const resource=g.subject.kind==='resource_url';
  const source_preference=resource?{policy:'only',urls:[g.subject.value],official:false}
    :g.source_preference?{policy:'only',urls:g.source_preference.sources,official:g.source_preference.official}:{policy:'any',urls:[],official:false};
  if(resource){anchor('source_preference',bound('subject'));anchor('input_source',bound('subject'));}
  else if(g.source_preference)anchor('source_preference',bound('source_preference'));
  const contract={version:'watch-contract.v1',user_intent_text:source.request,subject,trigger,constraints,time_scope,source_preference,
    input_source:{kind:resource?'url':'text',submitted_url:resource?g.subject.value:null,metadata_ref:null},
    evidence:evidence.sort((a,b)=>a.field.localeCompare(b.field,'en')),
    capability_status:kind==='ongoing_developments'?'SUPPORTED':kind==='event_occurrence'?'UNSUPPORTED':'UNKNOWN',
    recognition:{version:'create-frame.v1',request:source.request,frame:structuredClone(source.frame),
      identity:identity||{status:'EXACT',key:subject[0].identity,label:g.subject.value,referenceVersion:null},
      defaults:grounded.defaults,provenance:grounded.provenance}};
  return cleanStage(cleanTrace,'watch_contract',()=>{
    if(isContract&&!equal(input,contract))fail('semantic_contract_mismatch');
    return contract;
  },contractSummary);
}
