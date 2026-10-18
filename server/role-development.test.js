import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import {fixture,individual,predicate} from './test-support/watch-interpretation-fixtures.js';
import {interpretWatchRequest} from './watch-interpreter.js';import {compileMonitoringPlan,assessCapabilities} from '../src/js/watch-capabilities.js';
import {createWatchDefinition,structuredMonitoringSource} from '../src/js/watch-definition.js';
import {ROLE_SOURCE,roleDevelopmentIntent,roleDevelopmentQuery} from '../src/js/role-development.js';
import {resolveCurrentRole,assessRoleDevelopments} from './role-development.js';
import {mediaArticleIdentityKeys} from './media-article-identity.js';import {matchFeedItemToWatch,applyFeedCheckResult} from '../src/js/watch-monitoring.js';
import {definitions} from './test-support/watch-definition-fixtures.js';import {fingerprint} from './structured-watch-authorization.js';
import {runStructuredMediaMonitoring} from './structured-media-scheduler.js';
import {createStructuredWatchMiddleware} from './structured-watch-api.js';import {fetchAndNormalizeFeed} from './check-watch-api.js';
const at='2026-10-20T12:00:00.000Z',baseline='2026-10-18T16:00:00Z';
const resolution=(role='the Pope',name='Example IX')=>({officeId:'papacy',originalRole:role,personId:'https://www.vatican.va/content/vatican/en/holy-father/'+name.toLowerCase().replaceAll(' ','-')+'.html',name,names:[name],sourceUrl:ROLE_SOURCE,verifiedAt:at});
const interpretation=(request,role,topic,language)=>fixture(request,[individual('person',role,'person')],[predicate('news','news_about',['person'])],{language,topics:[{label:topic,role:'required'}],unresolvedRequirements:[{text:role,reason:'CURRENT_ROLE_HOLDER_UNVERIFIED'}]});
const approved=[];
for(const [request,role,topic,language]of [["Keep me informed about the Pope's health.",'the Pope','health','en'],['Surveille la santé du pape.','pape','santé','fr']])test('original '+language+' request compiles to source-bound role Watch, without rewriting or clarification',async()=>{
 const v=interpretation(request,role,topic,language),{originalRequest,...output}=v;output.evidence=output.evidence.map(({path,text})=>({path,quote:text,context:null}));let calls=0;
 const result=await interpretWatchRequest(request,{apiKey:'synthetic',language,fetchImpl:async()=>{calls++;return Response.json({output_text:JSON.stringify(output)});},roleResolver:async intent=>resolution(intent.originalRole)});
 assert.equal(calls,1);assert.deepEqual(result.interpretation.ambiguities,[]);assert.deepEqual(result.interpretation.unresolvedRequirements,[]);assert.equal(result.interpretation.originalRequest,request);
 const a=assessCapabilities(result.interpretation,{structured:true,roleResolution:result.roleResolution});assert.equal(a.status,'supported');
 const d=createWatchDefinition(result.interpretation,a.plan);assert.equal(d.request,request);assert.equal(d.plan.criteria.roleResolution.originalRole,role);assert.match(d.plan.criteria.query,/Example IX.*health.*santé/);approved.push(d);
});
test('unavailable resolution stays blocked even if the model omits the unresolved marker',async()=>{
 const request="Keep me informed about the Pope's health.",v=interpretation(request,'the Pope','health','en');v.unresolvedRequirements=[];v.evidence=v.evidence.filter(e=>!e.path.startsWith('/unresolvedRequirements/'));
 const {originalRequest,...output}=v;output.evidence=output.evidence.map(({path,text})=>({path,quote:text,context:null}));
 const result=await interpretWatchRequest(request,{apiKey:'synthetic',fetchImpl:async()=>Response.json({output_text:JSON.stringify(output)}),roleResolver:async()=>null});
 assert.equal(result.status,'unresolved');assert.equal(result.interpretation.unresolvedRequirements[0].reason,'CURRENT_ROLE_HOLDER_UNVERIFIED');
 assert.equal(assessCapabilities(v,{structured:true}).status,'unsupported');
});
test('official active-office marker resolves changed holders and fails closed on ambiguity/vacancy',async()=>{
 const html=name=>`<div id="pope-scrollbar"><article class="pope-item"><a href="/content/vatican/en/holy-father/${name.toLowerCase().replaceAll(' ','-')}.html"><div class="pope-name">${name}</div><p class="pope-end">--/--/--</p></a></article></div>`;
 for(const name of ['Example IX','Successor X']){let n=0;const r=await resolveCurrentRole({officeId:'papacy',originalRole:'pape'},{fetchImpl:async url=>{assert(/^https:\/\/www.vatican.va\//.test(url));n++;return new Response(html(name));},now:()=>new Date(at)});assert.equal(n,2);assert.equal(r.name,name);assert.equal(r.originalRole,'pape');assert.equal(r.sourceUrl,ROLE_SOURCE);}
 await assert.rejects(resolveCurrentRole({officeId:'papacy',originalRole:'pape'},{fetchImpl:async()=>new Response('<html>Vacancy</html>')}),{code:'ROLE_EVIDENCE_UNAVAILABLE'});
});
const article=(id,excerpt,extra={})=>({id,title:'Example IX health announcement',excerpt,source:'Vatican News',sourceUrl:'https://www.vaticannews.va',url:'https://example.test/'+id,publishedAt:at,...extra});
const fact='Today, Example IX was discharged from hospital, Vatican News reports.';
const decision=id=>({id,disposition:'verified',personQuote:'Example IX',developmentQuote:'was discharged from hospital',attributionQuote:'Vatican News',temporalQuote:'Today',eventType:'discharge',eventState:'unspecified'});
let accepted;
test('A-D: one bounded evidence assessment includes sourced new event; rejects unrelated, old and rumor',async()=>{
 const items=[article('current',fact),article('vatican','Example IX meets diplomats today.'),article('old',fact,{publishedAt:'2026-08-06T07:00:00Z'}),article('rumor','Unconfirmed rumors claim Example IX is ill today.')];let calls=0;
 accepted=await assessRoleDevelopments(items,resolution(),{baselineAt:baseline,checkedAt:at,apiKey:'synthetic',assessor:async opts=>{calls++;assert.equal(opts.max_output_tokens,1400);assert.equal(JSON.parse(opts.input).articles.length,3);assert.match(opts.instructions,/Do not infer medical conditions/);return{assessments:[decision('current'),{...decision('vatican'),disposition:'irrelevant'},{...decision('rumor'),disposition:'speculation'}]};}});
 assert.equal(calls,1);assert.deepEqual(accepted.map(i=>i.id),['current']);assert.equal(accepted[0].development.sourceUrl,'https://www.vaticannews.va');
 const d=approved[0],watch={...d,monitoringSource:structuredMonitoringSource(d.plan.criteria)};
 const normalized=applyFeedCheckResult(watch,{source:{title:'Fixture',url:watch.monitoringSource.url},checkedAt:at,items:accepted}).changes.monitoringSnapshot.items[0];assert(matchFeedItemToWatch(normalized,watch).matched);
 assert(!matchFeedItemToWatch(items[0],watch).matched,'keywords alone are insufficient');
});
test('E-F: semantic event identity survives repeat coverage and role re-resolution accepts only verified new holder',async()=>{
 const again=await assessRoleDevelopments([article('repeat',fact)],resolution(),{baselineAt:baseline,checkedAt:at,apiKey:'synthetic',assessor:async()=>({assessments:[decision('repeat')]})});
 assert.equal(mediaArticleIdentityKeys(accepted[0])[1],mediaArticleIdentityKeys(again[0])[1]);assert.notEqual(mediaArticleIdentityKeys(accepted[0])[0],mediaArticleIdentityKeys(again[0])[0]);
 const successor=resolution('the Pope','Successor X'),watch={...approved[0],monitoringSource:structuredMonitoringSource(approved[0].plan.criteria)};
 assert.match(roleDevelopmentQuery(successor),/Successor X/);assert.doesNotMatch(roleDevelopmentQuery(successor),/Example IX/);
 const current={...accepted[0],roleResolution:successor,development:{...accepted[0].development,personId:successor.personId}};assert(matchFeedItemToWatch(current,watch).matched);
});
test('insufficient dates, fabricated quotations, unapproved publishers and pre-reference events are never accepted',async()=>{
 for(const change of [{temporalQuote:'Yesterday'},{developmentQuote:'invented medical condition'},{personQuote:'Someone Else'}]){
  const result=await assessRoleDevelopments([article('current',fact)],resolution(),{baselineAt:baseline,checkedAt:at,apiKey:'synthetic',assessor:async()=>({assessments:[{...decision('current'),...change}]})});assert.equal(result.length,0);
 }
 const retrospective=article('retrospective','Today, Vatican News recalled Example IX was discharged from hospital on 2026-08-06.');
 assert.equal((await assessRoleDevelopments([retrospective],resolution(),{baselineAt:baseline,checkedAt:at,apiKey:'synthetic',assessor:async()=>({assessments:[{...decision('retrospective'),temporalQuote:'2026-08-06'}]})})).length,0);
 let calls=0;assert.equal((await assessRoleDevelopments([article('untrusted',fact,{sourceUrl:'https://unknown.example'})],resolution(),{baselineAt:baseline,checkedAt:at,assessor:async()=>{calls++;}})).length,0);assert.equal(calls,0);
});
test('role retrieval re-resolves before searching; source evidence assessment uses existing retrieval only',async()=>{
 const d=approved[0],source=structuredMonitoringSource(d.plan.criteria);let assessed=0,searched;
 const result=await fetchAndNormalizeFeed(source.url,{roleContext:{criteria:d.plan.criteria,baselineAt:baseline,priorItems:[]},roleResolver:async()=>resolution('the Pope','Successor X'),developmentAssessor:async(items,r)=>{assessed++;assert.equal(r.name,'Successor X');assert.equal(items[0].sourceUrl,'https://www.vaticannews.va/');return[];},lookup:async()=>[{address:'8.8.8.8',family:4}],fetchImpl:async url=>{searched=new URL(url);return new Response('<rss><channel><title>Fixture</title><item><guid>current</guid><title>Successor X health</title><link>https://example.test/new</link><pubDate>Tue, 20 Oct 2026 12:00:00 GMT</pubDate><source url="https://www.vaticannews.va/">Vatican News</source><description>Today a statement.</description></item></channel></rss>',{headers:{'content-type':'application/rss+xml'}});}});
 assert.match(searched.searchParams.get('q'),/Successor X/);assert.equal(assessed,1);assert.equal(result.items.length,1);
});
test('native SQL accepts EN/FR definitions, preserves existing definitions, and deduplicates repeated health development',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')))await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
 for(const d of [...definitions(),...approved])assert.equal((await db.query('select public.valid_structured_watch_definition($1,$2) ok',[structuredMonitoringSource(d.plan.criteria),d])).rows[0].ok,true,d.request);
 const owner=randomUUID(),id=randomUUID();await db.query("insert into auth.users values($1,'owner@example.test',now())",[owner]);
 const svc=(sql,args)=>db.transaction(async tx=>{await tx.exec("set local role service_role;select set_config('request.jwt.claim.role','service_role',true)");return tx.query(sql,args);});
 const d=approved[0],source=structuredMonitoringSource(d.plan.criteria),mutation=randomUUID();
 const client={rpc:async(name,args)=>{const entries=Object.entries(args);try{const r=await svc('select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result',entries.map(([,v])=>v));return{data:r.rows[0].result};}catch(error){return{error:{code:error.code}};}}};
 const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)};
 const handler=createStructuredWatchMiddleware({env,authenticate:async()=>({user:{id:owner},client:{}}),serviceClient:client,resolveRole:async()=>resolution(),now:()=>Date.parse(at)});
 const invoke=async body=>{let result;const response={setHeader(){},end(v){result=JSON.parse(v);}};await handler({method:'POST',url:'/api/structured-watches',body},response);assert.equal(response.statusCode,200,JSON.stringify(result));return result;};
 const common={watchId:id,mutationId:mutation,operation:'create',expectedRevision:0,title:'Health fixture'};
 const issued=await invoke({action:'issue',...common,interpretation:{...d.interpretation,originalRequest:d.request},plan:compileMonitoringPlan({...d.interpretation,originalRequest:d.request},{structured:true,roleResolution:d.plan.criteria.roleResolution})});
 const confirmed=await invoke({action:'confirm',...common,definition:issued.definition,token:issued.token});assert.equal(confirmed.receipt.ownerId,owner);
 assert.equal((await db.query('select monitoring_state from public.watches where id=$1',[id])).rows[0].monitoring_state,'paused');
 // Exercise the existing monitoring runner and native completion without any live source, email or provider.
 await svc('select public.set_structured_media_monitoring($1,$2,1,true,86400)',[id,owner]);
 const monitoringEnv={...env,STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',CRON_SECRET:'synthetic-only'};
 const run=async(items,checkedAt)=>{await db.query("update public.structured_media_schedules set next_due_at=now()-interval '1 second' where watch_id=$1",[id]);return runStructuredMediaMonitoring({client,env:monitoringEnv,schedulerAuthorized:true,fetchFeed:async()=>({checkedAt,source:{title:'Fixture',url:source.url},items})});};
 assert.equal((await run([],baseline)).unchanged,1);
 assert.equal((await run(accepted,at)).changed,1);
 const repeat={...accepted[0],id:'repeat-report',url:'https://example.test/repeat-report'};
 assert.equal((await run([repeat],'2026-10-21T12:00:00Z')).unchanged,1);
 // Existing identity ledger, not a parallel event queue.
 const keys=mediaArticleIdentityKeys(accepted[0]);assert((await db.query('select count(*)::int n from public.media_watch_seen_articles where watch_id=$1 and article_key=$2',[id,keys[1]])).rows[0].n===1);
 const duplicate={...accepted[0],id:'repeat',url:'https://example.test/repeat'};
 assert.equal((await db.query('select exists(select 1 from public.media_watch_seen_articles where watch_id=$1 and article_key=any($2)) known',[id,mediaArticleIdentityKeys(duplicate)])).rows[0].known,true);
 }finally{await db.close();}
});
