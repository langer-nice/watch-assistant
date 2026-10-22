import test from 'node:test';
import assert from 'node:assert/strict';
import {configureAccountStorage} from './account-storage.js';
import {configureReportSync,loadLatestServerReport,saveManualReport} from './report-sync.js';
import {getLatestReport,resetStoredReports} from './report-storage.js';
import {selectHomeReport} from './home-report.js';
import {resolveHomeReportTimestamp} from './home-report-timestamp.js';
const owner='4eee8bb6-21c1-46c2-b150-0fa8981a0aef',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env={VITE_SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true'};
const report={version:2,origin:'automatic',id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',ownerId:owner,startedAt:'2026-10-22T06:00:00Z',completedAt:'2026-10-22T06:02:00Z',watchIdsConsidered:['w'],watchIdsChecked:['w'],watchIdsSkipped:[],attempts:[{watchId:'w',status:'succeeded',startedAt:'2026-10-22T06:01:00Z',completedAt:'2026-10-22T06:01:00Z',resultIds:['a']}],entries:[{watchId:'w',title:'Synthetic',classification:'updated',attemptStatus:'succeeded',checkedAt:'2026-10-22T06:01:00Z',resultIds:['a']}]};
let state={status:'authenticated',session:{user:{id:owner}}};const callbacks=[];
const auth={getState:()=>state,subscribe:fn=>{callbacks.push(fn);return()=>{};}};
globalThis.localStorage={data:new Map(),getItem(key){return this.data.get(key)||null;},setItem(key,value){this.data.set(key,value);},removeItem(key){this.data.delete(key);}};
const login=id=>{state=id?{status:'authenticated',session:{user:{id}}}:{status:'anonymous'};callbacks.forEach(fn=>fn(state));};
for(const configuration of [env,{VITE_SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',VITE_MORNING_REPORT_PRODUCTION_ENABLED:'true'}])test('Home restores persisted report after reload/login/device and guards account-switch races '+configuration.VITE_SUPABASE_URL,async()=>{
 const env=configuration;
 configureAccountStorage(auth);resetStoredReports();let resolve;
 await configureReportSync({client:{rpc:async name=>{assert.equal(name,'latest_watch_report');return {data:report};}},auth,env});
 assert.equal(getLatestReport().id,report.id);
 resetStoredReports();await loadLatestServerReport();assert.equal(getLatestReport().id,report.id);
 login(null);assert.equal(getLatestReport(),null);login(owner);await loadLatestServerReport();assert.equal(getLatestReport().id,report.id);
 resetStoredReports();const pending=configureReportSync({client:{rpc:()=>new Promise(r=>{resolve=r;})},auth,env});
 const finishOriginal=resolve;login(other);finishOriginal({data:report});await pending;assert.equal(getLatestReport(),null);
 // Reject a foreign payload even if it arrives through an incorrectly mocked RPC.
 await configureReportSync({client:{rpc:async()=>({data:report})},auth,env});assert.equal(getLatestReport(),null);
 login(owner);
 await configureReportSync({client:{rpc:async name=>name==='latest_watch_report'?{data:report}:{data:true}},auth,env});
 const manual=await saveManualReport({...report,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',completedAt:'2026-10-22T06:03:00Z'});assert.equal(manual.origin,'manual');
});
test('automatic facts preserve local read rules and real generation time without notification side effects',()=>{
 const watch={id:'w',title:'Synthetic',createdAt:'2026-09-01',updates:[{id:'a',timestamp:'2026-10-22T06:01:00Z',status:'read',sourceTitle:'A meaningful headline'}]};
 const before=structuredClone(report);
 assert.equal(selectHomeReport({report,watches:[watch]}).updatedWatches.length,0);
 assert.equal(selectHomeReport({report,watches:[{...watch,updates:[{...watch.updates[0],status:'new'}]}]}).updatedWatches.length,1);
 assert.equal(resolveHomeReportTimestamp({report,watches:[{lastChecked:'2026-10-22T09:00:00Z'}]}),'2026-10-22T06:02:00.000Z');
 assert.deepEqual(report,before);
});
