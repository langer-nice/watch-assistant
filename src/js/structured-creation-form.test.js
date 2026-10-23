import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { fixture,individual,predicate } from '../../server/test-support/watch-interpretation-fixtures.js';
import { createMonitoringSourceMiddleware } from '../../server/monitoring-source-api.js';
import { createStructuredWatchMiddleware } from '../../server/structured-watch-api.js';
import { planWatch } from '../../server/watch-planner.js';
register('./test-support/json-module-loader.js',import.meta.url);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await tick();}assert.fail('Form did not settle');};
const storage=()=>{const data={};Object.defineProperties(data,{getItem:{value:k=>data[k]??null},setItem:{value:(k,v)=>data[k]=String(v)},removeItem:{value:k=>delete data[k]}});return data;};
for(const kind of ['news','news-pending','news-interpreting','news-error','article','currency','company'])test(`single creation field: ${kind} uses its automatic route without an opt-in`,async t=>{
 const originals=Object.fromEntries(['window','document','localStorage','sessionStorage','fetch','navigator','HTMLElement','Event'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const {window,document}=parseHTML(await readFile(new URL('../../new-watch.html',import.meta.url),'utf8'));
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value||'';},set(v){this._value=v;}});
 window.location={href:'https://synthetic.test/new-watch.html',search:'',pathname:'/new-watch.html',origin:'https://synthetic.test'};window.history={state:null,pushState(){},replaceState(){}};window.requestAnimationFrame=fn=>{fn();return 1;};window.cancelAnimationFrame=()=>{};window.getComputedStyle=()=>({lineHeight:'20',fontSize:'16',paddingTop:'8',paddingBottom:'8',borderTopWidth:'1',borderBottomWidth:'1',boxSizing:'border-box',minHeight:'48',maxHeight:'240'});
 for(const [k,v]of Object.entries({window,document,Event:window.Event,HTMLElement:window.HTMLElement,localStorage:storage(),sessionStorage:storage(),navigator:{language:'en',doNotTrack:'1'}}))Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const auth={getState:()=>({status:'authenticated',session:{user:{id:owner},access_token:'fixture-only'}}),subscribe:()=>()=>{}};
 const {configureAccountStorage}=await import('./account-storage.js');configureAccountStorage(auth);
 const creation=await import('./structured-watch-creation.js');creation.configureStructuredWatchCreation(auth);const ms=await import('./media-watch-server-store.js');const cs=await import('./company-watch-server-store.js');
 t.after(async()=>{creation.configureStructuredWatchCreation(null);await ms.configureMediaWatchServerStore(null);await cs.configureCompanyWatchServerStore(null);configureAccountStorage(null);for(const[k,d]of Object.entries(originals)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 const suppliedUrl='https://www.lemonde.fr/societe/article/2026/10/18/a-limoges-la-colere-et-la-sideration-apres-l-incendie-qui-a-ravage-l-hotel-de-ville_6797159_3224.html';
 const articleUrl=kind==='article',isNews=kind.startsWith('news');
 const request=articleUrl?suppliedUrl:kind==='currency'?'Notify me whenever the pound changes and one pound is worth more than 1.17 euros.':kind==='company'?'CEMEX GRANULATS, SIREN 552005969.':'  Keep me updated on Jannik Sinner.  ';
 const interpretation=isNews?fixture(request,[individual('s','Jannik Sinner','person')],[predicate('n','news_about',['s'])]):null;
 const calls=[];let persisted,releaseAccess,releaseInterpretation;
 const accessHold=kind==='news-pending'?new Promise(resolve=>{releaseAccess=resolve;}):null;
 const interpretationHold=kind==='news-interpreting'?new Promise(resolve=>{releaseInterpretation=resolve;}):null;
 const middleware=createStructuredWatchMiddleware({creationOnly:true,env:{SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)},authenticate:async()=>({user:{id:owner}}),serviceClient:{async rpc(name,p){assert.equal(name,'persist_structured_watch_v1');persisted=p;return {data:{id:p.p_id,ownerId:p.p_owner,mutationId:p.p_mutation,operation:p.p_operation,expectedRevision:p.p_revision,revision:1,definitionFingerprint:p.p_definition_fingerprint,payloadFingerprint:p.p_payload_fingerprint,monitoringState:'paused'}};}}});
 globalThis.fetch=async(path,options={})=>{calls.push(path);
  if(path==='/api/media-watches'){assert.notEqual(options.method,'POST');return Response.json({watches:[],emailEnabled:false});}
  if(path==='/api/company-watches'){assert.notEqual(options.method,'POST');return Response.json({watches:[]});}
  if(path==='/api/plan-watch?scope=migrated_routes')return Response.json(await planWatch(JSON.parse(options.body).request,{companyOnly:true,includeMediaStory:true,discoverSource:()=>assert.fail('Deterministic route selection must not discover a source')}));
  if(articleUrl&&path==='/api/page-title')return Response.json({title:'Incendie de l’hôtel de ville de Limoges',sourceUrl:suppliedUrl,siteName:'Le Monde',pageType:'news_article',contentAccessLimited:true});
  if(articleUrl&&path==='/api/monitoring-source'){
   assert.equal(JSON.parse(options.body).storyDiscovery,true);
   const handler=createMonitoringSourceMiddleware({lookup:async()=>[{address:'8.8.8.8',family:4}],fetchImpl:async()=>new Response('<rss><channel><title>Fixture public news feed</title><item><guid>fixture-only</guid><title>Limoges</title><link>https://example.test/limoges</link></item></channel></rss>',{headers:{'content-type':'application/rss+xml'}})});
   let result;const response={setHeader(){},end(s){result=JSON.parse(s);}};await handler({url:path,method:'POST',body:JSON.parse(options.body)},response);return Response.json(result,{status:response.statusCode});
  }
  if(path==='/api/plan-watch?mode=interpretation.v1'){assert.equal(isNews,true);assert.equal(JSON.parse(options.body).request,request);if(interpretationHold)await interpretationHold;if(kind==='news-error')return Response.json({code:'AI_SERVICE_UNAVAILABLE'},{status:503});return Response.json({mode:'interpretation.v1',interpretation,executable:false});}
  assert.equal(path,'/api/structured-watches');if(options.method==='GET'&&accessHold)await accessHold;let payload;const res={setHeader(){},end(raw){payload=JSON.parse(raw);}};await middleware({url:path,method:options.method,body:options.body?JSON.parse(options.body):undefined},res);return Response.json(payload,{status:res.statusCode});
 };
 await ms.configureMediaWatchServerStore(auth);await cs.configureCompanyWatchServerStore(kind==='company'?auth:null);const {initForm}=await import('./navigation.js');const form=document.querySelector('#newWatchForm');form.watchRequest=document.querySelector('[name="watchRequest"]');form.whyFollowing=document.querySelector('[name="whyFollowing"]');form.watchRequest.value=request;initForm();
 const assertSimpleCreation=()=>{assert.equal(form.querySelector('[data-structured-opt-in]'),null);assert.equal(form.querySelector('[data-note-toggle]').hidden,true);assert.equal(document.querySelector('#watchReason').hidden,true);assert.equal(form.whyFollowing.disabled,true);};
 assertSimpleCreation();form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 if(accessHold){await until(()=>calls.includes('/api/plan-watch?scope=migrated_routes'));await tick();assert.equal(calls.some(path=>path.includes('interpretation.v1')),false);assert.equal(persisted,undefined);releaseAccess();}
 if(interpretationHold){
  await until(()=>calls.includes('/api/plan-watch?mode=interpretation.v1'));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(calls.filter(path=>path.includes('scope=migrated_routes')).length,1);assert.equal(calls.filter(path=>path.includes('interpretation.v1')).length,1);assert.equal(persisted,undefined);releaseInterpretation();
 }
 if(kind==='news-error'){
  await until(()=>/temporarily unavailable/.test(document.querySelector('#watchError').textContent));
  assertSimpleCreation();assert.equal(form.watchRequest.value,request);assert.equal(persisted,undefined);assert.equal(form.querySelector('[data-structured-review]'),null);
  assert.equal(calls.filter(path=>path.includes('interpretation.v1')).length,1);assert.equal(calls.filter(path=>path.includes('scope=migrated_routes')).length,1);
  assert.equal(calls.some(path=>/watch-suggestion|clarif|check|cron/.test(path)),false);return;
 }
 if(kind==='currency'){
  await until(()=>form.querySelector('[data-currency-review]'));assertSimpleCreation();assert.equal(persisted,undefined);
  assert.ok(form.querySelector('[data-currency-review]').textContent.includes(request));assert.ok(form.querySelector('[data-currency-review] select'));
  assert.equal(form.querySelector('[data-structured-review]'),null);assert.equal(calls.some(path=>path.includes('plan-watch')||/watch-suggestion|check|cron/.test(path)),false);return;
 }
 if(kind==='company'){
  await until(()=>document.querySelector('#urlReview').hidden===false&&!document.querySelector('#urlReviewCreate').disabled);assertSimpleCreation();assert.equal(persisted,undefined);
  assert.equal(document.querySelector('#urlReviewTitle').value,'CEMEX GRANULATS');assert.match(document.querySelector('#urlReview').textContent,/552005969/);assert.match(document.querySelector('#urlReview').textContent,/BODACC/);
  assert.equal(form.querySelector('[data-structured-review]'),null);assert.equal(calls.filter(path=>path.includes('scope=migrated_routes')).length,1);
  assert.equal(calls.some(path=>path.includes('interpretation.v1')||/watch-suggestion|check-company|cron/.test(path)),false);return;
 }
 if(articleUrl){
  try{await until(()=>document.querySelector('#urlReviewCreate')&&!document.querySelector('#urlReviewCreate').disabled&&!document.querySelector('#urlReview').hidden);}catch(e){e.message+=JSON.stringify({calls,error:document.querySelector('#watchError')?.textContent,review:document.querySelector('#urlReview')?.textContent});throw e;}
  assertSimpleCreation();
  assert.equal(persisted,undefined);assert.equal(form.querySelector('[data-structured-review]'),null);assert.ok(calls.includes('/api/page-title'));assert.ok(calls.includes('/api/monitoring-source'));
  assert.equal(calls.some(p=>p.includes('interpretation.v1')||p.includes('watch-suggestion')||p.includes('check')||p.includes('cron')),false);
  assert.ok(document.querySelector('#urlReview').textContent.includes('Limoges'));return;
 }
 await until(()=>form.querySelector('[data-structured-review] button'));assert.equal(persisted,undefined);
 assertSimpleCreation();assert.ok(form.querySelector('[data-structured-review]').textContent.includes(request));
 const panel=form.querySelector('[data-structured-review]');
 if(interpretationHold){await tick();assert.equal(form.querySelector('[data-structured-review]'),panel);assert.equal(calls.filter(path=>path.includes('scope=migrated_routes')).length,1);assert.equal(calls.filter(path=>path.includes('interpretation.v1')).length,1);}
 panel.querySelector('button').click();await until(()=>form.querySelector('[data-structured-review] a'));
 assert.equal(persisted.p_definition.request,request);assert.equal(persisted.p_definition.plan.criteria.edition,'GB:en');assert.equal(calls.filter(p=>p.includes('interpretation.v1')).length,1);assert.equal(calls.filter(p=>p.includes('scope=migrated_routes')).length,1);assert.ok(calls.every(p=>!p.includes('check')&&!p.includes('cron')&&!p.includes('watch-suggestion')));assert.match(form.querySelector('[data-structured-review]').textContent,/Monitoring is not active/);assert.equal(window.location.href,'https://synthetic.test/new-watch.html');
});
