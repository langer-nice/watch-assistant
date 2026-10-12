import test from 'node:test';
import assert from 'node:assert/strict';
import { definitions } from '../../server/test-support/watch-definition-fixtures.js';
import { structuredMonitoringSource,definitionFromWatch } from './watch-definition.js';
import { configureAccountStorage } from './account-storage.js';
import { configureMediaWatchServerStore,getMediaServerWatches,mergeMediaWatches,checkStoredMediaWatch,prepareMediaWatch,getMediaPersistenceState,getMediaWatchLoadState } from './media-watch-server-store.js';
import { getWatchById,updateWatch,markUpdateAsRead } from './watch-storage.js';
import { getWatchDetailPresentationSnapshot } from './watch-detail-presentation.js';

test('structured hydration/manual preparation/local read state preserve authoritative paused definition',async t=>{
 const globals={fetch:globalThis.fetch,localStorage:globalThis.localStorage,window:globalThis.window};const values=new Map();
 globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};globalThis.window=new EventTarget();
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc',definition=definitions()[1];
 const row={created_at:'2026-10-12T12:00:00Z',id,user_id:owner,title:'Sinner',watch_definition:definition,monitoring_source:structuredMonitoringSource(definition.plan.criteria),monitoring_state:'paused',media_revision:1,media_mutation_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',deleted_at:null};
 const state={status:'authenticated',session:{user:{id:owner},access_token:'fixture-only'}};const auth={getState:()=>state,subscribe:()=>()=>{}};
 const calls=[];globalThis.fetch=async(path,options={})=>{calls.push([path,options]);if(options.method==='POST'){assert.equal(path,'/api/media-watches?action=check');assert.deepEqual(JSON.parse(options.body),{id,revision:1});return new Response(JSON.stringify({outcome:'baseline',changes:{}}),{status:200});}return new Response(JSON.stringify({watches:[row],emailEnabled:false}),{status:200});};
 t.after(async()=>{await configureMediaWatchServerStore(null);configureAccountStorage(null);Object.assign(globalThis,globals);});
 configureAccountStorage(auth);await configureMediaWatchServerStore(auth);
 const watch=getMediaServerWatches()[0];assert.equal(watch.serverReadOnly,true);assert.equal(watch.structuredExecutionDisabled,false);assert.equal(getMediaPersistenceState(watch).status,'saved');assert.equal(getMediaWatchLoadState().incompatible,0);
 assert.deepEqual(definitionFromWatch(getWatchById(id)),definition);assert.equal(getWatchDetailPresentationSnapshot(getWatchById(id)).classification,'attention');assert.throws(()=>prepareMediaWatch(watch,watch),{code:'UNSUPPORTED_WATCH_VERSION'});
 assert.equal((await checkStoredMediaWatch(watch)).outcome,'baseline');
 const updates=[{id:'u1',status:'new',summary:'Sinner wins',timestamp:'2026-10-12T13:00:00Z'}];updateWatch(id,{updates,lastChecked:'2026-10-12T13:00:00Z',monitoringSnapshot:{itemIds:['a']},request:'Forbidden',status:'watching',monitoringState:'monitoring',plan:{}});
 const cached=getWatchById(id);assert.deepEqual(definitionFromWatch(cached),definition);assert.equal(cached.monitoringState,'paused');assert.equal(cached.status,'paused');assert.deepEqual(cached.updates,updates);assert.equal(cached.lastChecked,'2026-10-12T13:00:00Z');
 markUpdateAsRead(id,'u1');assert.equal(getWatchById(id).updates[0].status,'read');assert.equal(calls.filter(([,o])=>o.method==='POST').length,1);
 const local={...cached,lastChecked:'2026-10-12T14:00:00Z',mediaPersistence:{...cached.mediaPersistence,revision:0}};assert.notEqual(mergeMediaWatches([local])[0].lastChecked,local.lastChecked);
 await assert.rejects(checkStoredMediaWatch({...watch,mediaPersistence:{...watch.mediaPersistence,ownerId:'other'}}),{code:'AUTH_REQUIRED'});
});
