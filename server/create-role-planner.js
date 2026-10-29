import { cleanStage,cleanAsyncStage,contractSummary } from './clean-create-trace.js';
import { createRoleSource,createRoleContractSchema,createRoleExtractionInstructions,normalizeCreateRoleContract,
  createExactUrlRoleContract,isExactRoleUrl,validateCreateRoleStructure,resolveRoleSelection } from './create-role-contract.js';
import { createFidelitySchema,createFidelityInstructions,createFidelityInput,validateCreateFidelity } from './create-fidelity-verifier.js';
import { handoffCreateRoleContract } from './create-role-compatibility.js';
import { resolveWatchContractCapability } from './create-contract-capability.js';
import { createRoleProvider,createRoleModelBudget } from './create-role-provider.js';
import { createABPreviewEnabled,CREATE_AB_MODE } from './create-role-access.js';

const error=(code,statusCode,reason)=>Object.assign(Error(code),{code,statusCode,...(reason?{reason}:{})});
// No default network transport. This server-only local seam cannot be enabled
// by request JSON, query parameters, API keys or a client PASS flag.
async function completeOnce(transport,stage,instructions,input,schema,timeoutMs,budget,trace){
  if(typeof transport?.complete!=='function')throw error('AI_SERVICE_UNAVAILABLE',503);
  const controller=new AbortController();let timer;
  try{
    return structuredClone(await Promise.race([
      Promise.resolve().then(()=>{
        budget.take(stage);trace?.modelCalls?.(budget.snapshot());
        return transport.complete({stage,instructions,input:structuredClone(input),
          format:{type:'json_schema',name:stage==='extraction'?'create_role_v1':'create_fidelity_v1',strict:true,schema:structuredClone(schema)},signal:controller.signal});
      }),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(error('AI_TIMEOUT',504));},timeoutMs);}),
    ]));
  }catch(cause){
    if(cause?.code==='AI_TIMEOUT')throw cause;
    throw error('AI_SERVICE_UNAVAILABLE',503);
  }finally{clearTimeout(timer);}
}
export async function planRoleAwareCreate(request,options={}){
  const {env,roleAwareLocalTransport,cleanTrace,verifiedIdentityLookup,timeoutMs=15000}=options;
  if(!['test','development'].includes(env?.VERCEL_ENV)&&!createABPreviewEnabled(env))throw error('STRUCTURED_FEATURE_UNAVAILABLE',404);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw error('INVALID_INTERPRETATION_REQUEST',400);
  const source=createRoleSource(request),url=isExactRoleUrl(request);
  const budget=createRoleModelBudget();cleanTrace?.modelCalls?.(budget.snapshot());
  const candidate=await cleanAsyncStage(cleanTrace,'semantic_extraction',()=>url?createExactUrlRoleContract(request)
    :completeOnce(roleAwareLocalTransport,'extraction',createRoleExtractionInstructions,
      {request,source_tokens:source.tokens.map(({index,text})=>({index,text}))},createRoleContractSchema,timeoutMs,budget,cleanTrace),
    c=>({subject_count:Array.isArray(c?.subjects)?Math.min(c.subjects.length,8):null,event_present:c?.event!=null,
      subjects:Array.isArray(c?.subjects)?c.subjects.slice(0,8).map(s=>{
        try{const span=resolveRoleSelection(source,s.selection);return span.text===s.value?span.text:null;}catch{return null;}
      }):[]}));
  cleanStage(cleanTrace,'semantic_validation',()=>validateCreateRoleStructure(candidate),c=>({subject_count:c.subjects.length}));
  const grounded=cleanStage(cleanTrace,'grounding',()=>normalizeCreateRoleContract(request,candidate),
    c=>({subject_count:c.semantic.subjects.length,represented_literals:c.coverage.represented_literals,
      derived_goal:c.semantic.monitoring_goal,event_present:!!c.semantic.event,event_source_valid:!!c.semantic.event}));
  const fidelity=await cleanAsyncStage(cleanTrace,'fidelity_verification',async()=>{
    const result=url?{verdict:'PASS',reasons:[]}:validateCreateFidelity(await completeOnce(roleAwareLocalTransport,'verification',
      createFidelityInstructions,createFidelityInput(grounded),createFidelitySchema,timeoutMs,budget,cleanTrace));
    if(result.verdict!=='PASS')throw Object.assign(error('CREATE_CLARIFICATION_REQUIRED',422,'fidelity_rejected'),{fidelity:result});
    return result;
  },r=>({verdict:r.verdict,reasons:r.reasons,event_admitted:!!grounded.semantic.event,method:url?'exact_url':'independent_verifier'}));
  // A faithfully represented ambiguity/residual still cannot become an
  // executable Watch merely because the verifier judged the representation.
  if(grounded.semantic.ambiguity.length||grounded.semantic.unrepresented_requirements.length)throw error('CREATE_CLARIFICATION_REQUIRED',422,'unrepresented_meaning');
  const contract=cleanStage(cleanTrace,'normalizer',()=>handoffCreateRoleContract(grounded,{verifiedIdentityLookup,cleanTrace}),c=>c?contractSummary(c):{mapping:'SEMANTIC_ONLY'});
  if(!contract)return cleanStage(cleanTrace,'review',()=>({mode:'create-core.v1',executable:false,status:'interpreted',
    semanticContract:grounded,contract:null,fidelity,capabilityStatus:'unsupported',interpretation:null,projectionStatus:'UNSUPPORTED',
    capability:{status:'UNSUPPORTED',adapter:null,unmetRequirements:[{code:'CREATE_FORMAT_UNSUPPORTED',field:'semantic_contract'}],saveEligible:false}}),
    ()=>({review_constructed:true,response_category:'interpreted',http_status:200}));
  const resolved=resolveWatchContractCapability(contract,cleanTrace,{verifiedIdentityLookup}),{projection}=resolved;
  return cleanStage(cleanTrace,'review',()=>({mode:'create-core.v1',executable:false,status:'interpreted',semanticContract:grounded,contract,fidelity,
    capabilityStatus:projection.capability_status.toLowerCase(),interpretation:projection.interpretation,projectionStatus:projection.status,assessment:projection.assessment,
    capability:{status:resolved.status,adapter:resolved.adapter,unmetRequirements:resolved.unmetRequirements,saveEligible:resolved.saveEligible}}),
    ()=>({review_constructed:true,response_category:'interpreted',http_status:200}));
}
export async function planHostedRoleAwareCreate(request,options={}){
  const result=await planRoleAwareCreate(request,{...options,roleAwareLocalTransport:createRoleProvider(options)});
  return {...result,mode:CREATE_AB_MODE};
}
