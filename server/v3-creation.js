import {randomUUID} from 'node:crypto';
import {understandCapture} from './v3-intent/understand.mjs';
import {createResponsesModel} from './v3-intent/provider.mjs';
import {authenticateSupabaseRequest} from './supabase-user.js';
import {createSupabaseServiceClient} from './supabase-service.js';
import {requireStructuredCreationAccess,structuredCreationEnabled} from './structured-creation-access.js';
import {structuredProductionEnabled} from './structured-production-access.js';
import {evaluateV3Source,pilotSource} from './v3-pilot.js';
import {parseCurrencyRequest,isCurrencyRequest} from '../src/js/currency-watch.js';
import {fetchAndNormalizeFeed} from './check-watch-api.js';
import {resolveV3UrlCapture,articleStoryTitleRequest} from './v3-article-seed.js';
import {watchTitleRequest,validateWatchTitle} from './v3-watch-title.js';
import {resolveV3OutputLocale} from './v3-output-locale.js';

export const V3_ENGINE='wa-v3-evidence-refs.v1';
export const v3CreationEnabled=env=>env.V3_PILOT_ENABLED==='true'&&structuredCreationEnabled(env)&&structuredProductionEnabled(env)&&env.STRUCTURED_MEDIA_SCHEDULED_ENABLED==='true';
export const V3_LIMITATION='Monitoring currently supports public RSS/Atom news and ECB GBP/EUR thresholds only. Booking availability, inventory, private pages and arbitrary page changes require an unavailable connector.';
const unsupported=reason=>({status:'UNSUPPORTED_FOR_NOW',reason});
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const verifyCreatedWatch=async(client,owner,id)=>{
 const read=await client.from('watches').select('id,user_id,deleted_at').eq('user_id',owner).eq('id',id).maybeSingle();
 if(read.error)throw Error('V3 creation confirmation unavailable');
 if(!read.data||read.data.id!==id||read.data.user_id!==owner)return 'V3_CREATION_NOT_CONFIRMED';
 return read.data.deleted_at?'V3_CREATION_DELETED':null;
};

// Connector grammar only; the admitted natural-language Intent remains unchanged.
export function v3CurrencyCriteria(text){
 const direct=parseCurrencyRequest(text);if(direct)return direct;
 const m=text.trim().match(/^(?:tell me when |alert me when )?(GBP|EUR)\/(GBP|EUR) (?:goes |is )?(above|strictly above|at least) (\d+(?:[.,]\d+)?)\.?$/i);
 return m?parseCurrencyRequest(`${m[1]} ${m[3].toLowerCase()==='at least'?'>=':'>'} ${m[4]} ${m[2]}`):null;
}
const unsupportedCapabilityTerms=/\b(?:booking|availability|inventory|in stock|stock price|weather|private page)\b|disponibilit[ée]|r[ée]servation/i;
const hasUnsupportedConstraint=constraints=>constraints.some(({kind,text,value})=>
 kind!=='exclusion'&&kind!=='exact_resource'&&
 (unsupportedCapabilityTerms.test(text)||(value!==undefined&&unsupportedCapabilityTerms.test(value))));

export function v3Capability(capture,understanding,{clarified=false}={}){
 // Connector routing uses the canonical text. Also check grounded requirements
 // before routing so a paraphrase cannot hide an unsupported capability.
 const text=clarified?understanding.intent.canonical_text:capture.raw_input;
 if(clarified&&hasUnsupportedConstraint(understanding.intent.explicit_constraints??[]))return {decision:unsupported(V3_LIMITATION)};
 const criteria=v3CurrencyCriteria(text);
 if(criteria)return {source:pilotSource({currency:true}),criteria};
 if(isCurrencyRequest(text))return {decision:unsupported('This exchange-rate condition is not supported by the existing ECB connector.')};
 if(unsupportedCapabilityTerms.test(text))return {decision:unsupported(V3_LIMITATION)};
 const resources=[...new Set([understanding.resource?.exact_url,...understanding.intent.references.map(r=>r.exact_url)].filter(Boolean))];
 if(resources.length>1)return {decision:unsupported('Only one explicit RSS/Atom resource can be monitored per Watch.')};
 if(resources.length===1){
  const url=new URL(resources[0]);if(url.protocol!=='https:'||url.username||url.password)return {decision:unsupported('A public HTTPS RSS/Atom feed is required.')};
  return {source:{type:'feed',url:resources[0]}};
 }
 // Broad acquisition is not a predicate compiler. Brain receives the complete
 // unchanged Intent, including OR/AND, geography, exclusions and timing.
 const labels=[...new Set(understanding.intent.references.map(r=>r.label))];
 if(!labels.length)return {decision:unsupported('A news subject or an explicit RSS/Atom resource is required.')};
 const query=labels.map(s=>'"'+s.replace(/["\\]/g,' ')+'"').join(' OR ');
 if(query.length>1000)return {decision:unsupported('The news source cannot support this query size.')};
 return {source:pilotSource({query})};
}

export function createV3WatchHandler({env=process.env,authenticate=authenticateSupabaseRequest,serviceClient,model,feed=fetchAndNormalizeFeed,currency,pageMetadata}={}){
 return async(req,res)=>{
  const send=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
  if(!v3CreationEnabled(env))return send(404,{code:'STRUCTURED_FEATURE_UNAVAILABLE'});
  if(req.method!=='POST')return send(405,{code:'METHOD_NOT_ALLOWED'});
  let stage='auth';
  try{
   const {user}=await authenticate(req,{env});requireStructuredCreationAccess(user,env);
   let body=req.body;
   if(body===undefined){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>12000)return send(413,{code:'INVALID_BODY'});}body=JSON.parse(raw);}
   if(typeof body==='string')body=JSON.parse(body);
   if(!body||Object.keys(body).some(k=>!['instruction','watchId','captureKind','clarifications'].includes(k))||!uuid.test(body.watchId)||typeof body.instruction!=='string'||!body.instruction.trim()||body.instruction.length>500)return send(400,{code:'INVALID_BODY'});
   const clarifications=body.clarifications===undefined?[]:body.clarifications;
   if(!Array.isArray(clarifications)||clarifications.length>3||clarifications.some(turn=>
    !turn||typeof turn!=='object'||Object.keys(turn).some(key=>!['question','answer'].includes(key))||
    typeof turn.question!=='string'||!turn.question.trim()||turn.question.length>400||
    typeof turn.answer!=='string'||!turn.answer.trim()||turn.answer.length>905))return send(400,{code:'INVALID_BODY'});
   const kind=body.captureKind||'FREE_TEXT';if(!['FREE_TEXT','URL'].includes(kind))return send(400,{code:'INVALID_BODY'});
   const client=serviceClient||createSupabaseServiceClient({env});
   const identity={p_id:body.watchId,p_owner:user.id,p_instruction:body.instruction,p_kind:kind};
   const confirmed=async(id,existing)=>{
    const failure=await verifyCreatedWatch(client,user.id,id);
    if(failure)return send(409,{code:failure});
    let engine=V3_ENGINE;
    if(existing){
     const sidecar=await client.from('v3_pilot_watches').select('engine').eq('user_id',user.id).eq('watch_id',id).maybeSingle();
     if(sidecar.error||!sidecar.data?.engine)throw Error('V3 creation engine unavailable');
     engine=sidecar.data.engine;
    }
    return send(200,{status:'READY_TO_MONITOR',id,engine,...(existing?{existing:true}:{}),persisted:true});
   };
   stage='identity';
   const existing=await client.rpc('create_v3_watch',{...identity,p_understanding:null,p_source:null,p_criteria:null,p_baseline:null});
   if(existing.error?.code==='PT409')return send(409,{code:'V3_CREATION_NOT_CONFIRMED'});
   if(existing.error)throw Error('V3 creation identity unavailable');
   if(existing.data)return await confirmed(existing.data,true);
   let capture={id:randomUUID(),kind,raw_input:body.instruction,...(kind==='URL'?{context:[{id:'resource',kind:'page',text:'',url:body.instruction.trim()}]}:{})};
   let urlInput;
   if(kind==='URL'){
    stage='url';
    try{urlInput=await resolveV3UrlCapture(capture,{feed,pageMetadata,storyLocale:()=>resolveV3OutputLocale({client,ownerId:user.id})});}
    catch(error){if(['INVALID_FEED','UNSUPPORTED_FEED','INVALID_XML','FEED_PARSE_ERROR','INVALID_FEED_FORMAT'].includes(error.code))return send(200,unsupported('This resource is not a supported public RSS/Atom feed.'));throw error;}
    if(urlInput.decision)return send(200,urlInput.decision);
    capture=urlInput.capture;
   }
   stage='intent';
   const intentModel=model||createResponsesModel({apiKey:env.OPENAI_API_KEY});
   let displayTitle;
   const clarified=clarifications.length>0;
   const needsDisplayTitle=clarified||!v3CurrencyCriteria(body.instruction);
   const scopedModel=needsDisplayTitle?async request=>{
    const output=await intentModel(urlInput?.seed?articleStoryTitleRequest(request,urlInput.locale):watchTitleRequest(request));
    const {display_title,...semantic}=output;displayTitle=display_title;return semantic;
   }:intentModel;
   let understanding=await understandCapture(capture,clarifications.map(turn=>turn.answer),{
    model:scopedModel,limitations:[V3_LIMITATION],clarificationQuestions:clarifications.map(turn=>turn.question),
   });
   if(understanding.decision.status==='NEEDS_CLARIFICATION'){
    const {suggestions,...decision}=understanding.decision;
    return send(200,{...decision,...(suggestions?.length?{clarification_options:suggestions}:{})});
   }
   if(understanding.decision.status!=='READY_TO_MONITOR')return send(200,understanding.decision);
   if(urlInput?.seed){
    if(understanding.resource||understanding.intent.references.some(r=>r.exact_url)||understanding.intent.explicit_constraints.some(c=>c.kind==='exact_resource'))return send(200,unsupported('This article must identify a story to follow, rather than require monitoring changes to the exact page.'));
    understanding={...understanding,story_seed:urlInput.seed};
   }
   const capability=v3Capability(capture,understanding,{clarified});if(capability.decision)return send(200,capability.decision);
   if(needsDisplayTitle&&!capability.criteria)understanding={...understanding,display_title:validateWatchTitle(displayTitle)};
   if(clarified)understanding={...understanding,clarifications};
   // Acquire baseline before any write. The single SQL RPC commits all records
   // together; a provider/source/validation failure leaves no partial Watch.
   stage='baseline';
   let baseline;
   try{baseline=await evaluateV3Source({id:body.watchId,understanding,criteria:capability.criteria,prior_state:{entries:[]},baseline_at:null},capability.source,{feed:urlInput?.baselineFeed||feed,currency});}
   catch(e){if(kind==='URL'&&['INVALID_FEED','UNSUPPORTED_FEED','INVALID_XML','FEED_PARSE_ERROR','UNSUPPORTED_CONTENT_TYPE','INVALID_FEED_FORMAT','NOT_A_FEED'].includes(e.code))return send(200,unsupported('This resource is not a supported public RSS/Atom feed.'));throw e;}
   stage='persistence';
   const saved=await client.rpc('create_v3_watch',{...identity,p_understanding:understanding,p_source:capability.source,p_criteria:capability.criteria||null,p_baseline:baseline});
   if(saved.error?.code==='PT409')return send(409,{code:'V3_CREATION_NOT_CONFIRMED'});
   if(saved.error)throw Error('V3 creation not committed');
   return await confirmed(saved.data,saved.data!==body.watchId.toLowerCase());
  }catch(e){console.warn('v3_creation_failed',{stage,code:/^[A-Z_]{1,80}$/.test(e.code||'')?e.code:'V3_CREATION_UNAVAILABLE'});return send([401,403,404].includes(e.statusCode)?e.statusCode:503,{code:['AUTH_REQUIRED','INVALID_SESSION','AUTH_UNAVAILABLE','STRUCTURED_FEATURE_UNAVAILABLE'].includes(e.code)?e.code:'V3_CREATION_UNAVAILABLE'});}
 };
}
