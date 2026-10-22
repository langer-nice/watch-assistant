import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretWatchRequest,safeInterpretationFailureCategory} from './watch-interpreter.js';
import {createPlanWatchMiddleware} from './plan-watch-api.js';
import {assessCapabilities} from '../src/js/watch-capabilities.js';
import {fixture,individual,predicate} from './test-support/watch-interpretation-fixtures.js';

const request='Keep me updated on important news about Royal Caribbean Group.';
const secret='synthetic-private-value';
const env={VERCEL_ENV:'preview',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
const value=(text=request,language='en')=>fixture(text,[individual('royal','Royal Caribbean Group')],[predicate('news','news_about',['royal'])],{language});
const output=v=>{const{originalRequest,...body}=v;return{...body,evidence:v.evidence.map(({path,text})=>({path,quote:text,context:null}))};};
const response=v=>new Response(JSON.stringify({output_text:JSON.stringify(v)}));
const call=async({fetchImpl=()=>assert.fail('No provider call'),changes={},method='POST',logger,...options}={})=>{
 const logs=[];
 const handler=createPlanWatchMiddleware({env:{...env,...changes},apiKey:secret,model:'configured-model',authenticate:async()=>({user:{id:env.STRUCTURED_WATCH_TEST_USER_IDS}}),fetchImpl,logger:logger||{warn:(...args)=>logs.push(args)},clientFactory:()=>assert.fail('No persistence'),discoverSource:()=>assert.fail('No source discovery'),...options});
 const req={url:'/api/plan-watch?mode=interpretation.v1',method,body:{request,language:'en'}};
 const res={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
 await handler(req,res);return{status:res.statusCode,body:res.body,logs};
};

for(const [status,category] of [[401,'PROVIDER_AUTH'],[403,'PROVIDER_AUTH'],[404,'PROVIDER_MODEL_OR_ENDPOINT'],[429,'PROVIDER_RATE_OR_QUOTA'],[500,'PROVIDER_SERVER'],[400,'PROVIDER_REQUEST']])test('provider HTTP '+status+' has sanitized classification, one request, no retry',async()=>{
 let calls=0;const r=await call({fetchImpl:async()=>{calls++;return new Response(secret,{status});}});
 assert.equal(calls,1);assert.equal(r.status,503);assert.equal(r.body.code,'AI_SERVICE_UNAVAILABLE');assert.equal(r.body.failureCategory,category);
 assert.deepEqual(r.logs,[['structured_interpretation_failed',{code:'AI_SERVICE_UNAVAILABLE',failureCategory:category}]]);
 assert(!JSON.stringify(r).includes(secret));assert(!JSON.stringify(r).includes(request));
});

for(const [name,fetchImpl,code,category] of [
 ['network',async()=>{throw Error(secret);},'AI_SERVICE_UNAVAILABLE','PROVIDER_NETWORK'],
 ['malformed envelope JSON',async()=>new Response(secret),'INTERPRETATION_FAILED','RESPONSE_JSON'],
 ['malformed output JSON',async()=>new Response(JSON.stringify({output_text:secret})),'INTERPRETATION_FAILED','RESPONSE_JSON'],
 ['missing output',async()=>new Response('{}'),'INTERPRETATION_FAILED','RESPONSE_JSON'],
 ['primitive output',async()=>response(null),'INTERPRETATION_FAILED','OUTPUT_SHAPE'],
 ['model-owned original request',async()=>response({...output(value()),originalRequest:request}),'INTERPRETATION_FAILED','OUTPUT_SHAPE'],
 ['malformed schema',async()=>response({unexpected:secret}),'INTERPRETATION_FAILED','STRUCTURED_VALIDATION'],
 ['ungrounded evidence',async()=>{const v=output(value());v.evidence[0].quote=secret;return response(v);},'INTERPRETATION_FAILED','STRUCTURED_VALIDATION'],
])test(name+' fails safely without private payload in logs or HTTP response',async()=>{
 let calls=0;const r=await call({fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});
 assert.equal(calls,1);assert.equal(r.body.code,code);assert.equal(r.body.failureCategory,category);assert.equal(r.body.executable,false);
 assert(!JSON.stringify(r).includes(secret));assert(!JSON.stringify(r).includes(request));
});

test('missing credential and timeout classified without fallback or retries',async()=>{
 const missing=await call({apiKey:undefined});assert.equal(missing.body.failureCategory,'PROVIDER_CONFIGURATION');
 let calls=0;await assert.rejects(interpretWatchRequest(request,{apiKey:secret,timeoutMs:5,fetchImpl:async()=>{calls++;return new Promise(()=>{});}}),e=>{assert.equal(e.code,'AI_TIMEOUT');assert.equal(e.failureCategory,'PROVIDER_TIMEOUT');return true;});assert.equal(calls,1);
});

for(const [text,language] of [[request,'en'],['Tiens-moi informé des actualités importantes de Royal Caribbean Group.','fr']])test('mocked '+language+' Royal Caribbean output parses and compiles Media/News without execution',async()=>{
 let calls=0;const r=await interpretWatchRequest(text,{apiKey:secret,model:'configured-model',language,fetchImpl:async(_url,options)=>{
  calls++;const body=JSON.parse(options.body);assert.equal(body.model,'configured-model');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return response(output(value(text,language)));
 }});
 assert.equal(calls,1);assert.equal(r.interpretation.subjects[0].label,'Royal Caribbean Group');assert.equal(r.interpretation.domain,'media_news');assert.equal(r.executable,false);
 const assessed=assessCapabilities(r.interpretation,{structured:true});assert.equal(assessed.status,'supported');assert.equal(assessed.plan.adapter,'google_news_literal_v1');assert.deepEqual(assessed.plan.criteria.subjects,['Royal Caribbean Group']);
});

test('production/other environment responses unchanged; no diagnostic logging outside authorized Staging',async()=>{
 for(const changes of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{SUPABASE_URL:'https://wrong.example.test'}]){
  const r=await call({changes,fetchImpl:async()=>response({})});assert(!Object.hasOwn(r.body,'failureCategory'));assert.deepEqual(r.logs,[]);
 }
});

test('ordinary GET never calls provider; successful review never logs or persists a Watch',async()=>{
 const get=await call({method:'GET'});assert.equal(get.status,405);assert.deepEqual(get.logs,[]);
 let calls=0;const r=await call({fetchImpl:async()=>{calls++;return response(output(value()));}});
 assert.equal(calls,1);assert.equal(r.status,200);assert.deepEqual(r.logs,[]);assert(!Object.hasOwn(r.body,'failureCategory'));assert.equal(r.body.executable,false);
});

test('arbitrary categories and logger exceptions cannot leak or change error contract',async()=>{
 assert.equal(safeInterpretationFailureCategory({failureCategory:secret}),'APPLICATION_EXCEPTION');
 const r=await call({fetchImpl:async()=>response({}),logger:{warn(){throw Error(secret);}}});
 assert.equal(r.status,502);assert.equal(r.body.code,'INTERPRETATION_FAILED');assert.equal(r.body.failureCategory,'STRUCTURED_VALIDATION');assert(!JSON.stringify(r).includes(secret));
});
