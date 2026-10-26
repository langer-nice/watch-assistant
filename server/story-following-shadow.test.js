import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeStoryShadow,storyShadowEnabled} from './story-following-shadow.js';
import {evaluateStoryShadow,storyShadowContext,classifyShadowPerson} from './story-following-shadow-matcher.js';
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
 const logs=[];let n=0;assert.doesNotThrow(()=>call({now:()=>n++?41:0,evaluator:()=>assert.fail('Over budget'),record:r=>logs.push(r)}));
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

const personFixture=JSON.parse(readFileSync(new URL('./test-support/story-shadow-person-parity.json',import.meta.url)));
{
const classifyPerson=classifyShadowPerson;
const context={name:'Jannik Sinner',profession:'tennis',allowSurname:true};
const cases=[
 ['Sinner returns after injury','MATCH'],
 ['Sinner withdraws from a tournament','MATCH'],
 ['Jannik Sinner announces tournament withdrawal','MATCH'],
 ['Sinner hires a new coach','MATCH'],
 ['Sinner announces participation in a tournament','MATCH'],
 ['Jannik Sinner injury improves after medical treatment','MATCH'],
 ['Jannik Sinner: World number one ends season early with knee injury','MATCH'],
 ['Sinner parts ways with his coach','MATCH'],
 ["Jannik Sinner's coach leaves the team",'MATCH'],
 ['Sinner reaches the tournament final','MATCH'],
 ['Jannik Sinner announces a medical update','MATCH'],
 ['Toni Nadal says he would coach Sinner','NO_MATCH'],
 ['Sinner urged to hire another coach','INSUFFICIENT_EVIDENCE'],
 ['Bublik reacts to fan remark about Sinner','NO_MATCH'],
 ['Opinion: comparing Sinner and Alcaraz','NO_MATCH'],
 ['The Italian champion is absent','INSUFFICIENT_EVIDENCE'],
 ['A sinner seeks forgiveness in a religious essay','NO_MATCH'],
 ['Alex Sinner returns from injury','NO_MATCH'],
 ['Sinner may return after injury','INSUFFICIENT_EVIDENCE'],
 ['Sinner is not returning to the tournament','INSUFFICIENT_EVIDENCE'],
 ['Sinner denies he will withdraw from the tournament','MATCH'],
 ['Jannik Sinner faces a test amid ongoing knee issues','INSUFFICIENT_EVIDENCE'],
 ['Jannik Sinner receives an injury boost','INSUFFICIENT_EVIDENCE'],
 ['Other Player hires a coach while Jannik Sinner watches','INSUFFICIENT_EVIDENCE'],
 ['Jannik Sinner watches while another coach leaves','INSUFFICIENT_EVIDENCE'],
 ['Italian tennis player announces comeback — The article names Lorenzo Musetti as the player concerned.','NO_MATCH']
];
for(const [title,expected] of cases)test(title,()=>assert.equal(classifyPerson({title},context).label,expected));
test('P02 own packet resolves initial, no external alias memory',()=>{
 assert.equal(classifyPerson({title:'J. Sinner changes his training schedule',ownedText:'The article names Jannik Sinner and describes a training change.'},context).label,'MATCH');
});
test('P03 own reference requires explicit same-packet name',()=>{
 assert.equal(classifyPerson({title:'The Italian player delays his return',ownedText:'The preceding paragraph names Jannik Sinner and states that this return date concerns him.'},context).label,'MATCH');
 assert.equal(classifyPerson({title:'The Italian player delays his return'},context).label,'INSUFFICIENT_EVIDENCE');
});
test('unattributable excerpt cannot repair missing identity',()=>{
 assert.equal(classifyPerson({title:'The player returns — Extrait conservé : Jannik Sinner returns from injury'},context).label,'INSUFFICIENT_EVIDENCE');
});
test('parameterized identity, no fixed-title allowlist',()=>{
 assert.equal(classifyPerson({title:'Avery Moss hires a new coach'},{name:'Avery Moss',profession:'tennis'}).label,'MATCH');
});
test('denial retains denial status instead of asserting withdrawal',()=>{
 const r=classifyPerson({title:'Sinner denies he will withdraw from the tournament'},context);
 assert.equal(r.status,'ATTRIBUTED_DENIAL');assert.equal(r.development,'PROFESSIONAL_STATEMENT');
});
test('H013: existing wrong-story proof outranks rumors',()=>{
 const title=personFixture.h013;
 const frozen={exclude:personFixture.exclusions};
 const r=classifyPerson({title},{...context,exclusions:frozen.exclude});
 assert.equal(r.label,'NO_MATCH');assert.equal(r.reason,'EXPLICIT_FIXED_SCOPE_EXCLUSION');
});
test('A/E: affirmative different-story evidence outranks rumor, speculation and opinion',()=>{
 const c={...context,exclusions:['football story']};
 for(const prefix of ['Rumors:','Speculation:','Opinion:']){
  const r=classifyPerson({title:prefix+' a football story may develop'},c);
  assert.equal(r.label,'NO_MATCH');assert.equal(r.status,'OUTSIDE_SCOPE');
 }
});
test('B: explicitly named different person outranks speculation',()=>{
 const r=classifyPerson({title:'An athlete may return — The article names Marco Bellini as the player concerned.'},context);
 assert.equal(r.label,'NO_MATCH');assert.equal(r.reason,'OTHER_PERSON_IS_SUBJECT');
});
test('C: monitored-person rumor stays insufficient even with other-story background',()=>{
 const c={...context,exclusions:['football story']};
 for(const title of ['Jannik Sinner may hire a new coach','Jannik Sinner might return after injury amid football story rumors']){
  const r=classifyPerson({title},c);assert.equal(r.label,'INSUFFICIENT_EVIDENCE');assert.equal(r.status,'SPECULATION');
 }
});
test('D: existing monitored-person opinion and recommendation handling unchanged',()=>{
 assert.equal(classifyPerson({title:'Opinion: Jannik Sinner should hire another coach'},context).label,'NO_MATCH');
 assert.equal(classifyPerson({title:'Jannik Sinner urged to hire another coach'},context).label,'INSUFFICIENT_EVIDENCE');
});
test('absence of a wrong-story fact cannot turn uncertainty into rejection',()=>{
 const c={...context,exclusions:['football story']};
 assert.equal(classifyPerson({title:'No football story is reported; an unnamed player may return'},c).label,'INSUFFICIENT_EVIDENCE');
});

}

const personWatch={...watch,interpretation:{...watch.interpretation,subjects:[{id:'person',kind:'individual',type:'person',label:'Jannik Sinner'}]}};
test('20 frozen offline v2 decisions: exact core metadata and runtime adapter parity, order independent',()=>{
 const context=storyShadowContext(personWatch),counts={};
 for(const row of personFixture.items){
  const input=personFixture.inputs.find(i=>i.title===row.title);
  const {id,title,...expected}=row;
  assert.deepEqual(classifyShadowPerson(input,context.person),expected,id);
  const r=evaluateStoryShadow({item:input,context});
  assert.equal(r.result,expected.label,id);assert.deepEqual(r.reasonCodes,[expected.reason]);
  counts[r.result]=(counts[r.result]||0)+1;
 }
 assert.deepEqual(counts,{MATCH:11,INSUFFICIENT_EVIDENCE:4,NO_MATCH:5});
 for(const row of [...personFixture.inputs].reverse())assert.equal(evaluateStoryShadow({item:row,context}).result,personFixture.items.find(i=>i.title===row.title).label);
});
test('person observer uses bounded source and quarantines unowned excerpts; other people keep existing policy',()=>{
 assert.equal(storyShadowContext(watch).person,undefined);
 const rows=[];
 call({watch:personWatch,items:personFixture.inputs.map((i,n)=>({...i,id:String(n)})),record:r=>rows.push(r)});
 assert.equal(rows.length,20);assert.ok(rows.every(r=>!r.shadow_error));
 assert.deepEqual(rows.map(r=>r.shadow_result),personFixture.items.map(i=>i.label));
 assert.equal(evaluateStoryShadow({context:storyShadowContext(personWatch),item:{title:'The player returns',excerpt:'Jannik Sinner returns from injury'}}).result,'INSUFFICIENT_EVIDENCE');
});

test('optimized Unicode boundaries preserve full-name and action boundaries',()=>{
 const c={name:'Avery Moss',profession:'tennis'};
 for(const title of ['Avery Mossé hires a coach','Avery Moss𐐀 hires a coach'])assert.notEqual(classifyShadowPerson({title},c).label,'MATCH',title);
 for(const title of ['éAvery Moss hires a coach','𐐀Avery Moss hires a coach','—Avery Moss hires a coach','😀Avery Moss hires a coach','xAvery Moss hires a coach; Avery Moss hires a coach'])assert.equal(classifyShadowPerson({title},c).label,'MATCH',title);
 assert.equal(classifyShadowPerson({title:'News'},{name:'\u0301'}).label,'INSUFFICIENT_EVIDENCE');
});

test('exact frozen H042/F08/J07 packets retain their protected abstentions',()=>{
 for(const row of personFixture.protected){
  const [title,excerpt]=row.text.split(' — Extrait conservé :');
  const context=row.id==='J07'?{category:'ev_strategy',identities:['Jaguar'],requiredTopics:[],geography:[]}:{category:'evolving_story',identities:['students'],requiredTopics:[],geography:['France']};
  assert.equal(evaluateStoryShadow({context,item:{title,excerpt}}).result,row.expected,row.id);
 }
});

test('authorized shadow budget permits 40 ms and still preserves authoritative results',()=>{
 const rows=[];let n=0;call({now:()=>n++?40:0,record:r=>rows.push(r)});
 assert.equal(rows.length,1);assert.equal(rows[0].shadow_error,false);assert.equal(rows[0].current_result,'NO_MATCH');
});
