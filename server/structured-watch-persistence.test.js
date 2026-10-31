import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { examples,definitions } from './test-support/watch-definition-fixtures.js';
import { structuredMonitoringSource } from '../src/js/watch-definition.js';
import { fingerprint } from './structured-watch-authorization.js';
import { createStructuredWatchMiddleware } from './structured-watch-api.js';
import { compileMonitoringPlan } from './watch-capabilities.js';

const directory=new URL('../supabase/migrations/',import.meta.url), migration='20261012140000_structured_watch_confirmation.sql';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const identifier = n => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
const signature='public.persist_structured_watch_v1(uuid,uuid,text,uuid,bigint,text,jsonb,jsonb,text,text)';
test('local SQL confirmation is service-only, atomic, inactive and durably idempotent',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    for(const file of (await readdir(directory)).sort().filter(file=>file.endsWith('.sql') && file<migration)) await db.exec((await readFile(new URL(file,directory),'utf8')).replace('create extension if not exists pgcrypto;',''));
    await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,'fixture@example.test',other,'other@example.test']);
    const scoped=(role,user,sql,args=[])=>db.transaction(async tx=>{
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,user]);
      return tx.query(sql,args);
    });
    const legacyId=identifier(1),legacy={inputType:'text',request:'Monitor news about Gucci.',category:'news',mediaMention:{subjects:['Gucci'],matchMode:'all'}},legacySource={type:'feed',url:'https://example.test/rss'};
    await scoped('authenticated',owner,"select public.persist_media_watch($1,'Legacy',$2,$3,'monitoring',0,$4,false)",[legacyId,legacySource,legacy,identifier(101)]);
    await db.query("insert into public.media_watch_snapshots(watch_id,user_id,checked_at,baseline_at,source_title,source_url,item_ids,items) values($1,$2,now(),now(),'Legacy','https://example.test/rss',array['old'],'[]')",[legacyId,owner]);
    const state=async()=> (await db.query("select jsonb_build_object('watches',(select jsonb_agg(to_jsonb(w) order by id) from public.watches w),'snapshots',(select jsonb_agg(to_jsonb(s) order by watch_id) from public.media_watch_snapshots s),'outbox',(select jsonb_agg(to_jsonb(n) order by id) from public.media_watch_notifications n)) data")).rows[0].data;
    const before=await state();
    const legacyFunctions=(await db.query("select proname,pg_get_functiondef(p.oid) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (proname='persist_media_watch' or proname like 'complete_%' or proname like 'invalidate_%' or proname='revise_media_query_without_rebaseline') order by proname")).rows;
    await db.exec(await readFile(new URL(migration,directory),'utf8'));
    assert.deepEqual(await state(),before);
    assert.deepEqual((await db.query("select proname,pg_get_functiondef(p.oid) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (proname='persist_media_watch' or proname like 'complete_%' or proname like 'invalidate_%' or proname='revise_media_query_without_rebaseline') order by proname")).rows,legacyFunctions);
    const definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
    const params=(override={})=>{
      const p={p_owner:owner,p_id:identifier(2),p_operation:'create',p_mutation:identifier(102),p_revision:0,p_title:'Fixture',p_source:source,p_definition:definition,...override};
      return {...p,p_definition_fingerprint:fingerprint(p.p_definition),p_payload_fingerprint:fingerprint({definition:p.p_definition,source:p.p_source,title:p.p_title})};
    };
    const rpcSQL='select public.persist_structured_watch_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) receipt';
    const args=p=>[p.p_owner,p.p_id,p.p_operation,p.p_mutation,p.p_revision,p.p_title,p.p_source,p.p_definition,p.p_definition_fingerprint,p.p_payload_fingerprint];
    const rpc=async(p,role='service_role',user='')=>(await scoped(role,user,rpcSQL,args(p))).rows[0].receipt;
    const created=params();let first,second;
    await t.test('role grants, direct writes and legacy RPC cannot authorize structured data',async()=>{
      for(const role of ['anon','authenticated','service_role']) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,signature])).rows[0].ok,role==='service_role');
      for(const role of ['anon','authenticated']) await assert.rejects(rpc(created,role,owner),{code:'42501'});
      await assert.rejects(scoped('authenticated',owner,"insert into public.watches(id,user_id,title,type,watch_definition,monitoring_source,monitoring_state) values($1,$2,'Forged','media_news',$3,$4,'paused')",[identifier(2),owner,definition,source]),{code:'42501'});
      await assert.rejects(db.query("insert into public.watches(id,user_id,title,type,watch_definition,monitoring_source,monitoring_state) values($1,$2,'Direct','media_news',$3,$4,'paused')",[identifier(2),owner,definition,source]),{code:'42501'});
      await assert.rejects(scoped('authenticated',owner,"select public.persist_media_watch($1,'Forged',$2,$3,'paused',0,$4,false)",[identifier(2),source,definition,identifier(102)]),{code:'22023'});
    });
    await t.test('atomic create stores exact definition paused, and concurrent lost-response retries return one receipt',async()=>{
      const receipts=await Promise.all([rpc(created),rpc(created),rpc(created)]);first=receipts[0];assert.deepEqual(receipts[1],first);assert.deepEqual(receipts[2],first);
      assert.equal(first.revision,1);assert.equal(first.monitoringState,'paused');
      const row=(await db.query('select * from public.watches where id=$1',[created.p_id])).rows[0];
      assert.deepEqual(row.watch_definition,definition);assert.equal(row.watch_definition.request,definition.request);assert.equal(row.monitoring_state,'paused');assert.equal(row.current_status,'paused');assert.equal(row.last_checked_at,null);
      assert.equal((await db.query('select count(*)::int n from public.structured_watch_mutations')).rows[0].n,1);
      assert.equal((await db.query("select count(*)::int n from public.watches where watch_definition ? 'definitionVersion' and monitoring_state='monitoring'")).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
    });
    await t.test('mutations bind owner, Watch, operation, revision and exact payload even after rehashing',async()=>{
      for(const change of [{p_owner:other},{p_id:identifier(3)},{p_operation:'update',p_revision:1},{p_title:'Different'}]) await assert.rejects(rpc(params(change)),{code:'PT409'});
      await assert.rejects(rpc(params({p_mutation:identifier(103)})),{code:'PT409'}); // Same ID, different creation.
      const bad=structuredClone(definition);bad.plan.criteria.query='Prada';
      await assert.rejects(rpc(params({p_mutation:identifier(103),p_definition:bad})),{code:'PT422'});
      await assert.rejects(rpc({...params({p_mutation:identifier(103)}),p_definition_fingerprint:'a'.repeat(64)}),{code:'PT422'});
      await assert.rejects(rpc(params({p_id:identifier(4),p_mutation:identifier(104),p_source:{...source,url:'https://attacker.test'}})),{code:'PT422'});
      assert.equal((await db.query('select count(*)::int n from public.structured_watch_mutations')).rows[0].n,1);
    });
    await t.test('atomic updates preserve IDs and use a single revision increment; historical retries never rewind',async()=>{
      const update=params({p_operation:'update',p_revision:1,p_mutation:identifier(105),p_title:'Updated title'});
      second=await rpc(update);assert.equal(second.revision,2);assert.deepEqual(await rpc(update),second);
      assert.deepEqual(await rpc(created),first);
      const row=(await db.query('select title,media_revision,monitoring_state from public.watches where id=$1',[created.p_id])).rows[0];
      assert.equal(row.title,'Updated title');assert.equal(Number(row.media_revision),2);assert.equal(row.monitoring_state,'paused');
      await assert.rejects(rpc(params({p_operation:'update',p_revision:1,p_mutation:identifier(106)})),{code:'PT409'});
      await assert.rejects(rpc(params({p_operation:'update',p_revision:2,p_owner:other,p_mutation:identifier(106)})),{code:'PT409'});
    });
    await t.test('same-revision competing updates cannot both succeed',async()=>{
      const results=await Promise.allSettled([rpc(params({p_operation:'update',p_revision:2,p_mutation:identifier(107),p_title:'Winner A'})),rpc(params({p_operation:'update',p_revision:2,p_mutation:identifier(108),p_title:'Winner B'}))]);
      assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(results.find(v=>v.status==='rejected').reason.code,'PT409');
      assert.equal(Number((await db.query('select media_revision from public.watches where id=$1',[created.p_id])).rows[0].media_revision),3);
    });
    await t.test('authenticated downgrade/alteration and receipt access are blocked',async()=>{
      assert.equal((await scoped('authenticated',owner,'update public.watches set watch_definition=$1,monitoring_source=$2 where id=$3 returning id',[legacy,legacySource,created.p_id])).rows.length,0);
      await assert.rejects(scoped('authenticated',owner,'select * from public.structured_watch_mutations'),{code:'42501'});
      await assert.rejects(db.query("update public.watches set monitoring_state='monitoring' where id=$1",[created.p_id]),{code:'42501'});
      const mutate=await db.transaction(async tx=>{
        await tx.exec('set local role service_role');await tx.query("select set_config('request.jwt.claim.role','service_role',true)");
        const receipt=(await tx.query(rpcSQL,args(params({p_operation:'update',p_revision:3,p_mutation:identifier(109)})))).rows[0].receipt;
        assert.notEqual((await tx.query("select current_setting('watch_assistant.structured_rpc',true) marker")).rows[0].marker,'persist.v1');return receipt;
      });assert.equal(mutate.revision,4);
    });
    await t.test('failure after the Watch write rolls back both Watch and receipt',async()=>{
      await db.exec(`create function public.fixture_receipt_failure() returns trigger language plpgsql as $$begin raise exception 'fixture failure' using errcode='23514';end$$;create trigger fixture_receipt_failure before insert on public.structured_watch_mutations for each row execute function public.fixture_receipt_failure();`);
      const beforeFailure=await state();
      await assert.rejects(rpc(params({p_id:identifier(10),p_mutation:identifier(110)})),{code:'23514'});
      assert.deepEqual(await state(),beforeFailure);
      await assert.rejects(rpc(params({p_operation:'update',p_revision:4,p_mutation:identifier(110),p_title:'Must roll back'})),{code:'23514'});
      assert.deepEqual(await state(),beforeFailure);
      assert.equal((await db.query('select count(*)::int n from public.structured_watch_mutations where mutation_id=$1',[identifier(110)])).rows[0].n,0);
      await db.exec('drop trigger fixture_receipt_failure on public.structured_watch_mutations;drop function public.fixture_receipt_failure();');
    });
    await t.test('currency and BODACC definitions are stored paused; company identity remains stable',async()=>{
      for(const index of [4,5]){
        const d=definitions()[index],s=structuredMonitoringSource(d.plan.criteria);
        const p=params({p_id:identifier(20+index),p_mutation:identifier(120+index),p_definition:d,p_source:s});
        const receipt=await rpc(p);assert.equal(receipt.revision,1);
        const update=params({...p,p_operation:'update',p_revision:1,p_mutation:identifier(130+index),p_title:'Inactive updated title'});
        assert.equal((await rpc(update)).revision,2);
        const row=(await db.query('select * from public.watches where id=$1',[p.p_id])).rows[0];assert.equal(row.monitoring_state,'paused');assert.equal(row.last_checked_at,null);
      }
    });
    await t.test('actual confirmation middleware reaches only the service RPC and remains idempotent',async()=>{
      const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner+',bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)};
      const handler=createStructuredWatchMiddleware({env,authenticate:async()=>({user:{id:owner}}),serviceClient:{rpc:async(name,p)=>{assert.equal(name,'persist_structured_watch_v1');return{data:await rpc(p),error:null};}}});
      const invoke=async body=>{let result;const response={setHeader(){},end(data){result=JSON.parse(data);}};await handler({method:'POST',url:'/api/structured-watches',body},response);assert.equal(response.statusCode,200);return result;};
      const body={action:'issue',operation:'create',watchId:identifier(30),mutationId:identifier(130),expectedRevision:0,title:'French Watch',interpretation:examples()[1],plan:compileMonitoringPlan(examples()[1],{structured:true})};
      const issued=await invoke(body);const confirm={action:'confirm',operation:'create',watchId:body.watchId,mutationId:body.mutationId,expectedRevision:0,title:body.title,token:issued.token,definition:issued.definition};
      const saved=await invoke(confirm);assert.deepEqual(await invoke(confirm),saved);
      const row=(await db.query('select watch_definition from public.watches where id=$1',[body.watchId])).rows[0];assert.equal(row.watch_definition.interpretation.language,'fr');assert.equal(row.watch_definition.request,body.interpretation.originalRequest);
    });
    await t.test('legacy creation/update and its baseline survive the new migration',async()=>{
      await scoped('authenticated',owner,"select public.persist_media_watch($1,'Legacy edited',$2,$3,'monitoring',1,$4,false)",[legacyId,legacySource,legacy,identifier(140)]);
      assert.deepEqual((await db.query('select watch_definition from public.watches where id=$1',[legacyId])).rows[0].watch_definition,legacy);
      assert.equal((await db.query('select item_ids from public.media_watch_snapshots where watch_id=$1',[legacyId])).rows[0].item_ids[0],'old');
      assert.equal((await db.query('select count(*)::int n from public.company_watch_notifications')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
    });
  }finally{await db.close();}
});
