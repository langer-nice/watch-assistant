// Observational sidecar only. No model values, quotes, names or request text
// leave this module. WeakMap scope follows the original extraction object.
const active=new WeakMap();
const enums=new Set(['named_entity','metric_pair','resource_url','ongoing_developments','event_occurrence','threshold_crossing','source_change',
  'publication','occurrence','gt','lt','gte','lte','eq','required','focus','excluded','quarter','date','only',
  'subject','monitoring_goal','comparison','time_scope','source_preference','competing_values','unresolved_reference','missing_value']);
const fields=['subject','monitoring_goal','comparison','constraints','time_scope','source_preference','ambiguity','unrepresented_requirements'];
const types=new Set(['USER_TEXT_EXACT','USER_TEXT_SEMANTIC','PRODUCT_DEFAULT','SERVER_DERIVED']);
const codes=new Set(['INVALID_CREATE_SEMANTIC_FRAME','CREATE_FRAME_CLARIFICATION_REQUIRED','INVALID_WATCH_CONTRACT']);
const reasons=new Set(['source_text','ungrounded_value','schema','invented_constraint','comparison_mismatch','comparison_conflict',
  'unrepresented_requirements','grounded_ambiguity','period','date','source_policy','invented_official','value_support','amount_conflict']);
const rules=new Set(['source_mention_identity.v1','identity_resolver.v1','exact_url_source_change.v1','exact_submitted_resource.v1',
  'exact_decimal.v1','ordered_pair_quote_unit.v1','quarter_period.v1','iso_date.v1','create_defaults.v1']);
const known=v=>enums.has(v)?v:v==null?null:'OTHER';
const kind=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
const present=v=>v!==null&&v!==undefined;
const size=v=>typeof v==='string'?Math.min(v.length,10000):null;
const shield=fn=>(...args)=>{try{return fn(...args);}catch{/* Observability never changes behavior. */}};
function matches(request,value){
  const result={supportPresent:typeof value==='string'&&value.length>0,supportLength:size(value),supportStart:null,supportEnd:null,
    exactMatchCount:0,normalizedMatchCount:null,boundaryCheckPassed:false};
  if(typeof value!=='string'||!value.length||typeof request!=='string')return result;
  for(let i=request.indexOf(value);i>=0;i=request.indexOf(value,i+1)){
    result.exactMatchCount++;
    if(!/[\p{L}\p{N}_]/u.test(request[i-1]||' ')&&!/[\p{L}\p{N}_]/u.test(request[i+value.length]||' ')){
      result.boundaryCheckPassed=true;
      if(result.supportStart===null){result.supportStart=i;result.supportEnd=i+value.length;}
    }
  }
  return result;
}
function makeDiagnostic(request,frame,trace){
  const outcomes=new Map();let normalized;
  const emit=shield(record=>trace.structure(record));
  const key=(field,index)=>`${field}:${index??'-'}`;
  const metadata=(field,value,support,provenance,index=null,category=null)=>({field,itemIndex:index,
    fieldType:kind(value),semanticCategory:known(category),provenance,valuePresent:present(value),
    ...matches(request,support),roleCheckPassed:null,groundingResult:'NOT_REACHED',rejectionCode:null,
    ...(outcomes.get(key(field,index))||{})});
  const diagnostic={
    quote:shield((field,index,provenance,value,accepted,reason=null)=>{
      const safeField=['subject','monitoring_goal','monitoring_goal.event','comparison','comparison.value','constraints','constraints.value',
        'time_scope','time_scope.value','source_preference','source_preference.sources','unrepresented_requirements'].includes(field)?field:'OTHER';
      const record={field:safeField,itemIndex:Number.isInteger(index)&&index>=0&&index<8?index:null,
        provenance:types.has(provenance)?provenance:'OTHER',...matches(request,value),roleCheckPassed:null,
        groundingResult:accepted?'QUOTE_ACCEPTED':'REJECTED',rejectionCode:accepted?null:'INVALID_CREATE_SEMANTIC_FRAME',
        rejectionReason:reasons.has(reason)?reason:null};
      outcomes.set(key(safeField,record.itemIndex),record);
      if(!accepted)emit({event:'quote_rejection',...record});
    }),
    role:shield((field,index,passed)=>{
      const k=key(field,index),previous=outcomes.get(k)||{};
      outcomes.set(k,{...previous,roleCheckPassed:passed,...(!passed?{groundingResult:'REJECTED',rejectionCode:'INVALID_CREATE_SEMANTIC_FRAME',rejectionReason:'invented_constraint'}:{})});
    }),
    normalized:shield(value=>{normalized=value;}),
    finish:shield((value,error)=>{
      const common={event:'frame_field',fieldsPresent:fields.filter(f=>Object.hasOwn(frame||{},f)),
        frameResult:error?'REJECTED':'ACCEPTED',finalCode:error?(codes.has(error.code)?error.code:'OTHER'):null};
      const write=(field,items)=>emit({...common,field,fieldType:kind(frame?.[field]),
        itemCount:Array.isArray(frame?.[field])?Math.min(frame[field].length,10000):null,items});
      const sub=frame?.subject,goal=frame?.monitoring_goal,c=frame?.comparison,s=frame?.source_preference;
      const row=(...args)=>{const r=metadata(...args);if(!error&&r.valuePresent)r.groundingResult='ACCEPTED';return r;};
      write('subject',[{...row('subject',sub?.value,sub?.value,'USER_TEXT_EXACT',null,sub?.kind),
        kind:known(sub?.kind),identityStatus:value?.recognition?.identity?.status&&['EXACT','RESOLVED','UNRESOLVED','AMBIGUOUS'].includes(value.recognition.identity.status)?value.recognition.identity.status:'NOT_REACHED'}]);
      write('monitoring_goal',[{...row('monitoring_goal',goal?.kind,goal?.support,sub?.kind==='resource_url'?'USER_TEXT_EXACT':'USER_TEXT_SEMANTIC',null,goal?.kind),
        enum:known(goal?.kind),eventKind:known(goal?.event?.kind),eventValuePresent:present(goal?.event?.value),
        eventValueMetadata:metadata('monitoring_goal.event',goal?.event?.value,goal?.event?.value,'USER_TEXT_EXACT')}]);
      write('comparison',[{...row('comparison',c?.operator,c?.support,'USER_TEXT_SEMANTIC',null,c?.operator),
        operator:known(c?.operator),valueMetadata:row('comparison.value',c?.value,c?.value,'USER_TEXT_EXACT')}]);
      for(const [field,list]of [['constraints',frame?.constraints],['time_scope',frame?.time_scope]]){
        const items=Array.isArray(list)?list.slice(0,8).map((item,i)=>({...row(field,item?.value,item?.support,'USER_TEXT_SEMANTIC',i,item?.role??item?.kind),
          valueMetadata:row(`${field}.value`,item?.value,item?.value,'USER_TEXT_EXACT',i)})):[];
        write(field,items);
      }
      write('source_preference',[{...row('source_preference',s?.policy,s?.support,'USER_TEXT_SEMANTIC',null,s?.policy),official:s?.official===true,
        sources:Array.isArray(s?.sources)?s.sources.slice(0,4).map((v,i)=>row('source_preference.sources',v,v,'USER_TEXT_EXACT',i)):[]}]);
      write('ambiguity',Array.isArray(frame?.ambiguity)?frame.ambiguity.slice(0,4).map((a,i)=>({...row('ambiguity',a?.reason,a?.support,'USER_TEXT_SEMANTIC',i,a?.reason),
        semanticField:known(a?.field),alternativeCount:Array.isArray(a?.alternatives)?Math.min(a.alternatives.length,4):null})):[]);
      write('unrepresented_requirements',Array.isArray(frame?.unrepresented_requirements)?frame.unrepresented_requirements.slice(0,8).map((v,i)=>row('unrepresented_requirements',v,v,'USER_TEXT_EXACT',i)):[]);
      if(normalized)for(const p of normalized.provenance||[]){
        if(!['PRODUCT_DEFAULT','SERVER_DERIVED'].includes(p.type))continue;
        const allowed=['subject_identity','monitoring_goal.kind','defaults.source_policy','comparison.normalized_value','comparison.unit','time_scope.normalized_value',
          'defaults.monitor_over_time','defaults.surface_meaningful_changes','defaults.relevance'];
        emit({event:'derived_or_default',field:allowed.includes(p.field)?p.field:'OTHER',provenance:p.type,
          derivationRule:rules.has(p.rule)?p.rule:'OTHER',valuePresent:true,spanRequired:false,supportStart:null,supportEnd:null,
          exactMatchCount:null,normalizedMatchCount:null,groundingResult:'ACCEPTED'});
      }
    }),
  };
  return diagnostic;
}
export const semanticFrameDiagnostic=frame=>frame&&typeof frame==='object'?active.get(frame):undefined;
export function withSemanticFrameStructure(request,frame,trace,fn){
  if(!trace?.structure||!frame||typeof frame!=='object')return fn();
  let diagnostic;
  try{diagnostic=makeDiagnostic(request,frame,trace);active.set(frame,diagnostic);}catch{return fn();}
  try{const result=fn();diagnostic.finish(result,null);return result;}
  catch(error){diagnostic.finish(null,error);throw error;}
  finally{active.delete(frame);}
}
