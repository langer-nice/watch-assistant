import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretWatchRequest } from './watch-interpreter.js';
import { reconstructInterpretation, validateInterpretation } from '../src/js/watch-interpretation.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';

const quoted = value => {
  const { originalRequest, ...output } = structuredClone(value);
  output.evidence = output.evidence.map(({ path, text }) => ({ path, quote: text, context: null }));
  return output;
};
const requests = [
  ['Keep me updated on the latest news about Jannik Sinner.', 'Tiens-moi informé des dernières actualités de Jannik Sinner.'],
  ['Keep me updated on Italian tennis players competing on the ATP and WTA tours.', 'Tiens-moi informé des joueurs et joueuses de tennis italiens sur les circuits ATP et WTA.'],
  ['Keep me informed about news from Gucci, Prada, Dolce & Gabbana, and Miu Miu.', 'Tiens-moi informé des actualités de Gucci, Prada, Dolce & Gabbana et Miu Miu.'],
  ['Notify me whenever GBP rises above 1.18 EUR.', 'Préviens-moi chaque fois que la livre sterling dépasse 1,18 euro.'],
];
const examples = requests.map(([en, fr], pair) => [en, fr].map((request, languageIndex) => {
  const french = languageIndex === 1;
  let subjects, conditions, extra = {};
  if (pair === 0) {
    subjects = [individual('sinner', 'Jannik Sinner', 'person')]; conditions = [predicate('news', 'news_about', ['sinner'])];
  } else if (pair === 1) {
    subjects = [{ ...individual('players', french ? 'joueurs et joueuses de tennis italiens' : 'Italian tennis players', 'person'),
      kind: 'open_group', quantifier: 'any', membership: [
        { attribute: 'nationality', operator: 'eq', values: [french ? 'italienne' : 'Italian'] },
        { attribute: 'sport', operator: 'eq', values: ['tennis'] },
        { attribute: 'tour', operator: 'in', values: ['ATP', 'WTA'] },
      ] }]; conditions = [predicate('news', 'news_about', ['players'])];
  } else if (pair === 2) {
    subjects = ['Gucci', 'Prada', 'Dolce & Gabbana', 'Miu Miu'].map((label, i) => individual(`brand${i}`, label));
    conditions = [{ id: 'anybrand', op: 'or', args: ['n0', 'n1', 'n2', 'n3'] },
      ...[0, 1, 2, 3].map(i => predicate(`n${i}`, 'news_about', [`brand${i}`]))];
  } else {
    subjects = [{ ...individual('base', french ? 'livre sterling' : 'GBP', 'currency'), canonicalCode: 'GBP' },
      { ...individual('quote', french ? 'euro' : 'EUR', 'currency'), canonicalCode: 'EUR' }];
    conditions = [{ ...predicate('rate', 'numeric', ['base', 'quote'], 'exchange_rate'), operator: 'gt', amount: '1.18', unit: 'EUR' }];
    extra = { intent: 'numeric_condition', domain: 'currency', ambiguities: [{ field: 'recurrence',
      alternatives: ['crossing', 'per_observation'], question: french ? 'À chaque franchissement ou observation satisfaite ?' : 'Each crossing or satisfied observation?' }] };
  }
  return fixture(request, subjects, conditions, { language: french ? 'fr' : 'en', ...extra });
}));

for (const [pair, values] of examples.entries()) {
  const results = [];
  for (const value of values) {
    test(`live regression pair ${pair + 1} ${value.language}: quoted evidence and faithful mocked extraction`, async () => {
      let calls = 0;
      const result = await interpretWatchRequest(value.originalRequest, { apiKey: 'synthetic', language: value.language,
        fetchImpl: async (_, options) => {
          calls++;
          const body = JSON.parse(options.body);
          assert.equal(body.max_output_tokens, 3000);
          assert.match(body.instructions, /Never calculate offsets/u);
          return new Response(JSON.stringify({ output_text: JSON.stringify(quoted(value)) }));
        } });
      assert.equal(calls, 1); assert.equal(result.executable, false);
      const actual = result.interpretation;
      assert.equal(actual.originalRequest, value.originalRequest);
      assert.equal(actual.recurrence, 'unspecified'); assert.deepEqual(actual.topics, []);
      for (const e of actual.evidence) assert.equal(actual.originalRequest.slice(e.start, e.end), e.text);
      assert.deepEqual(validateInterpretation(actual), actual);
      if (pair === 1) assert.deepEqual(actual.subjects[0].membership[0].values, ['IT']);
      if (pair === 2) { assert.equal(actual.conditions[0].op, 'or'); assert.equal(actual.subjects[2].label, 'Dolce & Gabbana'); }
      if (pair === 3) { assert.equal(result.status, 'ambiguous'); assert.equal(actual.conditions[0].operator, 'gt'); }
      const semantics = { intent: actual.intent, domain: actual.domain, conditions: actual.conditions, topics: actual.topics,
        recurrence: actual.recurrence, subjects: actual.subjects.map(({ label, ...s }) => s),
        ambiguities: actual.ambiguities.map(({ question, ...a }) => a) };
      results.push(semantics);
      if (results.length === 2) assert.deepEqual(results[0], results[1]);
    });
  }
}

test('exact quote reconstruction never trusts offsets or repairs absent source text', () => {
  const original = examples[0][0], output = quoted(original);
  assert.equal(reconstructInterpretation(output, original.originalRequest).evidence[0].start,
    original.originalRequest.indexOf('Jannik Sinner'));
  for (const mutate of [v => { v.evidence[0].start = 0; }, v => { v.evidence[0].quote = 'Invented Name'; },
    v => { v.evidence[0].path = '/subjects/0'; }, v => { v.evidence[1].path = '/conditions/0/value'; },
    v => { v.originalRequest = 'replacement'; }]) {
    const v = structuredClone(output); mutate(v);
    assert.throws(() => reconstructInterpretation(v, original.originalRequest), { code: 'INTERPRETATION_FAILED' });
  }
});

test('repeated quotes require a unique explicit context; no occurrence is guessed', () => {
  const request = 'Gucci in Paris. Gucci in Milan.';
  const value = fixture(request, [individual('g', 'Gucci')], [predicate('n', 'news_about', ['g'])]);
  const output = quoted(value);
  assert.throws(() => reconstructInterpretation(output, request), { code: 'INTERPRETATION_FAILED' });
  output.evidence[0].context = 'Gucci in Milan.';
  const actual = reconstructInterpretation(output, request);
  assert.equal(actual.evidence[0].start, request.lastIndexOf('Gucci'));
  for (const context of ['Gucci', request, 'Gucci in Rome.']) {
    output.evidence[0].context = context;
    assert.throws(() => reconstructInterpretation(output, request), { code: 'INTERPRETATION_FAILED' });
  }
});

test('empty groups, currency groups and combined bilingual membership fail schema checks', () => {
  for (const value of [examples[0][0], examples[3][0]]) {
    const output = quoted(value); output.subjects[0].kind = 'closed_group';
    assert.throws(() => reconstructInterpretation(output, value.originalRequest), { code: 'INTERPRETATION_FAILED' });
  }
  const value = examples[1][1], output = quoted(value);
  output.subjects[0].membership[0].attribute = 'sport et circuits';
  assert.throws(() => reconstructInterpretation(output, value.originalRequest), { code: 'INTERPRETATION_FAILED' });
});

test('mandatory news topics, membership-as-topic restrictions and invented recurrence fail closed', () => {
  const source = examples[0][0];
  const news = fixture(source.originalRequest, source.subjects, source.conditions, { topics: [{ label: 'news', role: 'required' }] });
  assert.throws(() => reconstructInterpretation(quoted(news), news.originalRequest), { code: 'INTERPRETATION_FAILED' });
  const group = examples[1][0];
  const restricted = fixture(group.originalRequest, group.subjects, group.conditions, { topics: [{ label: 'tennis', role: 'required' }] });
  assert.throws(() => reconstructInterpretation(quoted(restricted), restricted.originalRequest), { code: 'INTERPRETATION_FAILED' });
  for (const recurrence of ['per_new_item', 'per_observation', 'crossing']) {
    const output = quoted(source); output.recurrence = recurrence;
    assert.throws(() => reconstructInterpretation(output, source.originalRequest), { code: 'INTERPRETATION_FAILED' });
  }
  const currency = quoted(examples[3][0]); currency.ambiguities = [];
  assert.throws(() => reconstructInterpretation(currency, examples[3][0].originalRequest), { code: 'INTERPRETATION_FAILED' });
});

test('explicit recurrence, required topics, exclusions and unsupported conditions survive reconstruction', () => {
  const request = 'Notify me once when Gucci is mentioned concerning collections excluding Prada; require exhaustive coverage.';
  const value = fixture(request, [individual('g', 'Gucci'), individual('p', 'Prada')],
    [predicate('n', 'news_about', ['g']), predicate('exclude', 'news_about', ['p'])], {
      recurrence: 'once', exclusions: ['exclude'], topics: [{ label: 'collections', role: 'required' }],
      unresolvedRequirements: [{ text: 'require exhaustive coverage', reason: 'Guarantee unresolved' }],
    });
  const output = quoted(value); output.evidence.push({ path: '/recurrence', quote: 'once', context: 'Notify me once' });
  const actual = reconstructInterpretation(output, request);
  assert.equal(actual.recurrence, 'once'); assert.equal(actual.topics[0].role, 'required');
  assert.deepEqual(actual.exclusions, ['exclude']); assert.equal(actual.unresolvedRequirements.length, 1);
});

test('AND co-occurrence and relationship events remain separate from independent OR', () => {
  for (const [request, condition] of [
    ['Monitor news mentioning both Gucci and Prada.', predicate('n', 'mentions_together', ['g', 'p'])],
    ['Notify me when Gucci and Prada announce a collaboration.', predicate('n', 'relationship', ['g', 'p'], 'collaboration_announcement')],
  ]) {
    const value = fixture(request, [individual('g', 'Gucci'), individual('p', 'Prada')], [condition]);
    assert.deepEqual(reconstructInterpretation(quoted(value), request).conditions, [condition]);
  }
});

test('canonical membership cannot invent a country or tour absent from its evidence', () => {
  for (const [index, values] of [[0, ['US']], [2, ['ATP', 'PGA']]]) {
    const value = examples[1][0], output = quoted(value);
    output.subjects[0].membership[index].values = values;
    assert.throws(() => reconstructInterpretation(output, value.originalRequest), { code: 'INTERPRETATION_FAILED' });
  }
});

test('inclusive EN/FR comparisons retain gte rather than silently becoming strict', () => {
  for (const request of ['Notify me when GBP is at least 1.18 EUR.', 'Préviens-moi quand GBP vaut au moins 1,18 EUR.']) {
    const value = fixture(request, [{ ...individual('base', 'GBP', 'currency'), canonicalCode: 'GBP' },
      { ...individual('quote', 'EUR', 'currency'), canonicalCode: 'EUR' }],
    [{ ...predicate('rate', 'numeric', ['base', 'quote'], 'exchange_rate'), operator: 'gte', amount: '1.18', unit: 'EUR' }],
    { intent: 'numeric_condition', domain: 'currency' });
    assert.equal(reconstructInterpretation(quoted(value), request).conditions[0].operator, 'gte');
    const wrong = quoted(value); wrong.conditions[0].operator = 'gt';
    assert.throws(() => reconstructInterpretation(wrong, request), { code: 'INTERPRETATION_FAILED' });
  }
});
