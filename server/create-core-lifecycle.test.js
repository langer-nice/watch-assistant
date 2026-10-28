import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Readable } from 'node:stream';
import { parseHTML } from 'linkedom';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { createStructuredWatchMiddleware } from './structured-watch-api.js';
import { resolveWatchContractCapability } from './create-contract-capability.js';
import { reviewCreateExtraction } from './create-contract-bridge.js';
import { watchContractSemanticFingerprint } from './watch-contract.js';
import { configureStructuredWatchCreation, initStructuredWatchCreation } from '../src/js/structured-watch-creation.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';
import { cleanCreateExtraction } from './test-support/create-semantic-fixtures.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const uuid=n=>`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
const requests=[
  'Tell me when there are important new developments about Manchester City.',
  'Tell me when Microsoft publishes its Q3 2026 earnings results.',
  'Tell me when there are important new developments about Jannik Sinner.',
  'Tell me when GBP/EUR goes above 1.17.',
  'https://www.bbc.com/news/topics/c6vgy427vxklt',
];
function raw(index,run=1){
  if(index===4)return null;
  const r=requests[index];let v;
  if(index===3){
    v=fixture(r,[{...individual('base','GBP','currency'),canonicalCode:'GBP'},
      {...individual('quote','EUR','currency'),canonicalCode:'EUR'}],
      [{...predicate('n','numeric',['base','quote'],'exchange_rate'),operator:'gt',amount:'1.17',unit:'EUR'}],
      {domain:'currency',intent:'numeric_condition'});
  }else{
    const name=index===0?'Manchester City':index===1?'Microsoft':'Jannik Sinner';
    v=fixture(r,[individual('s',name,index===2?'person':'organization')],
      [predicate('n',index===1?'event':'news_about',['s'],index===1?'earnings_results_publication':null)],
      index===1?{intent:'event',temporal:[{text:'Q3 2026',relation:'unspecified',start:null,end:null,timezone:null}]}:{});
    if(index===1&&run===2){v.domain='official_company';v.conditions[0].value='official_company_announcement';}
    if(index===1&&run===3){v.conditions[0].kind='news_about';v.conditions[0].value=null;v.intent='ongoing_news';}
    if((index===0||index===2)&&run===3){v.topics=[{label:'important new developments',role:'required'}];
      v.evidence.push({path:'/topics/0',text:'important new developments'});}
  }
  const {originalRequest,...o}=v;
  o.evidence=o.evidence.map(({path,text})=>({path,quote:text,context:null}));return o;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await tick();}assert.fail('Lifecycle did not settle');}
async function harness(t,index=0,run=1,{core=true}={}){
  const previous=globalThis.document;
  const {document}=parseHTML('<form><textarea></textarea><p id="error"></p></form>');globalThis.document=document;
  const form=document.querySelector('form'),input=form.querySelector('textarea'),error=form.querySelector('#error');
  input.value=requests[index];
  const state={owner,clock:Date.UTC(2026,9,28,14),calls:[],receipts:new Map(),writes:0,rpcCalls:0,plan:null,
    provider:core?cleanCreateExtraction(index,run):raw(index,run),lose:false,persistenceError:false};
  const env={VERCEL_ENV:'test',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',
    CREATE_CORE_REPLACEMENT_ENABLED:core?'true':'false',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',
    STRUCTURED_WATCH_TEST_USER_IDS:owner+','+other,STRUCTURED_WATCH_SIGNING_SECRET:'isolated-local-fixture-secret-'.repeat(2),
    STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true'};
  const authenticate=async()=>({user:{id:state.owner}});
  configureStructuredWatchCreation({getState:()=>({status:'authenticated',session:{user:{id:state.owner},access_token:'fixture-only'}})});
  const plan=createPlanWatchMiddleware({env,authenticate,apiKey:'fixture-only',fetchImpl:async()=>
    Response.json({output_text:JSON.stringify(state.provider)})});
  const save=createStructuredWatchMiddleware({creationOnly:true,env,authenticate,now:()=>state.clock,serviceClient:{async rpc(name,p){
    assert.equal(name,'persist_structured_watch_v1');state.rpcCalls++;
    if(state.persistenceError)return {error:{code:'XX000'}};
    const previous=state.receipts.get(p.p_mutation);
    if(previous){
      if(previous.ownerId!==p.p_owner||previous.id!==p.p_id||previous.payloadFingerprint!==p.p_payload_fingerprint)
        return {error:{code:'PT409',message:'STRUCTURED_MUTATION_CONFLICT'}};
      return {data:previous};
    }
    const receipt={id:p.p_id,ownerId:p.p_owner,mutationId:p.p_mutation,operation:p.p_operation,expectedRevision:p.p_revision,
      revision:1,definitionFingerprint:p.p_definition_fingerprint,payloadFingerprint:p.p_payload_fingerprint,monitoringState:'paused'};
    state.writes++;state.receipts.set(p.p_mutation,receipt);return {data:receipt};
  }}});
  const dispatch=async(path,body,method=body?'POST':'GET')=>{
    const request=Readable.from(body?[JSON.stringify(body)]:[]);request.url=path;request.method=method;
    let result;const response={setHeader(){},end(value){result=JSON.parse(value);}};
    await (path.startsWith('/api/plan-watch')?plan:save)(request,response,()=>assert.fail('unexpected route'));
    return {status:response.statusCode,body:result};
  };
  let id=index*100+run*10;
  const controller=initStructuredWatchCreation({form,input,error,getLanguage:()=> 'en',uuid:()=>uuid(++id),
    listen:(node,event,fn)=>node?.addEventListener(event,fn),fetchImpl:async(path,options)=>{
      assert(['/api/structured-watches','/api/plan-watch?mode=create-core.v1','/api/plan-watch?mode=interpretation.v1'].includes(path));
      const body=options.body?JSON.parse(options.body):undefined;state.calls.push({path,body});
      const result=await dispatch(path,body,options.method);
      if(path.includes('create-core.v1')&&result.status===200)state.plan=result.body;
      if(body?.action==='confirm'&&state.lose){state.lose=false;throw Error('lost response');}
      return Response.json(result.body,{status:result.status});
    }});
  await until(()=>controller.isEnabled());
  const close=()=>{state.receipts.clear();configureStructuredWatchCreation(null);globalThis.document=previous;};
  t.after(close);
  return {state,form,input,error,controller,dispatch,close,panel:()=>form.querySelector('[data-structured-review]'),
    buttons:()=>[...form.querySelectorAll('[data-structured-review] button')],
    run:()=>controller.runCreateCore(input.value,'en')};
}

test('15 local client-to-API-to-signing-to-paused-persistence attempts, five cases x three variants',async t=>{
  const rows=[],first=new Map();
  for(let index=0;index<5;index++)for(let run=1;run<=3;run++){
    const h=await harness(t,index,run);const timestamp=new Date().toISOString();
    try{
      assert.equal(await h.run(),true);assert(h.panel());assert.equal(h.error.textContent,'');
      const result=h.state.plan,c=result.contract,cap=result.capability;
      const fingerprint=watchContractSemanticFingerprint(c);
      const meaning={fingerprint,capability:cap.status,saveEligible:cap.saveEligible};
      if(first.has(index))assert.deepEqual(meaning,first.get(index));else first.set(index,meaning);
      assert.deepEqual(c.constraints,[]);assert(h.panel().textContent.includes(requests[index]));
      assert.equal(h.form.querySelector('[data-structured-activate]'),null);
      let signing='NOT_ELIGIBLE',saved='NOT_ELIGIBLE';
      if(index===0||index===2){
        assert.equal(cap.status,'SUPPORTED');assert.equal(cap.adapter,'google_news_literal_v1');
        assert.match(h.panel().textContent,/Review your Watch/);assert.equal(h.state.writes,0);
        const issue=h.state.calls.find(x=>x.body?.action==='issue');assert(issue?.body.createContract);
        assert.deepEqual(issue.body.createContract,c);
        h.buttons()[0].click();h.buttons()[0].click();
        await until(()=>h.panel()?.querySelector('a'));
        assert.equal(h.state.writes,1);assert.equal(h.state.rpcCalls,1);
        assert.equal(h.state.calls.filter(x=>x.body?.action==='confirm').length,1);
        assert.equal([...h.state.receipts.values()][0].monitoringState,'paused');
        assert.match(h.panel().textContent,/not active/);signing='VERIFIED';saved='PAUSED_MOCK_RECEIPT';
      }else{
        assert.equal(h.buttons().length,2);assert.equal(h.state.calls.some(x=>x.body?.action==='issue'),false);
        assert.equal(h.state.rpcCalls,0);
        assert.match(h.panel().textContent,index===3?/Please clarify/:/cannot be monitored yet/);
        assert.equal(cap.status,index===3?'PARTIALLY_SUPPORTED':'UNSUPPORTED');
      }
      if(index===1){assert.equal(c.time_scope[0].value,'2026-Q3');assert.equal(c.source_preference.policy,'any');}
      if(index===3)assert.deepEqual(c.trigger.comparison,{comparator:'gt',value:'1.17',unit:'EUR'});
      if(index===4)assert.deepEqual(c.source_preference.urls,[requests[index]]);
      rows.push({case:index+1,run,timestamp,request:requests[index],semanticFingerprint:fingerprint,
        semantic:'VALID',capability:cap.status,review:index===0||index===2?'REVIEW':index===3?'CLARIFICATION':'UNSUPPORTED',
        signedConfirmation:signing,saveEligible:cap.saveEligible,saveResult:saved,
        genericFailure:false,semanticDrift:false,capabilityDrift:false,inventedConstraint:false,persistenceError:false});
    }finally{h.close();}
  }
  assert.equal(rows.length,15);console.log('LOCAL_FULL_CREATE_ATTEMPTS '+JSON.stringify(rows));
});

test('resolver is deterministic, preserves meaning, and exposes unmet requirements without creating adapters',()=>{
  for(let i=0;i<5;i++){
    const contract=reviewCreateExtraction(raw(i),requests[i]).contract,snapshot=structuredClone(contract);
    const a=resolveWatchContractCapability(contract),b=resolveWatchContractCapability(contract);
    assert.deepEqual(a,b);assert.deepEqual(contract,snapshot);
    assert.equal(a.status,[ 'SUPPORTED','UNSUPPORTED','SUPPORTED','PARTIALLY_SUPPORTED','UNSUPPORTED'][i]);
    if(!a.saveEligible){assert.equal(a.adapter,null);assert(a.unmetRequirements.length);}
  }
});

test('unsupported/partial contracts and fabricated support cannot obtain save tokens',async t=>{
  for(const index of [1,3,4]){
    const h=await harness(t,index);try{
      await h.run();const news=reviewCreateExtraction(raw(0),requests[0]);
      const contract=structuredClone(h.state.plan.contract);contract.capability_status='SUPPORTED';
      const result=await h.dispatch('/api/structured-watches',{action:'issue',operation:'create',watchId:uuid(900),mutationId:uuid(901),
        expectedRevision:0,title:'Rejected',createContract:contract,interpretation:news.interpretation,plan:news.assessment.plan});
      assert.equal(result.body.code,'MONITORING_PLAN_NOT_SUPPORTED');assert.equal(result.body.token,undefined);assert.equal(h.state.rpcCalls,0);
    }finally{h.close();}
  }
});

test('signed confirmation rejects payload tampering, wrong owner, contract/plan mismatch and stale reviews',async t=>{
  const h=await harness(t);await h.run();
  const issue=h.state.calls.find(x=>x.body?.action==='issue').body;
  const issued=await h.dispatch('/api/structured-watches',issue);
  const confirm={action:'confirm',operation:issue.operation,watchId:issue.watchId,mutationId:issue.mutationId,
    expectedRevision:0,title:issue.title,definition:issued.body.definition,token:issued.body.token};
  const tampered=structuredClone(confirm);tampered.title='Changed after review';
  assert.equal((await h.dispatch('/api/structured-watches',tampered)).body.code,'PLAN_DEFINITION_MISMATCH');
  const forged=structuredClone(confirm);forged.token=forged.token.slice(0,-1)+(forged.token.endsWith('a')?'b':'a');
  assert.equal((await h.dispatch('/api/structured-watches',forged)).body.code,'INVALID_PLAN_AUTHORIZATION');
  h.state.owner=other;assert.equal((await h.dispatch('/api/structured-watches',confirm)).body.code,'PLAN_OWNER_MISMATCH');h.state.owner=owner;
  const mismatch=structuredClone(issue);mismatch.createContract=reviewCreateExtraction(raw(2),requests[2]).contract;
  assert.equal((await h.dispatch('/api/structured-watches',mismatch)).body.code,'INVALID_WATCH_DEFINITION');
  const source=structuredClone(issue);source.createContract.source_preference={policy:'only',urls:[],official:true};
  assert.equal((await h.dispatch('/api/structured-watches',source)).body.code,'INVALID_WATCH_DEFINITION');
  h.state.clock+=600001;assert.equal((await h.dispatch('/api/structured-watches',confirm)).body.code,'EXPIRED_PLAN_AUTHORIZATION');
  assert.equal(h.state.rpcCalls,0);
});

test('lost confirmation reply retries the same signed mutation without duplicate mocked records',async t=>{
  const h=await harness(t);await h.run();h.state.lose=true;h.buttons()[0].click();
  await until(()=>/could not be confirmed/.test(h.error.textContent));assert.equal(h.state.writes,1);
  h.buttons()[0].click();await until(()=>h.panel().querySelector('a'));
  const bodies=h.state.calls.filter(x=>x.body?.action==='confirm').map(x=>x.body);
  assert.equal(bodies.length,2);assert.deepEqual(bodies[0],bodies[1]);assert.equal(h.state.writes,1);
  assert.equal(h.state.calls.filter(x=>x.path.includes('plan-watch')).length,1);
});

test('changed input/account invalidates UI confirmation and blocks save',async t=>{
  const h=await harness(t);await h.run();const button=h.buttons()[0];
  h.input.value+=' changed';h.input.dispatchEvent(new h.input.ownerDocument.defaultView.Event('input'));button.click();
  assert.equal(h.state.rpcCalls,0);assert.equal(h.panel(),null);
  h.input.value=requests[0];await h.run();h.state.owner=other;h.buttons()[0].click();
  assert.equal(h.state.rpcCalls,0);assert.match(h.error.textContent,/changed/);
});

test('opt-in remains disabled by default',async t=>{
  const h=await harness(t,0,1,{core:false});assert.equal(await h.run(),false);
  assert.equal(h.state.calls.some(x=>x.path.includes('plan-watch')),false);
});

test('isolated SQL: new-contract issuance and existing signed confirmation use atomic idempotent paused RPC',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for(const file of (await readdir(dir)).sort().filter(f=>f.endsWith('.sql')&&f<='20261012140000_structured_watch_confirmation.sql'))
      await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
    await db.query('insert into auth.users values($1,$2)',[owner,'fixture@example.test']);
    const env={VERCEL_ENV:'test',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',CREATE_CORE_REPLACEMENT_ENABLED:'true',
      STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,
      STRUCTURED_WATCH_SIGNING_SECRET:'in-memory-sql-fixture-only-'.repeat(2)};
    const handler=createStructuredWatchMiddleware({creationOnly:true,env,authenticate:async()=>({user:{id:owner}}),
      serviceClient:{rpc:async(name,p)=>{
        assert.equal(name,'persist_structured_watch_v1');
        const values=[p.p_owner,p.p_id,p.p_operation,p.p_mutation,p.p_revision,p.p_title,p.p_source,p.p_definition,p.p_definition_fingerprint,p.p_payload_fingerprint];
        const data=await db.transaction(async tx=>{
          await tx.exec('set local role service_role');
          await tx.query("select set_config('request.jwt.claim.role','service_role',true)");
          return tx.query('select public.persist_structured_watch_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) receipt',values);
        });return {data:data.rows[0].receipt};
      }}});
    const invoke=async body=>{
      const response={setHeader(){},end(s){this.body=JSON.parse(s);}};
      await handler({url:'/api/structured-watches',method:'POST',body},response);
      assert.equal(response.statusCode,200,JSON.stringify(response.body));return response.body;
    };
    for(const index of [0,2]){
      const p=reviewCreateExtraction(raw(index),requests[index]);
      const identity={operation:'create',watchId:uuid(700+index),mutationId:uuid(800+index),expectedRevision:0,title:'Local paused fixture'};
      const issued=await invoke({action:'issue',...identity,createContract:p.contract,interpretation:p.interpretation,plan:p.assessment.plan});
      const payload={action:'confirm',...identity,definition:issued.definition,token:issued.token};
      const receipt=await invoke(payload);assert.deepEqual(await invoke(payload),receipt);
      assert.equal(receipt.receipt.ownerId,owner);assert.equal(receipt.receipt.monitoringState,'paused');
    }
    const rows=(await db.query('select user_id,monitoring_state,last_checked_at from public.watches')).rows;
    assert.equal(rows.length,2);for(const row of rows){assert.equal(row.user_id,owner);assert.equal(row.monitoring_state,'paused');assert.equal(row.last_checked_at,null);}
    assert.equal((await db.query('select count(*)::int n from public.structured_watch_mutations')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
  }finally{await db.close();}
});
