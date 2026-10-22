import {getAccountOwner,getAccountEpoch} from './account-storage.js';
import {getLatestReport,saveReport} from './report-storage.js';
const setState=state=>{reportSyncState=state;globalThis.window?.dispatchEvent?.(new Event('watchassistant:reportschanged'));};
let connection=null,unsubscribe=null,flight=null;
export let reportSyncState='idle';
const enabled=env=>env?.VITE_SUPABASE_URL==='https://tseexvbwhrtofcsrvcqc.supabase.co'&&env?.VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED==='true';
export const loadLatestServerReport=async()=>{
 const c=connection,owner=getAccountOwner(),epoch=getAccountEpoch();
 if(!c||!owner||!enabled(c.env))return null;
 if(flight?.owner===owner&&flight.epoch===epoch)return flight.promise;
 const promise=(async()=>{
  reportSyncState='loading';
  try{
   const r=await c.client.rpc('latest_watch_report');
   if(c!==connection||owner!==getAccountOwner()||epoch!==getAccountEpoch())return null;
   if(r.error)throw Error('Report unavailable');
   const current=getLatestReport(),report=r.data;
   if(report&&(report.ownerId!==owner||report.version!==2))throw Error('Invalid report owner');
   if(report&&(!current||Date.parse(report.completedAt)>Date.parse(current.completedAt)))saveReport(report);
   setState('ready');return report;
  }catch{if(owner===getAccountOwner()&&epoch===getAccountEpoch())setState('unavailable');return null;}
 })().finally(()=>{if(flight?.promise===promise)flight=null;});flight={owner,epoch,promise};return promise;
};
export const configureReportSync=({client,auth,env=import.meta.env}={})=>{
 unsubscribe?.();connection=client&&auth?{client,auth,env}:null;flight=null;
 const apply=()=>{reportSyncState='idle';void loadLatestServerReport();};
 unsubscribe=auth?.subscribe?.(apply);apply();return loadLatestServerReport();
};
export const saveManualReport=async report=>{
 const local=saveReport({...report,origin:'manual'}),owner=getAccountOwner(),epoch=getAccountEpoch(),c=connection;
 if(!c||!enabled(c.env))return local;
 try{const r=await c.client.rpc('save_watch_report',{p_report:local,p_kind:'manual'});if(owner!==getAccountOwner()||epoch!==getAccountEpoch())return local;if(r.error)throw Error('Report not persisted');setState('ready');}
 catch{if(owner===getAccountOwner()&&epoch===getAccountEpoch())setState('unavailable');}
 return local;
};
if(typeof window!=='undefined'){
 globalThis.document?.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void loadLatestServerReport();});
 window.addEventListener('focus',()=>{void loadLatestServerReport();});
 window.addEventListener('watchassistant:accountstoragechanged',()=>{flight=null;void loadLatestServerReport();});
}
