import {loadStoryDigestDevelopments} from './story-digest-developments.js';
import {randomUUID,createHash} from 'node:crypto';
import {structuredMediaNotificationIntentsEnabled,structuredDigestAccountScope,structuredEmailTestOwners,getStructuredMediaStagingEmailConfig,structuredMediaEmailDeliveryAllowed} from './structured-media-notification-gates.js';
import {parisDigestWindow,renderMediaWatchDigest} from './media-watch-digest.js';
import {sendWithResend} from './media-watch-email.js';
import {safeEmailCode,definiteProviderFailure} from './watch-email-config.js';
import {withinMediaDeadline} from './media-deadline.js';
import {validateMediaQuery} from '../src/js/media-provider-query.js';
import {applyFeedCheckResult,matchFeedItemToWatch} from '../src/js/watch-monitoring.js';
import {mediaArticleIdentityKeys} from './media-article-identity.js';
import {fetchAndNormalizeFeed} from './check-watch-api.js';

export const legacyStagingOwner='4eee8bb6-21c1-46c2-b150-0fa8981a0aef';
export const stagingLegacyEnabled=env=>Boolean(structuredMediaNotificationIntentsEnabled(env)
 &&env.VERCEL_ENV==='preview'&&env.VERCEL_PROJECT_ID==='prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF'
 &&env.VERCEL_GIT_COMMIT_REF==='codex/structured-interpretation-v1'
 &&env.MEDIA_WATCH_DAILY_DIGEST_ENABLED==='true'&&structuredDigestAccountScope(env)
 &&structuredEmailTestOwners(env).length===1&&structuredEmailTestOwners(env)[0]===legacyStagingOwner);

export const runStagingLegacyMonitoring=async({client,env=process.env,fetchFeed=fetchAndNormalizeFeed,schedulerAuthorized=false,deadline=Date.now()+18000}={})=>{
 const result={status:'disabled',checked:0,changed:0,failed:0};
 if(!schedulerAuthorized||env.STRUCTURED_MEDIA_SCHEDULED_ENABLED!=='true'||!stagingLegacyEnabled(env))return result;
 const rows=await withinMediaDeadline(()=>client.rpc('staging_legacy_media_rows'),deadline);
 if(rows.error||!Array.isArray(rows.data)||rows.data.length>3)throw Error('Legacy Staging scope unavailable');
 result.status='success';
 await Promise.all(rows.data.map(async row=>{
  try{
   if(row.user_id!==legacyStagingOwner||row.watch_definition?.definitionVersion||row.monitoring_source?.type!=='feed')throw Error('Invalid legacy scope');
   validateMediaQuery(row.watch_definition,row.monitoring_source);
   const prior=row.media_watch_snapshots,watch={...row.watch_definition,id:row.id,monitoringSource:row.monitoring_source};
   const feed=await withinMediaDeadline(()=>fetchFeed(row.monitoring_source.url,{timeoutMs:Math.min(8000,Math.max(1,deadline-Date.now()))}),deadline);
   const snapshot=applyFeedCheckResult(watch,feed).changes.monitoringSnapshot;
   const items=snapshot.items.map(item=>({...item,identityKeys:mediaArticleIdentityKeys(item)}));
   const saved=await withinMediaDeadline(()=>client.rpc('complete_staging_legacy_media_check',{
    p_watch_id:row.id,p_user_id:row.user_id,p_expected_revision:row.media_revision,
    p_checked_at:snapshot.checkedAt,p_source_title:snapshot.source?.title,p_source_url:snapshot.source?.url,
    p_item_ids:items.map(item=>item.id),p_items:items,p_expected_checked_at:prior?.checked_at||null,p_expected_items:prior?.items||null,
    p_notification_items:items.filter(item=>matchFeedItemToWatch(item,watch).matched),
   }),deadline);
   if(saved.error||saved.data?.status!=='completed')throw Error('Legacy result not saved');
   result.checked++;if(saved.data.outcome==='matching-items')result.changed++;
  }catch{result.failed++;}
 }));
 if(result.failed)result.status='partial-success';return result;
};

export const processStagingLegacyDigests=async({client,env=process.env,sender=sendWithResend,developmentBuilder=loadStoryDigestDevelopments,now=Date.now,deadline=Date.now()+30000}={})=>{
 const summary={status:'disabled',sentCount:0,failedCount:0};
 if(!stagingLegacyEnabled(env))return summary;
 const config=getStructuredMediaStagingEmailConfig(env);if(!config)return summary;
 if(!parisDigestWindow(now()).open)return {...summary,status:'outside-morning-window'};
 const rpc=async(name,args)=>{const r=await withinMediaDeadline(()=>client.rpc(name,args),deadline);if(r.error)throw Object.assign(Error('Legacy digest SQL unavailable'),{code:'DATABASE_ERROR'});return r.data;};
 const ids=await rpc('prepare_staging_legacy_digests',{p_send_hour:parisDigestWindow(now()).utcHour});
 if(!Array.isArray(ids)||ids.length>3)throw Error('Invalid legacy digest batch');
 summary.status='success';
 for(const id of ids){
  if(Date.now()>=deadline||!parisDigestWindow(now()).open)break;
  const token=randomUUID();let claimed=null,providerStarted=false,boundary=false;
  try{
   claimed=await rpc('claim_staging_legacy_digest',{p_id:id,p_token:token});if(!claimed)continue;
   if(claimed.id!==id||claimed.user_id!==legacyStagingOwner||claimed.is_structured!==false||!claimed.articles?.length)throw Error('Invalid legacy digest claim');
   const auth=await withinMediaDeadline(()=>client.auth.admin.getUserById(claimed.user_id),deadline),user=auth.data?.user;
   if(auth.error||!user?.email_confirmed_at||!structuredMediaEmailDeliveryAllowed(env,claimed.user_id,user.email))throw Object.assign(Error('Recipient unavailable'),{code:'RECIPIENT_UNVERIFIED'});
   const locale=await rpc('get_media_watch_notification_locale',{p_user_id:claimed.user_id});
   let storyDevelopments=[];
   try{storyDevelopments=await withinMediaDeadline(()=>developmentBuilder({client,claimed,env,deadline}),Math.min(deadline-1000,Date.now()+8000));}catch{/* Keep sourced articles when extraction is unavailable. */}
   const content=renderMediaWatchDigest({locale,watchId:claimed.watch_id,watchTitle:claimed.watch_title,period:claimed.period,articles:claimed.articles,baseUrl:config.baseUrl,includeSourceSummaries:true,storyDevelopments});
   if(!parisDigestWindow(now()).open)throw Object.assign(Error('Window closed'),{code:'DIGEST_WINDOW_CLOSED'});
   boundary=true;if(await rpc('begin_media_watch_digest',{p_id:id,p_token:token})!==true){boundary=false;throw Error('Digest no longer eligible');}
   const key='watch-digest-'+createHash('sha256').update(`${claimed.watch_id}\0${claimed.period}`).digest('hex');
   const sent=await withinMediaDeadline(()=>{if(!parisDigestWindow(now()).open)throw Object.assign(Error('Window closed'),{code:'DIGEST_WINDOW_CLOSED'});providerStarted=true;return sender({...config,to:user.email,...content,idempotencyKey:key});},deadline);
   if(await rpc('finish_media_watch_digest',{p_id:id,p_token:token,p_provider:sent.id,p_error:null})!==true)throw Object.assign(Error('Completion unknown'),{code:'DATABASE_ERROR'});
   summary.sentCount++;
  }catch(error){
   if(claimed&&!providerStarted){
    if(error.code!=='DIGEST_WINDOW_CLOSED')summary.failedCount++;
    try{await rpc('defer_staging_legacy_digest',{p_id:id,p_token:token});}catch{summary.failedCount++;}
   }else{
    summary.failedCount++;
    if(claimed)try{await rpc('finish_media_watch_digest',{p_id:id,p_token:token,p_provider:null,p_error:boundary&&!definiteProviderFailure(error.code)?'EMAIL_DELIVERY_OUTCOME_UNKNOWN':safeEmailCode(error)});}catch{/* Preserve the submission boundary. */}
   }
  }
 }
 if(summary.failedCount)summary.status='partial-success';return summary;
};
