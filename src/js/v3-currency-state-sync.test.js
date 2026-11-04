import test from 'node:test';
import assert from 'node:assert/strict';
import {configureAccountStorage,localWatchStorageKey} from './account-storage.js';
import {configureMediaWatchServerStore,synchronizeMediaWatches,prepareMediaWatch,getMediaServerWatches,getMediaPersistenceState,mergeMediaWatches} from './media-watch-server-store.js';
import {mapMediaReportRow} from './media-watch-row.js';
import {mediaWatchDefinition} from './media-watch-definition.js';
import {v3ClientProjection,sameV3ClientIdentity,isV3CurrencyValidationArtifact} from './v3-media-identity.js';
import {migrateWatchModel} from './watch-model.js';
import {selectHomeReport} from './home-report.js';
import {buildStoredReport} from './report-snapshot.js';
import {evaluateV3Source} from '../../server/v3-pilot.js';
import {getUserFacingWatchClassification} from './report-status.js';
import {markUpdatesAsRead} from './watch-updates.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='11111111-1111-4111-8111-111111111111';
const journal=`watchAssistant.mediaSync.${owner}.${id}`;
class Storage{getItem(k){return this[k]??null;}setItem(k,v){this[k]=String(v);}removeItem(k){delete this[k];}}
const record=(base='GBP',quote='EUR',target='1.17')=>({id,user_id:owner,title:`${base}/${quote} > ${target}`,type:'media_news',
 watch_definition:{inputType:'text',request:`Tell me when ${base}/${quote} goes above ${target}.`,category:'finance',currencyPolicy:'crossing',currencyLanguage:'en',currencyRevision:'22222222-2222-4222-8222-222222222222',currencyCriteria:{base,quote,operator:'gt',target}},
 monitoring_source:{type:'currency',provider:'ecb',url:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'},v3Engine:'wa-v3-evidence-refs-pilot.v1',monitoring_state:'monitoring',current_status:'watching',media_revision:1,
 created_at:'2026-10-31T18:47:25Z',last_checked_at:'2026-11-04T06:35:40Z',last_check_outcome:'no-new-items',last_check_error_code:null,
 currency_evaluation:{base,quote,operator:'gt',target,met:true,observedRate:'1.199644905108',observationDate:'2026-11-03',checkedAt:'2026-11-04T06:35:40Z'}});
const stale=row=>({...mapMediaReportRow(row,owner),lastChecked:'2026-11-02T06:35:38Z',lastCheckAttempt:{status:'failed',attemptedAt:'2026-11-02T11:30:22.686Z',code:'PERSISTENCE_UNAVAILABLE'},
 currencyEvaluation:{...row.currency_evaluation,observedRate:'1.199328376109',observationDate:'2026-10-30',checkedAt:'2026-11-02T06:35:38Z'},currencySatisfied:false});

for(const pair of [['GBP','EUR','1.17'],['EUR','GBP','0.8']])test(pair.join('/')+' V3 numeric identity survives normalization and projection',()=>{
 const row=record(...pair),watch=mapMediaReportRow(row,owner),normalized=migrateWatchModel(watch).watch;
 assert.deepEqual(v3ClientProjection(row).watch_definition,row.watch_definition);
 assert(sameV3ClientIdentity(mediaWatchDefinition(normalized),row));
 assert.deepEqual(normalized.currencyCriteria,watch.currencyCriteria);assert.equal(normalized.currencyRevision,watch.currencyRevision);
});
test('only exact owned currency identities and the two-flag empty validation artifact can recover',()=>{
 const row=record(),local=stale(row),artifact={localOnly:true,validationError:true};assert(isV3CurrencyValidationArtifact(artifact,row,local,owner));
 for(const extra of [{pending:true},{definition:{}},{conflict:true},{deleted:true},{mutation:'draft'},{revision:1},{errorCode:'failure'}])assert(!isV3CurrencyValidationArtifact({...artifact,...extra},row,local,owner));
 for(const changed of [{request:'Real edit'},{title:'Real title edit'},{currencyCriteria:{...local.currencyCriteria,target:'1.2'}},{currencyRevision:crypto.randomUUID()},{monitoringSource:{type:'currency',url:'https://other.test'}},{status:'paused'},{mediaPersistence:{ownerId:owner,revision:2}},{mediaPersistence:{ownerId:'other'}}])assert(!isV3CurrencyValidationArtifact(artifact,row,{...local,...changed},owner));
 for(const changed of [{deleted_at:'2026-11-04'},{clientReadOnly:true},{user_id:'other'},{v3Engine:undefined},{monitoring_source:{type:'feed',url:'https://example.test/feed'}}])assert(!isV3CurrencyValidationArtifact(artifact,{...row,...changed},local,owner));
});
test('fresh read recovers the observed artifact, hydrates current state and restores the seven-check Brief without writes',async t=>{
 const originals=Object.fromEntries(['window','localStorage','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(async()=>{await configureMediaWatchServerStore(null);configureAccountStorage(null);for(const[k,d]of Object.entries(originals)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.window=new EventTarget();globalThis.localStorage=new Storage();
 let state={status:'authenticated',session:{access_token:'fixture',user:{id:owner}}};const auth={getState:()=>state,subscribe:()=>()=>{}};configureAccountStorage(auth);
 const row=record(),local=stale(row),artifact={localOnly:true,validationError:true},calls=[];let fail=false,hold,entered;
 localStorage.setItem(journal,JSON.stringify(artifact));localStorage.setItem(localWatchStorageKey('watchAssistant.watches'),JSON.stringify([local]));
 globalThis.fetch=async(path,options={})=>{assert.equal(path,'/api/media-watches');assert(!options.method||options.method==='GET');calls.push(path);if(hold){entered();await hold;}return fail?Response.json({code:'PERSISTENCE_UNAVAILABLE'},{status:503}):Response.json({watches:[row]});};
 await configureMediaWatchServerStore(auth);
 const retired=JSON.parse(localStorage.getItem(journal));assert.equal(retired.localOnly,false);assert.equal(retired.pending,false);assert.deepEqual(retired.terminalIdentity.original,artifact);
 const hydrated=mergeMediaWatches([local])[0];assert.equal(hydrated.monitoringAvailability,'saved');assert.equal(hydrated.lastChecked,row.last_checked_at);assert.equal(hydrated.lastCheckAttempt.status,'succeeded');assert.deepEqual(hydrated.currencyEvaluation,row.currency_evaluation);assert.equal(hydrated.updates.length,0);
 const quiet=Array.from({length:6},(_,i)=>({id:'quiet-'+i,title:'Quiet '+i,status:'watching',createdAt:'2026-10-01',lastChecked:row.last_checked_at,lastCheckAttempt:{status:'succeeded',attemptedAt:row.last_checked_at}}));
 const report={...buildStoredReport({watches:[mapMediaReportRow(row,owner),...quiet],ownerId:owner,id:'report',startedAt:'2026-11-04T07:00Z',completedAt:'2026-11-04T07:00:56Z'}),origin:'automatic',partial:true};
 const home=w=>selectHomeReport({report,watches:[w,...quiet],now:new Date('2026-11-04T08:00Z'),watchListAvailability:{active:true,uncertain:false,loading:false,waiting:false,failed:false}});
 assert.equal(home({...local,monitoringAvailability:'local-only'}).totalChecked,6);assert.equal(home(hydrated).totalChecked,7);assert.equal(home(hydrated).attentionWatches.length,0);assert.equal(home(hydrated).report.partial,true); // No Morning Brief flag rewrite.
 prepareMediaWatch({...hydrated,lastChecked:'2026-11-04T07:10Z'},hydrated);await synchronizeMediaWatches();assert.equal(getMediaPersistenceState(hydrated).status,'saved');assert.equal(calls.filter(Boolean).length>0,true);
 // A newer valid local manual result keeps its existing precedence.
 const newer={...hydrated,lastChecked:'2026-11-04T09:00Z',lastCheckAttempt:{status:'succeeded',attemptedAt:'2026-11-04T09:00Z'},currencyEvaluation:{...row.currency_evaluation,checkedAt:'2026-11-04T09:00Z'}};
 assert.equal(mergeMediaWatches([newer])[0].lastChecked,newer.lastChecked);
 const newerFailure={...hydrated,lastCheckAttempt:{status:'failed',attemptedAt:'2026-11-04T09:00Z',code:'CHECK_FAILED'}};
 assert.equal(mergeMediaWatches([newerFailure])[0].lastCheckAttempt.status,'failed');
 // Failed GET and an account switch cannot claim artifact recovery from cache.
 localStorage.setItem(journal,JSON.stringify(artifact));fail=true;await synchronizeMediaWatches();assert.deepEqual(JSON.parse(localStorage.getItem(journal)),artifact);
 fail=false;hold=new Promise(r=>{t.release=r;});const started=new Promise(r=>{entered=r;});const pending=synchronizeMediaWatches();await started;
 state={status:'authenticated',session:{access_token:'other',user:{id:'other'}}};t.release();await pending;assert.deepEqual(JSON.parse(localStorage.getItem(journal)),artifact);
});

test('condition still true is not attention; a new threshold event is Updated until acknowledged',()=>{
 const w={...mapMediaReportRow(record(),owner),monitoringAvailability:'saved'},now=new Date('2026-11-04T08:00Z');
 assert.equal(getUserFacingWatchClassification(w,{now}),'watching');
 const event={id:'crossing-event',timestamp:'2026-11-04T06:35:40Z',sourceTitle:'Threshold crossed',summary:'A new crossing occurred.',status:'new'};
 const unread={...w,updates:[event]};assert.equal(getUserFacingWatchClassification(unread,{now}),'updated');
 const read=markUpdatesAsRead(unread,[event.id]);assert.equal(getUserFacingWatchClassification(read,{now}),'watching');assert.equal(read.updates.length,1);assert.equal(read.currencyEvaluation.met,true);
 const report={...buildStoredReport({watches:[read],ownerId:owner,id:'historical-event-report',startedAt:'2026-11-04T07:00Z',completedAt:'2026-11-04T07:00:56Z'}),origin:'automatic'};
 assert.equal(selectHomeReport({report,watches:[read],now,watchListAvailability:{active:true,uncertain:false}}).totalChecked,1);
});

for(const [base,quote,target,rates] of [['GBP','EUR','1.17',['1.16','1.18','1.19','1.16','1.20']],['EUR','GBP','0.8',['0.79','0.81','0.82','0.79','0.83']]])test(`${base}/${quote} existing V3 crossing guard preserves history and suppresses continuous-above duplicates`,async()=>{
 const fixture=record(base,quote,target),criteria=fixture.watch_definition.currencyCriteria,history=[];let sourceCalls=0,modelCalls=0;
 let row={id,user_id:owner,engine:'wa-v3-evidence-refs.v1',criteria,baseline_at:null,evaluation:null,prior_state:{entries:[]},understanding:{intent:{canonical_text:fixture.watch_definition.request,references:[],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR'}}};
 for(let i=0;i<rates.length;i++){
  const met=Number(rates[i])>Number(target),action=met&&!row.evaluation?.met?'ALERT':'NO_ALERT',date=`2026-11-0${i+2}`;
  const result=await evaluateV3Source(row,fixture.monitoring_source,{currency:async()=>{sourceCalls++;return {criteria,observation:{base,quote,rate:rates[i],date},checkedAt:date+'T07:35:00Z'};},model:async req=>{modelCalls++;return {action,evidence_status:'CONFIRMED',reason:action==='ALERT'?'A new threshold crossing is confirmed.':'No new threshold crossing.',novelty_summary:null,condition_check:{required_state:'New threshold crossing',observed_state:met?'Above':'Below',condition_satisfied:met},evidence_refs:req.input.evidence.segments.filter(s=>s.role!=='PROVENANCE').map(s=>s.id),provenance_refs:req.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)};}});
  history.push(structuredClone(result));row={...row,baseline_at:row.baseline_at||date+'T07:35:00Z',evaluation:result.evaluation};
 }
 assert.deepEqual(history.map(r=>Boolean(r.article)),[false,true,false,false,true]);assert.equal(history[1].article.summary,'A new threshold crossing is confirmed.');assert.equal(history[2].evaluation.met,true);assert.equal(history[3].evaluation.met,false);assert.equal(sourceCalls,5);assert.equal(modelCalls,4);
});
