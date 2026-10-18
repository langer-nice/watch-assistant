import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretWatchRequest} from './watch-interpreter.js';
import {assessCapabilities} from '../src/js/watch-capabilities.js';
import {validateInterpretation} from '../src/js/watch-interpretation.js';
import {fixture,individual,predicate} from './test-support/watch-interpretation-fixtures.js';

const current='CURRENT_ROLE_HOLDER_UNVERIFIED',relative='RELATIVE_ROLE_HOLDER_UNVERIFIED';
const role=(request,label,{topic,language='en',reason=current}={})=>fixture(request,[individual('subject',label,'person')],[predicate('news','news_about',['subject'])],{
 language,topics:topic?[{label:topic,role:'required'}]:[],unresolvedRequirements:[{text:label,reason}],
});
const interpret=async value=>{
 let calls=0;
 const result=await interpretWatchRequest(value.originalRequest,{roleResolver:async()=>null,apiKey:'offline-fixture-only',model:'configured-model',language:value.language,fetchImpl:async(_url,options)=>{
  calls++;const body=JSON.parse(options.body);assert.equal(JSON.parse(body.input).request,value.originalRequest);assert.equal(body.model,'configured-model');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
  assert.match(body.instructions,/No verified current-officeholder data or lookup tool is supplied/);
  assert.match(body.instructions,/CURRENT_ROLE_HOLDER_UNVERIFIED/);assert.match(body.instructions,/RELATIVE_ROLE_HOLDER_UNVERIFIED/);
  assert.match(body.instructions,/health of a subject is a required health topic/);
  assert.doesNotMatch(body.instructions,/\b(?:pope|pape|Apple)\b/i,'Policy must not be a special-case identity mapping');
  const{originalRequest,...output}=value;output.evidence=output.evidence.map(({path,text})=>({path,quote:text,context:null}));
  return Response.json({output_text:JSON.stringify(output)});
 }});
 assert.equal(calls,1);assert.deepEqual(result.interpretation,value);assert.equal(result.executable,false);return result;
};

for(const [request,label,options] of [
 ["Keep me informed on the pope's health.",'the pope',{topic:'health'}],
 ['Keep me updated on news about the current pope.','the current pope',{}],
 ['News about the previous pope.','the previous pope',{reason:relative}],
 ['News about the president of France.','the president of France',{}],
 ["News about Apple's CEO.","Apple's CEO",{}],
 ['Actualités sur le président actuel de la France.','le président actuel de la France',{language:'fr'}],
 ['Tiens-moi informé de la santé du pape.','pape',{topic:'santé',language:'fr'}],
 ['Actualités sur le pape actuel.','le pape actuel',{language:'fr'}],
 ['Actualités sur le pape précédent.','le pape précédent',{language:'fr',reason:relative}],
 ["Actualités sur le PDG d’Apple.",'le PDG d’Apple',{language:'fr'}],
])test('grounded role reference, precise capability limitation, no invented holder: '+request,async()=>{
 const result=await interpret(role(request,label,options)),v=result.interpretation,assessment=assessCapabilities(v,{structured:true});
 assert.equal(result.status,'unresolved');assert.equal(v.domain,'media_news');assert.equal(v.intent,'ongoing_news');assert.deepEqual(v.ambiguities,[]);assert.deepEqual(v.subjects.map(s=>s.label),[label]);
 assert.equal(assessment.status,'unsupported');assert.deepEqual(assessment.clarifications,[]);assert.equal(assessment.plan,null);assert(assessment.issues.some(i=>i.code==='unsupported_role_resolution'));
 if(options.topic){assert.deepEqual(v.topics,[{label:options.topic,role:'required'}]);assert.equal(v.conditions[0].kind,'news_about');}
});

for(const [request,label,alternatives,question] of [
 ['News about a former president of France.','former president of France',['one named former president','all former presidents'],'Which former president, or all former presidents?'],
 ['News about the reigning monarch.','the reigning monarch',['a specified country','a specified royal house'],'Which country or royal house?'],
 ['News about Jordan.','Jordan',['the person you have in mind','another person named Jordan'],'Which person named Jordan?'],
 ['Actualités sur un ancien président de France.','ancien président de France',['un ancien président nommé','tous les anciens présidents'],'Quel ancien président, ou tous les anciens présidents ?'],
])test('genuine historical/scope ambiguity is preserved: '+request,async()=>{
 const v=fixture(request,[individual('s',label,'person')],[predicate('n','news_about',['s'])],{language:request.startsWith('Actualités')?'fr':'en',ambiguities:[{field:'subject',alternatives,question}]});
 const result=await interpret(v),a=assessCapabilities(result.interpretation,{structured:true});assert.equal(result.status,'ambiguous');assert.equal(a.clarifications.length,1);assert.equal(a.plan,null);assert.equal(result.interpretation.ambiguities[0].question,question);
});

for(const [request,topic,language] of [["Keep me informed about the health of Pope Francis.",'health','en'],['Tiens-moi informé de la santé du pape François.','santé','fr']])test('explicit named person and required health topic remain supported: '+language,async()=>{
 const name=language==='fr'?'pape François':'Pope Francis';
 const v=fixture(request,[individual('s',name,'person')],[predicate('n','news_about',['s'])],{language,topics:[{label:topic,role:'required'}]});
 const a=assessCapabilities((await interpret(v)).interpretation,{structured:true});assert.equal(a.status,'supported');assert.deepEqual(a.plan.criteria.subjects,[name]);assert.deepEqual(a.plan.criteria.topics,[topic]);
});

test('unrelated unsupported health constraint is retained alongside role limitation',async()=>{
 const request="Keep me informed on the pope's health with guaranteed exhaustive coverage.";
 const v=role(request,'the pope',{topic:'health'});v.unresolvedRequirements.push({text:'guaranteed exhaustive coverage',reason:'No exhaustive-source guarantee'});
 const start=request.indexOf('guaranteed exhaustive coverage');v.evidence.push({path:'/unresolvedRequirements/1',start,end:start+'guaranteed exhaustive coverage'.length,text:'guaranteed exhaustive coverage'});
 const a=assessCapabilities((await interpret(v)).interpretation,{structured:true});assert.equal(a.status,'unsupported');assert(a.issues.some(i=>i.code==='unsupported_role_resolution'));assert(a.issues.some(i=>i.code==='unresolved_requirement'));assert.equal(a.plan,null);
});

test('strict grounding forbids substituting an unstated current or former holder',()=>{
 const v=role("Keep me informed on the pope's health.",'the pope',{topic:'health'});
 for(const name of ['Invented Officeholder','Pope Francis']){const changed=structuredClone(v);changed.subjects[0].label=name;assert.throws(()=>validateInterpretation(changed),{code:'INTERPRETATION_FAILED'});}
 const changed=structuredClone(v);changed.subjects[0].currentHolder='Invented Officeholder';assert.throws(()=>validateInterpretation(changed),{code:'INTERPRETATION_FAILED'});
});

for(const [request,label,type] of [['Keep me updated on Jannik Sinner.','Jannik Sinner','person'],['Tiens-moi informé des actualités de Gucci.','Gucci','organization'],['Keep me updated on news about Royal Caribbean Group.','Royal Caribbean Group','organization']])test('existing named-subject contract preserved: '+label,async()=>{
 const v=fixture(request,[individual('s',label,type)],[predicate('n','news_about',['s'])],{language:request.startsWith('Tiens')?'fr':'en'}),a=assessCapabilities((await interpret(v)).interpretation,{structured:true});
 assert.equal(a.status,'supported');assert.equal(a.plan.adapter,'google_news_literal_v1');assert.deepEqual(a.plan.criteria.subjects,[label]);assert.deepEqual(a.plan.criteria.topics,[]);
});
