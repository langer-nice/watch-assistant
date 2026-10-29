import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { createWatchContractFromInterpretation, reviewCreateExtraction } from './create-contract-bridge.js';
import { normalizeWatchContract, watchContractSemanticFingerprint } from './watch-contract.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';
import { compileMonitoringPlan } from '../src/js/watch-capabilities.js';
import { cleanCreateExtraction } from './test-support/create-semantic-fixtures.js';

const owner='11111111-1111-4111-8111-111111111111';
const env={VERCEL_ENV:'test',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',
  STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',
  STRUCTURED_WATCH_TEST_USER_IDS:owner,CREATE_CORE_REPLACEMENT_ENABLED:'true'};
const requests=[
  'Tell me when there are important new developments about Manchester City.',
  'Tell me when Microsoft publishes its Q3 2026 earnings results.',
  'Tell me when there are important new developments about Jannik Sinner.',
  'Tell me when GBP/EUR goes above 1.17.',
  'https://www.bbc.com/news/topics/c6vgy427vxklt',
];
function extraction(index,run=1){
  const request=requests[index];let v;
  if(index===3){
    v=fixture(request,[{...individual('base','GBP','currency'),canonicalCode:'GBP'},
      {...individual('quote','EUR','currency'),canonicalCode:'EUR'}],
      [{...predicate('rate','numeric',['base','quote'],'exchange_rate'),operator:'gt',amount:'1.17',unit:'EUR'}],
      {domain:'currency',intent:'numeric_condition'});
  }else{
    const label=index===0?'Manchester City':index===1?'Microsoft':'Jannik Sinner';
    v=fixture(request,[individual('name',label,index===2?'person':'organization')],
      [predicate('condition',index===1?'event':'news_about',['name'],index===1?'earnings_results_publication':null)],
      index===1?{intent:'event',temporal:[{text:'Q3 2026',relation:'unspecified',start:null,end:null,timezone:null}]}:{});
    if(index===1&&run===2){v.domain='official_company';v.conditions[0].value='official_company_announcement';}
    if(index===1&&run===3){v.intent='ongoing_news';v.conditions[0].kind='news_about';v.conditions[0].value=null;}
    if((index===0||index===2)&&run===3){
      v.topics=[{label:'important new developments',role:'required'}];
      v.evidence.push({path:'/topics/0',start:request.indexOf('important'),end:request.indexOf('important')+26,text:'important new developments'});
    }
  }
  // Intentionally incompatible technical domain/intent in run 2: meaning is grounded.
  if(index!==1&&run===2){v.domain='other';v.intent='event';}
  const {originalRequest,...output}=v;
  output.evidence=output.evidence.map(({path,text})=>({path,quote:text,context:null}));
  return output;
}
const provider=value=>async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(options.body).store,false);
  return new Response(JSON.stringify({output_text:JSON.stringify(value)}));
};
const options=value=>({env,authenticate:async()=>({user:{id:owner}}),apiKey:'synthetic-local-key',fetchImpl:provider(value)});
async function call(body,opts,url='/api/plan-watch?mode=create-core.v1'){
  const request=Readable.from([JSON.stringify(body)]);request.method='POST';request.url=url;
  const response={setHeader(){},end(text){this.body=JSON.parse(text);}};
  await createPlanWatchMiddleware(opts)(request,response,()=>assert.fail('route not mounted'));
  return response;
}

test('15 real loopback HTTP planning attempts: five frozen cases, three changing extraction fixtures each',async()=>{
  let current,providerCalls=0,authCalls=0;
  const middleware=createPlanWatchMiddleware({env,authenticate:async()=>{authCalls++;return {user:{id:owner}};},
    apiKey:'synthetic-local-key',fetchImpl:async(...args)=>{providerCalls++;return provider(current)(...args);}});
  const server=createServer((req,res)=>{middleware(req,res,()=>{res.statusCode=404;res.end();}).catch(()=>{res.statusCode=500;res.end('{}');});});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}/api/plan-watch?mode=create-core.v1`;
  const rows=[];
  try{
    for(let index=0;index<5;index++){
      let first;
      for(let run=1;run<=3;run++){
        current=cleanCreateExtraction(index,run);
        const beforeCalls=providerCalls;
        const timestamp=new Date().toISOString();
        const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({operation:'create',request:requests[index],language:'en'})});
        const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
        assert.equal(providerCalls-beforeCalls,index===4?0:1);
        assert.equal(result.capability.status,['SUPPORTED','UNSUPPORTED','SUPPORTED','PARTIALLY_SUPPORTED','UNSUPPORTED'][index]);
        assert.equal(result.mode,'create-core.v1');assert.equal(result.status,'interpreted');assert.equal(result.executable,false);
        assert.deepEqual(normalizeWatchContract(result.contract),result.contract);
        assert.equal(result.contract.user_intent_text,requests[index]);assert.deepEqual(result.contract.constraints,[]);
        if(first)assert.deepEqual(result,first);else first=result;
        const c=result.contract;
        if(index===1){assert.equal(c.time_scope[0].value,'2026-Q3');assert.equal(c.source_preference.policy,'any');
          assert.equal(result.assessment.status,'unsupported');assert(result.assessment.issues.some(i=>i.code==='unsupported_event_detection'));}
        if(index===3){assert.deepEqual(c.trigger.comparison,{comparator:'gt',value:'1.17',unit:'EUR'});
          assert.equal(result.assessment.status,'clarification_required');}
        if(index===4){assert.deepEqual(c.source_preference.urls,[requests[4]]);assert.equal(result.interpretation,null);
          assert.equal(result.assessment.issues[0].code,'CREATE_FORMAT_UNSUPPORTED');}
        rows.push({case:index+1,run,timestamp,http:response.status,request:requests[index],
          category:result.status,contract:{subject:c.subject[0].value,trigger:c.trigger,time_scope:c.time_scope,
            source_preference:c.source_preference},projection:result.projectionStatus,
          capability:result.assessment.status,capabilityReasons:[...(result.assessment.issues||[]),...(result.assessment.clarifications||[])].map(i=>i.code),
          semanticFingerprint:watchContractSemanticFingerprint(c),genericFailure:false,drift:false});
      }
    }
    assert.equal(providerCalls,12);assert.equal(authCalls,15);
    console.log('LOCAL_CREATE_ATTEMPTS '+JSON.stringify(rows));
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('bridge neutralizes model domain, intent and event-family tags before old semantic validation',()=>{
  for(const index of [0,1,2,3]){
    const first=reviewCreateExtraction(extraction(index,1),requests[index]);
    assert.deepEqual(reviewCreateExtraction(extraction(index,2),requests[index]),first);
  }
});
test('invented required topics converge; arbitrary unsupported topics reject',()=>{
  for(const index of [0,2]){
    assert.deepEqual(createWatchContractFromInterpretation(extraction(index,3),requests[index]),
      createWatchContractFromInterpretation(extraction(index,1),requests[index]));
    const raw=extraction(index,3);raw.topics[0].label='transfers';
    assert.throws(()=>reviewCreateExtraction(raw,requests[index]),{code:'INVALID_CREATE_CONTRACT'});
  }
});
test('invented official-source semantic requirements cannot pass, unlike discarded technical tags',()=>{
  const raw=extraction(1);raw.unresolvedRequirements=[{text:'official sources only',reason:'OFFICIAL_ONLY'}];
  raw.evidence.push({path:'/unresolvedRequirements/0',quote:'official sources only',context:null});
  assert.throws(()=>reviewCreateExtraction(raw,requests[1]),{code:'INVALID_CREATE_CONTRACT'});
});
test('malformed, ambiguous, wrong-subject, bad evidence and conflicting decimal candidates fail safely',()=>{
  for(const change of [
    v=>{delete v.subjects;},v=>{v.subjects[0].label='Liverpool';},
    v=>{v.evidence[0].quote='not in request';},v=>{v.evidence[0].path='/subjects/9/label';},
    v=>{v.subjects[0].id=v.conditions[0].id;},
    v=>{v.conditions[0].subjects=['missing'];},
  ]){const raw=extraction(0);change(raw);assert.throws(()=>reviewCreateExtraction(raw,requests[0]),{code:'INVALID_CREATE_CONTRACT'});}
  const ambiguous=extraction(0);ambiguous.ambiguities=[{field:'subject',alternatives:['team','other'],question:'Which subject?'}];
  assert.throws(()=>reviewCreateExtraction(ambiguous,requests[0]),{code:'CREATE_CLARIFICATION_REQUIRED'});
  const wrong=extraction(3);wrong.conditions[0].amount='1.18';
  assert.throws(()=>reviewCreateExtraction(wrong,requests[3]),{code:'INVALID_CREATE_CONTRACT'});
});
test('existing Man City execution criteria remain equivalent; no new save path',()=>{
  const raw=extraction(0),result=reviewCreateExtraction(raw,requests[0]);
  const old=fixture(requests[0],[individual('s1','Manchester City')],[predicate('c1','news_about',['s1'])]);
  assert.deepEqual(result.assessment.plan.criteria,compileMonitoringPlan(old,{structured:true}).criteria);
  assert.equal(result.executable,false);assert.equal(result.token,undefined);assert.equal(result.receipt,undefined);
});
test('replacement API mode is gated, local-only, new-create-only and independently authenticated',async()=>{
  const body={request:requests[0],operation:'create'};
  for(const deployment of ['preview','production']){
    const opts=options(extraction(0));opts.env={...env,VERCEL_ENV:deployment};
    opts.fetchImpl=()=>assert.fail('provider must not run');
    assert.equal((await call(body,opts)).statusCode,404);
  }
  const disabled=options(extraction(0));disabled.env={...env,CREATE_CORE_REPLACEMENT_ENABLED:'false'};
  assert.equal((await call(body,disabled)).statusCode,404);
  const forbidden=options(extraction(0));forbidden.authenticate=async()=>({user:{id:'22222222-2222-4222-8222-222222222222'}});
  assert.equal((await call(body,forbidden)).statusCode,403);
  const anonymous=options(extraction(0));anonymous.authenticate=async()=>({user:null});
  assert.equal((await call(body,anonymous)).statusCode,401);
  for(const extra of [{operation:'update'},{watchId:owner},{operation:undefined},{language:'invalid'}]){
    const opts=options(extraction(0));opts.fetchImpl=()=>assert.fail('provider must not run');
    assert.equal((await call({...body,...extra},opts)).statusCode,400);
  }
});
test('invalid extraction returns safe typed API error; old interpretation mode stays distinct',async()=>{
  const raw=extraction(0);delete raw.subjects;
  const r=await call({operation:'create',request:requests[0]},options(raw));
  assert.equal(r.statusCode,422);assert.equal(r.body.code,'INVALID_CREATE_CONTRACT');assert.equal(r.body.executable,false);
  const old=await call({request:requests[0]},options(extraction(0)),'/api/plan-watch?mode=interpretation.v1');
  assert.equal(old.statusCode,200);assert.equal(old.body.mode,'interpretation.v1');assert.equal(old.body.contract,undefined);
});
test('URL uses the unified exact-resource branch without legacy discovery or a model',async()=>{
  const opts=options(null);opts.fetchImpl=()=>assert.fail('No model or URL fetch');
  opts.discoverSource=()=>assert.fail('No legacy source discovery');
  const r=await call({operation:'create',request:requests[4]},opts);
  assert.equal(r.statusCode,200);assert.equal(r.body.contract.input_source.submitted_url,requests[4]);
});

test('Preview preparation gate requires the exact branch, Staging backend and every delivery gate disabled',async()=>{
  const opts=options(null);opts.env={...env,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/create-clean-slice-b',
    STRUCTURED_PRODUCTION_ENABLED:'false',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'false',STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'false',
    WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'false',
    STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'false',MEDIA_WATCH_DAILY_DIGEST_ENABLED:'false',VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED:'false'};
  const body={operation:'create',request:requests[4]};
  assert.equal((await call(body,opts)).statusCode,200);
  for(const change of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'master'},{VERCEL_GIT_COMMIT_REF:'codex/create-core-slice3'},{SUPABASE_URL:'https://example.supabase.co'},
    {WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true'},{STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true'},{CREATE_CORE_REPLACEMENT_ENABLED:'false'}])
    assert.equal((await call(body,{...opts,env:{...opts.env,...change}})).statusCode,404);
});
