import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { reviewCreateExtraction } from './create-contract-bridge.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';
register('../src/js/test-support/json-module-loader.js',import.meta.url);
const storage=()=>{const data={};Object.defineProperties(data,{getItem:{value:k=>data[k]??null},
  setItem:{value:(k,v)=>data[k]=String(v)},removeItem:{value:k=>delete data[k]}});return data;};

for(const url of [false,true])test(`actual New Watch form: opt-in ${url?'URL':'currency'} reaches capability review before legacy routing`,async t=>{
  const keys=['window','document','localStorage','sessionStorage','fetch','navigator','HTMLElement','Event'];
  const prior=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const {window,document}=parseHTML(await readFile(new URL('../new-watch.html',import.meta.url),'utf8'));
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value||'';},set(v){this._value=v;}});
  window.HTMLElement.prototype.scrollIntoView=()=>{};
  window.location={href:'https://synthetic.test/new-watch.html',search:'',pathname:'/new-watch.html',origin:'https://synthetic.test'};
  window.history={state:null,pushState(){},replaceState(){}};window.requestAnimationFrame=fn=>{fn();return 1;};window.cancelAnimationFrame=()=>{};
  window.getComputedStyle=()=>({lineHeight:'20',fontSize:'16',paddingTop:'8',paddingBottom:'8',borderTopWidth:'1',borderBottomWidth:'1',boxSizing:'border-box',minHeight:'48',maxHeight:'240'});
  for(const[k,v]of Object.entries({window,document,Event:window.Event,HTMLElement:window.HTMLElement,
    localStorage:storage(),sessionStorage:storage(),navigator:{language:'en',doNotTrack:'1'}}))Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const auth={getState:()=>({status:'authenticated',session:{user:{id:owner},access_token:'fixture-only'}}),subscribe:()=>()=>{}};
  const {configureAccountStorage}=await import('../src/js/account-storage.js');configureAccountStorage(auth);
  const creation=await import('../src/js/structured-watch-creation.js');creation.configureStructuredWatchCreation(auth);
  t.after(()=>{creation.configureStructuredWatchCreation(null);configureAccountStorage(null);
    for(const[k,d]of Object.entries(prior)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
  const request=url?'https://www.bbc.com/news/topics/c6vgy427vxklt':'Tell me when GBP/EUR goes above 1.17.';
  let output=null;
  if(!url){
    const v=fixture(request,[{...individual('a','GBP','currency'),canonicalCode:'GBP'},{...individual('b','EUR','currency'),canonicalCode:'EUR'}],
      [{...predicate('n','numeric',['a','b'],'exchange_rate'),operator:'gt',amount:'1.17',unit:'EUR'}],{domain:'currency',intent:'numeric_condition'});
    const {originalRequest,...o}=v;o.evidence=o.evidence.map(({path,text})=>({path,quote:text,context:null}));output=o;
  }
  const calls=[];
  globalThis.fetch=async(path,options={})=>{
    calls.push(path);
    if(path==='/api/structured-watches'){assert.equal(options.method,'GET');return Response.json({enabled:true,createCoreEnabled:true,monitoringEnabled:true});}
    assert.equal(path,'/api/plan-watch?mode=create-core.v1','Legacy URL/currency/discovery path must not run');
    assert.equal(JSON.parse(options.body).operation,'create');
    return Response.json(reviewCreateExtraction(output,request));
  };
  const {initForm}=await import('../src/js/navigation.js');
  const form=document.querySelector('#newWatchForm');form.watchRequest=document.querySelector('[name="watchRequest"]');
  form.whyFollowing=document.querySelector('[name="whyFollowing"]');form.watchRequest.value=request;initForm();
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  let panel;
  for(let i=0;i<150;i++){panel=form.querySelector('[data-structured-review]');if(panel)break;await new Promise(resolve=>setImmediate(resolve));}
  assert(panel,JSON.stringify(calls));assert(panel.textContent.includes(request));
  assert.match(panel.textContent,url?/cannot be monitored yet/:/Please clarify/);
  assert.equal(document.querySelector('#watchError').textContent,'');
  assert.equal(panel.querySelectorAll('button').length,2);assert.equal(calls.filter(p=>p.includes('plan-watch')).length,1);
});
