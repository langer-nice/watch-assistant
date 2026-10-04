import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCurrencyRequest, normalizeCurrencyWatch, evaluateCurrencyRate, applyCurrencyCheckResult, earliestAcceptableRateDate } from './currency-watch.js';
import { createWatchCheckController } from './watch-monitoring.js';
import { fetchCurrencyRate } from '../../server/currency-rate.js';
import { planWatch } from '../../server/watch-planner.js';
import { discoverTextMonitoringSource } from '../../server/monitoring-source-api.js';
const now = () => new Date('2026-10-01T09:43:00Z');
const make = (target = '1.17') => normalizeCurrencyWatch({ id: crypto.randomUUID(), inputType: 'text', request: `The pound reaches ${target} to the euro`, title: 'Currency', status: 'watching' });
const response = (watch, rate, extra = {}) => ({ criteria: parseCurrencyRequest(watch.request), checkedAt: now().toISOString(), observation: { base: 'GBP', quote: 'EUR', rate, date: '2026-09-30', ...extra } });

test('currency routing bypasses news discovery and decimal comma normalizes without changing 1.70', async () => {
  assert.equal(make('1,17').currencyCriteria.target, '1.17');
  assert.equal(make('1.70').currencyCriteria.target, '1.7');
  assert.equal(parseCurrencyRequest('The pound reaches 1.17 to the euro').operator, 'gte');
  for (const text of ['Apple news', 'The pound falls below 1.17 to the euro', 'The pound reaches 1,170.2 to the euro']) assert.equal(parseCurrencyRequest(text), null);
  const request = make().request;
  assert.equal((await planWatch(request, { discoverSource: () => assert.fail('news') })).connector, 'ecb');
  assert.equal((await discoverTextMonitoringSource({ request }, { fetchImpl: () => assert.fail('news') })).monitoringSource.type, 'currency');
});
for (const [rate, met] of [['1.1699',false], ['1.169999999999',false], ['1.17',true], ['1.1701',true]]) {
  test(`exact comparison and first evaluation: ${rate} => ${met}`, () => {
    const watch = make(); const result = applyCurrencyCheckResult(watch, response(watch, rate));
    assert.equal(result.changes.currencyEvaluation.met, met);
    assert.equal(result.matchedItems.length, met ? 1 : 0);
    assert.equal(result.changes.lastCheckAttempt.status, 'succeeded');
  });
}
test('reverse pair compares by rational cross multiplication, not rounded inversion', () => {
  const criteria = make().currencyCriteria;
  assert.equal(evaluateCurrencyRate(criteria, { base: 'EUR', quote: 'GBP', rate: '0.8547' }).met, true);
  assert.equal(evaluateCurrencyRate(criteria, { base: 'EUR', quote: 'GBP', rate: '0.854701' }).met, false);
  assert.throws(() => evaluateCurrencyRate(criteria, { base: 'USD', quote: 'GBP', rate: '0.85' }));
});
test('repeated checks, a dip and reappearance produce one event; relevant edits rearm', () => {
  let watch = make();
  for (const [i, rate] of ['1.18','1.18','1.16','1.18'].entries()) {
    const date = `2026-10-${String(5+i).padStart(2,'0')}`;
    watch = { ...watch, ...applyCurrencyCheckResult(watch, { ...response(watch, rate, {date}), checkedAt: `${date}T17:00:00Z` }).changes };
  }
  assert.equal(watch.updates.length, 1);
  const oldRevision = watch.currencyRevision;
  watch = normalizeCurrencyWatch({ ...watch, request: 'The pound reaches 1.16 to the euro' });
  assert.notEqual(watch.currencyRevision, oldRevision);
  assert.equal(watch.currencyEvaluation, null);
  watch = { ...watch, ...applyCurrencyCheckResult(watch, response(watch, '1.18')).changes };
  assert.equal(watch.updates.length, 2);
  const cosmetic = normalizeCurrencyWatch({ ...watch, request: 'The pound reaches 1,16 to the euro', title: 'Renamed' });
  assert.equal(cosmetic.currencyRevision, watch.currencyRevision);
  assert.equal(cosmetic.currencySatisfied, true);
});
test('edit 1.70 to 1.17 evaluates current criteria and rejects in-flight success and failure', async () => {
  for (const rejects of [false, true]) {
    let watch = make('1.70'); let complete;
    const controller = createWatchCheckController({ getWatch: () => watch, saveWatch: (_, changes) => (watch = { ...watch, ...changes }),
      requestCurrency: () => new Promise((resolve, reject) => { complete = rejects ? reject : resolve; }), now });
    const pending = controller.check(watch.id); const original = watch;
    watch = normalizeCurrencyWatch({ ...watch, request: 'The pound reaches 1.17 to the euro' });
    const edited = structuredClone(watch);
    complete(rejects ? new Error('provider failure') : response(original, '1.18'));
    await assert.rejects(pending, { code: 'STALE_CHECK' });
    assert.deepEqual(watch, edited);
    const next = createWatchCheckController({ getWatch: () => watch, saveWatch: (_, changes) => (watch = { ...watch, ...changes }), requestCurrency: async request => {
      assert.equal(parseCurrencyRequest(request).target, '1.17'); return response(watch, '1.18');
    }, now });
    assert.equal((await next.check(watch.id)).outcome, 'currency-met');
  }
});
const xml = (rate = '0.8547', date = '2026-09-30') => `<gesmes:Envelope xmlns:gesmes="urn:test"><Cube><Cube time="${date}"><Cube currency="GBP" rate="${rate}"/></Cube></Cube></gesmes:Envelope>`;
test('structured provider captures exact original rate, direction, date, and retrieval time', async () => {
  const result = await fetchCurrencyRate(make().request, { now, fetchImpl: async (url) => { assert.match(url, /ecb.europa.eu/); return new Response(xml()); } });
  assert.deepEqual(result.observation, { base: 'EUR', quote: 'GBP', rate: '0.8547', date: '2026-09-30' });
  assert.equal(result.checkedAt, now().toISOString());
});
for (const [name, fetchImpl, code] of [
  ['unavailable',async () => new Response('', { status: 503 }), 'CURRENCY_PROVIDER_UNAVAILABLE'],
  ['network',async () => { throw new Error('network'); }, 'CURRENCY_PROVIDER_UNAVAILABLE'],
  ['malformed',async () => new Response('<broken'), 'INVALID_CURRENCY_DATA'],
  ['invalid rate',async () => new Response(xml('0')), 'INVALID_CURRENCY_DATA'],
  ['missing pair',async () => new Response(xml().replace('GBP','USD')), 'INVALID_CURRENCY_DATA'],
  ['future',async () => new Response(xml('0.85','2026-10-02')), 'INVALID_CURRENCY_DATA'],
  ['stale',async () => new Response(xml('0.85','2026-09-29')), 'STALE_CURRENCY_DATA'],
]) test(`${name} is an explicit verification failure, without advancing successful lastChecked`, async () => {
  let watch = make(); const old = watch.lastChecked;
  const controller = createWatchCheckController({ getWatch: () => watch, saveWatch: (_, changes) => (watch = { ...watch, ...changes }),
    requestCurrency: request => fetchCurrencyRate(request, { now, fetchImpl }), now });
  await assert.rejects(controller.check(watch.id), { code });
  assert.equal(watch.lastChecked, old);
  assert.equal(watch.lastCheckAttempt.status, 'failed');
  assert.equal(watch.lastCheckOutcome, null);
});
test('freshness handles weekdays, grace period, weekends, and TARGET Easter closure', () => {
  assert.equal(earliestAcceptableRateDate(now()), '2026-09-30');
  assert.equal(earliestAcceptableRateDate(new Date('2026-10-01T16:00Z')), '2026-10-01');
  assert.equal(earliestAcceptableRateDate(new Date('2026-10-04T12:00Z')), '2026-10-02');
  assert.equal(earliestAcceptableRateDate(new Date('2026-04-06T18:00Z')), '2026-04-02');
  assert.equal(earliestAcceptableRateDate(new Date('2026-01-01T18:00Z')), '2025-12-31');
  assert.equal(earliestAcceptableRateDate(new Date('2026-05-01T18:00Z')), '2026-04-30');
  assert.equal(earliestAcceptableRateDate(new Date('2026-12-27T18:00Z')), '2026-12-24');
  // ECB office holidays are not necessarily TARGET closures (Ascension Day).
  assert.equal(earliestAcceptableRateDate(new Date('2026-05-14T16:00Z')), '2026-05-14');
  assert.equal(earliestAcceptableRateDate(new Date('2026-10-26T16:59Z')), '2026-10-23');
  assert.equal(earliestAcceptableRateDate(new Date('2026-10-26T17:00Z')), '2026-10-26');
});

test('JSONB property ordering neither rearms a condition nor rejects an equivalent response', () => {
  const watch = make();
  const storedCriteria = { target: '1.17', quote: 'EUR', operator: 'gte', base: 'GBP' };
  assert.equal(normalizeCurrencyWatch({ ...watch, currencyCriteria: storedCriteria }).currencyRevision, watch.currencyRevision);
  assert.equal(applyCurrencyCheckResult(watch, { ...response(watch, '1.17'), criteria: storedCriteria }).outcome, 'currency-met');
});
