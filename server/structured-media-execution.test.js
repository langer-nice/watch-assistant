import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, individual, predicate, consumerFixtures } from './test-support/watch-interpretation-fixtures.js';
import { compileMonitoringPlan } from '../src/js/watch-capabilities.js';
import { createWatchDefinition, structuredMonitoringSource, definitionFromWatch } from '../src/js/watch-definition.js';
import { validateMediaQuery } from '../src/js/media-provider-query.js';
import { structuredMediaCriteria } from '../src/js/structured-media-execution.js';
import { matchFeedItemToWatch, applyFeedCheckResult, createWatchCheckController } from '../src/js/watch-monitoring.js';
import { migrateWatchModel } from '../src/js/watch-model.js';
import { createMediaWatchCheckMiddleware } from './media-watch-check-api.js';
import { runMediaMonitoring } from './media-monitoring-cron.js';

const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc',owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const make = (request,label,language='en',extra={}) => {
 const interpretation=fixture(request,[individual('s',label,label==='Jannik Sinner'?'person':'organization')],[predicate('n','news_about',['s'])],{language,...extra});
 const definition=createWatchDefinition(interpretation,compileMonitoringPlan(interpretation,{structured:true}));
 return {...definition,id,monitoringSource:structuredMonitoringSource(definition.plan.criteria),monitoringState:'paused',status:'paused',mediaPersistence:{ownerId:owner,revision:1}};
};
const manualEnv={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner};
const sinner=()=>make('Keep me updated on Jannik Sinner.','Jannik Sinner');
const rowFor=watch=>({id,user_id:owner,type:'media_news',watch_definition:definitionFromWatch(watch),monitoring_source:watch.monitoringSource,monitoring_state:'paused',media_revision:1,deleted_at:null});
const clientFor=row=>({from(){const filters=[];const b={select(){return b;},eq(k,v){filters.push([k,v]);return b;},is(k,v){filters.push([k,v]);return b;},order(){return b;},async range(){return {data:row&&filters.every(([k,v])=>row[k]===v)?[row]:[],error:null};}};return b;}});
const invoke=async(handler,body={id,revision:1})=>{let result;const res={setHeader(){},end(raw){result=JSON.parse(raw);}};await handler({method:'POST',url:'/api/media-watches?action=check',body},res);return {status:res.statusCode,result};};
const feed={checkedAt:'2026-10-12T12:00:00Z',source:{title:'News',url:'https://news.google.com'},items:[{id:'article',title:'Jannik Sinner wins',url:'https://example.test/article',excerpt:'Tennis'}]};

test('EN/FR approved queries, exact requests and hydration have identical execution semantics',()=>{
 for(const [en,fr,label] of [['Keep me updated on Jannik Sinner.','Tiens-moi informé des actualités de Jannik Sinner.','Jannik Sinner'],['Monitor news about Gucci.','Surveille les actualités concernant Gucci.','Gucci']]){
  const a=make(en,label),b=make(fr,label,'fr');assert.deepEqual(structuredMediaCriteria(a),structuredMediaCriteria(b));assert.deepEqual(a.monitoringSource,b.monitoringSource);
  for(const watch of [a,b]){const hydrated=migrateWatchModel(JSON.parse(JSON.stringify(watch))).watch;assert.equal(hydrated.request,watch.request);assert.deepEqual(definitionFromWatch(hydrated),definitionFromWatch(watch));assert.deepEqual(hydrated.mediaPersistence,watch.mediaPersistence);assert.equal(hydrated.serverReadOnly,true);assert.equal(hydrated.structuredExecutionDisabled,false);assert.equal(new URL(watch.monitoringSource.url).searchParams.get('ceid'),'GB:en');}
 }
});
test('explicit versions/source mismatch reject without legacy fallback; missing version remains legacy',()=>{
 const w=sinner();assert.equal(validateMediaQuery({inputType:'url'}, {url:'https://example.test/rss'}),undefined);
 for(const bad of [{...w,definitionVersion:'future'},{...w,definitionVersion:null},{...w,plan:{...w.plan,criteria:{...w.plan.criteria,query:'invented'}}},{...w,monitoringSource:{...w.monitoringSource,url:'https://evil.test/rss'}}]){
  assert.throws(()=>validateMediaQuery(definitionFromWatch(bad),bad.monitoringSource));assert.throws(()=>matchFeedItemToWatch(feed.items[0],bad));
 }
 assert.equal(matchFeedItemToWatch({title:'Gucci'}, {inputType:'text',mediaMention:{subjects:['Gucci'],matchMode:'all'}}).matched,true);
});
test('single identities, approved aliases and same-article AND/topics/exclusions reuse literal matcher',()=>{
 assert.equal(matchFeedItemToWatch(feed.items[0],sinner()).matched,true);assert.equal(matchFeedItemToWatch({title:'Sinner'},sinner()).matched,false);
 const brand=make('Monitor news about Gucci.','Gucci');assert.equal(matchFeedItemToWatch({title:'Gucci collection'},brand).matched,true);assert.equal(matchFeedItemToWatch({title:'Prada collection'},brand).matched,false);
 const aliases=make('Monitor news about Royal Caribbean Group.','Royal Caribbean Group');assert.equal(matchFeedItemToWatch({title:'Royal Caribbean Cruises results'},aliases).matched,true);assert.match(aliases.monitoringSource.query,/ OR /);
 const interpretation=fixture('Monitor Gucci and Prada together about collections excluding lawsuits.',[individual('g','Gucci'),individual('p','Prada')],[{id:'root',op:'and',args:['both','topic','not']},predicate('both','mentions_together',['g','p']),predicate('topic','topic',['g','p'],'collections'),{id:'not',op:'not',args:['excluded']},predicate('excluded','topic',['g','p'],'lawsuits')],{exclusions:['excluded']});
 const definition=createWatchDefinition(interpretation,compileMonitoringPlan(interpretation,{structured:true}));const watch={...definition,monitoringSource:structuredMonitoringSource(definition.plan.criteria)};
 assert.equal(matchFeedItemToWatch({title:'Gucci collections',excerpt:'Prada'},watch).matched,true);assert.equal(matchFeedItemToWatch({title:'Gucci collections'},watch).matched,false);assert.equal(matchFeedItemToWatch({title:'Gucci Prada collections lawsuits'},watch).matched,false);
});
test('independent OR, groups and semantic event plans cannot become executable definitions',()=>{
 for(const interpretation of [consumerFixtures[1],consumerFixtures[2],consumerFixtures[3],fixture('Monitor a Gucci collaboration.',[individual('g','Gucci')],[predicate('e','event',['g'],'collaboration')],{intent:'event'})]) assert.throws(()=>createWatchDefinition(interpretation,compileMonitoringPlan(interpretation,{structured:true})));
});
test('manual path authenticates, isolates ownership and ignores submitted criteria',async()=>{
 const watch=sinner(),row=rowFor(watch);let fetched=0,rpc=0;
 const handler=createMediaWatchCheckMiddleware({env:manualEnv,authenticate:async()=>({user:{id:owner},client:clientFor(row)}),fetchFeed:async url=>{fetched++;assert.equal(url,watch.monitoringSource.url);return feed;},serviceClient:{async rpc(name,p){rpc++;assert.equal(name,'complete_manual_media_watch_check');assert.equal(p.p_user_id,owner);assert.equal(p.p_expected_revision,1);return {data:{status:'completed',outcome:'baseline',matchedItems:[],unseenItems:[]},error:null};}}});
 const result=await invoke(handler,{id,revision:1,criteria:{query:'evil'}});assert.equal(result.status,200);assert.equal(result.result.outcome,'baseline');assert.equal(result.result.changes.status,'paused');assert.equal(row.monitoring_state,'paused');assert.equal(fetched,1);assert.equal(rpc,1);
 assert.equal((await invoke(handler,{id,revision:2})).status,409);assert.equal(fetched,1);
 const denied=createMediaWatchCheckMiddleware({env:manualEnv,authenticate:async()=>({user:{id:'other'},client:clientFor(row)}),fetchFeed:()=>assert.fail('foreign provider')});assert.equal((await invoke(denied)).status,404);
 const unauth=createMediaWatchCheckMiddleware({env:manualEnv,authenticate:async()=>{throw Object.assign(Error('auth'),{code:'AUTH_REQUIRED',statusCode:401});}});assert.equal((await invoke(unauth)).status,401);
 for(const bad of [{...watch,definitionVersion:'future'},{...watch,monitoringSource:{type:'feed',url:'https://evil.test'}}]){const h=createMediaWatchCheckMiddleware({env:manualEnv,authenticate:async()=>({user:{id:owner},client:clientFor(rowFor(bad))}),fetchFeed:()=>assert.fail('invalid provider')});assert.notEqual((await invoke(h)).status,200);}
});
test('browser structured check requires stored authenticated execution and never local fallback',async()=>{
 const w=sinner();let providers=0;
 const controller=createWatchCheckController({getWatch:()=>w,saveWatch:()=>w,checkStoredWatch:async()=>null,requestCheck:()=>{providers++;}});
 await assert.rejects(controller.check(id),{code:'AUTH_REQUIRED'});assert.equal(providers,0);
 const stored=createWatchCheckController({getWatch:()=>w,saveWatch:()=>w,checkStoredWatch:async()=>({outcome:'baseline',changes:{}}),requestCheck:()=>assert.fail()});assert.equal((await stored.check(id)).outcome,'baseline');
});
test('unleased structured rows never execute through the legacy scheduled path',async()=>{
 for(const [state,enabled,expected] of [['monitoring',false,0],['paused',true,0],['monitoring',true,0]]){
  const row={...rowFor(sinner()),monitoring_state:state};let fetches=0;const calls=[];const client={...clientFor(row),async rpc(name,args){calls.push([name,args]);return {data:name.startsWith('complete')?'unchanged':false,error:null};}};
  await runMediaMonitoring({client,env:enabled?{STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true'}:{},fetchFeed:async()=>{fetches++;return feed;},notificationProcessor:async()=>({status:'disabled'})});assert.equal(fetches,expected);
  const completed=calls.find(([name])=>name==='complete_scheduled_media_watch_check');if(expected){assert.equal(completed[1].p_enqueue_notifications,false);assert.deepEqual(completed[1].p_notification_items,[]);}
 }
 const row={...rowFor(sinner()),monitoring_state:'monitoring',watch_definition:{...definitionFromWatch(sinner()),definitionVersion:'future'}};let completed=0;
 const result=await runMediaMonitoring({client:{...clientFor(row),async rpc(name){if(name.startsWith('complete'))completed++;return {data:false,error:null};}},env:{STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true'},fetchFeed:()=>assert.fail('invalid version'),notificationProcessor:async()=>({status:'disabled'})});assert.equal(result.failedCount,0);assert.equal(result.skippedCount,1);assert.equal(completed,0);
});
