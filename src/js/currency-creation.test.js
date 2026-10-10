import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCurrencyRequest, requestedCurrencyPolicy, normalizeCurrencyWatch, evaluateCurrencyRate } from './currency-watch.js';
import { clarifyWatchRequest, validateClarification } from './request-clarification.js';
import { planWatch } from '../../server/watch-planner.js';
import { discoverTextMonitoringSource } from '../../server/monitoring-source-api.js';
import { mediaWatchDefinition } from './media-watch-definition.js';
import { currencyOverview } from './currency-watch.js';
const exact = 'Préviens-moi chaque fois que le taux de la livre sterling change et qu’une livre vaut plus de 1,17 euro.';
const reformulated = 'Surveille le taux de change GBP/EUR et préviens-moi chaque fois que 1 GBP vaut plus de 1,17 EUR.';
for (const [request, base, quote, operator, policy] of [
  [exact,'GBP','EUR','gt','daily'], [reformulated,'GBP','EUR','gt',null],
  ['Notify me every time the pound changes and one pound is worth more than 1.17 euros.','GBP','EUR','gt','daily'],
  ['Notify me each time 1 GBP changes and GBP >= 1.17 EUR.','GBP','EUR','gte','daily'],
  ['Préviens-moi chaque fois que le cours change et un euro vaut plus de 1,17 livre sterling.','EUR','GBP','gt','daily'],
  ['Notify me when GBP reaches 1.17 EUR','GBP','EUR','gte',null],
  ['GBP > 1.17 EUR','GBP','EUR','gt',null],
]) test(`currency instruction retains direction, strictness and intent: ${request}`, async () => {
  assert.deepEqual(parseCurrencyRequest(request),{base,quote,operator,target:'1.17'});
  assert.equal(requestedCurrencyPolicy(request),policy);
  assert.equal((await planWatch(request,{discoverSource:()=>assert.fail('news discovery')})).connector,'ecb');
  assert.equal((await discoverTextMonitoringSource({request},{fetchImpl:()=>assert.fail('news fetch')})).monitoringSource.provider,'ecb');
  assert.equal((await clarifyWatchRequest(request)).suggestedRequest,request);
  const watch=normalizeCurrencyWatch({id:crypto.randomUUID(),inputType:'text',request,currencyPolicy:policy || 'crossing',title:'Staging currency regression'});
  const saved=mediaWatchDefinition(watch);
  assert.equal(saved.watch_definition.request,request);
  assert.equal(saved.watch_definition.currencyCriteria.operator,operator);
  assert.equal(saved.watch_definition.currencyPolicy,policy || 'crossing');
  assert.match(currencyOverview(watch.currencyCriteria,'fr'),operator==='gt'?/> 1,17/:/≥ 1,17/);
});
test('a reformulation cannot discard explicit recurring intent',()=>{
  const result=validateClarification({resultType:'suggestion',suggestedRequest:reformulated},exact);
  assert.equal(result.suggestedRequest,exact);
});
for(const request of ['2 GBP > 1.17 EUR','GBP/EUR and EUR > 1.17 GBP','GBP between 1.17 and 1.20 EUR','GBP > 1.17 EUR and GBP < 1.2 EUR','GBP below 1.17 EUR','GBP > 1.17 USD']) test(`ambiguous/unsupported condition never falls through to news: ${request}`,async()=>{
  assert.equal(parseCurrencyRequest(request),null);
  await assert.rejects(discoverTextMonitoringSource({request},{fetchImpl:()=>assert.fail('news fetch')}),{code:'CURRENCY_CLARIFICATION_REQUIRED'});
});
test('strict boundary and reciprocal use exact arithmetic; old Watches do not acquire a new policy',()=>{
  for(const operator of ['gt','gte']) {
    const c={base:'GBP',quote:'EUR',operator,target:'1.25'};
    for(const observation of [{base:'GBP',quote:'EUR',rate:'1.25'},{base:'EUR',quote:'GBP',rate:'0.8'}]) assert.equal(evaluateCurrencyRate(c,observation).met,operator==='gte');
    assert.equal(evaluateCurrencyRate(c,{base:'GBP',quote:'EUR',rate:'1.250000000001'}).met,true);
  }
  assert.equal(normalizeCurrencyWatch({inputType:'text',request:exact,currencyPolicy:'once'}).currencyPolicy,'once');
  assert.equal(normalizeCurrencyWatch({inputType:'text',request:exact}).currencyPolicy,undefined);
});
test('natural change-and-stays wording retains recurring semantics',()=>{
  for(const request of ['La livre sterling change et reste au-dessus de 1,17 euro.', 'The pound changes and stays above 1.17 EUR.']) assert.deepEqual(parseCurrencyRequest(request),{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'});
});
