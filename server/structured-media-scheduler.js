import {runPilotMonitoring} from './v3-pilot.js';
import {productionExecutionEnabled,productionWatchOwners} from './structured-production-access.js';
import {mediaDailyDigestEnabled} from './media-watch-digest.js';
import { structuredCreationEnabled } from './structured-creation-access.js';
import { validateMediaQuery } from '../src/js/media-provider-query.js';
import { applyFeedCheckResult, matchFeedItemToWatch } from '../src/js/watch-monitoring.js';
import { mediaArticleIdentityKeys } from './media-article-identity.js';
import { withinMediaDeadline } from './media-deadline.js';
import { fetchAndNormalizeFeed } from './check-watch-api.js';
import { structuredMediaNotificationIntentsEnabled } from './structured-media-notification-gates.js';

// Called only behind the existing authenticated cron handler. No browser tokens,
// delivery processor, new endpoint, or provider query construction here.
export const runStructuredMediaMonitoring = async ({client,env=process.env,schedulerAuthorized=false,
 fetchFeed=fetchAndNormalizeFeed,deadline=Date.now()+18000,batchSize=3}={}) => {
 const summary={status:'disabled',claimed:0,changed:0,unchanged:0,failed:0,skipped:0,notifications:'disabled'};
 if(env.STRUCTURED_MEDIA_SCHEDULED_ENABLED!=='true')return summary;
 if(!schedulerAuthorized || typeof env.CRON_SECRET!=='string' || !env.CRON_SECRET.trim())return {...summary,status:'unauthorized'};
 const production=productionExecutionEnabled(env);
 if(!production&&!structuredCreationEnabled(env))return {...summary,status:'environment-blocked'};
 const pilotTask=runPilotMonitoring({client,env,schedulerAuthorized}).catch(()=>({status:'unavailable',claimed:0}));
 try {
 const enqueue = structuredMediaNotificationIntentsEnabled(env);
 const owners=production?await productionWatchOwners(client):String(env.STRUCTURED_WATCH_TEST_USER_IDS||'').split(',').map(x=>x.trim()).filter(x=>/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x));
 if(!owners.length)return {...summary,status:'unauthorized'};
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>3)throw Error('Invalid structured batch');
 if(Date.now()>=deadline)return {...summary,status:'deadline'};
 const claim=await withinMediaDeadline(()=>client.rpc('claim_structured_media_checks',{p_owners:owners,p_limit:batchSize}),deadline);
 if(claim.error||!Array.isArray(claim.data)||claim.data.length>batchSize)throw Error('Structured claim failed');
 summary.status='success';summary.claimed=claim.data.length;
 await Promise.all(claim.data.map(async row=>{
  const prior=Array.isArray(row.media_watch_snapshots)?row.media_watch_snapshots[0]:row.media_watch_snapshots;
  const finish={p_watch_id:row.id,p_owner:row.user_id,p_revision:row.media_revision,p_token:row.lease_token,
   p_checked_at:null,p_source_title:null,p_source_url:null,p_items:[],p_expected_checked_at:prior?.checked_at||null,p_expected_items:prior?.items||null,p_matching:[],p_error:null};
  try{
   if(!owners.includes(row.user_id)||row.monitoring_state!=='monitoring'||row.deleted_at||!row.lease_token)throw Error('Invalid structured claim');
   validateMediaQuery(row.watch_definition,row.monitoring_source);
   const watch={...row.watch_definition,id:row.id,monitoringSource:row.monitoring_source};
   const feed=await withinMediaDeadline(()=>fetchFeed(row.monitoring_source.url,{roleContext:{criteria:row.watch_definition.plan.criteria,baselineAt:prior?.baseline_at,priorItems:prior?.items},timeoutMs:Math.min(8000,Math.max(1,deadline-Date.now()))}),deadline);
   const snapshot=applyFeedCheckResult(watch,feed).changes.monitoringSnapshot;
   const items=snapshot.items.map(item=>({...item,identityKeys:mediaArticleIdentityKeys(item)}));
   Object.assign(finish,{p_checked_at:snapshot.checkedAt,p_source_title:snapshot.source?.title,p_source_url:snapshot.source?.url,p_items:items,p_matching:items.filter(item=>matchFeedItemToWatch(item,watch).matched)});
   const completed=await withinMediaDeadline(()=>client.rpc(mediaDailyDigestEnabled(env) ? 'finish_structured_check_with_digest' : enqueue ? 'finish_structured_media_check_with_notifications' : 'finish_structured_media_check',
    enqueue || mediaDailyDigestEnabled(env) ? {...finish,p_enqueue_notifications:enqueue} : finish),deadline);
   if(completed.error)throw Object.assign(Error('Structured completion failed'),{code:'PERSISTENCE_UNAVAILABLE'});
   if(completed.data?.status==='skipped')summary.skipped++;
   else if(completed.data?.status!=='completed')throw Error('Invalid structured completion');
   else if(completed.data.outcome==='matching-items')summary.changed++;else summary.unchanged++;
  }catch(error){
   summary.failed++;
   // Late/unknown commits are fenced by the lease token. A committed result
   // cannot be undone by this failure report. Expired leases recover in SQL.
   try{await withinMediaDeadline(()=>client.rpc('finish_structured_media_check',{...finish,p_error:/^[A-Z_]{1,100}$/.test(error.code||'')?error.code:'CHECK_FAILED'}),deadline);}catch{/* bounded recovery by lease expiry */}
  }
 }));
 if(summary.failed)summary.status='partial-success';return summary;
 } finally {const pilot=await pilotTask;if(pilot.claimed)summary.pilot=pilot;}
};
