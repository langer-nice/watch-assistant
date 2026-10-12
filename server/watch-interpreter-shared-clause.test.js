import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { reconstructInterpretation, validateInterpretation } from '../src/js/watch-interpretation.js';
import { interpretWatchRequest } from './watch-interpreter.js';
import { createPlanWatchMiddleware } from './plan-watch-api.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';

const shared = (request, labels, clause, language = 'en') => {
  const value = fixture(request, labels.map((label, i) => individual(`s${i}`, label)),
    [{ id: 'root', op: 'or', args: labels.map((_, i) => `n${i}`) },
      ...labels.map((_, i) => predicate(`n${i}`, 'news_about', [`s${i}`]))], { language });
  const { originalRequest, ...output } = value;
  output.evidence = labels.map((quote, i) => ({ path: `/subjects/${i}/label`, quote, context: null }));
  output.evidence.push({ path: '/conditions/0', quote: request, context: null });
  labels.forEach((quote, i) => output.evidence.push(
    { path: `/conditions/${i + 1}`, quote: clause, context: null },
    { path: `/conditions/${i + 1}`, quote, context: null },
  ));
  return output;
};
const labels = ['Gucci', 'Prada', 'Dolce & Gabbana', 'Miu Miu'];
const en = 'Keep me informed about news from Gucci, Prada, Dolce & Gabbana, and Miu Miu.';
const fr = 'Tiens-moi informé des actualités de Gucci, Prada, Dolce & Gabbana et Miu Miu.';

test('Fashion EN/FR share exact clause spans across independent subjects without fabricated phrases', async () => {
  const results = [];
  for (const [request, clause, language] of [[en, 'news from', 'en'], [fr, 'actualités de', 'fr']]) {
    const output = shared(request, labels, clause, language);
    const result = await interpretWatchRequest(request, { apiKey: 'synthetic', language,
      fetchImpl: async () => new Response(JSON.stringify({ output_text: JSON.stringify(output) })) });
    assert.equal(result.executable, false); assert.equal(result.status, 'interpreted');
    const value = result.interpretation; results.push(value);
    assert.equal(value.domain, 'media_news'); assert.equal(value.conditions[0].op, 'or');
    assert.equal(value.subjects[2].label, 'Dolce & Gabbana');
    assert.equal(value.recurrence, 'unspecified'); assert.deepEqual(value.topics, []);
    for (const evidence of value.evidence) assert.equal(request.slice(evidence.start, evidence.end), evidence.text);
    assert.equal(value.evidence.filter(e => e.text === clause).length, 4);
  }
  assert.deepEqual(results[0].conditions, results[1].conditions);
  assert.deepEqual(results[0].subjects, results[1].subjects);
});

test('shared-clause handling is generic across names and sentence forms', () => {
  const request = 'Monitor news about Nike, Adidas and Puma.';
  const value = reconstructInterpretation(shared(request, ['Nike', 'Adidas', 'Puma'], 'news about'), request);
  assert.equal(value.conditions[0].op, 'or'); assert.equal(value.subjects.length, 3);
});

test('fabricated shared-clause quotes, wrong entity support and ambiguous quotes remain rejected', () => {
  const invented = shared(en, labels, 'news from');
  invented.evidence.find(e => e.path === '/conditions/2').quote = 'news from Prada';
  assert.throws(() => reconstructInterpretation(invented, en), { code: 'INTERPRETATION_FAILED' });
  const ungrounded = shared(en, labels, 'news from');
  ungrounded.evidence = ungrounded.evidence.filter(e => !(e.path === '/conditions/2' && e.quote === 'Prada'));
  assert.throws(() => reconstructInterpretation(ungrounded, en), { code: 'INTERPRETATION_FAILED', reason: 'CONDITION_EVIDENCE_MISMATCH' });
  const request = 'Monitor news about Nike and Adidas; monitor news about Puma.';
  assert.throws(() => reconstructInterpretation(shared(request, ['Nike', 'Adidas', 'Puma'], 'news about'), request), { code: 'INTERPRETATION_FAILED' });
});

test('official-company classification contradicting news intent or predicates gets a specific reason', () => {
  for (const [request, clause, language] of [[en, 'news from', 'en'], [fr, 'actualités de', 'fr']]) {
    const output = shared(request, labels, clause, language); output.domain = 'official_company';
    assert.throws(() => reconstructInterpretation(output, request), { code: 'INTERPRETATION_FAILED', reason: 'DOMAIN_PREDICATE_CONFLICT' });
    output.intent = 'event';
    assert.throws(() => reconstructInterpretation(output, request), { code: 'INTERPRETATION_FAILED', reason: 'DOMAIN_PREDICATE_CONFLICT' });
  }
});

test('explicit official company events remain understood without capability approval', () => {
  for (const request of ['Notify me when Acme files an official company announcement.',
    'Préviens-moi lorsque Acme dépose une annonce officielle.']) {
    const value = fixture(request, [individual('acme', 'Acme')],
      [predicate('event', 'event', ['acme'], 'official_company_announcement')], { intent: 'event', domain: 'official_company' });
    assert.equal(validateInterpretation(value).domain, 'official_company');
    const ungrounded = structuredClone(value);
    ungrounded.evidence = ungrounded.evidence.map(e => e.path === '/conditions/0'
      ? { ...e, start: request.indexOf('Acme'), end: request.indexOf('Acme') + 4, text: 'Acme' } : e);
    assert.throws(() => validateInterpretation(ungrounded), { code: 'INTERPRETATION_FAILED', reason: 'OFFICIAL_SOURCE_UNGROUNDED' });
  }
  const request = 'Notify me when Acme announces a collection.';
  const wrong = fixture(request, [individual('acme', 'Acme')], [predicate('e', 'event', ['acme'], 'collection_announcement')],
    { intent: 'event', domain: 'official_company' });
  assert.throws(() => validateInterpretation(wrong), { code: 'INTERPRETATION_FAILED', reason: 'DOMAIN_PREDICATE_CONFLICT' });
});

test('co-occurrence and relationships preserve all referenced subjects without becoming OR', () => {
  for (const kind of ['mentions_together', 'relationship']) {
    const request = 'Monitor news about both Nike and Adidas collaborating.';
    const value = fixture(request, [individual('n', 'Nike'), individual('a', 'Adidas')],
      [predicate('p', kind, ['n', 'a'], kind === 'relationship' ? 'collaboration' : null)]);
    assert.equal(validateInterpretation(value).conditions[0].kind, kind);
  }
});

test('opt-in HTTP reports only the safe domain-conflict reason; legacy response is untouched', async () => {
  const output = shared(fr, labels, 'actualités de', 'fr'); output.domain = 'official_company';
  const req = Readable.from([JSON.stringify({ request: fr, language: 'fr' })]);
  req.url = '/api/plan-watch?mode=interpretation.v1'; req.method = 'POST';
  const res = { setHeader() {}, end(text) { this.body = JSON.parse(text); } };
  await createPlanWatchMiddleware({ apiKey: 'synthetic',
    fetchImpl: async () => new Response(JSON.stringify({ output_text: JSON.stringify(output) })) })(req, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { mode: 'interpretation.v1', executable: false, code: 'INTERPRETATION_FAILED', reason: 'DOMAIN_PREDICATE_CONFLICT' });
});
