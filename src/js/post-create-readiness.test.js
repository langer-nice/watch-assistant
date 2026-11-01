import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import {initStructuredWatchCreation,configureStructuredWatchCreation} from './structured-watch-creation.js';
import {confirmCreatedMediaWatchRead} from './media-watch-server-store.js';
import {readWatchCache} from './watch-server-resilience.js';
import {mapMediaReportRow} from './media-watch-row.js';
import {isWatchCreationTransition,watchCreationCopy} from './watch-creation-presentation.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',other='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const original='Keep me updated on important developments concerning Blackburn Rovers football club';
const row=()=>({id,user_id:owner,title:'Blackburn Rovers developments',created_at:'2026-11-01T12:00:00Z',type:'media_news',deleted_at:null,monitoring_state:'monitoring',current_status:'watching',v3Engine:'wa-v3-evidence-refs.v1',media_revision:1,watch_definition:{inputType:'url',request:original,category:'news',storyProfile:{concepts:[{label:'Blackburn Rovers',type:'condition'}],userAddedConcepts:[]}},monitoring_source:{type:'feed',url:'https://example.test/feed'},last_checked_at:'2026-11-01T12:00:00Z',last_check_outcome:'baseline',media_watch_snapshots:{checked_at:'2026-11-01T12:00:00Z',baseline_at:'2026-11-01T12:00:00Z',items:[],item_ids:[],initial_items:[]}});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const tick=()=>new Promise(r=>setImmediate(r));
const until=async f=>{for(let n=0;n<100;n++){if(f())return;await tick();}assert.fail('fixture did not reach state');};
const setup=(t,{response=()=>Response.json({watches:[row()]}),createError=false,cacheBlocked=false}={})=>{
 const old={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch,localStorage:globalThis.localStorage};
 const {document}=parseHTML('<form><textarea></textarea><button id="newWatchSubmit"><span id="newWatchSubmitLabel">Create Watch</span></button><p aria-live="polite"></p></form>');globalThis.document=document;
 let href='',navigations=0,current=true,language='en',releaseCreate,releaseRead;
 globalThis.window={location:{get href(){return href;},set href(v){navigations++;href=v;}}};globalThis.localStorage=cacheBlocked?{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}:memory();
 const createHold=new Promise(r=>releaseCreate=r),readHold=new Promise(r=>releaseRead=r),calls=[];
 const form=document.querySelector('form'),input=document.querySelector('textarea'),button=document.querySelector('button'),status=document.querySelector('p');input.value=original;
 configureStructuredWatchCreation({getState:()=>({status:'authenticated',session:{user:{id:owner},access_token:'fixture-only'}})});
 globalThis.fetch=async(path,options)=>{calls.push({path,options});assert.equal(path,'/api/media-watches');assert.equal(options.method||'GET','GET');assert.equal(options.headers.Authorization,'Bearer fixture-only');await readHold;return response();};
 const controller=initStructuredWatchCreation({form,input,error:status,getLanguage:()=>language,isCurrent:()=>current,listen:(n,e,f,o)=>n?.addEventListener(e,f,o),uuid:()=>id,fetchImpl:async(path,options)=>{
  calls.push({path,options});if(path==='/api/structured-watches')return Response.json({enabled:true,v3Create:true});assert.equal(path,'/api/v3-pilot');await createHold;return createError?Response.json({code:'V3_CREATION_UNAVAILABLE'},{status:503}):Response.json({status:'READY_TO_MONITOR',id,engine:'wa-v3-evidence-refs.v1'});
 }});
 t.after(()=>{Object.assign(globalThis,old);configureStructuredWatchCreation(null);});
 return {controller,form,input,button,status,calls,releaseCreate,releaseRead,invalidate:()=>{current=false;},changeLanguage:()=>{language='fr';document.dispatchEvent(new document.defaultView.Event('i18n:languageChanged'));},href:()=>href,navigations:()=>navigations};
};

test('existing POST, one existing list read, cache-ready detail, exactly one navigation',async t=>{
 const h=setup(t),work=h.controller.runV3(original,'en');await until(()=>h.calls.length===2);
 assert.equal(h.href(),'');assert.deepEqual(JSON.parse(h.calls[1].options.body),{instruction:original,watchId:id,captureKind:'FREE_TEXT'});
 h.releaseCreate();await until(()=>h.calls.length===3);assert.equal(h.href(),'');assert.equal(h.button.disabled,true);assert.equal(h.button.getAttribute('aria-busy'),'true');assert.equal(h.button.querySelector('.watch-creation-spinner').hidden,false);assert.equal(h.input.readOnly,true);
 const duplicate=new document.defaultView.Event('submit',{bubbles:true,cancelable:true});h.form.dispatchEvent(duplicate);assert.equal(duplicate.defaultPrevented,true);
 await h.controller.runV3(original,'en');assert.equal(h.calls.length,3);
 h.releaseRead();await work;
 assert.equal(h.href(),'watch-detail.html?id='+id);assert.equal(h.navigations(),1);assert.equal(h.calls.filter(x=>x.path==='/api/media-watches').length,1);
 const cached=readWatchCache('media',owner,x=>x);assert.ok(cached.rows.some(x=>x.id===id));assert.equal(mapMediaReportRow(cached.rows.find(x=>x.id===id),owner).request,original);
 assert.equal(isWatchCreationTransition({id,found:true,availability:{active:true},storage:memory()}),false);
});

for(const [name,options] of [
 ['expired auth response',{response:()=>Response.json({code:'INVALID_SESSION'},{status:401})}],
 ['HTTP failure',{response:()=>Response.json({code:'DATABASE_ERROR'},{status:503})}],
 ['missing ID',{response:()=>Response.json({watches:[]})}],
 ['deleted ID',{response:()=>Response.json({watches:[{...row(),deleted_at:'2026-11-01T12:00:00Z'}]})}],
 ['foreign account',{response:()=>Response.json({watches:[{...row(),user_id:other}]})}],
 ['malformed list',{response:()=>Response.json({watches:null})}],
 ['invalid row',{response:()=>Response.json({watches:[{id,user_id:owner}]})}],
 ['network failure',{response:()=>{throw TypeError('offline');}}],
 ['cache cannot carry row across navigation',{cacheBlocked:true}],
])test(`confirmed creation + ${name}: truthful terminal waiting, one read, no retry`,async t=>{
 const h=setup(t,options),work=h.controller.runV3(original,'en');await until(()=>h.calls.length===2);h.releaseCreate();await until(()=>h.calls.length===3);h.releaseRead();await work;
 assert.equal(h.href(),'');assert.equal(h.navigations(),0);assert.equal(h.input.value,original);assert.equal(h.button.disabled,true);assert.equal(h.button.querySelector('.watch-creation-spinner').hidden,false);
 assert.equal(h.status.textContent,'Your Watch was created, but it is taking a little longer to open. Please return to All Watches in a moment.');assert.equal(h.status.getAttribute('role'),'status');assert.equal(h.status.getAttribute('aria-live'),'polite');assert.doesNotMatch(h.status.textContent,/Watch not found|Creation failed|creating again|automatically/i);
 await h.controller.runV3(original,'en');h.input.value='Another request';await h.controller.runV3(h.input.value,'en');await tick();await tick();
 assert.equal(h.calls.filter(x=>x.path==='/api/v3-pilot').length,1);assert.equal(h.calls.filter(x=>x.path==='/api/media-watches').length,1);
});

test('genuine create failure does not issue readiness read or claim creation succeeded',async t=>{
 const h=setup(t,{createError:true}),work=h.controller.runV3(original,'en');await until(()=>h.calls.length===2);h.releaseCreate();await work;
 assert.equal(h.calls.length,2);assert.equal(h.href(),'');assert.equal(h.input.value,original);assert.equal(h.button.disabled,false);assert.match(h.status.textContent,/Creation could not be confirmed/);assert.doesNotMatch(h.status.textContent,/was created/);
});

test('account/editor changes during the one read cannot cache or navigate',async t=>{
 const h=setup(t),work=h.controller.runV3(original,'en');await until(()=>h.calls.length===2);h.releaseCreate();await until(()=>h.calls.length===3);h.invalidate();h.releaseRead();await work;
 assert.equal(h.href(),'');assert.equal(readWatchCache('media',owner,x=>x),null);assert.equal(h.calls.length,3);
});

test('a throwing confirmation cannot be mapped to create failure or repeated',async t=>{
 // The real reader already catches transport/validation failures; preserve that
 // boundary even for a failed injected adapter.
 const h=setup(t,{response:()=>{throw Error('read adapter');}}),work=h.controller.runV3(original,'en');await until(()=>h.calls.length===2);h.releaseCreate();await until(()=>h.calls.length===3);h.releaseRead();await work;assert.match(h.status.textContent,/Your Watch was created/);
});

test('direct detail absence semantics unchanged; no new timer/retry loop in confirmation',async()=>{
 assert.equal(isWatchCreationTransition({id:'invalid',found:false,availability:{active:true},storage:memory()}),false);
 const source=await readFile(new URL('./media-watch-server-store.js',import.meta.url),'utf8');const method=source.slice(source.indexOf('export const confirmCreatedMediaWatchRead'),source.indexOf('// An older browser-only Watch'));
 assert.equal((method.match(/await read\(/g)||[]).length,1);assert.doesNotMatch(method,/setInterval\(|setTimeout\(|refreshSession|synchronizeMediaWatches\(|for\s*\(|while\s*\(/);
 assert.equal(watchCreationCopy('fr').createdWaiting,'Votre Watch a été créée, mais son ouverture prend un peu plus de temps. Revenez à Toutes les Watches dans un instant.');
});


test('language change during confirmation retains known creation and does not unlock a second submit',async t=>{
 const h=setup(t),work=h.controller.runV3(original,'en');await until(()=>h.calls.length===2);h.releaseCreate();await until(()=>h.calls.length===3);h.changeLanguage();h.releaseRead();await work;
 assert.equal(h.href(),'');assert.equal(h.button.disabled,true);assert.match(h.status.textContent,/Votre Watch a été créée/);assert.equal(readWatchCache('media',owner,x=>x),null);
 await h.controller.runV3(original,'fr');assert.equal(h.calls.length,3);
});
