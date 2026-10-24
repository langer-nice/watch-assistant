import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {register} from 'node:module';
import {parseHTML} from 'linkedom';
import {configureAccountStorage,localWatchStorageKey} from './account-storage.js';
import * as media from './media-watch-server-store.js';
import {isMediaWatch} from './media-watch-definition.js';
import {currencyCriteriaFor,CURRENCY_SOURCE} from './currency-watch.js';
register('./test-support/json-module-loader.js',import.meta.url);
const tick=()=>new Promise(r=>setImmediate(r));
const until=async f=>{for(let i=0;i<100;i++){if(f())return;await tick();}assert.fail('Delete did not settle');};
const source=await readFile(new URL('./navigation.js',import.meta.url),'utf8');
// Execute the real confirmation handler with its existing closure, without booting unrelated page services.
const handlerSource=source.slice(source.indexOf('  if (deleteConfirmEl) {'),source.indexOf('  if (confirmationEl) {'));
let n=0;
async function setup(t,{mode='success',context='owned',language='en',currency=false}={}){
 const original=Object.fromEntries(['localStorage','window','document','fetch','Event'].map(k=>[k,globalThis[k]]));
 const {window,document}=parseHTML(await readFile(new URL('../../watch-detail.html',import.meta.url),'utf8'));
 window.location={href:'https://synthetic.test/watch-detail.html?id=fixture'};
 const storage={};Object.defineProperties(storage,{getItem:{value:k=>storage[k]??null},setItem:{value:(k,v)=>storage[k]=String(v)},removeItem:{value:k=>delete storage[k]}});
 Object.assign(globalThis,{window,document,Event:window.Event,localStorage:storage});
 const owner='delete-owner-'+(++n),id='11111111-1111-4111-8111-111111111111';
 let state={status:'authenticated',session:{user:{id:owner},access_token:'synthetic'}},held,posts=0;
 const auth={getState:()=>state,subscribe:()=>()=>{}};configureAccountStorage(auth);
 let row={id,user_id:owner,title:'Gucci',created_at:'2026-09-13T10:00:00Z',monitoring_state:'monitoring',current_status:'watching',media_revision:3,deleted_at:null,watch_definition:{inputType:'text',request:'Monitor news about Gucci.',category:'news',mediaMention:{subjects:['Gucci'],matchMode:'all'}},monitoring_source:{type:'feed',url:'https://news.google.com/rss/search?q=Gucci'}};
 if(currency){const request='Let me know when 1 GBP is above 1.17 EUR';row={...row,monitoring_source:CURRENCY_SOURCE,watch_definition:{inputType:'text',request,category:'finance',currencyCriteria:currencyCriteriaFor({inputType:'text',request}),currencyRevision:'33333333-3333-4333-8333-333333333333'}};}
 globalThis.fetch=async(_path,options={})=>{
  if(options.method!=='POST')return Response.json({watches:context==='journal-missing'?[]:[row],emailEnabled:false});
  posts++;const job=JSON.parse(options.body);assert.equal(job.deleted,true);assert.equal(job.definition.id,id);
  await new Promise(r=>{held=r;});
  if(mode==='server')return Response.json({code:'DATABASE_ERROR'},{status:503});
  if(mode==='network')throw new TypeError('offline');
  if(mode==='conflict')return Response.json({code:'MEDIA_CONFLICT'},{status:409});
  if(mode==='unconfirmed')return Response.json({watch:row});
  row={...row,deleted_at:'2026-10-24T08:00:00Z',media_revision:4,media_mutation_id:job.mutation};
  if(mode==='lost-response')throw new TypeError('lost response');
  return Response.json({watch:row});
 };
 await media.configureMediaWatchServerStore(auth);
 const storageModule=await import('./watch-storage.js');
 let watch=context==='journal-missing'?{...row.watch_definition,id,title:row.title,monitoringSource:row.monitoring_source,mediaPersistence:{ownerId:owner},createdAt:row.created_at,status:'watching'}:storageModule.getWatchById(id);
 if(context==='owner-missing')watch={...watch,mediaPersistence:undefined};
 localStorage.setItem(localWatchStorageKey('watchAssistant.watches'),JSON.stringify([watch]));
 const dialog=document.querySelector('#watchDeleteDialog'),confirm=document.querySelector('#watchDeleteConfirm');let closed=false;
 document.querySelector('#watchTitle').textContent=watch.title;
 dialog.close=()=>{closed=true;};
 new Function('watch','deleteConfirmEl','deleteDialogEl','deleteWatch','window','document','isMediaWatch','currencyCriteriaFor','isCompanyWatch','isCompanyWatchServerMode','deleteServerCompanyWatch','getLanguage',handlerSource)(watch,confirm,dialog,storageModule.deleteWatch,window,document,isMediaWatch,currencyCriteriaFor,()=>false,()=>false,()=>assert.fail('Not a company deletion'),()=>language);
 if(context==='session-missing')state={status:'anonymous'};
 t.after(async()=>{await media.configureMediaWatchServerStore(null);configureAccountStorage(null);for(const[k,v]of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
 return {storageModule,id,confirm,dialog,storage,title:()=>document.querySelector('#watchTitle').textContent,visible:()=>Boolean(storageModule.getWatchById(id)),closed:()=>closed,location:()=>window.location.href,posts:()=>posts,release:()=>held(),started:()=>Boolean(held),setMode:v=>{mode=v;held=null;},run:()=>confirm.onclick({preventDefault(){}})};
}
test('legacy deletion stays visible and does not redirect until matching server soft-delete confirmation',async t=>{
 const f=await setup(t),pending=f.run();await until(f.started);assert(f.visible());assert(!f.closed());assert.match(f.location(),/watch-detail/);assert(f.confirm.disabled);
 f.release();await pending;assert(!f.visible());assert(f.closed());assert.equal(f.location(),'watches.html');
 assert.deepEqual(f.storageModule.getStoredWatches(),[]);assert.equal(f.posts(),1);
});
for(const mode of ['server','network','conflict','unconfirmed'])test(mode+' failure keeps the Watch visible, reports failure and does not redirect',async t=>{
 const f=await setup(t,{mode}),pending=f.run();await until(f.started);f.release();await pending;
 assert(f.visible());assert(!f.closed());assert.match(f.location(),/watch-detail/);assert.equal(f.confirm.disabled,false);
 assert.match(f.dialog.querySelector('[role="alert"]').textContent,/Deletion failed/);
 // A reload reads the same pending journal; an unconfirmed tombstone must not hide the server row.
 assert(f.visible());assert.equal(f.storageModule.getStoredWatches().length,1);
 if(mode==='server'){f.setMode('success');const retry=f.run();await until(f.started);f.release();await retry;assert(!f.visible());assert.equal(f.location(),'watches.html');}
});
for(const context of ['session-missing','owner-missing','journal-missing'])test(context+' is surfaced instead of silently deleting locally',async t=>{
 const f=await setup(t,{context,language:'fr'});await f.run();if(context==='session-missing'){assert.equal(f.storageModule.getStoredWatches().length,1);assert.equal(f.title(),'Gucci');}else assert(f.visible());assert(!f.closed());assert.match(f.location(),/watch-detail/);assert.equal(f.posts(),0);
 assert.match(f.dialog.querySelector('[role="alert"]').textContent,/suppression a échoué/);assert.equal(f.confirm.disabled,false);
});
test('a lost response is successful only if the subsequent server read proves the same deletion mutation',async t=>{
 const f=await setup(t,{mode:'lost-response'}),pending=f.run();await until(f.started);f.release();await pending;assert(!f.visible());assert.equal(f.location(),'watches.html');
});
test('currency keeps its existing queued delete contract and Structured remains read-only',async t=>{
 const f=await setup(t,{currency:true});assert.throws(()=>media.queueMediaWatchDeletion({serverReadOnly:true}),e=>e.code==='UNSUPPORTED_WATCH_VERSION');
 await f.run();assert.equal(f.location(),'watches.html');assert(!f.visible());assert.deepEqual(f.storageModule.getStoredWatches(),[]);
 await until(f.started);f.release();await media.synchronizeMediaWatches();assert.equal(f.posts(),1);
});
