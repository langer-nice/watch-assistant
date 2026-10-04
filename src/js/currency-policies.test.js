import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCurrencyWatch, applyCurrencyCheckResult } from './currency-watch.js';
const make = policy => normalizeCurrencyWatch({ id: crypto.randomUUID(), inputType: 'text', request: 'The pound reaches 1.17 to the euro', currencyPolicy: policy });
const response = (w, date, rate) => ({ criteria: w.currencyCriteria, checkedAt: `${date}T17:00:00Z`, observation: { base: 'GBP', quote: 'EUR', date, rate } });
const check = (w, day, rate) => applyCurrencyCheckResult(w, response(w, `2026-10-${String(day).padStart(2,'0')}`, rate));
for (const [policy, rates, expected] of [
  ['crossing', ['1.16','1.17','1.18','1.16','1.19'], [0,1,0,0,1]],
  ['daily', ['1.17','1.18','1.18','1.16','1.19'], [1,1,0,0,1]],
  ['once', ['1.16','1.17','1.18','1.16','1.19'], [0,1,0,0,0]],
]) test(`${policy}: ordered observations, repeats, and storage round-trip`, () => {
  let w = make(policy);
  rates.forEach((rate,i) => {
    const result = check(w, 5+i, rate); assert.equal(result.matchedItems.length, expected[i]);
    w = JSON.parse(JSON.stringify({...w,...result.changes}));
    assert.equal(check(w,5+i,rate).matchedItems.length,0);
  });
  assert.equal(w.updates.length,expected.reduce((a,b)=>a+b,0));
});
test('failures, same-day corrections, stale and out-of-order observations leave successful state intact', () => {
  let w=make('crossing'); w={...w,...check(w,6,'1.176').changes}; const before=structuredClone(w);
  for (const [day,rate] of [[5,'1.16'],[6,'1.16'],[7,'invalid']]) assert.throws(()=>check(w,day,rate));
  assert.throws(()=>applyCurrencyCheckResult(w,{...response(w,'2026-10-06','1.16'), checkedAt:'2026-10-09T17:00:00Z'}),{code:'STALE_CURRENCY_DATA'});
  assert.deepEqual(w,before); assert.equal(check(w,7,'1.18').matchedItems.length,0);
  w={...w,...check(w,7,'1.16').changes}; assert.equal(check(w,8,'1.17').matchedItems.length,1);
});
test('policy changes retain observation and history and do not replay; precision remains exact',()=>{
  let w=make('once'); w={...w,...check(w,5,'1.176').changes};
  const stamp=w.updates[0].timestamp;
  w={...w,currencyPolicy:'daily'}; assert.equal(check(w,5,'1.176').matchedItems.length,0); assert.equal(check(w,6,'1.176').matchedItems.length,0);
  w={...w,...check(w,6,'1.18').changes}; assert.equal(w.updates[0].timestamp,stamp);
  w={...w,currencyPolicy:'crossing'}; assert.equal(check(w,7,'1.19').matchedItems.length,0);
  const boundary=normalizeCurrencyWatch({...make('daily'),request:'The pound reaches 1.18 to the euro'});
  assert.equal(check(boundary,5,'1.176').matchedItems.length,0);
  assert.equal(check(boundary,5,'1.18').matchedItems.length,1);
});
