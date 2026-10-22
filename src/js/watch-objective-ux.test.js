import test from 'node:test';
import assert from 'node:assert/strict';
import { structuredWatchObjective,localizedGeneratedMediaTitle } from './media-watch-title.js';
import { getCanonicalWatchClassification } from './report-status.js';
import { getWatchStatusPresentation } from './watch-status-presentation.js';
import { readFileSync } from 'node:fs';
const role={officeId:'papacy',originalRole:'pape',name:'Example IX',names:['Example IX','Exemple IX'],sourceUrl:'https://www.vatican.va/content/vatican/en.html',personId:'https://www.vatican.va/content/vatican/en/holy-father/example-ix.html',verifiedAt:'2026-10-18T17:00:00Z'};
const watch={definitionVersion:'watch-definition.v1',title:'pape',interpretation:{language:'fr'},plan:{domain:'media_news',criteria:{subjects:['pape'],topics:['santé'],roleResolution:role}}};
for(const lang of ['fr','en'])test(`${lang}: objective title and creation confirmation use approved topic and resolved holder`,()=>{
 const before=structuredClone(watch),o=structuredWatchObjective(watch,lang);
 assert.equal(o.title,lang==='fr'?'Santé du pape Exemple IX':'Health of Pope Example IX');
 assert.match(o.activated,lang==='fr'?/surveillance activée/:/monitoring activated/);
 assert.match(o.description,lang==='fr'?/chaque jour.*santé du pape Exemple IX/:/daily.*Example IX's health/);
 assert.match(o.baseline,lang==='fr'?/référence.*email désactivées/:/baseline.*Email notifications disabled/);
 assert.equal(localizedGeneratedMediaTitle(watch,lang),o.title);assert.deepEqual(watch,before);
});
test('custom titles are preserved; generated titles localize; another holder is not hardcoded',()=>{
 assert.equal(localizedGeneratedMediaTitle({...watch,title:'My personal title'},'fr'),null);
 const named={...watch,title:structuredWatchObjective(watch,'fr').title};assert.equal(localizedGeneratedMediaTitle(named,'en'),'Health of Pope Example IX');
 const successor=structuredClone(watch);successor.plan.criteria.roleResolution.name='Successor X';successor.plan.criteria.roleResolution.names=['Successor X','Successeur X'];
 assert.equal(structuredWatchObjective(successor,'fr').title,'Santé du pape Successeur X');
});
test('other approved development topics appear in titles without inferred identity',()=>{
 const generic={plan:{domain:'media_news',criteria:{subjects:['Example Co'],topics:['earnings']}}};assert.equal(structuredWatchObjective(generic,'en').title,'earnings — Example Co');
 assert.equal(structuredWatchObjective({plan:{domain:'currency'}},'en'),null);
});
for(const structured of [false,true])test(`${structured?'Structured':'legacy'}: awaiting first check is neutral and real failure remains attention`,()=>{
 const w={...(structured?watch:{}),monitoringAvailability:'saved',monitoringState:'monitoring',status:'watching',lastChecked:null,lastCheckAttempt:null};const before=structuredClone(w);
 assert.equal(getCanonicalWatchClassification(w),'pending');assert.deepEqual(w,before);
 for(const lang of ['fr','en']){const locale=JSON.parse(readFileSync(new URL(`../locales/${lang}.json`,import.meta.url)));assert.deepEqual(getWatchStatusPresentation('pending',key=>locale.statuses[key.split('.')[1]]),{label:lang==='fr'?'En attente du premier contrôle':'Awaiting first check',modifier:'stable'});}
 assert.equal(getCanonicalWatchClassification({...w,lastCheckAttempt:{status:'failed',code:'FETCH_FAILED'}}),'attention');
 assert.equal(getCanonicalWatchClassification({...w,actionRequired:true}),'attention');
 for(const issue of [{structuredExecutionDisabled:true},{monitoringIssueReason:'source-persistently-unavailable'},{monitoringStatus:{state:'unavailable'}}])assert.equal(getCanonicalWatchClassification({...w,...issue}),'attention');
 assert.equal(getCanonicalWatchClassification({...w,monitoringState:'needs-attention'}),'attention');
 assert.equal(getCanonicalWatchClassification({...w,lastChecked:'2026-10-18T17:10:00Z',lastCheckAttempt:{status:'succeeded'}}),'watching');
});
test('paused and uncertain persistence do not become a falsely active neutral status',()=>{
 assert.equal(getCanonicalWatchClassification({...watch,monitoringAvailability:'saved',monitoringState:'paused',status:'paused'}),'paused');
 assert.equal(getCanonicalWatchClassification({...watch,monitoringAvailability:'saved'}),'attention');
 assert.equal(getCanonicalWatchClassification({...watch,monitoringAvailability:'stale',monitoringState:'monitoring'}),'attention');
});
