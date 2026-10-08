import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
register('./test-support/json-module-loader.js', import.meta.url);
const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async predicate => { for(let i=0;i<100;i++) { if(predicate())return; await tick(); } assert.fail('Form did not settle'); };
const storage = () => {
  const values = {};
  Object.defineProperties(values, { getItem:{value:k=>values[k]??null},setItem:{value:(k,v)=>{values[k]=String(v);}},removeItem:{value:k=>{delete values[k];}} });
  return values;
};
for(const policy of ['crossing','daily']) for(const failSave of [false,true]) test(`actual currency form: ${policy}, persistence ${failSave?'fails recoverably':'before activation'}`, async t=>{
  const originals=Object.fromEntries(['window','document','localStorage','sessionStorage','fetch','navigator','HTMLElement','Event'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const {window,document}=parseHTML(await readFile(new URL('../../new-watch.html',import.meta.url),'utf8'));
  const local=storage(); const events=[]; let rows=[]; let releaseSave;
  window.location={href:'https://synthetic.test/new-watch.html',search:'',pathname:'/new-watch.html',origin:'https://synthetic.test'};
  window.history={state:null,pushState(){},replaceState(){}};
  window.requestAnimationFrame=fn=>{fn();return 1;};window.cancelAnimationFrame=()=>{};
  window.getComputedStyle=()=>({lineHeight:'20',fontSize:'16',paddingTop:'8',paddingBottom:'8',borderTopWidth:'1',borderBottomWidth:'1',boxSizing:'border-box',minHeight:'48',maxHeight:'240'});
  // linkedom's select only exposes a getter; browser selection is writable.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value||'';},set(v){this._value=v;}});
  for(const [k,v] of Object.entries({window,document,Event:window.Event,HTMLElement:window.HTMLElement,localStorage:local,sessionStorage:storage(),navigator:{language:'en',doNotTrack:'1'}}))Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
  const owner=`form-${policy}-${failSave}`;
  const auth={getState:()=>({status:'authenticated',session:{user:{id:owner},access_token:'synthetic'}}),subscribe:()=>()=>{}};
  const {configureAccountStorage,localWatchStorageKey}=await import('./account-storage.js');configureAccountStorage(auth);
  const ms=await import('./media-watch-server-store.js');
  globalThis.fetch=async(path,options={})=>{
    if(path==='/api/media-watches') {
      if(options.method==='POST') {
        const job=JSON.parse(options.body);events.push(['persist',job]);
        await new Promise(resolve=>{releaseSave=resolve;});
        if(failSave)return Response.json({code:'DATABASE_ERROR'},{status:503});
        rows=[{...job.definition,media_revision:1,media_mutation_id:job.mutation,current_status:'watching',created_at:new Date().toISOString()}];
        events.push(['ack']);return Response.json({watch:rows[0]});
      }
      return Response.json({watches:rows,emailEnabled:false});
    }
    if(path==='/api/media-watches?action=check') {
      events.push(['check',JSON.parse(options.body)]);assert.ok(events.some(e=>e[0]==='ack'));
      return Response.json({checkedAt:new Date().toISOString(),items:[],outcome:'currency-not-met',currencyObservation:{base:'EUR',quote:'GBP',rate:'0.9',date:'2026-10-07'}});
    }
    throw Error(`Unexpected request ${path}`);
  };
  t.after(async()=>{await ms.configureMediaWatchServerStore(null);for(const[k,d]of Object.entries(originals)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
  await ms.configureMediaWatchServerStore(auth);
  const {initForm}=await import('./navigation.js');
  const form=document.querySelector('#newWatchForm');form.watchRequest=document.querySelector('[name="watchRequest"]');form.whyFollowing=document.querySelector('[name="whyFollowing"]');
  form.watchRequest.value='Notify me whenever the pound changes and one pound is worth more than 1.17 euros.';
  initForm();form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>document.querySelector('[data-currency-review]'));
  const panel=document.querySelector('[data-currency-review]');const select=panel.querySelector('select');select.value=policy;select.dispatchEvent(new window.Event('change'));
  panel.querySelector('button').click();
  await until(()=>releaseSave);
  const retained=JSON.parse(local.getItem(localWatchStorageKey('watchAssistant.watches')));assert.equal(retained.length,1);
  const job=events.find(e=>e[0]==='persist')[1];assert.equal(job.definition.watch_definition.currencyPolicy,policy);
  assert.match(job.definition.watch_definition.currencyRevision,/^[0-9a-f-]{36}$/);
  assert.equal(retained[0].currencyRevision,job.definition.watch_definition.currencyRevision);
  assert.equal(events.filter(e=>e[0]==='check').length,0);
  releaseSave();await until(()=>String(window.location.href).includes('watch-detail.html') || String(window.location.href).endsWith('index.html'));
  const saved=JSON.parse(local.getItem(localWatchStorageKey('watchAssistant.watches')))[0];
  assert.equal(saved.id,retained[0].id);assert.equal(saved.currencyRevision,retained[0].currencyRevision);
  if(failSave){assert.equal(events.filter(e=>e[0]==='check').length,0);assert.equal(ms.getMediaPersistenceState(saved).status,'failed');assert.equal(saved.request,form.watchRequest.value);}
  else {assert.equal(events.filter(e=>e[0]==='check').length,1);assert.equal(rows[0].id,saved.id);}
});
