import test from 'node:test';
import assert from 'node:assert/strict';
import {reconstructInterpretation,validateInterpretation,safeValidationDiagnostic} from '../src/js/watch-interpretation.js';
import {createPlanWatchMiddleware} from './plan-watch-api.js';
import {structuredCreationError} from '../src/js/structured-watch-creation.js';
import {fixture,individual,predicate} from './test-support/watch-interpretation-fixtures.js';

const request='Tell me when Microsoft publishes its Q3 2026 earnings results, including revenue, EPS, guidance or major AI/cloud commentary.';
const privateValue='private-model-value-never-log';
const valid=()=>fixture(request,[individual('microsoft','Microsoft')],[predicate('news','news_about',['microsoft'])]);
const output=value=>{const {originalRequest,...body}=value;return {...body,evidence:value.evidence.map(({path,text})=>({path,quote:text,context:null}))};};
const checkFailure=(run,expected)=>assert.throws(run,error=>{
 assert.equal(error.code,'INTERPRETATION_FAILED');assert.equal(error.statusCode,502);
 assert.equal(error.message,'Structured interpretation failed validation.');
 const diagnostic=safeValidationDiagnostic(error);assert(diagnostic);assert.equal(diagnostic.predicate,expected);
 assert.equal(diagnostic.category,'STRUCTURED_VALIDATION');assert(diagnostic.expected);assert(diagnostic.actual);
 assert(!JSON.stringify(diagnostic).includes(privateValue));assert(!JSON.stringify(diagnostic).includes(request));
 assert.equal(error.validationDiagnostic,diagnostic);assert(!JSON.stringify(error).includes('validationDiagnostic'));
 return true;
});

test('valid reconstruction and validation unchanged; no diagnostic generated',()=>{
 const value=valid();assert.deepEqual(reconstructInterpretation(output(value),request),value);
 assert.deepEqual(validateInterpretation(value),value);
 assert.equal(safeValidationDiagnostic({validationDiagnostic:{predicate:privateValue}}),undefined);
});

for(const [name,mutate,expected] of [
 ['extra arbitrary key',v=>{v[privateValue]=privateValue;},'schema.object_keys'],
 ['missing required field',v=>{delete v.recurrence;},'schema.object_keys'],
 ['unsafe enum',v=>{v.recurrence=privateValue;},'schema.enum'],
 ['subject union',v=>{v.subjects[0].kind=privateValue;},'schema.any_of'],
 ['identifier pattern',v=>{v.subjects[0].id='Unsafe '+privateValue;},'schema.any_of'],
 ['evidence quotation',v=>{v.evidence[0].quote=privateValue;},'evidence.unique_quote'],
 ['evidence pointer',v=>{v.evidence[0].path='/subjects/15/label';},'evidence.pointer_exists'],
])test('reconstruction still rejects '+name+' with private-data-free predicate metadata',()=>{
 const value=output(valid());mutate(value);checkFailure(()=>reconstructInterpretation(value,request),expected);
});

for(const [name,mutate,expected,reason] of [
 ['domain mismatch',v=>{v.domain='other';},'domain.predicate_consistency','DOMAIN_PREDICATE_CONFLICT'],
 ['subject grounding',v=>{v.subjects[0].label=privateValue;},'subject.label_grounding'],
 ['duplicate identity',v=>{v.subjects.push(structuredClone(v.subjects[0]));},'identity.unique_ids'],
 ['recurrence cue',v=>{v.recurrence='once';},'recurrence.grounded_cue'],
 ['event value',v=>{v.conditions[0].kind='event';},'predicate.required_value'],
 ['non-numeric amount',v=>{v.conditions[0].amount='3';},'predicate.non_numeric_fields'],
])test('validation still rejects '+name+' at the labeled branch',()=>{
 const value=valid();mutate(value);checkFailure(()=>validateInterpretation(value),expected);
 if(reason)assert.throws(()=>validateInterpretation(value),{reason});
});

const production={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',
 VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',
 STRUCTURED_PRODUCTION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true'};
const call=async({value=output(valid()),logger}={})=>{
 const logs=[];let calls=0;
 const handler=createPlanWatchMiddleware({env:production,apiKey:privateValue,
  authenticate:async()=>({user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}),
  logger:logger||{warn:(...args)=>logs.push(args)},
  fetchImpl:async()=>{calls++;return Response.json({output_text:JSON.stringify(value)})},
  clientFactory:()=>assert.fail('No persistence'),discoverSource:()=>assert.fail('No discovery')});
 const response={setHeader(){},end(body){this.body=JSON.parse(body)}};
 await handler({url:'/api/plan-watch?mode=interpretation.v1',method:'POST',body:{request,language:'en'}},response);
 assert.equal(calls,1);return {status:response.statusCode,body:response.body,logs};
};

test('Production handler logs exact predicate; HTTP and UI contracts unchanged',async()=>{
 const value=output(valid());value.recurrence='once';
 const result=await call({value});assert.equal(result.status,502);
 assert.deepEqual(result.body,{mode:'interpretation.v1',executable:false,code:'INTERPRETATION_FAILED',failureCategory:'STRUCTURED_VALIDATION'});
 assert.equal(result.logs.length,1);const [message,data]=result.logs[0];assert.equal(message,'structured_interpretation_failed');
 assert.equal(data.validation.validator,'validateInterpretation');assert.equal(data.validation.stage,'validation');
 assert.equal(data.validation.predicate,'recurrence.grounded_cue');
 assert(!JSON.stringify(result).includes(request));assert(!JSON.stringify(result).includes(privateValue));
 assert.equal(structuredCreationError(result.body.code,'en'),'The request could not be reviewed. Your text has been kept.');
});

test('Production reconstruction failure reaches logs only; arbitrary key/value never leaks',async()=>{
 const value=output(valid());value[privateValue]=privateValue;const result=await call({value});
 assert.equal(result.status,502);assert.equal(result.logs[0][1].validation.predicate,'schema.object_keys');
 assert.equal(result.logs[0][1].validation.validator,'reconstructInterpretation');
 assert(!JSON.stringify(result).includes(privateValue));assert(!Object.hasOwn(result.body,'validation'));
});

test('successful handler still returns review without logging or persistence; logger failure cannot alter rejection',async()=>{
 const ok=await call();assert.equal(ok.status,200);assert.deepEqual(ok.logs,[]);
 const value=output(valid());value.recurrence='once';
 const rejected=await call({value,logger:{warn(){throw Error(privateValue)}}});
 assert.equal(rejected.status,502);assert.equal(rejected.body.code,'INTERPRETATION_FAILED');
 assert(!Object.hasOwn(rejected.body,'validation'));
});

// Existing synthetic Microsoft fixture; no provider calls or production replay.
for (const [name, quote, context, quoteCount, contextCount, scope] of [
 ['quote missing', 'absent-evidence', null, 0, null, 'request'],
 ['quote duplicated', 'in', null, 3, null, 'request'],
 ['context missing', 'absent', 'absent context', 1, 0, 'context'],
 ['context duplicated', 'in', 'in', 1, 3, 'context'],
 ['multiple relationships fail', 'absent-evidence', 'in', 0, 3, 'context'],
 ['quote duplicated inside unique context', 'in', request, 3, 1, 'context'],
]) test('unique quote occurrence diagnostic: '+name,()=>{
 const value=output(valid());value.evidence[0]={...value.evidence[0],quote,context};
 assert.throws(()=>reconstructInterpretation(value,request),error=>{
  assert.equal(error.code,'INTERPRETATION_FAILED');assert.equal(error.statusCode,502);
  assert.equal(error.message,'Structured interpretation failed validation.');
  const diagnostic=safeValidationDiagnostic(error);
  assert.equal(diagnostic.predicate,'evidence.unique_quote');
  assert.deepEqual(diagnostic.actual,{
   quoteLength:quote.length,contextPresent:context!==null,contextLength:context?.length??null,
   quoteOccurrenceCount:quoteCount,contextOccurrenceCount:contextCount,quoteSearchScope:scope,
   contextFoundExactlyOnce:contextCount===null?null:contextCount===1,quoteFoundExactlyOnce:quoteCount===1,
  });
  assert(!Object.hasOwn(diagnostic.actual,'quote'));
  assert(!Object.hasOwn(diagnostic.actual,'context'));
  assert(!JSON.stringify(diagnostic).includes(request));return true;
 });
});

test('unique context can disambiguate a globally repeated quote without failure',()=>{
 const value=output(valid());value.evidence.push({path:'/conditions/0',quote:'in',context:'earnings'});
 const reconstructed=reconstructInterpretation(value,request);
 assert.equal(reconstructed.evidence.at(-1).text,'in');
 assert.equal(reconstructed.evidence.at(-1).start,request.indexOf('earnings')+4);
});

test('unique quote occurrence counting preserves overlapping rejection',()=>{
 const original='aaa '+request;
 const value=output(fixture(original,[individual('microsoft','Microsoft')],[predicate('news','news_about',['microsoft'])]));
 value.evidence[0].quote='aa';
 assert.throws(()=>reconstructInterpretation(value,original),error=>{
  assert.equal(safeValidationDiagnostic(error).predicate,'evidence.unique_quote');
  assert.equal(safeValidationDiagnostic(error).actual.quoteOccurrenceCount,2);return true;
 });
});

test('Production warning carries occurrence counts without evidence content or HTTP changes',async()=>{
 const value=output(valid());value.evidence[0].quote=privateValue;
 const result=await call({value});
 assert.equal(result.status,502);
 assert.deepEqual(result.body,{mode:'interpretation.v1',executable:false,code:'INTERPRETATION_FAILED',failureCategory:'STRUCTURED_VALIDATION'});
 const {actual}=result.logs[0][1].validation;
 assert.equal(actual.quoteOccurrenceCount,0);assert.equal(actual.contextPresent,false);
 assert.equal(actual.quoteLength,privateValue.length);
 assert(!JSON.stringify(result).includes(privateValue));assert(!JSON.stringify(result).includes(request));
});
