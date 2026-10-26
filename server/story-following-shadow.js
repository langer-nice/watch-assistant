import {createHash} from 'node:crypto';
import {evaluateStoryShadow,storyShadowContext,STORY_SHADOW_VERSION} from './story-following-shadow-matcher.js';
import {structuredStagingUrlMatches} from './structured-creation-access.js';

export {STORY_SHADOW_VERSION};
export const storyShadowEnabled = env => env?.VERCEL_ENV==='preview'
 && env.VERCEL_PROJECT_ID==='prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF'
 && env.VERCEL_GIT_COMMIT_REF==='codex/story-following-shadow-staging'
 && structuredStagingUrlMatches(env) && env.STORY_FOLLOWING_SHADOW_ENABLED==='true';
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const writeDiagnostic = row => console.info(JSON.stringify(row));

// Side-effect boundary: called only AFTER current persistence succeeds. No client,
// RPC, notification processor or email dependency is passed into this observer.
// Its return value is deliberately ignored by all production callers.
export const observeStoryShadow = ({env=process.env,ownerId,watch,items,matchingItems,
 evaluator=evaluateStoryShadow,record=writeDiagnostic,clock=()=>new Date().toISOString(),now=()=>performance.now()}={}) => {
 try {
  if(!storyShadowEnabled(env)||!uuid(ownerId)||!uuid(watch?.id))return;
  const owners=String(env.STRUCTURED_WATCH_TEST_USER_IDS||'').split(',').map(s=>s.trim());
  if(!owners.includes(ownerId))return;
  if(!Array.isArray(items)||items.length>20||!Array.isArray(matchingItems))return;
  const context=storyShadowContext(watch);const matched=new Set(matchingItems.map(item=>item.id));
  const start=now();
  for(const item of items){
   const candidate=typeof item?.id==='string'?item.id:typeof item?.url==='string'?item.url:null;
   if(!candidate||candidate.length>4096)continue;
   const base={event:'story-following-shadow',shadow_version:STORY_SHADOW_VERSION,
    watch_id:watch.id,owner_key:hash(ownerId),candidate_key:hash(candidate),
    current_result:matched.has(item.id)?'MATCH':'NO_MATCH',created_at:clock()};
   try{
    if(now()-start>8){record({...base,shadow_result:null,category:context?.category||'unknown',reason_codes:['SHADOW_BUDGET_EXCEEDED'],shadow_error:true});break;}
    // Copy only bounded input fields. Never expose the mutable Watch or candidates
    // to evaluator/recorder, and never write raw content, URLs or provider metadata.
    const input=Object.freeze({source:typeof item.source==='string'?item.source.slice(0,300):undefined,title:typeof item.title==='string'?item.title:'',excerpt:typeof item.excerpt==='string'?item.excerpt:'',
     url:typeof item.url==='string'?item.url:'',excerptProvenance:item.excerptProvenance?Object.freeze({...item.excerptProvenance}):undefined});
    const decision=evaluator({item:input,context:context?structuredClone(context):null});
    if(!['MATCH','NO_MATCH','INSUFFICIENT_EVIDENCE'].includes(decision?.result))throw Error('Invalid shadow result');
    record({...base,shadow_result:decision.result,category:decision.category,
      reason_codes:decision.reasonCodes,evidence_summary:decision.evidence,shadow_error:false});
   }catch{try{record({...base,shadow_result:null,category:context?.category||'unknown',reason_codes:['SHADOW_EVALUATION_FAILED'],shadow_error:true});}catch{/* diagnostics cannot affect monitoring */}}
  }
 }catch{/* fail-closed observation only; current result remains authoritative */}
};
