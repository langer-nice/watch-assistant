import {createHash} from 'node:crypto';
import {understandCapture} from './v3-intent/understand.mjs';
import {createResponsesModel} from './v3-intent/provider.mjs';
import {createBrainModel} from './v3-brain/provider.mjs';
import {judgeReferenceEvidence} from './v3-brain-lab/evidence-ref-candidate/candidate.mjs';
import {toBrainInput} from './v3-brain-lab/end-to-end-mini/adapter.mjs';
import {fetchAndNormalizeFeed} from './check-watch-api.js';
import {fetchCurrencyRate} from './currency-rate.js';
import {evaluateCurrencyRate} from '../src/js/currency-watch.js';
export const PILOT_OWNER='b4757e02-fc75-4984-b50e-8d933ae7ec04';
export const PILOT_ENGINE='wa-v3-evidence-refs-pilot.v1';
export const PILOT_SPECS=Object.freeze([
 {title:'Manchester City important developments',instruction:'Keep me updated on important new developments concerning Manchester City.',query:'Manchester City'},
 {title:'GBP/EUR > 1.17',instruction:'Tell me when GBP/EUR goes above 1.17.',currency:true},
 {title:'Apple Mac product announcements',instruction:'Tell me when Apple announces a new Mac product.',url:'https://www.apple.com/newsroom/rss-feed.rss'},
 {title:'Metallica Europe 2027 credible reports',instruction:'Tell me when there are credible new reports that Metallica may announce concerts or tour dates in Europe for 2027, even before official confirmation.',query:'Metallica'}
]);
export const pilotDatabaseMatches=env=>env.VERCEL_ENV==='production'&&env.VERCEL_PROJECT_ID==='prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF'&&env.SUPABASE_URL==='https://cztpitujsnzhhenedwjn.supabase.co';
export const pilotEnabled=env=>env.V3_PILOT_ENABLED==='true'&&pilotDatabaseMatches(env)&&env.STRUCTURED_PRODUCTION_ENABLED==='true';
export function pilotSource(spec){if(spec.currency)return {type:'currency',provider:'ecb',url:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'};const u=new URL('https://news.google.com/rss/search');u.search=new URLSearchParams({q:spec.query||'',hl:'en-GB',gl:'GB',ceid:'GB:en'});return {type:'feed',url:spec.url||u.href};}
export async function preparePilot(instruction,{model}={}){
 const slot=PILOT_SPECS.findIndex(s=>s.instruction===instruction);if(slot<0)throw Error('Not a pilot instruction');
 const capture={kind:'FREE_TEXT',raw_input:instruction};
 const understanding=await understandCapture(capture,[],{model});
 if(understanding.decision.status!=='READY_TO_MONITOR')throw Error('Pilot Intent is not READY_TO_MONITOR');
 return {slot:slot+1,engine:PILOT_ENGINE,instruction,understanding};
}
const hash=s=>createHash('sha256').update(s).digest('hex');
export function feedEvidence(feed){
 const items=feed.items.slice(0,20);if(!items.length)throw Error('No supplied evidence');
 return {id:hash(JSON.stringify(items)),title:feed.source?.title||'News feed',content:items.map(i=>[i.title,i.excerpt||'',`Source: ${i.sourceTitle||i.source||feed.source?.title||'unspecified'}`,`URL: ${i.url||''}`,`Published: ${i.publishedAt||'unspecified'}`].join('\n')).join('\n\n'),source:feed.source?.title||'RSS feed',url:feed.source.url,retrieved_at:feed.checkedAt||new Date().toISOString()};
}
export async function evaluatePilot(row,{feed=fetchAndNormalizeFeed,currency=fetchCurrencyRate,model}={}){
 const spec=PILOT_SPECS[row.slot-1];if(!spec||row.user_id!==PILOT_OWNER||row.engine!==PILOT_ENGINE||row.instruction!==spec.instruction)throw Error('Pilot identity mismatch');
 let evidence,items,evaluation;
 if(spec.currency){
  const rate=await currency(spec.instruction);evaluation=evaluateCurrencyRate(rate.criteria,rate.observation);
  const quote=`GBP/EUR ${evaluation.observedRate}`;
  evidence={id:hash(JSON.stringify(rate.observation)),title:'ECB GBP/EUR reference observation',content:`${quote} (display truncated at 12 decimal places). Source observation: ${rate.observation.base}/${rate.observation.quote} ${rate.observation.rate}. Exact rational comparison GBP/EUR > 1.17: ${evaluation.met}.`,measurement:{metric:'GBP/EUR',value:String(evaluation.observedRate),quote},source:'ECB',url:pilotSource(spec).url,published_at:rate.observation.date+'T00:00:00Z',retrieved_at:rate.checkedAt};
  items=[{id:evidence.id,title:evidence.title,excerpt:quote,url:evidence.url,publishedAt:evidence.published_at,source:'ECB'}];
 }else{const f=await feed(pilotSource(spec).url);items=f.items.slice(0,20);evidence=feedEvidence(f);}
 const input=toBrainInput(row.understanding,evidence,row.prior_state||{entries:[]});
 // Initial evidence is a baseline, never a creation alert and never a model call.
 if(!row.baseline_at)return {evidence,items,evaluation,judgment:null,article:null};
 const judgment=await judgeReferenceEvidence(input,{model});
 let article=null;
 if(judgment.action==='ALERT'){
  if(spec.currency&&(!evaluation.met||row.evaluation?.met))throw Error('Numeric condition not satisfied');
  const chosen=spec.currency?items[0]:items.find(i=>judgment.evidence_basis.some(b=>b.text.includes(i.title)||i.excerpt&&b.text.includes(i.excerpt)));
  if(!chosen?.url)throw Error('No selected evidence article');
  article={title:`${judgment.evidence_status==='STRONG_UNCONFIRMED'?'Unconfirmed reports: ':''}${judgment.reason}`.slice(0,300),url:chosen.url,summary:judgment.reason,publishedAt:chosen.publishedAt,source:chosen.sourceTitle||chosen.source||evidence.source};
 }
 return {evidence,items,evaluation,judgment,article};
}
export async function runPilotMonitoring({client,env=process.env,schedulerAuthorized=false,model,feed,currency}={}){
 if(!schedulerAuthorized||!pilotEnabled(env))return {status:'disabled',claimed:0};
 const claim=await client.rpc('claim_v3_pilot_checks');if(claim.error)throw Error('Pilot claim failed');
 const rows=claim.data||[];let completed=0,failed=0;
 await Promise.all(rows.map(async row=>{try{
  const result=await evaluatePilot(row,{feed,currency,model:model||createBrainModel({apiKey:env.OPENAI_API_KEY})});
  const saved=await client.rpc('finish_v3_pilot_check',{p_id:row.id,p_token:row.token,p_result:result});if(saved.error||saved.data!==true)throw Error('Pilot completion fenced');completed++;
 }catch{failed++;await client.rpc('fail_v3_pilot_check',{p_id:row.id,p_token:row.token});}}));
 return {status:failed?'partial-success':'success',claimed:rows.length,completed,failed};
}
export const pilotIntentModel=env=>createResponsesModel({apiKey:env.OPENAI_API_KEY});
