import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
import {mediaArticleIdentityKeys} from './media-article-identity.js';
import {runStructuredMediaMonitoring} from './structured-media-scheduler.js';
import {createMediaWatchCheckMiddleware} from './media-watch-check-api.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env={CRON_SECRET:'synthetic-cron-only',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner};
for(const [name,changes,authorized,status] of [['default off',{STRUCTURED_MEDIA_SCHEDULED_ENABLED:undefined},true,'disabled'],['unauthorized',{},false,'unauthorized'],['no secret',{CRON_SECRET:''},true,'unauthorized'],['wrong project',{SUPABASE_URL:'https://forbidden.example.test'},true,'environment-blocked'],['production',{VERCEL_ENV:'production'},true,'environment-blocked'],['no allowlist',{STRUCTURED_WATCH_TEST_USER_IDS:''},true,'unauthorized']])test(`structured scheduler fails closed: ${name}`,async()=>{
 const result=await runStructuredMediaMonitoring({client:{rpc:()=>assert.fail('No database access allowed')},env:{...env,...changes},schedulerAuthorized:authorized,fetchFeed:()=>assert.fail('No source access allowed')});assert.equal(result.status,status);
});

test('isolated SQL scheduler lifecycle, claims, completion, failures and fencing',async t=>{
 const db=new PGlite();const originalFetch=globalThis.fetch;let network=0;
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);for(const f of (await readdir(dir)).sort().filter(x=>x.endsWith('.sql')&&x<='20261015160000_structured_media_scheduling.sql'))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  globalThis.fetch=()=>{network++;assert.fail('External network forbidden');};
  const role=(r,sql,args=[])=>db.transaction(async tx=>{await tx.exec(`set local role ${r}`);await tx.query("select set_config('request.jwt.claim.role',$1,true)",[r]);return tx.query(sql,args);});
  const svc=(sql,args=[])=>role('service_role',sql,args);
  const definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
  await db.query('insert into auth.users values($1,$2)',[owner,'synthetic-owner@example.test']);
  await svc("select public.persist_structured_watch_v1($1,$2,'create',$3,0,'Synthetic scheduled fixture',$4,$5,$6,$7)",[owner,id,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',source,definition,fingerprint(definition),fingerprint({definition,source,title:'Synthetic scheduled fixture'})]);
  const row=async()=>(await db.query('select * from public.watches where id=$1',[id])).rows[0];
  const snap=async()=>(await db.query('select * from public.media_watch_snapshots where watch_id=$1',[id])).rows[0];
  const schedule=async()=>(await db.query('select * from public.structured_media_schedules where watch_id=$1',[id])).rows[0];
  const keys=async()=>(await db.query('select article_key from public.media_watch_seen_articles where watch_id=$1 order by article_key',[id])).rows;
  const due=()=>db.query("update public.structured_media_schedules set next_due_at=now()-interval '1 second' where watch_id=$1",[id]);
  const active=async(value=true,interval=3600)=>(await svc('select public.set_structured_media_monitoring($1,$2,$3,$4,$5) ok',[id,owner,(await row()).media_revision,value,interval])).rows[0].ok;
  const claim=async(limit=3,owners=[owner])=>(await svc('select public.claim_structured_media_checks($1,$2) result',[owners,limit])).rows[0].result;
  let rpcFailure=false,lostResponse=false;
  const client={async rpc(name,p){
   const fields=name==='claim_structured_media_checks'?['p_owners','p_limit']:name==='claim_structured_media_manual_check'?['p_watch_id','p_owner','p_revision']:['p_watch_id','p_owner','p_revision','p_token','p_checked_at','p_source_title','p_source_url','p_items','p_expected_checked_at','p_expected_items','p_matching','p_error',...(Object.hasOwn(p,'p_manual')?['p_manual']:[])];assert.ok(['claim_structured_media_checks','claim_structured_media_manual_check','finish_structured_media_check'].includes(name));
   if(rpcFailure&&name==='finish_structured_media_check'&&!p.p_error)return {error:{code:'synthetic'},data:null};
   const r=(await svc(`select public.${name}(${fields.map((_,i)=>'$'+(i+1)).join(',')}) result`,fields.map(k=>p[k]))).rows[0].result;
   if(lostResponse&&name==='finish_structured_media_check'&&!p.p_error){lostResponse=false;throw Error('Synthetic response lost after commit');}return {data:r,error:null};
  }};
  const item=(key,title)=>({id:'synthetic-'+key,title,url:'https://example.test/'+key,excerpt:'Fictional test data',publishedAt:'2026-10-15T00:00:00Z'});
  const old=item('old','Synthetic Jannik Sinner baseline'),news=item('new','Synthetic Jannik Sinner new match'),unrelated=item('other','Synthetic unrelated tennis');
  const feed=items=>({checkedAt:new Date().toISOString(),source:{title:'Synthetic test publisher',url:'https://example.test'},items});
  const run=(items,extra={})=>runStructuredMediaMonitoring({client,env,schedulerAuthorized:true,fetchFeed:async url=>{assert.equal(url,source.url);return feed(items);},...extra});
  const approved=await row();let baseline;
  await t.test('new fixture paused; browser roles and wrong owner cannot activate or claim',async()=>{
   assert.equal((await row()).monitoring_state,'paused');assert.deepEqual(await claim(),[]);
   for(const r of ['anon','authenticated'])await assert.rejects(role(r,'select public.claim_structured_media_checks($1,3)',[[owner]]),{code:'42501'});
   assert.equal((await svc('select public.set_structured_media_monitoring($1,$2,1,true,3600) ok',[id,other])).rows[0].ok,false);
   await assert.rejects(svc('select public.set_structured_media_monitoring($1,$2,1,true,1)',[id,owner]),{code:'22023'});
  });
  await t.test('explicit active due fixture establishes baseline without notification; interval advances',async()=>{
   assert.equal(await active(),true);const r=await run([old]);assert.equal(r.claimed,1);assert.equal(r.unchanged,1);baseline=structuredClone((await snap()).initial_items);
   assert.equal((await row()).last_check_outcome,'baseline');assert.equal((await keys()).length,2);assert.equal((await row()).monitoring_state,'monitoring');assert.ok((await schedule()).next_due_at>Date.now());assert.equal((await schedule()).lease_token,null);
  });
  await t.test('not due, wrong allowlist and paused fixtures cannot fetch',async()=>{
   assert.equal((await run([],{fetchFeed:()=>assert.fail('Not due')})).claimed,0);assert.deepEqual(await claim(3,[other]),[]);
   await active(false);await due();assert.deepEqual(await claim(),[]);await active();
  });
  await t.test('new positive article detected; unrelated candidate remembered; first baseline preserved',async()=>{
   const r=await run([old,news,unrelated]);assert.equal(r.changed,1);assert.equal((await row()).last_change_item_id,mediaArticleIdentityKeys(news)[0]);assert.equal((await keys()).length,6);assert.deepEqual((await snap()).initial_items,baseline);
  });
  await t.test('repeated execution is idempotent and interval prevents hot processing',async()=>{
   await due();const r=await run([old,news,unrelated]);assert.equal(r.unchanged,1);assert.equal((await row()).last_check_outcome,'no-new-items');assert.equal((await keys()).length,6);assert.equal((await run([])).claimed,0);
  });
  await t.test('overlapping workers receive one lease and cannot fetch twice',async()=>{
   await due();let release,entered;const started=new Promise(r=>entered=r);const first=run([old],{fetchFeed:async()=>{entered();await new Promise(r=>release=r);return feed([old]);}});await started;
   assert.equal((await run([],{fetchFeed:()=>assert.fail('Already leased')})).claimed,0);release();assert.equal((await first).claimed,1);
  });
  await t.test('source failure preserves baseline and ledger and applies bounded backoff',async()=>{
   await due();const before=await keys(),beforeSnapshot=await snap();const r=await run([],{fetchFeed:()=>{throw Object.assign(Error('Synthetic timeout'),{code:'TIMEOUT'});}});assert.equal(r.failed,1);assert.deepEqual(await keys(),before);assert.deepEqual(await snap(),beforeSnapshot);assert.equal((await row()).last_check_error_code,'TIMEOUT');assert.equal((await schedule()).failures,1);assert.ok((await schedule()).next_due_at>Date.now()+290000);assert.equal((await run([])).claimed,0);
  });
  await t.test('failed completion never partially inserts identities',async()=>{
   await due();const before=await keys();rpcFailure=true;const r=await run([item('not-committed','Synthetic Jannik Sinner rollback')]);rpcFailure=false;assert.equal(r.failed,1);assert.deepEqual(await keys(),before);assert.equal((await schedule()).lease_token,null);
  });
  await t.test('invalid completion atomically rolls back even an identity inserted earlier in its loop',async()=>{
   await due();const [leased]=await claim(),prior=await snap(),before=await keys();
   const valid=item('rolled-back','Synthetic Jannik Sinner atomic rollback');valid.identityKeys=mediaArticleIdentityKeys(valid);const invalid={...valid,id:'invalid',identityKeys:['invalid-key']};
   const p={p_watch_id:id,p_owner:owner,p_revision:leased.media_revision,p_token:leased.lease_token,p_checked_at:new Date().toISOString(),p_source_title:'Synthetic',p_source_url:source.url,p_items:[valid,invalid],p_expected_checked_at:prior.checked_at,p_expected_items:prior.items,p_matching:[valid],p_error:null};
   await assert.rejects(client.rpc('finish_structured_media_check',p),{code:'22023'});assert.deepEqual(await keys(),before);assert.deepEqual(await snap(),prior);assert.equal((await schedule()).lease_token,leased.lease_token);
   await client.rpc('finish_structured_media_check',{...p,p_error:'CHECK_FAILED'});
  });
  await t.test('success followed by lost response cannot be undone or retried immediately',async()=>{
   await due();lostResponse=true;const r=await run([old,news]);assert.equal(r.failed,1);assert.equal((await row()).last_check_error_code,null);assert.equal((await run([])).claimed,0);assert.equal((await schedule()).failures,0);
  });
  await t.test('manual success fences an overlapping scheduled snapshot without corruption',async()=>{
   await due();const [leased]=await claim();const prior=await snap();const article={...item('manual','Synthetic Jannik Sinner manual overlap')};article.identityKeys=mediaArticleIdentityKeys(article);
   await svc("select public.complete_manual_media_watch_check($1,$2,'Synthetic',$3,$4,$5,$6,$7,$5,$8,$9)",[id,new Date().toISOString(),source.url,[article.id],[article],prior.checked_at,prior.items,(await row()).media_revision,owner]);
   const r=await client.rpc('finish_structured_media_check',{p_watch_id:id,p_owner:owner,p_revision:leased.media_revision,p_token:leased.lease_token,p_checked_at:new Date().toISOString(),p_source_title:'Synthetic',p_source_url:source.url,p_items:[],p_expected_checked_at:prior.checked_at,p_expected_items:prior.items,p_matching:[],p_error:null});assert.equal(r.data.status,'skipped');assert.equal((await row()).last_change_item_id,article.identityKeys[0]);assert.equal((await schedule()).lease_token,null);
  });
  await t.test('manual and scheduler share a lease before fetching when scheduling is enabled',async()=>{
   const authClient={from(){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},async range(){const w=await row();return {data:filters.every(([k,v])=>w[k]===v)?[{...w,media_watch_snapshots:await snap()}]:[],error:null};}};return q;}};
   let fetches=0,entered,release;const started=new Promise(r=>entered=r);
   const handler=createMediaWatchCheckMiddleware({env,authenticate:async()=>({user:{id:owner},client:authClient}),serviceClient:client,fetchFeed:async()=>{fetches++;entered();await new Promise(r=>release=r);return feed([old,news]);}});
   const invoke=async()=>{let body;const response={setHeader(){},end(raw){body=JSON.parse(raw);}};await handler({method:'POST',url:'/api/media-watches?action=check',body:{id,revision:(await row()).media_revision}},response);return {status:response.statusCode,body};};
   await due();const [leased]=await claim();assert.equal((await invoke()).status,409);assert.equal(fetches,0);
   const prior=await snap();await client.rpc('finish_structured_media_check',{p_watch_id:id,p_owner:owner,p_revision:leased.media_revision,p_token:leased.lease_token,p_checked_at:null,p_source_title:null,p_source_url:null,p_items:[],p_expected_checked_at:prior.checked_at,p_expected_items:prior.items,p_matching:[],p_error:'TEST_RELEASE'});
   await due();const request=invoke();await started;assert.equal((await run([],{fetchFeed:()=>assert.fail('Manual lease prevents scheduler fetch')})).claimed,0);release();assert.equal((await request).status,200);assert.equal(fetches,1);assert.equal((await row()).monitoring_state,'monitoring');
   await active(false);
   const pausedHandler=createMediaWatchCheckMiddleware({env,authenticate:async()=>({user:{id:owner},client:authClient}),serviceClient:client,fetchFeed:async()=>feed([old])});const response={setHeader(){},end(){}};await pausedHandler({method:'POST',url:'/api/media-watches?action=check',body:{id,revision:(await row()).media_revision}},response);assert.equal(response.statusCode,200);assert.equal((await row()).monitoring_state,'paused');await active();
  });
  await t.test('expired worker cannot complete after a newer claim',async()=>{
   await due();const [first]=await claim();await db.query("update public.structured_media_schedules set lease_until=now()-interval '1 second' where watch_id=$1",[id]);const [second]=await claim();assert.notEqual(first.lease_token,second.lease_token);
   const result=await client.rpc('finish_structured_media_check',{p_watch_id:id,p_owner:owner,p_revision:first.media_revision,p_token:first.lease_token,p_checked_at:null,p_source_title:null,p_source_url:null,p_items:[],p_expected_checked_at:null,p_expected_items:null,p_matching:[],p_error:'TIMEOUT'});assert.equal(result.data.status,'skipped');assert.equal((await schedule()).lease_token,second.lease_token);await active(false);
  });
  await t.test('bounded SQL batches distribute distinct claims across workers',async()=>{
   for(let n=1;n<=4;n++){
    const fixtureId='cccccccc-cccc-4ccc-8ccc-'+String(n).padStart(12,'0');const mutation='dddddddd-dddd-4ddd-8ddd-'+String(n).padStart(12,'0');
    await svc("select public.persist_structured_watch_v1($1,$2,'create',$3,0,'Synthetic scheduled fixture',$4,$5,$6,$7)",[owner,fixtureId,mutation,source,definition,fingerprint(definition),fingerprint({definition,source,title:'Synthetic scheduled fixture'})]);
    await svc('select public.set_structured_media_monitoring($1,$2,1,true,86400)',[fixtureId,owner]);
   }
   const a=await claim(2),b=await claim(2);assert.equal(a.length,2);assert.equal(b.length,2);assert.equal(new Set([...a,...b].map(w=>w.id)).size,4);assert.deepEqual(await claim(),[]);
  });
  await t.test('limits, final approval integrity, pause and outbox safety',async()=>{
   assert.deepEqual(await claim(0),[]);await assert.rejects(run([],{batchSize:4}),/Invalid structured batch/);
   const after=await row();for(const key of ['user_id','watch_definition','monitoring_source','media_mutation_id'])assert.deepEqual(after[key],approved[key]);assert.equal(after.monitoring_state,'paused');assert.deepEqual((await snap()).initial_items,baseline);assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);assert.equal(network,0);
  });
 }finally{globalThis.fetch=originalFetch;await db.close();}
});

test('unsupported claimed definition fails without source retrieval',async()=>{
 const calls=[];const r=await runStructuredMediaMonitoring({env,schedulerAuthorized:true,client:{rpc:async(name)=>{calls.push(name);return {data:name==='claim_structured_media_checks'?[{id,user_id:owner,monitoring_state:'monitoring',lease_token:'synthetic',watch_definition:{definitionVersion:'future'},monitoring_source:{url:'https://example.test'}}]:{status:'failed'},error:null};}},fetchFeed:()=>assert.fail('Unsupported definition must not fetch')});assert.equal(r.failed,1);assert.deepEqual(calls,['claim_structured_media_checks','finish_structured_media_check']);
});
