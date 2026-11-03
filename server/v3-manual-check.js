import {runV3WatchCheck} from './v3-pilot.js';
import {mapMediaReportRow} from '../src/js/media-watch-row.js';
import {diagnosticInvocationId,withV3ScheduledDiagnostics,getV3AttemptDiagnostic,recordV3Failure} from './v3-scheduled-diagnostics.js';

export const runManualV3Check=({row,user,client,env,model,feed,currency,engine,outputLocale})=>withV3ScheduledDiagnostics({
 invocation_id:diagnosticInvocationId(),watch_id:row.id,engine,invocation_type:'manual',
},async()=>{
 let token;
 try{
  const claim=await client.rpc('claim_structured_media_manual_check',{p_watch_id:row.id,p_owner:user.id,p_revision:row.media_revision});
  if(claim.error)throw claim.error;
  if(!claim.data?.lease_token)return {status:409,body:{code:'MEDIA_CONFLICT',...getV3AttemptDiagnostic()}};
  token=claim.data.lease_token;
  const work=claim.data.v3;
  if(!work||work.id!==row.id||work.user_id!==user.id||work.engine!==engine||work.token!==token)throw Error('Pilot identity mismatch');
  const result=await runV3WatchCheck(work,{client,env,model,feed,currency,outputLocale});
  // Return the same authoritative read model used by scheduled hydration.
  const saved=await client.from('watches').select('*,media_watch_snapshots(*),currency_watch_events(*)')
   .eq('id',row.id).eq('user_id',user.id).eq('type','media_news').is('deleted_at',null).range(0,0);
  if(saved.error||!saved.data?.[0])throw saved.error||Error('Pilot completion fenced');
  const persisted=saved.data[0],mapped=mapMediaReportRow({...persisted,v3Engine:engine},user.id);
  const changes=Object.fromEntries(['status','lastChecked','lastCheckAttempt','lastCheckOutcome','initialContext','monitoringSnapshot','updates','currencyEvaluation','currencySatisfied']
   .filter(key=>mapped[key]!==undefined).map(key=>[key,mapped[key]]));
  return {status:200,body:{outcome:persisted.last_check_outcome,changes,
   matchedItems:result.article?mapped.updates.filter(update=>update.id===persisted.last_change_item_id):[],...getV3AttemptDiagnostic()}};
 }catch(error){
  recordV3Failure(error);
  if(token){try{await client.rpc('fail_v3_pilot_check',{p_id:row.id,p_token:token});}catch{/* Keep the original failure and let its bounded lease expire. */}}
  const diagnostic=getV3AttemptDiagnostic();
  return {status:503,body:{code:'V3_'+diagnostic.stage,...diagnostic}};
 }
});
