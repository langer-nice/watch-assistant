import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { watchContractSemanticFingerprint } from './watch-contract.js';
import { frameRequests,createFrameFixture,newsFrame } from './test-support/create-frame-fixtures.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={VERCEL_ENV:'test',CREATE_CORE_REPLACEMENT_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',
  SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_TEST_USER_IDS:owner};
const aliases={key:'fixture:identity:1',label:'Manchester City',mentions:['Manchester City','Man City'],referenceVersion:'offline-reference.v1',sourceUrl:'https://identity-fixture.invalid/1'};
// Server-only verified-reference fixture, not a production dictionary or a
// claim that an independent real-world alias source has been integrated.
const verifiedIdentityLookup=mention=>aliases.mentions.includes(mention)?[aliases]:[];
test('39 real local API attempts: 12 subjects + 12 paraphrases + 15 frozen; no live provider or persistence',async()=>{
  let current,providerCalls=0;const events=[],rows=[];
  const middleware=createPlanWatchMiddleware({env,verifiedIdentityLookup,authenticate:async()=>({user:{id:owner}}),apiKey:'offline-only',
    logger:{info:(_,json)=>events.push(JSON.parse(json))},fetchImpl:async(_url,init)=>{
      providerCalls++;const b=JSON.parse(init.body);assert.equal(b.text.format.name,'create_semantic_frame_v1');assert.equal(b.text.format.strict,true);
      return Response.json({output_text:JSON.stringify(current)});
    }});
  const server=createServer((req,res)=>middleware(req,res,()=>{res.statusCode=404;res.end();}).catch(e=>{res.statusCode=500;res.end(JSON.stringify({error:e.code}));}));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const groups=[['syntax',['Manchester City','Manchester United','PSG','SpaceX'].map(s=>({request:`Tell me when there are important new developments about ${s}.`,subject:s}))],
    ['paraphrase',[
      {request:frameRequests[0],subject:'Manchester City'},
      {request:'Keep me informed about Man City.',subject:'Man City'},
      {request:'I want news about Man City.',subject:'Man City'},
      {request:'Let me know when there is important news about Man City.',subject:'Man City'},
    ]],['frozen',frameRequests.map((request,index)=>({request,index}))]];
  const url=`http://127.0.0.1:${server.address().port}/api/plan-watch?mode=create-core.v1`;
  let paraphraseFingerprint;
  try{
    for(const [group,cases]of groups)for(const [caseIndex,c]of cases.entries()){
      let fingerprint;
      for(let run=1;run<=3;run++){
        current=group==='frozen'?createFrameFixture(c.index,run):newsFrame(c.subject,c.request);
        const before=providerCalls,startEvents=events.length;
        const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'create',request:c.request,language:'en'})});
        const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
        const contract=body.contract,frame=contract.recognition.frame;
        const fp=watchContractSemanticFingerprint(contract,{verifiedIdentityLookup});
        if(fingerprint)assert.equal(fp,fingerprint);else fingerprint=fp;
        if(group==='paraphrase'){if(paraphraseFingerprint)assert.equal(fp,paraphraseFingerprint);else paraphraseFingerprint=fp;}
        if(group!=='frozen')assert.equal(frame.monitoring_goal.kind,'ongoing_developments');
        const expected=group==='frozen'?['SUPPORTED','UNSUPPORTED','SUPPORTED','PARTIALLY_SUPPORTED','UNSUPPORTED'][c.index]:'SUPPORTED';
        assert.equal(body.capability.status,expected);assert.equal(providerCalls-before,group==='frozen'&&c.index===4?0:1);
        const trace=events.slice(startEvents);assert(!trace.some(e=>e.status==='FAIL'));assert.equal(trace.at(-1).last_pass_stage,'review');
        if(group==='frozen'&&c.index===3)assert.deepEqual(contract.trigger.comparison,{comparator:'gt',value:'1.17',unit:'EUR'});
        if(group==='frozen'&&c.index===4)assert.equal(contract.input_source.submitted_url,c.request);
        if(group==='frozen'&&c.index===1){assert.equal(contract.time_scope[0].value,'2026-Q3');assert.equal(contract.source_preference.official,false);}
        rows.push({group,case:caseIndex+1,run,timestamp:new Date().toISOString(),http:response.status,
          correlation:trace[0].correlation_id,goal:frame.monitoring_goal.kind,identity:contract.recognition.identity,
          capability:body.capability.status,fingerprint:fp,comparison:contract.trigger.comparison,url:contract.input_source.submitted_url});
      }
    }
    assert.equal(rows.length,39);assert.equal(providerCalls,36);
    console.log('SLICE2B_LOCAL_ATTEMPTS '+JSON.stringify(rows));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
