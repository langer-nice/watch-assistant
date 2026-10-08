import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import * as store from './media-watch-server-store.js';
import { renderMediaPersistenceNotice } from './media-watch-persistence-notice.js';
import { renderWatchLoadNotice } from './watch-load-notice.js';
import { configureAccountStorage } from './account-storage.js';

const row = {id:'00000000-0000-4000-8000-000000000091', title:'Fixture news',media_revision:1,
 monitoring_state:'monitoring',current_status:'watching',watch_definition:{inputType:'text',category:'news',request:'Fixture news',mediaMention:{subjects:['Fixture'],matchMode:'all'}},monitoring_source:{type:'feed',url:'https://fixture.example/rss'}};
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('confirmed presentation, unknown notification state, writes, errors and account isolation',async t=>{
 const originals=Object.fromEntries(['localStorage','window','document','fetch'].map(k=>[k,globalThis[k]]));
 const memory={};Object.defineProperties(memory,{getItem:{value:k=>memory[k]??null},setItem:{value:(k,v)=>{memory[k]=String(v);}},removeItem:{value:k=>delete memory[k]}});
 globalThis.localStorage=memory;globalThis.window=new EventTarget();
 globalThis.document=parseHTML('<main class="page--detail"><h1>Fixture</h1><section id="context">Initial context</section></main>').document;
 let state={status:'authenticated',session:{user:{id:'presentation-a'},access_token:'token-a'}};const listeners=new Set();
 const auth={getState:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 configureAccountStorage(auth);
 let response=()=>Response.json({watches:[row],emailEnabled:true});const calls=[];
 globalThis.fetch=async(path,options)=>{calls.push({path,method:options.method||'GET'});return response(path,options);};
 t.after(async()=>{await store.configureMediaWatchServerStore(null);for(const[k,v]of Object.entries(originals)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
 const watch={...row.watch_definition,id:row.id,title:row.title,monitoringSource:row.monitoring_source,status:'watching',mediaPersistence:{ownerId:'presentation-a'}};
 const render=(lang='en',w=watch)=>{renderMediaPersistenceNotice(w,document.querySelector('h1'),lang);return document.getElementById('watchMediaPersistenceNotice');};
 // A completed local job alone cannot confirm a saved server Watch.
 localStorage.setItem('watchAssistant.mediaSync.presentation-a.'+row.id,JSON.stringify({pending:false,revision:1}));
 let wait=deferred();response=()=>wait.promise;const initial=store.configureMediaWatchServerStore(auth);await flush();
 assert.equal(store.getMediaPersistenceState(watch).status,'loading');
 assert.match(render().textContent,/Loading saved Watch/);assert.doesNotMatch(render().textContent,/disabled/);
 wait.resolve(Response.json({watches:[row],emailEnabled:true}));await initial;
 for(const language of ['en','fr'])for(const enabled of [true,false]){
  response=()=>Response.json({watches:[row],emailEnabled:enabled});await store.synchronizeMediaWatches({readOnly:true});
  const currency={...watch,request:'GBP reaches 1.17 EUR'};
  const currencyBefore=render(language,currency).textContent;
  const before=render(language).textContent;const context=document.getElementById('context');
  wait=deferred();response=()=>wait.promise;const refresh=store.synchronizeMediaWatches({readOnly:true});await flush();
  assert.equal(render(language,currency).textContent,currencyBefore);assert.equal(render(language).textContent,before);assert.equal(render(language).getAttribute('aria-busy'),'false');assert.equal(document.getElementById('context'),context);
  wait.resolve(Response.json({watches:[row],emailEnabled:!enabled}));await refresh;
  assert.notEqual(render(language).textContent,before,'genuine server setting changes are shown');
 }
 // A confirmed successful server check replaces a retained local activation failure.
 const checkedRow={...row,last_checked_at:'2026-10-08T14:05:00Z',last_check_outcome:'baseline'};
 response=()=>Response.json({watches:[checkedRow],emailEnabled:false});await store.synchronizeMediaWatches({readOnly:true});
 const [reconciled]=store.mergeMediaWatches([{...watch,monitoringState:'needs-attention',lastCheckAttempt:{status:'failed',attemptedAt:'2026-10-08T14:04:00Z'}}]);
 assert.equal(reconciled.monitoringState,'monitoring');assert.equal(reconciled.lastCheckAttempt.status,'succeeded');
 assert.doesNotMatch(render('en',reconciled).textContent,/check failed|first check is pending/);
 assert.equal(store.getMediaServerWatches()[0].monitoringState,'monitoring');
 response=()=>Response.json({watches:[row],emailEnabled:true});await store.synchronizeMediaWatches({readOnly:true});const confirmed=render().textContent;
 response=()=>Response.json({watches:[row]});await store.synchronizeMediaWatches({readOnly:true});assert.equal(render().textContent,confirmed,'missing email field must not disable notifications');
 response=()=>Response.json({code:'DATABASE_ERROR'},{status:503});await store.synchronizeMediaWatches({readOnly:true});
 assert.equal(render().textContent,confirmed);renderWatchLoadNotice('en',1);assert.equal(document.getElementById('watchLoadNotice').hidden,false);assert.match(document.getElementById('watchLoadNotice').textContent,/couldn’t load/);
 // Reset backoff via a new normal session/account; old results must not win.
 wait=deferred();response=()=>wait.promise;state={...state,session:{...state.session,access_token:'token-new'}};listeners.forEach(fn=>fn(state));await flush();
 state={status:'authenticated',session:{user:{id:'presentation-b'},access_token:'token-b'}};response=()=>Response.json({watches:[],emailEnabled:false});listeners.forEach(fn=>fn(state));await flush();
 assert.equal(store.getMediaPersistenceState(watch).status,'local-only');assert.deepEqual(store.getMediaServerWatches(),[]);
 wait.resolve(Response.json({watches:[row],emailEnabled:true}));await flush();assert.deepEqual(store.getMediaServerWatches(),[]);
 // Actual pending writes distinguish saving from explicit claim progress.
 state={status:'authenticated',session:{user:{id:'presentation-c'},access_token:'token-c'}};listeners.forEach(fn=>fn(state));await flush();
 const owned={...watch,mediaPersistence:{ownerId:'presentation-c'}};
 for(const operation of ['saving','syncing']){
  const key='watchAssistant.mediaSync.presentation-c.'+row.id;
  localStorage.setItem(key,JSON.stringify({pending:true,operation,mutation:operation,revision:1,definition:{...row,id:row.id}}));
  wait=deferred();response=(_p,o)=>o.method==='POST'?wait.promise:Response.json({watches:[row],emailEnabled:true});
  const save=store.synchronizeMediaWatches();await flush();
  assert.match(render('en',owned).textContent,operation==='saving'?/Saving changes/:/Syncing/);
  assert.match(render('fr',owned).textContent,operation==='saving'?/Enregistrement/:/Synchronisation en cours/);
  wait.resolve(Response.json({watch:row}));await save;assert.equal(store.getMediaPersistenceState(owned).status,'saved');assert.match(render('en',owned).textContent,/This Watch is synced/);
 }
 const conflictKey='watchAssistant.mediaSync.presentation-c.'+row.id;
 localStorage.setItem(conflictKey,JSON.stringify({pending:true,conflict:true,revision:1}));
 assert.match(render('en',owned).textContent,/newer version exists/);assert.match(render('fr',owned).textContent,/version plus récente/);
 assert.equal(render('en',owned).querySelector('button').disabled,false);
 state={status:'anonymous'};listeners.forEach(fn=>fn(state));assert.deepEqual(store.getMediaServerWatches(),[]);assert.equal(store.getMediaPersistenceState(owned).status,'local-only');
 assert.ok(calls.every(c=>!c.path.includes('action=check')));
});
