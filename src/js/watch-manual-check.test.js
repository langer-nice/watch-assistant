import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canManuallyCheckWatch } from './watch-manual-check.js';
import { migrateWatchModel } from './watch-model.js';
import { createWatchDefinition, structuredMonitoringSource, definitionFromWatch } from './watch-definition.js';
import { compileMonitoringPlan } from './watch-capabilities.js';
import { fixture, individual, predicate } from '../../server/test-support/watch-interpretation-fixtures.js';
import { configureMediaWatchServerStore, getMediaServerWatches, checkStoredMediaWatch, canCheckStoredMediaWatch } from './media-watch-server-store.js';
import { createWatchCheckController, MonitoringCheckError } from './watch-monitoring.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const make=()=>{
 const i=fixture('Keep me updated on Jannik Sinner.',[individual('s','Jannik Sinner','person')],[predicate('n','news_about',['s'])]);
 const d=createWatchDefinition(i,compileMonitoringPlan(i,{structured:true}));
 return migrateWatchModel({...d,id,monitoringSource:structuredMonitoringSource(d.plan.criteria),status:'paused',monitoringState:'paused',mediaPersistence:{ownerId:owner,revision:1}}).watch;
};
const owned={canCheckStoredWatch:()=>true};
test('valid owned paused structured Media can be checked without removing edit lock',()=>{
 const w=make(),before=structuredClone(w);assert.equal(canManuallyCheckWatch(w,owned),true);assert.equal(w.serverReadOnly,true);assert.deepEqual(w,before);
});
for(const [name,change,opts]of[
 ['unauthenticated',w=>w,{}],['foreign owner',w=>w,{canCheckStoredWatch:()=>false}],
 ['preparing',w=>w,{...owned,preparing:true}],['in progress',w=>w,{...owned,inProgress:true}],
 ['execution disabled',w=>({...w,structuredExecutionDisabled:true}),owned],
 ['unsupported adapter',w=>({...w,plan:{...w.plan,adapter:'ecb_exchange_rate_v1'}}),owned],
 ['future version',w=>({...w,definitionVersion:'future'}),owned],
 ['missing revision',w=>({...w,mediaPersistence:{ownerId:owner}}),owned],
 ['source mismatch',w=>({...w,monitoringSource:{type:'feed',url:'https://example.test/evil'}}),owned],
])test(`${name} cannot enable a structured check`,()=>assert.equal(canManuallyCheckWatch(change(make()),opts),false));
for(const readOnly of [false,true])for(const inProgress of [false,true])for(const preparing of [false,true])test(`legacy availability unchanged: ${readOnly}/${inProgress}/${preparing}`,()=>{
 assert.equal(canManuallyCheckWatch({serverReadOnly:readOnly},{inProgress,preparing}),!readOnly&&!inProgress&&!preparing);
});

// Execute the real detail-button block, rather than mirroring its click handler.
const navigation=await readFile(new URL('./navigation.js',import.meta.url),'utf8');
const start=navigation.indexOf('  if (checkNowEl) {'),end=navigation.indexOf('  if (checkNowLabelEl) {',start);
assert(start>=0&&end>start);const block=navigation.slice(start,end).replaceAll('import.meta.env.DEV','false');
const install=new Function('d','canManuallyCheckWatch',`const {watch,checkNowEl,watchCheckController,canCheckStoredMediaWatch}=d;
 let detailCheckInProgress=false,detailCheckErrorWatchId=null;const isPreparing=false;
 const checkNowLabelEl=null,checkSpinnerEl=null,lastCheckedEl=null;
 const checkFeedbackEl={textContent:'',dataset:{},hidden:true};
 const t=k=>k,waitForVisiblePaint=async()=>{},isCompanyWatch=()=>false,isCompanyWatchServerMode=()=>false;
 const markUpdatesAsRead=()=>{},refreshLatestReport=()=>{},getWatches=()=>[],MonitoringCheckError=d.MonitoringCheckError;
 const renderWatchDetail=()=>{checkNowEl.disabled=!canManuallyCheckWatch(watch,{inProgress:detailCheckInProgress,canCheckStoredWatch:canCheckStoredMediaWatch});};
 ${block}
 return {failed:()=>detailCheckErrorWatchId,feedback:checkFeedbackEl};`);
const setup=async(t,{deny=false}={})=>{
 const originals=Object.fromEntries(['fetch','localStorage','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));const data=new Map();
 globalThis.window=new EventTarget();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const w=make();const row={id,user_id:owner,title:'Jannik Sinner',watch_definition:definitionFromWatch(w),monitoring_source:w.monitoringSource,monitoring_state:'paused',current_status:'paused',media_revision:1,deleted_at:null};
 let authenticated=true;const auth={getState:()=>({status:authenticated?'authenticated':'anonymous',session:{user:{id:owner},access_token:'synthetic-only'}}),subscribe:()=>()=>{}};const calls=[];let release;
 globalThis.fetch=async(path,options)=>{
  calls.push({path,options});if(path==='/api/media-watches'&&(!options.method||options.method==='GET'))return Response.json({watches:[row],emailEnabled:false});
  assert.equal(path,'/api/media-watches?action=check');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer synthetic-only');assert.deepEqual(JSON.parse(options.body),{id,revision:1});
  await new Promise(r=>release=r);return deny?Response.json({code:'STRUCTURED_FEATURE_UNAVAILABLE'},{status:403}):Response.json({outcome:'baseline',matchedItems:[],newItems:[],changes:{status:'paused'}});
 };
 t.after(async()=>{await configureMediaWatchServerStore(null);for(const[k,v]of Object.entries(originals))if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 await configureMediaWatchServerStore(auth);let current=migrateWatchModel(getMediaServerWatches()[0]).watch;assert(current);const before=structuredClone(current);
 const controller=createWatchCheckController({getWatch:()=>current,saveWatch:(_id,changes)=>current={...current,...changes},checkStoredWatch:watch=>canCheckStoredMediaWatch(watch)?checkStoredMediaWatch(watch):null,requestCheck:()=>assert.fail('No legacy fallback')});
 const button={disabled:true,setAttribute(){}};const ui=install({watch:current,checkNowEl:button,watchCheckController:controller,canCheckStoredMediaWatch,MonitoringCheckError},canManuallyCheckWatch);
 return {button,ui,calls,before,signOutLocally:()=>{authenticated=false;},current:()=>current,release:async()=>{for(let n=0;n<50&&!release;n++)await new Promise(r=>setImmediate(r));assert(release);release();}};
};
test('real detail click reaches authenticated stored endpoint once, keeps paused definition and blocks double click',async t=>{
 const h=await setup(t);assert.equal(h.button.disabled,false);const first=h.button.onclick();assert.equal(h.button.disabled,true);await h.button.onclick();await h.release();await first;
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,1);assert.equal(h.ui.failed(),null);assert.equal(h.button.disabled,false);assert.deepEqual(h.current(),h.before);assert.equal(h.current().serverReadOnly,true);
});
test('server denial stays a controlled failure without local fallback or definition change',async t=>{
 const h=await setup(t,{deny:true});const pending=h.button.onclick();await h.release();await pending;
 assert.equal(h.ui.failed(),id);assert.equal(h.button.disabled,false);assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,1);assert.deepEqual(h.current().request,h.before.request);assert.equal(h.current().status,'paused');
});
test('detail edit, activation and delete locks remain independent of manual availability',()=>{
 assert.match(navigation,/editActionEl\.hidden = Boolean\(watch\.serverReadOnly\)/);assert.match(navigation,/pausedResumeEl\.hidden = Boolean\(watch\.serverReadOnly\)/);assert.match(navigation,/if \(watch\.serverReadOnly\) return;/);assert.match(navigation,/deleteEl\.hidden = Boolean\(watch\.serverReadOnly\)/);
});

test('session loss blocks the actual click handler before any check request',async t=>{
 const h=await setup(t);h.signOutLocally();await h.button.onclick();
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,0);assert.deepEqual(h.current(),h.before);
});
