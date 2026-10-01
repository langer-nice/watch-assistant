import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrencySummary, formatCurrencyOverview, currencyUpdateSummary } from './currency-display.js';
import { evaluateCurrencyRate, applyCurrencyCheckResult, normalizeCurrencyWatch } from './currency-watch.js';
import { getWatchUpdates } from './watch-updates.js';
import { getCurrentSituationPresentation } from './watch-update-presentation.js';
const criteria = { base:'GBP',quote:'EUR',operator:'gte',target:'1.17' };
const evaluation = {...evaluateCurrencyRate(criteria,{base:'EUR',quote:'GBP',rate:'0.85463',date:'2026-09-30'}),checkedAt:'2026-10-01T10:00:00Z'};
test('locale-aware display rounds the rate only, keeps the exact decision/data and uses observation date',()=>{
 const before=JSON.stringify(evaluation);
 assert.equal(formatCurrencySummary(evaluation,'fr'),'Seuil atteint : 1 GBP ≈ 1,1701 EUR. Seuil : ≥ 1,17 EUR. Taux de référence quotidien de la BCE du 30 septembre 2026.');
 assert.match(formatCurrencySummary(evaluation,'en'),/1 GBP ≈ 1\.1701 EUR.*Target: ≥ 1\.17 EUR.*30 September 2026/);
 assert.equal(JSON.stringify(evaluation),before);
 assert.match(formatCurrencyOverview(criteria,'fr'),/1,17 EUR.*pas une cotation en temps réel/);
});
test('below-target display does not round up to the target, including tiny and high precision thresholds',()=>{
 for(const [target,rate] of [['1.17','1.169999999999'],['0.00001','0.000009999999'],['1.170049','1.170048999999']]){
 const e=evaluateCurrencyRate({...criteria,target},{base:'GBP',quote:'EUR',rate,date:'2026-09-30'});
 assert.equal(e.met,false);
 const text=formatCurrencySummary(e,'fr');assert.match(text,/Seuil non atteint/);const displayed=text.match(/1 GBP [≈=] ([\d,]+)/)[1].replace(',','.');assert.ok(Number(displayed)<Number(target),text);assert.ok(Number(displayed)>0,text);
 }
});
test('saved PR47 local raw events localize in both languages without changing IDs or persisted prose',()=>{
 let w=normalizeCurrencyWatch({inputType:'text',request:'The pound reaches 1.17 to the euro',status:'watching'});
 w={...w,...applyCurrencyCheckResult(w,{criteria,observation:{base:'EUR',quote:'GBP',rate:'0.85463',date:'2026-09-30'},checkedAt:evaluation.checkedAt}).changes};
 const serialized=JSON.stringify(w);const update=getWatchUpdates(w)[0];
 assert.match(currencyUpdateSummary(w,update,'fr'),/Seuil atteint/);
 assert.match(currencyUpdateSummary(w,update,'en'),/Target reached/);
 assert.equal(JSON.stringify(w),serialized);
});
test('hydrated server event uses current evaluation only for its exact detection time; old events never borrow newer observations',()=>{
 const update={id:'currency:revision:GBP:EUR:1.17',timestamp:evaluation.checkedAt,summary:'Saved English'};
 assert.match(currencyUpdateSummary({currencyEvaluation:evaluation},update,'fr'),/Seuil atteint/);
 assert.equal(currencyUpdateSummary({currencyEvaluation:{...evaluation,checkedAt:'2026-10-02T10:00:00Z'}},update,'fr'),'');
 assert.equal(currencyUpdateSummary({currencyEvaluation:evaluation},{...update,id:'article:currency-news'},'fr'),'');
 assert.equal(formatCurrencySummary({...evaluation,observationDate:'2026-02-31'},'fr'),'');
});
test('duplicate publisher headline is shown once but distinct source excerpts remain intact',()=>{
 const base={id:'article',timestamp:'2026-10-01T10:00:00Z',sourceTitle:'Publisher headline',status:'new'};
 assert.equal(getCurrentSituationPresentation({updates:[{...base,summary:'Publisher   headline'}]}).title,'');
 const p=getCurrentSituationPresentation({updates:[{...base,summary:'A distinct original excerpt.'}]});
 assert.equal(p.title,base.sourceTitle);assert.equal(p.summary,'A distinct original excerpt.');
});
