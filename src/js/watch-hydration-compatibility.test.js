import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const compatible={id:'00000000-0000-4000-8000-000000000001',title:'Topic',monitoring_state:'monitoring',current_status:'watching',created_at:'2026-10-06T10:00:00Z',media_revision:1,monitoring_source:{type:'feed',url:'https://example.com/rss'},watch_definition:{inputType:'text',request:'News about protests',category:'news',mediaMention:{subjects:['protests'],matchMode:'all'}}};
const recurring={...compatible,id:'00000000-0000-4000-8000-000000000002',title:'Recurring currency',monitoring_source:{type:'currency',url:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'},watch_definition:{inputType:'text',category:'finance',request:'Préviens-moi chaque fois que le taux de la livre sterling change et qu’une livre vaut plus de 1,17 euro.',currencyCriteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'},currencyPolicy:'daily',currencyRevision:'00000000-0000-4000-8000-000000000003'}};

test('newer persisted currency definitions cannot poison same-account media hydration or be rewritten',async t=>{
 const originals={fetch:globalThis.fetch,localStorage:globalThis.localStorage,window:globalThis.window,document:globalThis.document};
 const values={};globalThis.localStorage={getItem:k=>values[k]??null,setItem:(k,v)=>values[k]=v,removeItem:k=>delete values[k]};globalThis.window=new EventTarget();globalThis.document=parseHTML('<html><body><main class="page--watches"><div id="exampleWatches"></div><h1 id="title"></h1></main></body></html>').document;
 const ms=await import('./media-watch-server-store.js');const cs=await import('./company-watch-server-store.js');const notices=await import('./watch-load-notice.js');const {renderMediaPersistenceNotice}=await import('./media-watch-persistence-notice.js');
 let state={status:'authenticated',session:{user:{id:'compat-owner'},access_token:'synthetic'}};const subscribers=new Set();const auth={getState:()=>state,subscribe:f=>{subscribers.add(f);return()=>subscribers.delete(f);}};
 t.after(async()=>{await ms.configureMediaWatchServerStore(null);await cs.configureCompanyWatchServerStore(null);Object.assign(globalThis,originals);});
 let failing=true,held=false,releases=[],calls=[];
 globalThis.fetch=async(path,options)=>{calls.push({path,method:options.method||'GET'});if(held)await new Promise(r=>releases.push(r));if(path.includes('company')&&failing)return Response.json({code:'DATABASE_ERROR'},{status:503});return Response.json({watches:path.includes('company')?[]:[compatible,recurring],emailEnabled:false});};
 await ms.configureMediaWatchServerStore(auth);await cs.configureCompanyWatchServerStore(auth);
 assert.equal(ms.getMediaWatchLoadState().status,'ready');assert.equal(ms.getMediaWatchLoadState().incompatible,1);assert.equal(ms.getMediaServerWatches().length,2);
 const readonly=ms.mergeMediaWatches([]).find(w=>w.id===recurring.id);assert.equal(readonly.serverReadOnly,true);assert.equal(readonly.monitoringAvailability,'incompatible');assert.deepEqual(readonly.currencyCriteria,recurring.watch_definition.currencyCriteria);assert.equal(readonly.currencyPolicy,'daily');
 assert.throws(()=>ms.prepareMediaWatch(readonly,readonly),e=>e.code==='UNSUPPORTED_WATCH_VERSION');assert.throws(()=>ms.queueMediaWatchDeletion(readonly),e=>e.code==='UNSUPPORTED_WATCH_VERSION');await assert.rejects(ms.checkStoredMediaWatch(readonly),e=>e.code==='UNSUPPORTED_WATCH_VERSION');
 renderMediaPersistenceNotice(readonly,document.getElementById('title'),'fr');assert.match(document.getElementById('watchMediaPersistenceNotice').textContent,/lecture seule/);
 notices.renderWatchLoadNotice('fr',2);assert.equal(notices.getWatchListAvailability().partial,true);assert.equal(document.getElementById('exampleWatches').hidden,true);
 const notice=document.getElementById('watchLoadNotice'),button=notice.querySelector('button');assert.match(notice.textContent,/DATABASE_ERROR/);
 // Retry fails, becomes actionable again, then succeeds. Concurrent clicks coalesce.
 held=true;const before=calls.length;button.click();button.click();await tick();assert.equal(button.disabled,true);assert.match(button.textContent,/tentative/);assert.equal(calls.length-before,2);held=false;releases.splice(0).forEach(r=>r());await tick();await tick();assert.equal(button.disabled,false);assert.match(notice.textContent,/Impossible/);
 failing=false;button.click();await tick();await tick();assert.equal(notices.getWatchListAvailability().failed,false);assert.equal(notice.hidden,false);assert.match(notice.textContent,/lecture seule/);assert.equal(button.hidden,true);assert.equal(document.getElementById('exampleWatches').hidden,false);assert.ok(calls.every(c=>c.method==='GET'));
 // Late reads cannot repopulate another account or resurrect a signed-out list.
 held=true;const pending=ms.synchronizeMediaWatches({readOnly:true});await tick();state={status:'anonymous'};subscribers.forEach(f=>f(state));held=false;releases.splice(0).forEach(r=>r());await pending;assert.deepEqual(ms.getMediaServerWatches(),[]);assert.equal(notices.getWatchListAvailability().active,false);
});

test('invalid response and offline failures have actionable codes without a retry loop',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const {watchRequest}=await import('./watch-server-resilience.js');let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('<html>Login</html>',{status:200});};await assert.rejects(watchRequest('/fixture'),e=>e.code==='INVALID_RESPONSE');assert.equal(calls,1);
 globalThis.fetch=async()=>{calls++;throw new TypeError('offline');};await assert.rejects(watchRequest('/fixture'),e=>e.code==='NETWORK_ERROR');assert.equal(calls,2);
});
