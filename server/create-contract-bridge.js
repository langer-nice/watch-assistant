// Local new-Create bridge only: consume extraction before legacy reconstruction.
import { interpretationOutputSchema, matchesStructuredSchema } from '../src/js/watch-interpretation.js';
import { normalizeWatchContract } from './watch-contract.js';
import { resolveWatchContractCapability } from './create-contract-capability.js';
import { traceCreateStage, summarizeCreateExtraction } from './create-core-trace.js';

const invalid = () => { throw Object.assign(new Error('Invalid Create extraction'),{code:'INVALID_CREATE_CONTRACT',statusCode:422}); };
export const isExactCreateUrl = request => {
  if (typeof request !== 'string' || /\s/u.test(request)) return false;
  try { const u=new URL(request);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password; }
  catch { return false; }
};

/** Raw current extractor output -> candidate -> authoritative Slice 1 normalizer.
 * Domain/intent and model event-family hints never select the downstream plan.
 * This adapter intentionally admits only the bounded Slice 1 semantic vocabulary.
 */
export function createWatchContractFromInterpretation(output, request, createCoreTrace) {
  let check='request';
  const predicateDiagnostics=[];
  let finalRejectionPredicate=null;
  let triggerPathContent;
  // Bridge-local, text-free snapshots. Never alter the predicate's result.
  const diagnose=(predicate,result,binding,detail={})=>{
    if(!createCoreTrace)return result;
    const condition=output?.conditions?.[0];
    predicateDiagnostics.push({binding,predicate,predicateResult:result,
      conditionPresent:!!condition,conditionValuePresent:!!condition&&Object.hasOwn(condition,'value'),
      conditionValueIsNull:condition?.value===null,
      candidateEvidenceCount:Math.min(10000,output?.evidence?.length||0),sourceKind:'request',...detail});
    if(!result)finalRejectionPredicate=predicate;
    return result;
  };
  return traceCreateStage(createCoreTrace,'contract_bridge',()=>{
  try {
    if (typeof request !== 'string' || !request || request.length>500) invalid();
    if (isExactCreateUrl(request)) {
      if (output !== null) invalid(); // No model topic is needed for source-bound URL meaning.
      const evidence=['subject/0','trigger'].map(field=>({field,source_id:'request',start:0,end:request.length,text:request}));
      return normalizeWatchContract({user_intent_text:request,subject:[{kind:'resource',value:request}],
        trigger:{kind:'resource_change',target:request,comparison:null},constraints:[],time_scope:[],
        source_preference:{policy:'only',urls:[request],official:false},evidence},{request},createCoreTrace);
    }
    // Keep extraction shape safety, not its model-sensitive technical semantics.
    check='output_schema';
    if (!matchesStructuredSchema(output,interpretationOutputSchema)) invalid();
    check='ambiguity';
    if (output.ambiguities.length) throw Object.assign(new Error('Clarification required'),{code:'CREATE_CLARIFICATION_REQUIRED',statusCode:422});
    check='bounded_shape';
    if (output.subjects.some(s=>s.kind!=='individual') || output.geographic.length || output.exclusions.length
      || output.unresolvedRequirements.length || output.recurrence!=='unspecified'
      || output.conditions.length!==1 || output.conditions[0].op!=='predicate') invalid();
    check='references';
    const node=output.conditions[0],subjects=output.subjects;
    if (!diagnose('condition_subject_references_valid',!(new Set(subjects.map(s=>s.id)).size!==subjects.length || subjects.some(s=>s.id===node.id)
      || output.condition!==node.id || new Set(node.subjects).size!==node.subjects.length
      || node.subjects.length!==subjects.length || node.subjects.some(id=>!subjects.some(s=>s.id===id))),'condition',{
        evidenceReferencePresent:!!output.condition&&node.subjects.length>0,
        evidenceReferenceResolved:output.condition===node.id&&node.subjects.every(id=>subjects.some(s=>s.id===id))})) invalid();
    check='evidence_source';
    const paths=new Set([...subjects.map((_,i)=>`/subjects/${i}/label`),'/conditions/0',
      ...output.topics.map((_,i)=>`/topics/${i}`),...output.temporal.map((_,i)=>`/temporal/${i}`)]);
    const spans=output.evidence.map(e=>{
      if(!diagnose('evidence_path_allowed',paths.has(e.path),'evidence',{evidenceReferencePresent:!!e.path,evidenceReferenceResolved:paths.has(e.path)}))invalid();
      const context=e.context??e.quote;
      const at=request.indexOf(context),relative=context.indexOf(e.quote);
      if(!diagnose('evidence_context_and_quote_source_match',at>=0&&relative>=0,'evidence',{exactMatchFound:at>=0&&relative>=0,contextInRequest:at>=0,quoteInContext:relative>=0}))invalid();
      const start=at+relative;
      return {path:e.path,start,end:start+e.quote.length,text:e.quote};
    });
    const evidence=[];
    const bind=(field,path,value,exact=false)=>{
      check='evidence_binding';
      const span=spans.find(e=>e.path===path&&(exact?e.text===value:e.text.includes(value)));
      if(createCoreTrace&&!span&&field==='trigger'&&path==='/conditions/0'
        &&request==='Tell me when there are important new developments about Manchester City.'){
        // Flat summary fields survive Node's hosted console inspection depth.
        const atPath=spans.filter(e=>e.path===path);
        const contentMatches=spans.filter(e=>e.text.includes(value));
        const both=atPath.filter(e=>e.text.includes(value));
        triggerPathContent={binding:'trigger',expectedEvidencePath:path,candidateEvidenceCount:spans.length,
          availableEvidencePaths:[...new Set(spans.map(e=>e.path))],
          expectedPathPresent:atPath.length>0,expectedPathMatchCount:atPath.length,
          contentMatchAnyPath:contentMatches.length>0,contentMatchCountAnyPath:contentMatches.length,
          expectedPathContentMatch:both.length>0,expectedPathContentMatchCount:both.length,
          samePathDifferentContentCount:atPath.length-both.length,
          sameContentDifferentPathCount:contentMatches.length-both.length,sourceKind:'request',
          quotePresentCount:output.evidence.filter(e=>typeof e.quote==='string'&&e.quote.length>0).length,
          contextPresentCount:output.evidence.filter(e=>typeof e.context==='string'&&e.context.length>0).length,
          spanPresentCount:spans.filter(e=>Number.isInteger(e.start)&&Number.isInteger(e.end)).length,
          finalPredicate:'binding_source_span_match'};
      }
      if(!diagnose('binding_source_span_match',!!span,
        field.startsWith('subject/')?'subject':field.startsWith('constraints/')?'constraint':field.startsWith('time_scope/')?'time_scope':field,createCoreTrace?{
          evidenceReferencePresent:spans.some(e=>e.path===path),evidenceReferenceResolved:spans.some(e=>e.path===path),
          exactMatchFound:!!span,matchMode:exact?'equal':'contains',
          matchingEvidenceCount:Math.min(10000,spans.filter(e=>e.path===path&&(exact?e.text===value:e.text.includes(value))).length),
        }:{}))invalid();
      const start=span.start+span.text.indexOf(value);
      evidence.push({field,source_id:'request',start,end:start+value.length,text:value});
    };
    const c={user_intent_text:request,subject:[],trigger:null,constraints:[],time_scope:[],evidence};
    check='subject_trigger';
    const rate=/^Tell me when (GBP\/EUR|EUR\/GBP) goes (above|at least|below) (\d{1,12}(?:[.,]\d{1,12})?)\.$/u.exec(request);
    if(rate){
      const ordered=node.subjects.map(id=>subjects.find(s=>s.id===id));
      if(node.kind!=='numeric'||ordered.length!==2||ordered.map(s=>s.label).join('/')!==rate[1]
        || node.value!=='exchange_rate')invalid();
      // Each individual currency must be grounded in the original extraction.
      ordered.forEach(s=>bind('subject/0',`/subjects/${subjects.indexOf(s)}/label`,s.label,true));
      evidence.splice(0,evidence.length); // Combined ordered instrument evidence is source-derived.
      const start=request.indexOf(rate[1]);
      evidence.push({field:'subject/0',source_id:'request',start,end:start+rate[1].length,text:rate[1]});
      c.subject=[{kind:'instrument',value:rate[1]}];
      c.trigger={kind:'threshold_crossing',target:'exchange_rate',comparison:{comparator:node.operator,value:node.amount,unit:node.unit}};
      bind('trigger','/conditions/0',`goes ${rate[2]} ${rate[3]}`);
      bind('trigger/comparison','/conditions/0',rate[3]);
    }else{
      if(subjects.length!==1||node.operator!==null||node.amount!==null||node.unit!==null)invalid();
      c.subject=[{kind:'entity',value:subjects[0].label}];bind('subject/0','/subjects/0/label',subjects[0].label,true);
      const event=/\b(publishes|releases|announces) its (Q[1-4] \d{4}) earnings (results|report)\.$/u.exec(request);
      if(event){
        if(!['event','news_about'].includes(node.kind)||![null,'earnings_results_publication','earnings_release','earnings_report','official_company_announcement'].includes(node.value))invalid();
        c.trigger={kind:'publication',target:'earnings results',comparison:null};
        bind('trigger','/conditions/0',event[0].slice(0,-1));
      }else{
        const phrase=/\b(important new developments|new developments|news|updates) about /u.exec(request)?.[1];
        if(!diagnose('news_condition_kind_null_value_and_phrase',node.kind==='news_about'&&node.value===null&&!!phrase,'condition',{
          kindIsNewsAbout:node.kind==='news_about',phrasePresent:!!phrase,
          exactMatchFound:!!phrase&&spans.some(e=>e.path==='/conditions/0'&&e.text.includes(phrase)),
          evidenceReferencePresent:spans.some(e=>e.path==='/conditions/0'),
          evidenceReferenceResolved:spans.some(e=>e.path==='/conditions/0'),
          matchingEvidenceCount:Math.min(10000,spans.filter(e=>e.path==='/conditions/0'&&!!phrase&&e.text.includes(phrase)).length),
        }))invalid();
        c.trigger={kind:'development',target:phrase,comparison:null};bind('trigger','/conditions/0',phrase);
      }
    }
    check='constraints';
    output.topics.forEach((t,i)=>{
      c.constraints.push({kind:'topic',value:t.label,role:t.role==='coverage_focus'?'focus':t.role});
      bind(`constraints/${i}`,`/topics/${i}`,t.label);
    });
    check='temporal';
    output.temporal.forEach((t,i)=>{
      if(t.start!==null||t.end!==null||t.timezone!==null||t.relation!=='unspecified')invalid();
      c.time_scope.push({kind:'period',value:t.text,basis:'unspecified'});bind(`time_scope/${i}`,`/temporal/${i}`,t.text);
    });
    check='normalization';
    return normalizeWatchContract(c,{request},createCoreTrace);
  }catch(e){
    if(e.code==='CREATE_CLARIFICATION_REQUIRED'||e.code==='INVALID_CREATE_CONTRACT')throw e;
    invalid();
  }
  },()=>({check,...summarizeCreateExtraction(output),predicateDiagnostics:predicateDiagnostics.slice(0,64),finalRejectionPredicate,...triggerPathContent}));
}

export function reviewCreateExtraction(output, request, createCoreTrace) {
  const contract=createWatchContractFromInterpretation(output,request,createCoreTrace);
  const resolved=resolveWatchContractCapability(contract,createCoreTrace),{projection}=resolved;
  return traceCreateStage(createCoreTrace,'review_response',()=>({mode:'create-core.v1',executable:false,status:'interpreted',contract,
    capabilityStatus:projection.capability_status.toLowerCase(),interpretation:projection.interpretation,
    projectionStatus:projection.status,assessment:projection.assessment,
    capability:{status:resolved.status,adapter:resolved.adapter,unmetRequirements:resolved.unmetRequirements,saveEligible:resolved.saveEligible}}));
}
