import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { fixture,individual,predicate } from '../../server/test-support/watch-interpretation-fixtures.js';
import { createStructuredWatchMiddleware } from '../../server/structured-watch-api.js';
register('./test-support/json-module-loader.js',import.meta.url);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await tick();}assert.fail('Form did not settle');};
const storage=()=>{const data={};Object.defineProperties(data,{getItem:{value:k=>data[k]??null},setItem:{value:(k,v)=>data[k]=String(v)},removeItem:{value:k=>delete data[k]}});return data;};
for(const articleUrl of [false,true])test(articleUrl?'article URL bypasses selected Structured text interpretation and reaches existing executable story review':'actual creation form routes authorized opt-in through review/confirmation, without legacy planning or activation',async t=>{
 const originals=Object.fromEntries(['window','document','localStorage','sessionStorage','fetch','navigator','HTMLElement','Event'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const {window,document}=parseHTML(await readFile(new URL('../../new-watch.html',import.meta.url),'utf8'));
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value||'';},set(v){this._value=v;}});
 window.location={href:'https://synthetic.test/new-watch.html',search:'',pathname:'/new-watch.html',origin:'https://synthetic.test'};window.history={state:null,pushState(){},replaceState(){}};window.requestAnimationFrame=fn=>{fn();return 1;};window.cancelAnimationFrame=()=>{};window.getComputedStyle=()=>({lineHeight:'20',fontSize:'16',paddingTop:'8',paddingBottom:'8',borderTopWidth:'1',borderBottomWidth:'1',boxSizing:'border-box',minHeight:'48',maxHeight:'240'});
 for(const [k,v]of Object.entries({window,document,Event:window.Event,HTMLElement:window.HTMLElement,localStorage:storage(),sessionStorage:storage(),navigator:{language:'en',doNotTrack:'1'}}))Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const auth={getState:()=>({status:'authenticated',session:{user:{id:owner},access_token:'fixture-only'}}),subscribe:()=>()=>{}};
 const {configureAccountStorage}=await import('./account-storage.js');configureAccountStorage(auth);
 const creation=await import('./structured-watch-creation.js');creation.configureStructuredWatchCreation(auth);const ms=await import('./media-watch-server-store.js');
 t.after(async()=>{creation.configureStructuredWatchCreation(null);await ms.configureMediaWatchServerStore(null);configureAccountStorage(null);for(const[k,d]of Object.entries(originals)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 const suppliedUrl='https://www.lemonde.fr/societe/article/2026/10/18/a-limoges-la-colere-et-la-sideration-apres-l-incendie-qui-a-ravage-l-hotel-de-ville_6797159_3224.html';
 const request=articleUrl?suppliedUrl:'  Keep me updated on Jannik Sinner.  ',interpretation=articleUrl?null:fixture(request,[individual('s','Jannik Sinner','person')],[predicate('n','news_about',['s'])]);const calls=[];let persisted;
 const middleware=createStructuredWatchMiddleware({creationOnly:true,env:{SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)},authenticate:async()=>({user:{id:owner}}),serviceClient:{async rpc(name,p){assert.equal(name,'persist_structured_watch_v1');persisted=p;return {data:{id:p.p_id,ownerId:p.p_owner,mutationId:p.p_mutation,operation:p.p_operation,expectedRevision:p.p_revision,revision:1,definitionFingerprint:p.p_definition_fingerprint,payloadFingerprint:p.p_payload_fingerprint,monitoringState:'paused'}};}}});
 globalThis.fetch=async(path,options={})=>{calls.push(path);
  if(path==='/api/media-watches'){assert.notEqual(options.method,'POST');return Response.json({watches:[],emailEnabled:false});}
  if(articleUrl&&path==='/api/plan-watch?scope=migrated_routes')return Response.json({strategy:'media_story',connector:'media_story',country:null,identifier:suppliedUrl,confidence:0.9,needsClarification:false,clarificationQuestion:null});
  if(articleUrl&&path==='/api/page-title')return Response.json({title:'Incendie de l’hôtel de ville de Limoges',sourceUrl:suppliedUrl,siteName:'Le Monde',pageType:'news_article',contentAccessLimited:true,monitoringSource:{type:'rss',url:'https://news.google.com/rss/search?q=Limoges+incendie',discovery:'news-search',query:'Limoges incendie'}});
  if(path==='/api/plan-watch?mode=interpretation.v1'){assert.equal(JSON.parse(options.body).request,request);return Response.json({mode:'interpretation.v1',interpretation,executable:false});}
  assert.equal(path,'/api/structured-watches');let payload;const res={setHeader(){},end(raw){payload=JSON.parse(raw);}};await middleware({url:path,method:options.method,body:options.body?JSON.parse(options.body):undefined},res);return Response.json(payload,{status:res.statusCode});
 };
 await ms.configureMediaWatchServerStore(auth);const {initForm}=await import('./navigation.js');const form=document.querySelector('#newWatchForm');form.watchRequest=document.querySelector('[name="watchRequest"]');form.whyFollowing=document.querySelector('[name="whyFollowing"]');form.watchRequest.value=request;initForm();
 await until(()=>form.querySelector('[data-structured-opt-in]'));form.querySelector('[data-structured-opt-in]').checked=true;form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));if(articleUrl){
  try{await until(()=>document.querySelector('#urlReviewCreate')&&!document.querySelector('#urlReviewCreate').disabled&&!document.querySelector('#urlReview').hidden);}catch(e){e.message+=JSON.stringify({calls,error:document.querySelector('#watchError')?.textContent,review:document.querySelector('#urlReview')?.textContent});throw e;}
  assert.equal(persisted,undefined);assert.equal(form.querySelector('[data-structured-review]'),null);assert.ok(calls.includes('/api/page-title'));
  assert.equal(calls.some(p=>p.includes('interpretation.v1')||p.includes('watch-suggestion')||p.includes('check')||p.includes('cron')),false);
  assert.ok(document.querySelector('#urlReview').textContent.includes('Limoges'));return;
 }
 await until(()=>form.querySelector('[data-structured-review] button'));assert.equal(persisted,undefined);
 const panel=form.querySelector('[data-structured-review]');panel.querySelector('button').click();await until(()=>form.querySelector('[data-structured-review] a'));
 assert.equal(persisted.p_definition.request,request);assert.equal(persisted.p_definition.plan.criteria.edition,'GB:en');assert.equal(calls.filter(p=>p.includes('plan-watch')).length,1);assert.ok(calls.every(p=>!p.includes('check')&&!p.includes('cron')));assert.match(form.querySelector('[data-structured-review]').textContent,/Monitoring is not active/);assert.equal(window.location.href,'https://synthetic.test/new-watch.html');
});
