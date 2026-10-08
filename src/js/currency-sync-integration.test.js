import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./test-support/json-module-loader.js',import.meta.url);
const tick=()=>new Promise(r=>setImmediate(r));
const storage=()=>{const s={};Object.defineProperties(s,{getItem:{value:k=>s[k]??null},setItem:{value:(k,v)=>{s[k]=String(v);}},removeItem:{value:k=>{delete s[k];}}});return s;};
test('hydrated currency acknowledgement and report provenance are local, not definition mutations',async t=>{
 const old={localStorage:globalThis.localStorage,window:globalThis.window,fetch:globalThis.fetch};
 globalThis.localStorage=storage();globalThis.window=new EventTarget();
 const auth={getState:()=>({status:'authenticated',session:{user:{id:'currency-sync-fixture'},access_token:'test'}}),subscribe:()=>()=>{}};
 const {configureAccountStorage}=await import('./account-storage.js');configureAccountStorage(auth);
 const ms=await import('./media-watch-server-store.js');const ws=await import('./watch-storage.js');
 t.after(async()=>{await ms.configureMediaWatchServerStore(null);for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
 const {normalizeCurrencyWatch,CURRENCY_SOURCE}=await import('./currency-watch.js');
 const {mediaWatchDefinition}=await import('./media-watch-definition.js');
 const w=normalizeCurrencyWatch({id:crypto.randomUUID(),title:'Currency fixture',request:'GBP > 1.17 EUR',inputType:'text',currencyPolicy:'daily',status:'watching',monitoringSource:CURRENCY_SOURCE});
 const date='2026-10-08T11:15:00.000Z';
 const row={...mediaWatchDefinition(w),media_revision:2,media_mutation_id:crypto.randomUUID(),current_status:'watching',created_at:date,last_checked_at:date,last_check_outcome:'currency-met',currency_watch_events:[{id:'event-one',detected_at:date,article:{title:'Threshold met',url:CURRENCY_SOURCE.url,excerpt:'GBP 1.18 EUR',publishedAt:'2026-10-07'},evaluation:{met:true}}]};
 const calls=[];
 globalThis.fetch=async(_path,o={})=>{calls.push(o.method||'GET');return Response.json({watches:[row],emailEnabled:false});};
 await ms.configureMediaWatchServerStore(auth);
 const journalKey=`watchAssistant.mediaSync.currency-sync-fixture.${w.id}`;
 assert.equal(ms.getMediaPersistenceState(ws.getWatchById(w.id)).status,'saved');
 // Actual detail handler persists an acknowledgement through addWatch.
 ws.markUpdateAsRead(w.id,'event-one');
 assert.equal(ms.getMediaPersistenceState(ws.getWatchById(w.id)).status,'saved');
 assert.equal(localStorage.getItem(journalKey),null,'no journal is needed for an unchanged hydrated definition');
 const {generateReport}=await import('./report-service.js');
 const result=await generateReport({watches:[ws.getWatchById(w.id)],getWatch:ws.getWatchById,saveWatch:ws.updateWatch,
 checkController:{check:async()=>{
   const current=ws.getWatchById(w.id);
   ws.updateWatch(w.id,{updates:[...current.updates,{id:'event-two',timestamp:date,sourceTitle:'Changed matching daily rate',summary:'GBP 1.19 EUR',status:'new'}]});
   return {outcome:'currency-met',matchedItems:[{id:'event-two'}]};
 }},save:x=>x,loadReports:()=>[],clock:()=>new Date(date)});
 assert.equal(result.attempts[0].status,'succeeded');assert.equal(result.entries[0].classification,'updated','a threshold result is informational, not technical attention');
 await tick();assert.deepEqual(calls,['GET']);assert.equal(row.media_revision,2);
 // Real definition edits still become pending, and failed/conflicted writes remain visible.
 let release;globalThis.fetch=async(_path,o={})=>{if(o.method==='POST'){await new Promise(r=>{release=r;});return Response.json({code:'MEDIA_CONFLICT'},{status:409});}return Response.json({watches:[row]});};
 ws.updateWatch(w.id,{title:'Actual edit'});await tick();assert.equal(ms.getMediaPersistenceState(ws.getWatchById(w.id)).status,'pending');
 const before=JSON.parse(localStorage.getItem(journalKey));release();await ms.synchronizeMediaWatches();
 assert.equal(ms.getMediaPersistenceState(ws.getWatchById(w.id)).status,'conflict');
 assert.equal(JSON.parse(localStorage.getItem(journalKey)).mutation,before.mutation);
});
