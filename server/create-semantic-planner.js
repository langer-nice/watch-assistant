import { cleanStage,cleanAsyncStage,extractionSummary,contractSummary } from './clean-create-trace.js';
import { requestStructuredOutput } from './request-clarification-api.js';
import { createSemanticFrameSchema,createSemanticFrameInstructions,createExactUrlSemanticFrame,validateCreateSemanticFrame } from './create-semantic-frame.js';
import { isExactSemanticUrl } from './create-semantic-extraction.js';
import { normalizeSemanticWatchContract } from './semantic-watch-contract.js';
import { resolveWatchContractCapability } from './create-contract-capability.js';
import { withSemanticFrameStructure } from './semantic-frame-structure.js';

const error=(code,statusCode)=>Object.assign(new Error(code),{code,statusCode});
export async function extractCreateSemanticFrame(request,{
  apiKey,model,fetchImpl=fetch,language='und',timeoutMs=15000,cleanTrace,
}={}) {
  if(typeof request!=='string'||!request.trim()||request.length>500||!['en','fr','mixed','und'].includes(language)){
    throw error('INVALID_INTERPRETATION_REQUEST',400);
  }
  let extraction;
  await cleanAsyncStage(cleanTrace,'semantic_extraction',async()=>{
  if(isExactSemanticUrl(request))extraction=createExactUrlSemanticFrame(request);
  else{
    if(!apiKey)throw error('AI_SERVICE_UNAVAILABLE',503);
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw error('INVALID_INTERPRETATION_REQUEST',400);
    const controller=new AbortController();let timer;
    try{
      extraction=await Promise.race([
        requestStructuredOutput({apiKey,model,fetchImpl,signal:controller.signal,instructions:createSemanticFrameInstructions,
          input:JSON.stringify({request,languageHint:language}),reasoning:{effort:'low'},
          max_output_tokens:1600,maxOutputBytes:16000,
          text:{verbosity:'low',format:{type:'json_schema',name:'create_semantic_frame_v1',strict:true,schema:createSemanticFrameSchema}},
        }),
        new Promise((_,reject)=>{timer=setTimeout(()=>{reject(error('AI_TIMEOUT',504));controller.abort();},timeoutMs);}),
      ]);
    }catch(cause){
      if(cause.code==='AI_TIMEOUT')throw cause;
      throw error(cause instanceof SyntaxError?'INTERPRETATION_FAILED':'AI_SERVICE_UNAVAILABLE',cause instanceof SyntaxError?502:503);
    }finally{clearTimeout(timer);}
  }
  return extraction;
  },extractionSummary);
  return extraction;
}

export async function planCreateSemantics(request,options={}) {
  const {cleanTrace,verifiedIdentityLookup}=options;
  const extraction=await extractCreateSemanticFrame(request,options);
  let contract;
  try{
    contract=withSemanticFrameStructure(request,extraction,cleanTrace,()=>{
      cleanStage(cleanTrace,'semantic_validation',()=>validateCreateSemanticFrame(extraction),extractionSummary);
      return cleanStage(cleanTrace,'normalizer',()=>normalizeSemanticWatchContract({version:'create-frame.v1',request,frame:extraction},
        {verifiedIdentityLookup,cleanTrace}),contractSummary);
    });
  }catch(cause){
    throw error(['CREATE_FRAME_CLARIFICATION_REQUIRED','CREATE_SEMANTIC_AMBIGUITY'].includes(cause.code)?'CREATE_CLARIFICATION_REQUIRED':'INVALID_CREATE_CONTRACT',422);
  }
  const context={verifiedIdentityLookup};
  const resolved=resolveWatchContractCapability(contract,cleanTrace,context),{projection}=resolved;
  return cleanStage(cleanTrace,'review',()=>({mode:'create-core.v1',executable:false,status:'interpreted',contract,
    capabilityStatus:projection.capability_status.toLowerCase(),interpretation:projection.interpretation,
    projectionStatus:projection.status,assessment:projection.assessment,
    capability:{status:resolved.status,adapter:resolved.adapter,unmetRequirements:resolved.unmetRequirements,saveEligible:resolved.saveEligible}}),
    v=>({review_constructed:true,response_category:v.status,http_status:200}));
}
