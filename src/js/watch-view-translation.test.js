import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {localWatchStorageKey, configureAccountStorage} from './account-storage.js';
import {initStructuredEmailPreference} from './structured-email-preference.js';
import {definitions} from '../../server/test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from './watch-definition.js';
register('./test-support/json-module-loader.js',import.meta.url);
const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const storage=()=>{const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
const tick=()=>new Promise(r=>setImmediate(r));

test('actual viewing renderer, hydration, language and preference interactions never translate',async t=>{
 const globals=['window','document','localStorage','sessionStorage','Event','CustomEvent','navigator','fetch'];const previous=Object.fromEntries(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 // Keep real detail markup; static i18n labels are covered separately.
 const markup=(await readFile(new URL('../../watch-detail.html',import.meta.url),'utf8')).replace(/ data-i18n(?:-[a-z-]+)?="[^"]*"/g,'');
 const {window,document}=parseHTML(markup);
 const queued=[];const events=new Map();
 Object.defineProperty(globalThis,'window',{value:window,configurable:true,writable:true});globalThis.document=document;globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.Event=window.Event;globalThis.CustomEvent=window.CustomEvent;
 Object.defineProperty(globalThis,'navigator',{value:{language:'en'},configurable:true});
 window.location={href:'https://offline.example.test/watch-detail.html?id='+id,search:'?id='+id,pathname:'/watch-detail.html'};
 window.history={replaceState(){}};window.scrollTo=()=>{};
 // Advance any window timers explicitly: the removed 200ms queue would execute
 // here and hit the counted, mocked translation route below.
 window.setTimeout=fn=>(queued.push(fn),queued.length);window.clearTimeout=()=>{};
 let translationRequests=0,providerCalls=0,otherNetwork=0;
 globalThis.fetch=async url=>{if(String(url)==='/api/watch-translation'){translationRequests++;providerCalls++;return Response.json({title:'Unexpected mock translation',summary:'Unexpected'});}otherNetwork++;throw Error('External request forbidden');};
 let state={status:'authenticated',session:{user:{id:'owner-a'}}};const subscribers=new Set();
 const auth={getState:()=>state,subscribe:fn=>(subscribers.add(fn),()=>subscribers.delete(fn))};
 configureAccountStorage(auth);
 const {getWatchById}=await import('./watch-storage.js');const {initApp}=await import('./navigation.js');const {setLanguage,t:translate}=await import('./i18n.js');
 const emitAuth=owner=>{state=owner?{status:'authenticated',session:{user:{id:owner}}}:{status:'anonymous'};subscribers.forEach(fn=>fn(state));};
 const flush=async()=>{for(let i=0;i<30&&queued.length;i++){const fn=queued.shift();await fn();await tick();}assert.equal(queued.length,0);await tick();};
 const original={id,title:'Original custom tennis title',inputType:'text',category:'news',request:'Jannik Sinner',status:'paused',monitoringState:'paused',monitoringSummary:'Original publisher-independent summary',createdAt:'2026-10-16T00:00:00Z',mediaMention:{subjects:['Jannik Sinner'],matchMode:'all'},monitoringSource:{type:'feed',url:'https://example.test/feed'}};
 let preference={mode:'daily_digest',enabled:false,version:'daily-digest.v1'},fail=false;const calls=[];
 const client={rpc:async(name,p)=>{calls.push(name);if(name.startsWith('get_'))return{data:{...preference}};if(fail)return{error:{message:'PRIVATE'}};preference={mode:p.p_mode,enabled:p.p_enabled,version:'daily-digest.v1'};return{data:{...preference}};}};
 const addWatch=watch=>localStorage.setItem(localWatchStorageKey('watchAssistant.watches'),JSON.stringify([watch]));
 let control;
 try{
  addWatch(original);initApp();await flush();
  const title=()=>document.querySelector('#watchTitle').textContent;
  await t.test('legacy original and alternate language; repeat hydration and reload',async()=>{
   for(const language of ['en','fr','en','fr']){setLanguage(language,{persist:false});await flush();assert.equal(title(),original.title);}
   initApp();await flush();assert.equal(title(),original.title);assert.equal(translationRequests,0);
  });
  await t.test('valid stored translation reused, stale translation falls back without saving copy',async()=>{
   addWatch({...original,localizedCopy:{fr:{sourceTitle:original.title,sourceSummary:original.monitoringSummary,title:'Titre déjà enregistré',summary:'Résumé déjà enregistré'}}});window.dispatchEvent(new Event('storage'));setLanguage('fr',{persist:false});await flush();assert.equal(title(),'Titre déjà enregistré');assert.equal(getWatchById(id).title,original.title);
   addWatch({...original,localizedCopy:{fr:{sourceTitle:'Old title',sourceSummary:original.monitoringSummary,title:'Stale translation',summary:'Old'}}});window.dispatchEvent(new Event('storage'));await flush();assert.equal(title(),original.title);
  });
  await t.test('Structured Media displays original title without translation',async()=>{
   const definition=definitions()[0];addWatch({...original,...definition,id,title:original.title,inputType:'text',status:'paused',monitoringState:'paused',monitoringSource:structuredMonitoringSource(definition.plan.criteria)});window.dispatchEvent(new Event('storage'));await flush();assert.equal(title(),original.title);
  });
  await t.test('management panel and Off/Daily/Immediately saves, errors and reload are translation-free',async()=>{
   const root=document.querySelector('#email-notifications');control=initStructuredEmailPreference({root,client,auth,location:window.location,t:translate,digestEnabled:true});await tick();assert(!root.hidden);
   const select=root.querySelector('select');
   for(const mode of ['off','daily_digest','immediate']){for(const option of select.options)option.selected=false;[...select.options].find(o=>o.value===mode).selected=true;select.dispatchEvent(new Event('change'));await tick();await control.refresh();await flush();assert.equal(preference.mode,mode);assert.equal(preference.enabled,false);assert.equal(title(),original.title);}
   fail=true;root.querySelector('input').checked=true;root.querySelector('input').dispatchEvent(new Event('change'));await tick();assert(!root.querySelector('input').checked);assert(root.textContent.includes(translate('detail.emailSaveFailed')));fail=false;
   for(const language of ['en','fr']){setLanguage(language,{persist:false});control.render();await flush();assert(root.textContent.includes(translate('detail.emailFrequencyDaily')));}
   control.destroy();control=initStructuredEmailPreference({root,client,auth,location:window.location,t:translate,digestEnabled:true});await tick();assert.equal(root.querySelector('select').value,'immediate');assert.equal(providerCalls,0);
  });
  await t.test('switch accounts and logout cannot display another owner stored translation',async()=>{
   addWatch({...original,localizedCopy:{fr:{sourceTitle:original.title,sourceSummary:original.monitoringSummary,title:'Private owner A translation',summary:'A'}}});setLanguage('fr',{persist:false});await flush();assert.equal(title(),'Private owner A translation');
   emitAuth('owner-b');await flush();assert(!title().includes('Private owner A'));addWatch({...original,title:'Owner B original title'});window.dispatchEvent(new Event('storage'));await flush();assert.equal(title(),'Owner B original title');emitAuth(null);await flush();assert(!title().includes('Owner B'));assert(document.querySelector('#email-notifications').hidden);
  });
  assert.equal(translationRequests,0);assert.equal(providerCalls,0);assert.equal(otherNetwork,0);assert(calls.includes('set_media_watch_email_policy'));t.diagnostic('Ordinary viewing: translation endpoint requests=0; provider mock calls=0; external requests=0.');
 }finally{control?.destroy();configureAccountStorage(null);for(const[k,d]of Object.entries(previous)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});

test('view entry point cannot schedule or import automatic translation transport',async()=>{
 const navigation=await readFile(new URL('./navigation.js',import.meta.url),'utf8');assert.doesNotMatch(navigation,/translateStoredWatchCopy|scheduleWatchTranslations|watchTranslationTimer|\/api\/watch-translation/);
 const source=await readFile(new URL('./structured-email-preference.js',import.meta.url),'utf8');assert.doesNotMatch(source,/translateStoredWatchCopy|\/api\/watch-translation|api\.openai/);
});
