import {randomUUID} from 'node:crypto';
import {understandCapture} from './v3-intent/understand.mjs';
import {createResponsesModel} from './v3-intent/provider.mjs';
import {authenticateSupabaseRequest} from './supabase-user.js';
import {createSupabaseServiceClient} from './supabase-service.js';
import {requireStructuredCreationAccess,structuredCreationEnabled} from './structured-creation-access.js';
import {structuredProductionEnabled} from './structured-production-access.js';
import {evaluateV3Source,pilotSource} from './v3-pilot.js';
import {parseCurrencyRequest,isCurrencyRequest} from '../src/js/currency-watch.js';

export const V3_ENGINE='wa-v3-evidence-refs.v1';
export const v3CreationEnabled=env=>env.V3_PILOT_ENABLED==='true'&&structuredCreationEnabled(env)&&structuredProductionEnabled(env)&&env.STRUCTURED_MEDIA_SCHEDULED_ENABLED==='true';
export const V3_LIMITATION='Monitoring currently supports public RSS/Atom news and ECB GBP/EUR thresholds only. Booking availability, inventory, private pages and arbitrary page changes require an unavailable connector.';
const unsupported=reason=>({status:'UNSUPPORTED_FOR_NOW',reason});
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Connector grammar only; the admitted natural-language Intent remains unchanged.
export function v3CurrencyCriteria(text){
 const direct=parseCurrencyRequest(text);if(direct)return direct;
 const m=text.trim().match(/^(?:tell me when |alert me when )?(GBP|EUR)\/(GBP|EUR) (?:goes |is )?(above|strictly above|at least) (\d+(?:[.,]\d+)?)\.?$/i);
 return m?parseCurrencyRequest(`${m[1]} ${m[3].toLowerCase()==='at least'?'>=':'>'} ${m[4]} ${m[2]}`):null;
}
export function v3Capability(capture,understanding){
 const text=capture.raw_input;
 const criteria=v3CurrencyCriteria(text);
 if(criteria)return {source:pilotSource({currency:true}),criteria};
 if(isCurrencyRequest(text))return {decision:unsupported('This exchange-rate condition is not supported by the existing ECB connector.')};
 if(/\b(?:booking|availability|inventory|in stock|stock price|weather|private page)\b|disponibilit[ée]|r[ée]servation/i.test(text))return {decision:unsupported(V3_LIMITATION)};
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

export function createV3WatchHandler({env=process.env,authenticate=authenticateSupabaseRequest,serviceClient,model,feed,currency}={}){
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
   if(!body||Object.keys(body).some(k=>!['instruction','watchId','captureKind'].includes(k))||!uuid.test(body.watchId)||typeof body.instruction!=='string'||!body.instruction.trim()||body.instruction.length>500)return send(400,{code:'INVALID_BODY'});
   const kind=body.captureKind||'FREE_TEXT';if(!['FREE_TEXT','URL'].includes(kind))return send(400,{code:'INVALID_BODY'});
   const capture={id:randomUUID(),kind,raw_input:body.instruction,...(kind==='URL'?{context:[{id:'resource',kind:'page',text:'',url:body.instruction.trim()}]}:{})};
   const client=serviceClient||createSupabaseServiceClient({env});
   // Owner-scoped idempotency also reuses existing pilot identities without
   // selecting an engine by instruction. No migration/recreation of old rows.
   const existing=await client.from('v3_pilot_watches').select('watch_id,instruction,engine').eq('user_id',user.id).eq('instruction',body.instruction).maybeSingle();
   if(existing.error)throw Error('V3 persistence unavailable');
   if(existing.data)return send(200,{status:'READY_TO_MONITOR',id:existing.data.watch_id,engine:existing.data.engine,existing:true});
   stage='intent';
   const understanding=await understandCapture(capture,[],{model:model||createResponsesModel({apiKey:env.OPENAI_API_KEY}),limitations:[V3_LIMITATION]});
   if(understanding.decision.status!=='READY_TO_MONITOR')return send(200,{...understanding.decision});
   const capability=v3Capability(capture,understanding);if(capability.decision)return send(200,capability.decision);
   // Acquire baseline before any write. The single SQL RPC commits all records
   // together; a provider/source/validation failure leaves no partial Watch.
   stage='baseline';
   let baseline;
   try{baseline=await evaluateV3Source({id:body.watchId,understanding,criteria:capability.criteria,prior_state:{entries:[]},baseline_at:null},capability.source,{feed,currency});}
   catch(e){if(kind==='URL'&&['INVALID_FEED','UNSUPPORTED_FEED','INVALID_XML','FEED_PARSE_ERROR','UNSUPPORTED_CONTENT_TYPE','INVALID_FEED_FORMAT','NOT_A_FEED'].includes(e.code))return send(200,unsupported('This resource is not a supported public RSS/Atom feed.'));throw e;}
   stage='persistence';
   const saved=await client.rpc('create_v3_watch',{p_id:body.watchId,p_owner:user.id,p_instruction:body.instruction,p_kind:kind,p_understanding:understanding,p_source:capability.source,p_criteria:capability.criteria||null,p_baseline:baseline});
   if(saved.error)throw Error('V3 creation not committed');
   return send(200,{status:'READY_TO_MONITOR',id:saved.data,engine:V3_ENGINE});
  }catch(e){console.warn('v3_creation_failed',{stage,code:/^[A-Z_]{1,80}$/.test(e.code||'')?e.code:'V3_CREATION_UNAVAILABLE'});return send([401,403,404].includes(e.statusCode)?e.statusCode:503,{code:['AUTH_REQUIRED','INVALID_SESSION','AUTH_UNAVAILABLE','STRUCTURED_FEATURE_UNAVAILABLE'].includes(e.code)?e.code:'V3_CREATION_UNAVAILABLE'});}
 };
}
