import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaWatchCheckMiddleware } from './media-watch-check-api.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';
import { compileMonitoringPlan } from '../src/js/watch-capabilities.js';
import { createWatchDefinition, structuredMonitoringSource } from '../src/js/watch-definition.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const safeEnv=()=>({SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner});
const rowFor=()=>{
 const value=fixture('Keep me updated on Jannik Sinner.',[individual('s','Jannik Sinner','person')],[predicate('n','news_about',['s'])]);
 const definition=createWatchDefinition(value,compileMonitoringPlan(value,{structured:true}));
 return {id,user_id:owner,type:'media_news',watch_definition:definition,monitoring_source:structuredMonitoringSource(definition.plan.criteria),monitoring_state:'paused',current_status:'paused',media_revision:1,deleted_at:null};
};
const feed={checkedAt:'2026-10-15T10:00:00Z',source:{title:'Synthetic news',url:'https://news.google.com'},items:[{id:'one',title:'Jannik Sinner wins',excerpt:'Tennis',url:'https://example.test/one'}]};
const setup=({env=safeEnv(),row=rowFor(),user=owner,authError=false}={})=>{
 const calls={auth:0,reads:0,serviceInit:0,fetches:0,rpcs:[]};let current=row;
 const client={from(table){calls.reads++;assert.equal(table,'watches');const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},async range(a,b){assert.deepEqual([a,b],[0,0]);assert(filters.some(([k,v])=>k==='user_id'&&v===user));return {data:current&&filters.every(([k,v])=>current[k]===v)?[structuredClone(current)]:[],error:null};}};return q;}};
 const handler=createMediaWatchCheckMiddleware({env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-only-not-a-real-credential',...env},authenticate:async()=>{calls.auth++;if(authError)throw Object.assign(Error('auth'),{code:'AUTH_REQUIRED',statusCode:401});return {user:{id:user},client};},
  createClientImpl(){calls.serviceInit++;return {async rpc(name,p){calls.rpcs.push({name,p});assert.equal(name,'complete_manual_media_watch_check');assert.equal(p.p_watch_id,id);assert.equal(p.p_user_id,user);assert.equal(p.p_expected_revision,1);assert.equal(Object.hasOwn(p,'p_enqueue_notifications'),false);assert(!Object.keys(p).some(k=>/definition|monitoring_state/.test(k)));
   const initial=!current.media_watch_snapshots;current={...current,media_watch_snapshots:{checked_at:p.p_checked_at,items:p.p_items,initial_items:initial?p.p_items:current.media_watch_snapshots.initial_items,baseline_at:initial?p.p_checked_at:current.media_watch_snapshots.baseline_at}};
   // The existing SQL ledger is authoritative; this mock tests consumption of
   // its baseline/no-new-items outcomes, not the SQL implementation itself.
   return {data:{status:'completed',outcome:initial?'baseline':'no-new-items',matchedItems:[],unseenItems:[]},error:null};
  }};},fetchFeed:async url=>{calls.fetches++;assert.equal(url,current.monitoring_source.url);return structuredClone(feed);},fetchCurrency:()=>assert.fail('currency should not run')});
 return {calls,row:()=>current,async check(body={id,revision:1}){let value;const res={setHeader(){},end(raw){value=JSON.parse(raw);}};await handler({url:'/api/media-watches?action=check',method:'POST',body},res);return {status:res.statusCode,value};}};
};
for(const [label,patch] of [
 ['Production URL',{SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co'}],
 ['missing URL',{SUPABASE_URL:undefined}],['other project',{SUPABASE_URL:'https://wrong-project.supabase.co'}],
 ['trailing slash',{SUPABASE_URL:safeEnv().SUPABASE_URL+'/'}],['whitespace',{SUPABASE_URL:' '+safeEnv().SUPABASE_URL}],
 ['public URL fallback',{SUPABASE_URL:undefined,VITE_SUPABASE_URL:safeEnv().SUPABASE_URL}],
 ['backend disabled',{STRUCTURED_WATCH_BACKEND_ENABLED:'false'}],['creation disabled',{STRUCTURED_WATCH_CREATION_ENABLED:'false'}],
 ['invalid boolean',{STRUCTURED_WATCH_BACKEND_ENABLED:'TRUE'}],['Production runtime',{VERCEL_ENV:'production'}],
 ['not allowlisted',{STRUCTURED_WATCH_TEST_USER_IDS:other}],['empty allowlist',{STRUCTURED_WATCH_TEST_USER_IDS:''}],
])test(`structured ${label} rejects before service initialization, source or write`,async()=>{
 const h=setup({env:{...safeEnv(),...patch}}),r=await h.check({id,revision:1,structured:false,userId:owner,watch_definition:{inputType:'url'}});
 assert.equal(r.status,label==='not allowlisted'||label==='empty allowlist'?403:404);assert.equal(r.value.code,'STRUCTURED_FEATURE_UNAVAILABLE');
 assert.equal(h.calls.auth,1);assert.equal(h.calls.reads,1,'only the required owner-filtered classification read');assert.equal(h.calls.serviceInit,0);assert.equal(h.calls.fetches,0);assert.deepEqual(h.calls.rpcs,[]);
});
test('unauthenticated request makes no row read, service initialization or provider call',async()=>{
 const h=setup({authError:true});assert.equal((await h.check()).status,401);assert.equal(h.calls.reads,0);assert.equal(h.calls.serviceInit,0);assert.equal(h.calls.fetches,0);assert.deepEqual(h.calls.rpcs,[]);
});
test('body-supplied owner cannot authorize a foreign Watch',async()=>{
 const h=setup({user:other});assert.equal((await h.check({id,revision:1,userId:owner})).status,404);assert.equal(h.calls.serviceInit,0);assert.equal(h.calls.fetches,0);assert.deepEqual(h.calls.rpcs,[]);
});
for(const [name,mutate]of[
 ['unknown version',row=>row.watch_definition.definitionVersion='future'],
 ['null version',row=>row.watch_definition.definitionVersion=null],
 ['missing definition contents',row=>row.watch_definition={definitionVersion:'watch-definition.v1'}],
 ['mismatched saved source',row=>row.monitoring_source.url='https://example.test/evil'],
])test(`persisted structured ${name} fails without writes or legacy fallback`,async()=>{
 const row=rowFor();mutate(row);const h=setup({row});assert.notEqual((await h.check({id,revision:1,structured:false,watch_definition:{inputType:'url'}})).status,200);assert.equal(h.calls.serviceInit,0);assert.equal(h.calls.fetches,0);assert.deepEqual(h.calls.rpcs,[]);
});
test('allowed paused owner uses saved definition and preserves baseline/dedup outcome without notification RPCs',async()=>{
 const h=setup(),before=structuredClone(h.row());const body={id,revision:1,structured:false,userId:other,criteria:{query:'invented'},watch_definition:{inputType:'url'}};
 const a=await h.check(body);assert.equal(a.status,200);assert.equal(a.value.outcome,'baseline');assert.equal(a.value.changes.status,'paused');assert.deepEqual(a.value.newItems,[]);assert.ok(a.value.changes.initialContext.items.length>0);
 const b=await h.check(body);assert.equal(b.status,200);assert.equal(b.value.outcome,'no-new-items');assert.equal(b.value.changes.status,'paused');assert.deepEqual(b.value.newItems,[]);
 assert.equal(h.calls.fetches,2);assert.equal(h.calls.rpcs.length,2);assert.deepEqual(h.calls.rpcs[0].p.p_items[0].identityKeys,h.calls.rpcs[1].p.p_items[0].identityKeys);
 assert.deepEqual(h.row().watch_definition,before.watch_definition);assert.deepEqual(h.row().monitoring_source,before.monitoring_source);assert.equal(h.row().monitoring_state,'paused');assert.equal(h.row().user_id,owner);
});
test('legacy manual check retains Production/disabled-gate behavior and ignores forged client version',async()=>{
 const row={...rowFor(),watch_definition:{inputType:'url',request:'https://example.test/rss'},monitoring_source:{type:'feed',url:'https://example.test/rss'},monitoring_state:'monitoring',current_status:'watching'};
 const h=setup({row,env:{SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',VERCEL_ENV:'production'}});const r=await h.check({id,revision:1,structured:true,watch_definition:{definitionVersion:'watch-definition.v1'}});
 assert.equal(r.status,200);assert.equal(h.calls.fetches,1);assert.equal(h.calls.rpcs.length,1);assert.equal(h.row().monitoring_state,'monitoring');
});
