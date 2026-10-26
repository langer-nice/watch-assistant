import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeStoryShadow,storyShadowEnabled} from './story-following-shadow.js';
import {evaluateStoryShadow,storyShadowContext} from './story-following-shadow-matcher.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env={VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/story-following-shadow-staging',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STORY_FOLLOWING_SHADOW_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner};
const watch={id,interpretation:{schemaVersion:'interpretation.v1',domain:'media_news',ambiguities:[],unresolvedRequirements:[],subjects:[{id:'person',kind:'individual',type:'person',label:'Casey Morrow'}],conditions:[{op:'predicate',kind:'news_about',subjects:['person'],value:null}],topics:[],geographic:[],exclusions:[]}};
const item={id:'https://example.test/article?token=secret',url:'https://example.test/article?token=secret',title:'Casey Morrow announces a tournament withdrawal',excerpt:'PRIVATE ARTICLE TEXT'};
const decision=result=>({result,category:'person',reasonCodes:['VERIFIED_LOCAL_RELATION'],evidence:{identity:'PROVEN',relation:'PROVEN',geography:'NOT_REQUIRED',development:'PROVEN',polarity:'ASSERTED'}});
const call=(extra={})=>observeStoryShadow({env,ownerId:owner,watch,items:[item],matchingItems:[],now:()=>0,clock:()=> '2026-10-26T12:00:00Z',...extra});

test('staging-only strict gate; Production, other project/branch/database, off and missing flags are closed',()=>{
 assert.equal(storyShadowEnabled(env),true);
 for(const override of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_PROJECT_ID:'other'},{VERCEL_GIT_COMMIT_REF:'master'},{SUPABASE_URL:'https://other.supabase.co'},{STORY_FOLLOWING_SHADOW_ENABLED:'false'},{STORY_FOLLOWING_SHADOW_ENABLED:undefined}]){
  assert.equal(storyShadowEnabled({...env,...override}),false);call({env:{...env,...override},record:()=>assert.fail('Must not record'),evaluator:()=>assert.fail('Must not evaluate')});
 }
});
test('shadow MATCH cannot alter real NO_MATCH or mutate input',()=>{
 const logs=[],before=structuredClone({watch,item});const matching=[];
 assert.equal(call({matchingItems:matching,evaluator:()=>decision('MATCH'),record:r=>logs.push(r)}),undefined);
 assert.deepEqual(matching,[]);assert.deepEqual({watch,item},before);
 assert.equal(logs[0].current_result,'NO_MATCH');assert.equal(logs[0].shadow_result,'MATCH');
});
test('shadow NO_MATCH cannot suppress real MATCH',()=>{
 const logs=[],matching=[item];call({matchingItems:matching,evaluator:()=>decision('NO_MATCH'),record:r=>logs.push(r)});
 assert.deepEqual(matching,[item]);assert.equal(logs[0].current_result,'MATCH');assert.equal(logs[0].shadow_result,'NO_MATCH');
});
test('evaluation, context and storage errors never escape into monitoring',()=>{
 const logs=[];assert.doesNotThrow(()=>call({evaluator:()=>{throw Error('SECRET');},record:r=>logs.push(r)}));
 assert.equal(logs[0].shadow_error,true);assert.deepEqual(logs[0].reason_codes,['SHADOW_EVALUATION_FAILED']);
 assert.doesNotThrow(()=>call({record:()=>{throw Error('storage');}}));
 assert.doesNotThrow(()=>call({watch:{id,get interpretation(){throw Error('context');}}}));
 assert.doesNotThrow(()=>call({evaluator:()=>({result:'invalid'}),record:()=>{throw Error('storage');}}));
});
test('diagnostics are separate, contain no raw URLs/content/secrets and have bounded metadata only',()=>{
 const rows=[];call({record:r=>rows.push(r)});const row=rows[0];
 assert.equal(row.event,'story-following-shadow');assert.equal(row.watch_id,id);assert.match(row.candidate_key,/^[a-f0-9]{64}$/);
 assert.equal(row.shadow_error,false);assert.ok(!JSON.stringify(row).match(/PRIVATE|Casey|secret|example\.test/));
 assert.notEqual(row.owner_key,owner);
});
test('shadow has no notification/email/database dependencies or access',()=>{
 const result=observeStoryShadow({env,ownerId:owner,watch,items:[item],matchingItems:[],now:()=>0,record:()=>{},get client(){assert.fail('No DB access');},get sendEmail(){assert.fail('No email');},get createNotification(){assert.fail('No notification');}});
 assert.equal(result,undefined);
 for(const file of ['story-following-shadow.js','story-following-shadow-matcher.js']){
  const src=readFileSync(new URL(file,import.meta.url),'utf8');assert.doesNotMatch(src,/\bfetch\s*\(|\.rpc\s*\(|\.from\s*\(|resend|openai|llama|supabase-service/);
 }
});
test('owner isolation and invalid watch/candidate identifiers fail closed',()=>{
 for(const override of [{ownerId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},{ownerId:'invalid'},{watch:{...watch,id:'invalid'}}])call({...override,record:()=>assert.fail('No cross-owner observation')});
});
test('bounded CPU budget records a safe error and does not interrupt',()=>{
 const logs=[];let n=0;assert.doesNotThrow(()=>call({now:()=>n++?20:0,evaluator:()=>assert.fail('Over budget'),record:r=>logs.push(r)}));
 assert.deepEqual(logs[0].reason_codes,['SHADOW_BUDGET_EXCEEDED']);
});
test('H042-style multi-headline excerpt cannot complete a candidate title',()=>{
 const context={category:'evolving_story',identities:['students'],requiredTopics:[],geography:['France']};
 const r=evaluateStoryShadow({context,item:{title:'Mass protests across France lead to arrests',excerpt:'Student demonstrations spread across France; students announce new marches'}});
 assert.equal(r.result,'INSUFFICIENT_EVIDENCE');
});
test('F08-equivalent evidence does not borrow another article country or facts',()=>{
 const context={category:'evolving_story',identities:['students'],requiredTopics:[],geography:['France']};
 assert.equal(evaluateStoryShadow({context,item:{title:'Government responds to lycée mobilisation',excerpt:'Same article as another case; only discovery URL changes'}}).result,'INSUFFICIENT_EVIDENCE');
});
test('J07 absence/negation does not establish wildlife or electric strategy',()=>{
 const context={category:'ev_strategy',identities:['Jaguar'],requiredTopics:[],geography:[]};
 assert.equal(evaluateStoryShadow({context,item:{title:'Jaguar changes strategy. No automotive, wildlife or sporting context disambiguates Jaguar.'}}).result,'INSUFFICIENT_EVIDENCE');
 assert.equal(evaluateStoryShadow({context,item:{title:'Jaguar habitat conservation expands'}}).result,'NO_MATCH');
});
test('same-document provenance must match candidate; unknown excerpt remains quarantined',()=>{
 const context=storyShadowContext(watch);
 const base={title:'Sports news',url:'https://example.test/a',excerpt:item.title};
 assert.equal(evaluateStoryShadow({context,item:base}).result,'INSUFFICIENT_EVIDENCE');
 assert.equal(evaluateStoryShadow({context,item:{...base,excerptProvenance:{kind:'same-document',url:'https://example.test/other'}}}).result,'INSUFFICIENT_EVIDENCE');
 assert.equal(evaluateStoryShadow({context,item:{...base,excerptProvenance:{kind:'same-document',url:base.url}}}).result,'MATCH');
});
test('identical inputs are deterministic and matcher makes zero network/AI calls',()=>{
 const context=storyShadowContext(watch);const prior=globalThis.fetch;globalThis.fetch=()=>assert.fail('No network');
 try{const a=evaluateStoryShadow({context,item});assert.equal(a.result,'MATCH');assert.deepEqual(evaluateStoryShadow({context,item}),a);}finally{globalThis.fetch=prior;}
});
test('missing typed Watch scope abstains; does not interpret raw requests or topics into a new story',()=>{
 assert.equal(storyShadowContext({request:'Monitor an acquisition',mediaMention:{subjects:['A','B']}}),null);
 assert.equal(evaluateStoryShadow({item,context:null}).result,'INSUFFICIENT_EVIDENCE');
 assert.equal(storyShadowContext({...watch,interpretation:{...watch.interpretation,subjects:[{id:'a',label:'Group',kind:'open_group'}]}}),null);
});
test('confirmed two-party collaboration uses local explicit renewal and concrete phase, never co-mentions',()=>{
 const context={category:'campaign',identities:['Studio Vale','North Ridge'],requiredTopics:[],geography:[],campaign:null};
 const renewal='Studio Vale and North Ridge have rejoined creative forces yet again';
 const owned=title=>({title});
 assert.equal(evaluateStoryShadow({context,item:owned(renewal+'\nThe brands\nare set to release a second collection')}).result,'MATCH');
 assert.equal(evaluateStoryShadow({context,item:owned('Studio Vale and North Ridge fashion roundup')}).result,'INSUFFICIENT_EVIDENCE');
 assert.equal(evaluateStoryShadow({context,item:owned(renewal+'\nOther House joins the collaborators\nThe brands announce a new phase')}).result,'INSUFFICIENT_EVIDENCE');
});

test('real scheduler persists its current result before observer; storage failures cannot change RPCs or outcome',async()=>{
 const {runStructuredMediaMonitoring}=await import('./structured-media-scheduler.js');
 const {fixture,individual,predicate}=await import('./test-support/watch-interpretation-fixtures.js');
 const {compileMonitoringPlan}=await import('../src/js/watch-capabilities.js');
 const {createWatchDefinition,structuredMonitoringSource}=await import('../src/js/watch-definition.js');
 const interpreted=fixture('Keep me updated on Casey Morrow.',[individual('s','Casey Morrow','person')],[predicate('n','news_about',['s'])]);
 const definition=createWatchDefinition(interpreted,compileMonitoringPlan(interpreted,{structured:true}));
 const source=structuredMonitoringSource(definition.plan.criteria);
 const row={id,user_id:owner,media_revision:1,lease_token:'synthetic-lease',deleted_at:null,monitoring_state:'monitoring',watch_definition:definition,monitoring_source:source,media_watch_snapshots:{checked_at:'2026-10-25T12:00:00Z',items:[]}};
 const candidate={id:'synthetic-article',title:'Casey Morrow is mentioned in passing',url:'https://example.test/a'};
 const localEnv={...env,CRON_SECRET:'synthetic-only',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true'};
 const execute=async enabled=>{
  const calls=[];let persisted=false;const info=console.info;
  console.info=()=>{assert.equal(persisted,true);throw Error('Diagnostic writer unavailable');};
  try{
   const summary=await runStructuredMediaMonitoring({env:{...localEnv,STORY_FOLLOWING_SHADOW_ENABLED:enabled?'true':'false'},schedulerAuthorized:true,
    client:{async rpc(name,args){calls.push({name,args});if(name==='claim_structured_media_checks')return {data:[row],error:null};persisted=true;return {data:{status:'completed',outcome:'matching-items'},error:null};}},
    fetchFeed:async()=>({checkedAt:'2026-10-26T12:00:00Z',source:{title:'News',url:source.url},items:[candidate]})});
   return {calls,summary};
  }finally{console.info=info;}
 };
 const disabled=await execute(false),enabled=await execute(true);
 assert.deepEqual(enabled,disabled);assert.equal(enabled.summary.changed,1);assert.equal(enabled.summary.failed,0);
 assert.deepEqual(enabled.calls.map(c=>c.name),['claim_structured_media_checks','finish_structured_media_check']);
 assert.equal(enabled.calls[1].args.p_matching[0].id,candidate.id);
});
