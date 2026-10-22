import {randomUUID} from 'node:crypto';
import {stagingLegacyEnabled,legacyStagingOwner} from './staging-legacy-notifications.js';
import {mapMediaReportRow} from '../src/js/media-watch-row.js';
import {mapCompanyWatchRow} from './company-watch-repository.js';
import {buildStoredReport} from '../src/js/report-snapshot.js';

export const morningReportWindow=(at=Date.now())=>{
 const date=new Date(at);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
 const seconds=Number(parts.hour)*3600+Number(parts.minute)*60+Number(parts.second);
 if(seconds<28800||seconds>=30600)return null;
 return {day:`${parts.year}-${parts.month}-${parts.day}`,cutoff:new Date(date.getTime()-(seconds-28800)*1000-date.getUTCMilliseconds()).toISOString()};
};
// Read durable results only. This path cannot check a source, acknowledge an
// article, consume an outbox row, or send a notification.
export const generateMorningReport=async({client,env=process.env,at=Date.now()}={})=>{
 const window=morningReportWindow(at);
 if(!window||!stagingLegacyEnabled(env))return {status:'disabled'};
 const context=await client.rpc('morning_report_context',{p_cutoff:window.cutoff});
 if(context.error)throw Error('Morning context unavailable');
 const data=context.data;
 if(!data||data.pending>0)return {status:'awaiting-completed-checks'};
 if(data.exists)return {status:'already-generated'};
 if(!Array.isArray(data.watches)||!data.watches.every(row=>row.user_id===legacyStagingOwner))throw Error('Invalid morning owner');
 const watches=data.watches.map(row=>row.type==='media_news'?mapMediaReportRow(row,legacyStagingOwner):mapCompanyWatchRow(row));
 const completedAt=new Date(at).toISOString();
 const report={...buildStoredReport({watches,ownerId:legacyStagingOwner,id:randomUUID(),startedAt:window.cutoff,completedAt}),origin:'automatic',snapshotAt:completedAt,sourceRevision:data.revision,
  partial:watches.some(w=>w.lastCheckAttempt?.status!=='succeeded'||!w.lastChecked||Date.parse(w.lastChecked)<Date.parse(window.cutoff))};
 // Pending/paused classifications are not completed checks. Keep them visible
 // as attention instead of silently losing them in report normalization.
 for(const entry of report.entries)if(!['attention','new','updated','watching'].includes(entry.classification))entry.classification='attention';
 const saved=await client.rpc('save_watch_report',{p_report:report,p_kind:'automatic'});
 if(saved.error)throw Error('Morning persistence unavailable');
 return {status:saved.data?'generated':'snapshot-changed',partial:report.partial};
};

// The existing claim RPC and leases remain the sole authority for due work.
// Drain bounded batches only in the morning; no new interval or source request
// for Watches which are not already due. Other hourly behavior stays unchanged.
export const runMorningBatches=async({run,args,at,deadline=Date.now()+18000})=>{
 const total=await run({...args,deadline});
 if(!morningReportWindow(at))return total;
 let last=total.claimed,batches=1;
 while(last===3&&!total.failed&&Date.now()<deadline&&batches<20){
  const next=await run({...args,deadline});batches++;last=next.claimed;
  for(const key of ['claimed','changed','unchanged','failed','skipped'])total[key]=(total[key]||0)+(next[key]||0);
  if(next.failed)total.status='partial-success';
 }
 return total;
};
