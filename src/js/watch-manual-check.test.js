import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canManuallyCheckWatch, manualCheckIssue } from './watch-manual-check.js';
import { getMonitoringFailureMessageKey } from './watch-monitoring-errors.js';
import { parseHTML } from 'linkedom';
import { createMediaWatchMiddleware } from '../../server/media-watch-api.js';
import { migrateWatchModel } from './watch-model.js';
import { createWatchDefinition, structuredMonitoringSource, definitionFromWatch } from './watch-definition.js';
import { compileMonitoringPlan } from './watch-capabilities.js';
import { fixture, individual, predicate } from '../../server/test-support/watch-interpretation-fixtures.js';
import { configureMediaWatchServerStore, getMediaServerWatches, checkStoredMediaWatch, canCheckStoredMediaWatch, synchronizeMediaWatches, mergeMediaWatches } from './media-watch-server-store.js';
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
const install=new Function('d','canManuallyCheckWatch','manualCheckIssue','getMonitoringFailureMessageKey',`const {watch,checkNowEl,watchCheckController,canCheckStoredMediaWatch}=d;const getWatchById=()=>d.current?d.current():watch;
 let detailCheckInProgress=false,detailCheckErrorWatchId=null;const isPreparing=false;
 const checkNowLabelEl=null,checkSpinnerEl=null,lastCheckedEl=null;
 const checkFeedbackEl=d.feedback||{textContent:'',dataset:{},hidden:true};
 const t=k=>k,waitForVisiblePaint=async()=>{},isCompanyWatch=()=>false,isCompanyWatchServerMode=()=>false;
 const markUpdatesAsRead=()=>{},refreshLatestReport=()=>{},getWatches=()=>[],MonitoringCheckError=d.MonitoringCheckError;
 const renderWatchDetail=()=>{checkNowEl.disabled=!canManuallyCheckWatch(watch,{inProgress:detailCheckInProgress||watchCheckController.isChecking(watch.id),canCheckStoredWatch:canCheckStoredMediaWatch});};
 ${block}
 return {failed:()=>detailCheckErrorWatchId,feedback:checkFeedbackEl};`);
const setup=async(t,{deny=false,networkFailure=false,immediate=false,checkConflict=false}={})=>{
 const originals=Object.fromEntries(['fetch','localStorage','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));const data=new Map();
 globalThis.window=new EventTarget();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const w=make();const row={id,user_id:owner,title:'Jannik Sinner',watch_definition:definitionFromWatch(w),monitoring_source:w.monitoringSource,monitoring_state:'paused',current_status:'paused',media_revision:1,deleted_at:null};
 let authenticated=true;const auth={getState:()=>({status:authenticated?'authenticated':'anonymous',session:{user:{id:owner},access_token:'synthetic-only'}}),subscribe:()=>()=>{}};const calls=[];let release;
 globalThis.fetch=async(path,options)=>{
  calls.push({path,options});if(path==='/api/media-watches'&&(!options.method||options.method==='GET')){
   // Exercise the real owner-filtered GET projection, not an overcomplete mock row.
   let columns,body,status;const query={select:value=>{columns=value.split(',');return query;},eq:(key,value)=>{if(key==='user_id')assert.equal(value,owner);else assert.equal(value,'media_news');return query;},order:()=>query,range:async()=>({data:[Object.fromEntries(Object.entries(row).filter(([key])=>columns.includes(key)))],error:null})};
   await createMediaWatchMiddleware({env:{},authenticate:async()=>({user:{id:owner},client:{from:table=>{assert.equal(table,'watches');return query;}}})})({url:path,method:'GET'}, {setHeader(){},set statusCode(value){status=value;},end:value=>{body=JSON.parse(value);}});
   assert.equal(status,200);assert.equal(body.watches[0].user_id,owner);return Response.json(body);
  }
  assert.equal(path,'/api/media-watches?action=check');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer synthetic-only');assert.deepEqual(JSON.parse(options.body),{id,revision:Number(row.media_revision)});
  if(!immediate)await new Promise(r=>release=r);if(checkConflict)return Response.json({code:'MEDIA_CONFLICT'},{status:409});if(networkFailure)throw new TypeError('synthetic fetch failure');return deny?Response.json({code:'STRUCTURED_FEATURE_UNAVAILABLE'},{status:403}):Response.json({outcome:'baseline',matchedItems:[],newItems:[],changes:{status:'paused'}});
 };
 t.after(async()=>{await configureMediaWatchServerStore(null);for(const[k,v]of Object.entries(originals))if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 await configureMediaWatchServerStore(auth);let current=migrateWatchModel(getMediaServerWatches()[0]).watch;assert(current);const before=structuredClone(current);
 const controller=createWatchCheckController({getWatch:()=>current,saveWatch:(_id,changes)=>current={...current,...changes},checkStoredWatch:watch=>canCheckStoredMediaWatch(watch)?checkStoredMediaWatch(watch):null,requestCheck:()=>assert.fail('No legacy fallback')});
 const {document}=parseHTML('<button type="button">Check now</button><p role="status" hidden></p>');
 const button=document.querySelector('button'),feedback=document.querySelector('p');
 const ui=install({watch:current,current:()=>current,feedback,checkNowEl:button,watchCheckController:controller,canCheckStoredMediaWatch,MonitoringCheckError},canManuallyCheckWatch,manualCheckIssue,getMonitoringFailureMessageKey);
 return {button,ui,calls,before,signOutLocally:()=>{authenticated=false;},replaceWatch:value=>{current=value;},queuePending:()=>localStorage.setItem(`watchAssistant.mediaSync.${owner}.${id}`,JSON.stringify({pending:true,definition:{id}})),current:()=>current,refresh:async(changes={})=>{Object.assign(row,changes);assert.deepEqual(await synchronizeMediaWatches({readOnly:true}),{ok:true});current=migrateWatchModel(mergeMediaWatches([current])[0]).watch;},release:async()=>{for(let n=0;n<50&&!release;n++)await new Promise(r=>setImmediate(r));assert(release);release();}};
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
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,0);assert.deepEqual(h.current(),h.before);assert.equal(h.ui.feedback.hidden,false);assert.equal(h.ui.feedback.textContent,'detail.checkFailure.authentication');
});

test('controller-only in-flight check disables render and produces progress feedback without dispatch',async()=>{
 const w=make(),{document}=parseHTML('<button type="button">Check now</button><p hidden></p>');const button=document.querySelector('button'),feedback=document.querySelector('p');let checks=0;
 install({watch:w,feedback,checkNowEl:button,watchCheckController:{isChecking:()=>true,check:()=>{checks++;}},canCheckStoredMediaWatch:()=>true,MonitoringCheckError},canManuallyCheckWatch,manualCheckIssue,getMonitoringFailureMessageKey);
 assert.equal(button.disabled,true);await button.onclick();assert.equal(checks,0);assert.equal(feedback.hidden,false);assert.equal(feedback.textContent,'detail.checkingForUpdates');
});
for(const [name,value,key]of[
 ['Watch disappeared',null,'detail.notFoundCopy'],
 ['invalid revision',{...make(),mediaPersistence:{ownerId:owner,revision:0}},'detail.checkFailure.edited'],
 ['missing id',{...make(),id:''},'detail.notFoundCopy'],
])test(`${name} after render gives feedback instead of silently returning`,async t=>{
 const h=await setup(t);assert.equal(h.button.disabled,false);h.replaceWatch(value);await h.button.onclick();assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,0);assert.equal(h.ui.feedback.hidden,false);assert.equal(h.ui.feedback.textContent,key);
});
test('DOM click on enabled Jannik control sends exactly one authenticated check',async t=>{
 const h=await setup(t);assert.equal(h.button.disabled,false);h.button.click();h.button.click();await h.release();
 for(let n=0;n<50&&h.button.disabled;n++)await new Promise(r=>setImmediate(r));
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,1);assert.equal(h.ui.failed(),null);assert.equal(h.button.disabled,false);assert.equal(h.current().status,'paused');assert.equal(h.current().serverReadOnly,true);
});
test('network failure is caught without duplicate dispatch or legacy fallback',async t=>{
 const h=await setup(t,{networkFailure:true});const promise=h.button.onclick();await h.release();await promise;assert.equal(h.ui.failed(),id);assert.equal(h.button.disabled,false);assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,1);
});
test('stale revision and persistence errors retain useful categories instead of temporary-network copy',()=>{
 assert.equal(getMonitoringFailureMessageKey('MEDIA_CONFLICT'),'detail.checkFailure.edited');assert.equal(getMonitoringFailureMessageKey('PERSISTENCE_UNAVAILABLE'),'detail.checkFailure.persistence');
});

test('revision changed relative to synchronized row fails visibly categorized without a POST',async t=>{
 const h=await setup(t);h.replaceWatch({...h.current(),mediaPersistence:{ownerId:owner,revision:2}});await h.button.onclick();
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,0);assert.equal(h.ui.failed(),id);assert.equal(h.current().lastCheckAttempt.code,'MEDIA_CONFLICT');assert.equal(getMonitoringFailureMessageKey(h.current().lastCheckAttempt.code),'detail.checkFailure.edited');
});

test('authenticated GET projection includes ownership needed for Structured manual checks',async t=>{
 const h=await setup(t,{immediate:true});assert.equal((await checkStoredMediaWatch(h.current())).outcome,'baseline');
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,1);
});

for(const revision of [1,'1'])test(`DOM check after repeated GET refreshes uses authoritative revision ${typeof revision}`,async t=>{
 const h=await setup(t);const before=h.current();await h.refresh({media_revision:revision});await h.refresh();
 assert.notEqual(h.current(),before);assert.equal(h.current().mediaPersistence.revision,1);
 h.button.click();h.button.click();await h.release();for(let n=0;n<50&&h.button.disabled;n++)await new Promise(r=>setImmediate(r));
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,1);assert.equal(h.ui.failed(),null);
 assert.equal(h.current().status,'paused');assert.equal(h.current().serverReadOnly,true);assert.deepEqual(definitionFromWatch(h.current()),definitionFromWatch(before));
});
for(const revision of [undefined,null,0,'invalid'])test(`missing or invalid server revision ${revision} fails safely with feedback`,async t=>{
 const h=await setup(t);await h.refresh({media_revision:revision});await h.button.onclick();
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,0);assert.equal(h.ui.feedback.hidden,false);assert.equal(h.ui.feedback.textContent,'detail.checkFailure.edited');
});
test('stale local object conflicts until reconciled with changed authoritative revision',async t=>{
 const h=await setup(t,{immediate:true});const stale=h.current();await h.refresh({media_revision:2});
 await assert.rejects(checkStoredMediaWatch(stale),{code:'MEDIA_CONFLICT'});assert.equal(h.current().mediaPersistence.revision,2);
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,0);
});
test('foreign local owner is rejected before any check POST',async t=>{
 const h=await setup(t,{immediate:true});await assert.rejects(checkStoredMediaWatch({...h.current(),mediaPersistence:{ownerId:'other',revision:1}}),{code:'AUTH_REQUIRED'});
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,0);
});
test('API revision conflict remains MEDIA_CONFLICT with no retry',async t=>{
 const h=await setup(t,{checkConflict:true});const check=h.button.onclick();await h.release();await check;
 assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,1);assert.equal(h.current().lastCheckAttempt.code,'MEDIA_CONFLICT');assert.equal(h.current().status,'paused');
});

test('pending journal and missing local revision show feedback without a persistence write',async t=>{
 const h=await setup(t);h.replaceWatch({...h.current(),mediaPersistence:{ownerId:owner}});h.queuePending();await h.refresh();await h.button.onclick();
 assert.equal(h.ui.feedback.hidden,false);assert.equal(h.ui.feedback.textContent,'detail.checkFailure.edited');assert.equal(h.calls.some(c=>c.options.method==='POST'),false);
});
test('refreshed authoritative revision replaces the old object and is dispatched without hardcoding',async t=>{
 const h=await setup(t);await h.refresh({media_revision:2});const operation=h.button.onclick();await h.release();await operation;
 assert.equal(h.ui.failed(),null);assert.equal(h.calls.filter(c=>c.path.includes('action=check')).length,1);assert.equal(h.current().status,'paused');
});
test('unhydrated string local revision is rejected safely instead of dispatching uncertain state',async t=>{
 const h=await setup(t);h.replaceWatch({...h.current(),mediaPersistence:{ownerId:owner,revision:'1'}});await h.button.onclick();
 assert.equal(h.ui.feedback.hidden,false);assert.equal(h.ui.feedback.textContent,'detail.checkFailure.edited');assert.equal(h.calls.some(c=>c.options.method==='POST'),false);
});
