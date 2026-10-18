import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { initStructuredWatchCreation,configureStructuredWatchCreation,structuredCreationError } from './structured-watch-creation.js';
import { fixture,individual,predicate,consumerFixtures } from '../../server/test-support/watch-interpretation-fixtures.js';
import { createStructuredWatchMiddleware } from '../../server/structured-watch-api.js';
import { watchCreationState,creationConfirmationKey } from './watch-creation-state.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await tick();}assert.fail('Flow did not settle');};
const news=(request,label='Jannik Sinner',language='en',extra={})=>fixture(request,[individual('s',label,label==='Jannik Sinner'?'person':'organization')],[predicate('n','news_about',['s'])],{language,...extra});
const harness=async(t,interpretation,options={})=>{
 const previous=globalThis.document;const {document}=parseHTML('<form><textarea></textarea><p id="error"></p></form>');globalThis.document=document;
 const form=document.querySelector('form'),input=document.querySelector('textarea'),error=document.querySelector('#error');input.value=interpretation.originalRequest;
 const state={owner,language:interpretation.language,clock:Date.UTC(2026,9,12),interpretation,calls:[],records:new Map(),rpcCount:0,aiError:null,confirmFailure:null,hold:null,lose:false};
 configureStructuredWatchCreation({getState:()=>({status:'authenticated',session:{user:{id:state.owner},access_token:'fixture-only'}})});
 t.after(()=>{globalThis.document=previous;configureStructuredWatchCreation(null);});
 const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner+','+other,STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)};
 if(options.monitoring)env.STRUCTURED_MEDIA_SCHEDULED_ENABLED='true';
 const client={from(){const q={select(){return q;},eq(){return q;},is(){return q;},async range(){const saved=state.calls.find(c=>c.body?.action==='confirm')?.body;return{data:saved?[{id:saved.watchId,media_revision:1,watch_definition:saved.definition,monitoring_source:(await import('./watch-definition.js')).structuredMonitoringSource(saved.definition.plan.criteria)}]:[]};}};return q;}};
 const middleware=createStructuredWatchMiddleware({creationOnly:true,env,now:()=>state.clock,authenticate:async()=>({user:{id:state.owner},client}),serviceClient:{async rpc(_name,p){
  state.rpcCount++;if(_name==='set_structured_media_monitoring')return options.activationFailure?{error:{code:'XX000'}}:{data:true};if(state.hold)await state.hold;if(state.confirmFailure)return {error:state.confirmFailure};
  const receipt=state.records.get(p.p_id)||{id:p.p_id,ownerId:p.p_owner,mutationId:p.p_mutation,operation:p.p_operation,expectedRevision:p.p_revision,revision:1,definitionFingerprint:p.p_definition_fingerprint,payloadFingerprint:p.p_payload_fingerprint,monitoringState:'paused'};
  state.records.set(p.p_id,receipt);return {data:receipt,error:null};
 }}});
 let n=0;const controller=initStructuredWatchCreation({form,input,error,getLanguage:()=>state.language,listen:(node,event,fn)=>node?.addEventListener(event,fn),uuid:()=>`cccccccc-cccc-4ccc-8ccc-${String(++n).padStart(12,'0')}`,fetchImpl:async(path,request)=>{
  const body=request.body?JSON.parse(request.body):undefined;state.calls.push({path,body});
  if(path.startsWith('/api/plan-watch')){if(state.aiError)return Response.json({code:state.aiError},{status:503});assert.equal(body.request,input.value);return Response.json({mode:'interpretation.v1',interpretation:state.interpretation,executable:false});}
  assert.equal(path,'/api/structured-watches');if(options.disabled)return Response.json({code:'STRUCTURED_FEATURE_UNAVAILABLE'},{status:404});
  let value;const response={setHeader(){},end(raw){value=JSON.parse(raw);}};await middleware({url:path,method:request.method,body},response);
  if(body?.action==='confirm'&&state.lose){state.lose=false;throw Error('lost response');}
  return Response.json(value,{status:response.statusCode});
 }});
 if(options.disabled){await tick();assert.equal(form.querySelector('[data-structured-opt-in]'),null);}else{await until(()=>form.querySelector('[data-structured-opt-in]'));form.querySelector('[data-structured-opt-in]').checked=true;}
 return {state,form,input,error,controller,review:()=>form.querySelector('[data-structured-review]'),buttons:()=>[...form.querySelectorAll('[data-structured-review] button')],run:()=>controller.run(input.value,state.language)};
};
for(const [language,request,label] of [['en','Keep me updated on Jannik Sinner.','Jannik Sinner'],['fr','Tiens-moi informé des actualités de Jannik Sinner.','Jannik Sinner'],['en','Monitor news about Gucci.','Gucci'],['fr','Surveille les actualités concernant Gucci.','Gucci']])test(`${language} ${label}: explicit review, one interpretation, signed confirmation, saved paused`,async t=>{
 const h=await harness(t,news(request,label,language));await h.run();assert.equal(h.state.records.size,0);assert.ok(h.review().textContent.includes(request));assert.ok(h.review().textContent.includes(label));assert.match(h.review().textContent,/20/);assert.match(h.review().textContent,language==='fr'?/britannique en anglais/:/UK English/);assert.doesNotMatch(h.review().textContent,/interpretation\.v1|monitoring-plan|predicate|adapter|JSON/);
 const issued=h.state.calls.find(c=>c.body?.action==='issue');assert.equal(issued.body.interpretation.originalRequest,request);assert.ok(issued.body.plan.criteria.subjects.includes(label));
 h.buttons()[0].click();h.buttons()[0].click();await until(()=>h.state.records.size===1&&h.review().querySelector('a'));assert.equal(h.state.rpcCount,1);assert.equal(h.state.calls.filter(c=>c.path.startsWith('/api/plan-watch')).length,1);assert.equal(h.state.calls.filter(c=>c.body?.action==='confirm').length,1);assert.match(h.review().textContent,language==='fr'?/inactive/:/not active/);assert.doesNotMatch(h.review().textContent,/Watching|Surveillance active/);
 assert.ok(h.state.calls.every(c=>!c.path.includes('check')&&!c.path.includes('cron')));assert.equal(h.review().querySelector('a').href.includes('token'),false);
 const def=h.state.calls.find(c=>c.body?.action==='confirm').body.definition;assert.equal(watchCreationState({...def,monitoringState:'paused',lastChecked:'2026-10-12'}),'paused');assert.equal(creationConfirmationKey({...def,monitoringState:'paused'}),'detail.structuredSavedPausedCopy');
});
test('default gate/unselected opt-in preserves legacy dispatch and makes no interpretation calls',async t=>{
 const h=await harness(t,news('Monitor news about Gucci.','Gucci'),{disabled:true});assert.equal(await h.run(),false);assert.equal(h.state.calls.length,1);assert.equal(h.state.records.size,0);
});
test('cancel and edit discard token/plan; changed text requires a new interpretation/review',async t=>{
 const h=await harness(t,news('Keep me updated on Jannik Sinner.'));await h.run();h.buttons()[2].click();assert.equal(h.review(),null);assert.equal(h.state.rpcCount,0);
 await h.run();const old=h.buttons()[0];h.buttons()[1].click();h.input.value='Monitor news about Gucci.';h.input.dispatchEvent(new h.input.ownerDocument.defaultView.Event('input'));old.click();assert.equal(h.state.rpcCount,0);
 h.state.interpretation=news(h.input.value,'Gucci');await h.run();assert.match(h.review().textContent,/Gucci/);h.buttons()[0].click();await until(()=>h.state.records.size===1);assert.equal(h.state.calls.filter(c=>c.path.startsWith('/api/plan-watch')).length,3);
});
test('changing selected language invalidates a pending review',async t=>{
 const h=await harness(t,news('Keep me updated on Jannik Sinner.'));await h.run();const confirm=h.buttons()[0];h.state.language='fr';globalThis.document.dispatchEvent(new globalThis.document.defaultView.Event('i18n:languageChanged'));confirm.click();assert.equal(h.state.rpcCount,0);assert.equal(h.review(),null);
});
for(const [name,value,pattern] of [['OR',consumerFixtures[3],/independently/],['group',consumerFixtures[1],/open group/],['event',fixture('Monitor a Gucci collaboration.',[individual('g','Gucci')],[predicate('e','event',['g'],'collaboration')],{intent:'event'}),/events or collaborations/],['ambiguous',news('Monitor news about Jordan.','Jordan','en',{ambiguities:[{field:'subject',alternatives:['person','brand'],question:'Do you mean the person or the brand?'}]}),/person or the brand/]])test(`${name} shows specific guidance without authorization or persistence`,async t=>{
 const h=await harness(t,value);await h.run();assert.match(h.review().textContent,pattern);assert.equal(h.state.calls.some(c=>c.body?.action==='issue'),false);assert.equal(h.state.rpcCount,0);assert.equal(h.buttons().length,2);
});
test('required topics, optional focus, exclusions, alias co-occurrence and recurrence are reviewed faithfully',async t=>{
 const value=fixture('Monitor Royal Caribbean Group and Gucci about earnings with interest in results excluding layoffs; each new article.',[individual('r','Royal Caribbean Group'),individual('g','Gucci')],[{id:'root',op:'and',args:['both','topic','not']},predicate('both','mentions_together',['r','g']),predicate('topic','topic',['r','g'],'earnings'),{id:'not',op:'not',args:['excluded']},predicate('excluded','topic',['r','g'],'layoffs')],{exclusions:['excluded'],topics:[{label:'results',role:'coverage_focus'}],recurrence:'per_new_item'});value.evidence.push({path:'/recurrence',start:value.originalRequest.indexOf('each new article'),end:value.originalRequest.indexOf('each new article')+16,text:'each new article'});
 const h=await harness(t,value);await h.run();assert.match(h.review().textContent,/same article/);assert.match(h.review().textContent,/earnings/);assert.match(h.review().textContent,/Topics of interest \(not filters\): results/);assert.match(h.review().textContent,/layoffs/);assert.match(h.review().textContent,/each new matching article/);assert.match(h.review().textContent,/approved alternative names/);assert.equal(h.state.rpcCount,0);
});
test('AI failure retains request and does not fall back, issue or persist',async t=>{
 const h=await harness(t,news('Keep me updated on Jannik Sinner.'));h.state.aiError='AI_SERVICE_UNAVAILABLE';await h.run();assert.match(h.error.textContent,/temporarily unavailable/);assert.equal(h.input.value,h.state.interpretation.originalRequest);assert.equal(h.state.calls.length,2);assert.equal(h.state.rpcCount,0);
});
test('expiry, changed owner and persistence failures leave no partial Watch',async t=>{
 const h=await harness(t,news('Keep me updated on Jannik Sinner.'));await h.run();h.state.clock+=300000;h.buttons()[0].click();await until(()=>/renewed/.test(h.error.textContent));assert.match(h.review().textContent,/renewed/);assert.equal(h.state.calls.filter(c=>c.path.startsWith('/api/plan-watch')).length,1);assert.equal(h.state.calls.filter(c=>c.body?.action==='issue').length,2);assert.equal(h.state.records.size,0);
 h.buttons()[1].click();await h.run();h.state.owner=other;h.buttons()[0].click();assert.equal(h.state.records.size,0);assert.match(h.error.textContent,/changed/);
 h.state.owner=owner;await h.run();h.state.confirmFailure={code:'XX000',message:'secret SQL details'};h.buttons()[0].click();await until(()=>/could not be confirmed/.test(h.error.textContent));assert.equal(h.state.records.size,0);assert.doesNotMatch(h.error.textContent,/SQL details/);
});
test('lost reply recovers the same mutation without another interpretation or duplicate Watch',async t=>{
 const h=await harness(t,news('Keep me updated on Jannik Sinner.'));await h.run();h.state.lose=true;h.buttons()[0].click();await until(()=>/could not be confirmed/.test(h.error.textContent));assert.equal(h.state.records.size,1);
 h.buttons()[0].click();await until(()=>h.review().querySelector('a'));const confirms=h.state.calls.filter(c=>c.body?.action==='confirm');assert.equal(confirms.length,2);assert.deepEqual(confirms[0].body,confirms[1].body);assert.equal(h.state.records.size,1);assert.equal(h.state.calls.filter(c=>c.path.startsWith('/api/plan-watch')).length,1);
});
test('every recoverable error has concise EN/FR copy',()=>{for(const code of ['AUTH_REQUIRED','STRUCTURED_FEATURE_UNAVAILABLE','INTERPRETATION_FAILED','AI_TIMEOUT','EXPIRED_PLAN_AUTHORIZATION','PLAN_DEFINITION_MISMATCH','STRUCTURED_REVISION_CONFLICT','STRUCTURED_MUTATION_CONFLICT','STRUCTURED_PERSISTENCE_UNAVAILABLE','STALE_REVIEW']){const en=structuredCreationError(code,'en'),fr=structuredCreationError(code,'fr');assert.ok(en);assert.ok(fr);assert.notEqual(en,fr);assert.doesNotMatch(en+fr,/stack|SQL|token|JSON/);}});
test('confirmation locks cancel/edit and coalesces clicks while persistence is pending',async t=>{
 const h=await harness(t,news('Monitor news about Gucci.','Gucci'));await h.run();let release;h.state.hold=new Promise(resolve=>{release=resolve;});const buttons=h.buttons();buttons[0].click();buttons[0].click();buttons[1].click();buttons[2].click();await until(()=>h.state.rpcCount===1);assert.ok(h.review());assert.equal(buttons[1].disabled,true);release();await until(()=>h.review().querySelector('a'));assert.equal(h.state.records.size,1);assert.equal(h.state.rpcCount,1);
});
test('editing during interpretation invalidates the response even if the text is later restored',async t=>{
 const h=await harness(t,news('Keep me updated on Jannik Sinner.'));const promise=h.run();h.input.value+=' ';h.input.dispatchEvent(new h.input.ownerDocument.defaultView.Event('input'));h.input.value=h.state.interpretation.originalRequest;await promise;assert.equal(h.review(),null);assert.equal(h.state.calls.some(c=>c.body?.action==='issue'),false);assert.equal(h.state.rpcCount,0);
});
test('French review preserves Dolce & Gabbana without translating or changing its identity',async t=>{
 const h=await harness(t,news('Surveille les actualités concernant Dolce & Gabbana.','Dolce & Gabbana','fr'));await h.run();assert.match(h.review().textContent,/Dolce & Gabbana/);assert.equal(h.state.calls.find(c=>c.body?.action==='issue').body.plan.criteria.subjects[0],'Dolce & Gabbana');assert.equal(h.state.rpcCount,0);
});

for(const language of ['en','fr'])test(`${language}: compact review groups preserve limits and action semantics without persistence`,async t=>{
 const request=language==='fr'?'Tiens-moi informé des actualités de Jannik Sinner.':'Keep me updated on Jannik Sinner.';
 const h=await harness(t,news(request,'Jannik Sinner',language));await h.run();const panel=h.review();
 assert.ok(panel.classList.contains('structured-review-confirmation'));
 const groups=[...panel.querySelectorAll('.structured-review-field')];assert.equal(groups.length,3);
 assert.equal(groups[0].querySelector('p').textContent,request);assert.equal(groups[1].querySelector('.structured-review-subject').textContent,'Jannik Sinner');
 assert.match(groups[1].textContent,/Google/);assert.match(groups[1].textContent,/20/);
 assert.match(groups[1].textContent,language==='fr'?/autres noms approuvés/:/approved alternative names/);
 assert.match(panel.querySelector('.structured-review-paused').textContent,language==='fr'?/en pause/:/paused/);
 const actions=panel.querySelector('[data-structured-actions]');assert.equal(actions.querySelectorAll('button').length,3);
 for(const b of actions.querySelectorAll('button'))assert.equal(b.type,'button');
 assert.equal(h.state.rpcCount,0);assert.equal(h.state.calls.filter(c=>c.path.startsWith('/api/plan-watch')).length,1);
 h.buttons()[1].click();assert.equal(h.review(),null);assert.equal(h.input.value,request);assert.equal(h.state.rpcCount,0);
});

for(const [request,label,topic,language,expected] of [
 ["Keep me informed on the pope's health.",'the pope','health','en',/Your role reference is understood/],
 ['Tiens-moi informé de la santé du pape.','pape','santé','fr',/Votre référence à une fonction est comprise/],
])test('role reference shows precise limitation and required topic without clarification: '+language,async t=>{
 const value=fixture(request,[individual('s',label,'person')],[predicate('n','news_about',['s'])],{language,topics:[{label:topic,role:'required'}],unresolvedRequirements:[{text:label,reason:'CURRENT_ROLE_HOLDER_UNVERIFIED'}]});
 const h=await harness(t,value);assert.equal(h.state.calls.filter(c=>c.path.includes('plan-watch')).length,0);await h.run();
 const text=h.review().textContent;assert.match(text,expected);assert(text.includes(request));assert(text.includes(topic));assert.match(text,language==='fr'?/Sujets obligatoires/:/Required topics/);
 assert.doesNotMatch(text,/Which pope|Quel pape|Please clarify your request|Précisez votre demande/);assert.equal(h.buttons().length,2);assert.equal(h.state.rpcCount,0);assert.equal(h.state.calls.filter(c=>c.path.includes('plan-watch')).length,1);assert.equal(h.state.calls.some(c=>c.body?.action==='issue'),false);
});

test('role ambiguity with missing scope still asks the actual targeted question',async t=>{
 const value=fixture('News about the reigning monarch.',[individual('s','the reigning monarch','person')],[predicate('n','news_about',['s'])],{ambiguities:[{field:'subject',alternatives:['one country','another country'],question:'Which country or royal house?'}]});
 const h=await harness(t,value);await h.run();assert.match(h.review().textContent,/Which country or royal house/);assert.equal(h.state.rpcCount,0);
});

for(const language of ['en','fr'])test(`${language}: expired review renews safely with the same identity and requires another confirmation`,async t=>{
 const request=language==='fr'?'Surveille les actualités concernant Gucci.':'Monitor news about Gucci.';
 const h=await harness(t,news(request,'Gucci',language));await h.run();const first=h.state.calls.find(c=>c.body?.action==='issue').body;
 h.state.clock+=300000;h.buttons()[0].click();await until(()=>/renewed|renouvelée/.test(h.error.textContent));
 assert.equal(h.state.records.size,0);assert.equal(h.state.rpcCount,0);assert.equal(h.state.calls.filter(c=>c.path.startsWith('/api/plan-watch')).length,1);
 const issued=h.state.calls.filter(c=>c.body?.action==='issue');assert.deepEqual(issued[1].body,first);
 h.buttons()[0].click();await until(()=>h.review().querySelector('a'));assert.equal(h.state.records.size,1);assert.equal(h.state.rpcCount,1);
});
for(const language of ['en','fr'])test(`${language}: daily activation requires explicit choice and follows successful signed persistence`,async t=>{
 const h=await harness(t,news(language==='fr'?'Surveille les actualités concernant Gucci.':'Monitor news about Gucci.','Gucci',language),{monitoring:true});await h.run();
 const choice=h.review().querySelector('[data-structured-activate]');assert.equal(choice.checked,false);assert.equal(h.state.records.size,0);
 choice.checked=true;choice.dispatchEvent(new h.input.ownerDocument.defaultView.Event('change'));assert.match(h.buttons()[0].textContent,/daily|quotidienne/);
 h.buttons()[0].click();await until(()=>h.review().querySelector('a'));assert.equal(h.state.records.size,1);assert.equal(h.state.rpcCount,2);
 const writes=h.state.calls.filter(c=>['confirm','monitoring'].includes(c.body?.action));assert.equal(writes[0].body.action,'confirm');assert.deepEqual(writes[1].body,{action:'monitoring',watchId:writes[0].body.watchId,expectedRevision:1,active:true});
 assert.match(h.review().textContent,language==='fr'?/quotidienne activée/:/Daily monitoring activated/);assert.ok(h.state.calls.every(c=>!c.path.includes('check')&&!c.path.includes('cron')&&!c.path.includes('email')));
});
test('activation failure preserves the saved Watch and directs to its state without recreating',async t=>{
 const h=await harness(t,news('Monitor news about Gucci.','Gucci'),{monitoring:true,activationFailure:true});await h.run();h.review().querySelector('[data-structured-activate]').checked=true;
 h.buttons()[0].click();await until(()=>h.review().querySelector('a'));assert.equal(h.state.records.size,1);assert.match(h.review().textContent,/activation could not be confirmed/);assert.equal(h.state.calls.filter(c=>c.body?.action==='confirm').length,1);
});
test('scheduler gate off offers no activation choice',async t=>{
 const h=await harness(t,news('Monitor news about Gucci.','Gucci'));await h.run();assert.equal(h.review().querySelector('[data-structured-activate]'),null);
});

test('expiry preserves explicit daily choice but never activates or saves until reconfirmed',async t=>{
 const h=await harness(t,news('Monitor news about Gucci.','Gucci'),{monitoring:true});await h.run();h.review().querySelector('[data-structured-activate]').checked=true;h.state.clock+=300000;
 h.buttons()[0].click();await until(()=>/renewed/.test(h.error.textContent));assert.equal(h.state.rpcCount,0);assert.equal(h.review().querySelector('[data-structured-activate]').checked,true);assert.match(h.buttons()[0].textContent,/activate daily/);
 h.buttons()[0].click();await until(()=>h.review().querySelector('a'));assert.equal(h.state.records.size,1);assert.equal(h.state.rpcCount,2);
});
test('enabled scheduling still saves paused unless the user explicitly chooses activation',async t=>{
 const h=await harness(t,news('Monitor news about Gucci.','Gucci'),{monitoring:true});await h.run();h.buttons()[0].click();await until(()=>h.review().querySelector('a'));assert.equal(h.state.rpcCount,1);assert.equal(h.state.calls.some(c=>c.body?.action==='monitoring'),false);assert.match(h.review().textContent,/Saved paused/);
});
