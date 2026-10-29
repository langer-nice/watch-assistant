import { requestStructuredOutput } from './request-clarification-api.js';

const limit=()=>Object.assign(Error('AI call budget exceeded'),{code:'AI_SERVICE_UNAVAILABLE',statusCode:503,reason:'model_call_limit'});
export function createRoleModelBudget(){
  const counts={extraction:0,verification:0,total:0};
  return {take(stage){
    if(!['extraction','verification'].includes(stage)||counts[stage]>=1||counts.total>=2)throw limit();
    counts[stage]++;counts.total++;
  },snapshot:()=>({...counts})};
}
// Shared Responses transport, unchanged model/configuration and approved
// prompts/schemas. One HTTP request per invocation, no fallback or retry.
export function createRoleProvider({apiKey,model,fetchImpl=fetch,cleanTrace}={}){
  const budget=createRoleModelBudget();
  return {complete({stage,instructions,input,format,signal}){
    budget.take(stage);
    return requestStructuredOutput({apiKey,model,signal,instructions,input:JSON.stringify(input),reasoning:{effort:'low'},
      max_output_tokens:stage==='extraction'?1600:256,maxOutputBytes:16000,
      text:{verbosity:'low',format},fetchImpl:async(url,init)=>{
        const response=await fetchImpl(url,{...init,redirect:'error'});
        cleanTrace?.providerStatus?.(stage,response.status);return response;
      }});
  }};
}
