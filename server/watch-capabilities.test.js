import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCapabilities, compileMonitoringPlan, validateCompiledMonitoringPlan, capabilityRegistry } from './watch-capabilities.js';
import { validateMonitoringPlan } from '../src/js/watch-interpretation.js';
import { matchFeedItemToMediaMention } from '../src/js/watch-monitoring.js';
import { evaluateCurrencyRate } from '../src/js/currency-watch.js';
import { fixture, individual, predicate, consumerFixtures } from './test-support/watch-interpretation-fixtures.js';

const single = request => fixture(request, [individual('s', 'Jannik Sinner', 'person')], [predicate('n', 'news_about', ['s'])]);
const issues = value => assessCapabilities(value).issues.map(i => i.code);
const recurrence = (value, mode) => {
  value.recurrence = mode;
  value.evidence.push({ path: '/recurrence', text: value.originalRequest, start: 0, end: value.originalRequest.length });
  return value;
};
const currency = (request, mode = 'once', operator = 'gt', base = 'GBP', quote = 'EUR') => {
  const label = code => request.includes('livre') ? code === 'GBP' ? 'livre sterling' : 'euro' : code;
  return recurrence(fixture(request, [{ ...individual('base', label(base), 'currency'), canonicalCode: base },
    { ...individual('quote', label(quote), 'currency'), canonicalCode: quote }],
    [{ ...predicate('n', 'numeric', ['base', 'quote'], 'exchange_rate'), operator, amount: '1.18', unit: quote }],
    { intent: 'numeric_condition', domain: 'currency' }), mode);
};

test('registry is small, versioned and immutable', () => {
  assert.equal(capabilityRegistry.version, 'capabilities.v1'); assert.equal(capabilityRegistry.capabilities.length, 3);
  assert.throws(() => capabilityRegistry.capabilities[0].operators.push('or'), TypeError);
});

test('Sinner EN/FR compile equivalent executable criteria but remain non-executing', () => {
  const en = single('Keep me updated on Jannik Sinner.');
  const fr = single('Tiens-moi informé des actualités de Jannik Sinner.'); fr.language = 'fr';
  const a = assessCapabilities(en), b = assessCapabilities(fr);
  assert.equal(a.status, 'supported'); assert.equal(b.status, 'supported');
  assert.deepEqual(a.plan.criteria, b.plan.criteria); assert.equal(a.plan.executable, false);
  assert.equal(a.plan.recurrence, 'unspecified'); assert.notEqual(a.plan.interpretationRef, b.plan.interpretationRef);
  assert.equal(a.plan.criteria.query, 'Jannik Sinner');
});

for (const label of ['Gucci', 'Prada', 'Dolce & Gabbana', 'Sephora', 'Royal Caribbean Cruises', 'RCL']) {
  test(`existing literal news capability: ${label}`, () => {
    const value = fixture(`Monitor news about ${label}`, [individual('s', label)], [predicate('n', 'news_about', ['s'])]);
    const plan = compileMonitoringPlan(value);
    assert.equal(plan.adapter, 'google_news_literal_v1'); assert.deepEqual(plan.criteria.subjects, [label]);
    if (label === 'Royal Caribbean Cruises') assert.equal(plan.criteria.query, '("Royal Caribbean Cruises" OR "Royal Caribbean Group")');
    if (label === 'RCL') assert.equal(plan.criteria.query, 'RCL');
  });
}

test('Italian group EN/FR never becomes a literal phrase or invented roster', () => {
  const en = consumerFixtures[1];
  const fr = fixture('Surveille les joueurs de tennis italiens sur les circuits ATP et WTA.',
    [{ ...en.subjects[0], label: 'joueurs de tennis italiens' }], en.conditions, { language: 'fr' });
  for (const value of [en, fr]) {
    const result = assessCapabilities(value); assert.equal(result.status, 'unsupported');
    assert.ok(result.issues.some(i => i.code === 'unsupported_group_membership')); assert.equal(result.plan, null);
  }
});

test('fashion EN/FR independent OR is unsupported with a confirmation-only alternative', () => {
  const names = ['Gucci', 'Prada', 'Dolce & Gabbana', 'Miu Miu'];
  const conditions = [{ id: 'root', op: 'or', args: ['n0', 'n1', 'n2', 'n3'] }, ...names.map((_, i) => predicate(`n${i}`, 'news_about', [`s${i}`]))];
  const subjects = names.map((label, i) => individual(`s${i}`, label));
  const values = [fixture('Monitor news about Gucci, Prada, Dolce & Gabbana, and Miu Miu.', subjects, conditions),
    fixture('Surveille les actualités de Gucci, Prada, Dolce & Gabbana et Miu Miu.', subjects, conditions, { language: 'fr' })];
  const results = values.map(assessCapabilities);
  assert.deepEqual(results[0].issues, results[1].issues);
  for (const result of results) { assert.equal(result.status, 'unsupported'); assert.equal(result.plan, null);
    assert.equal(result.alternative.requiresConfirmation, true); assert.ok(result.issues.some(i => i.code === 'unsupported_independent_or')); }
  assert.throws(() => compileMonitoringPlan(values[0]), { code: 'MONITORING_PLAN_NOT_SUPPORTED' });
});

for (const op of ['and', 'or']) {
  test(`explicit ${op} never changes logical meaning`, () => {
    const value = fixture(`Monitor news mentioning Gucci ${op} Prada.`, [individual('g', 'Gucci'), individual('p', 'Prada')],
      [{ id: 'root', op, args: ['gnews', 'pnews'] }, predicate('gnews', 'news_about', ['g']), predicate('pnews', 'news_about', ['p'])]);
    const result = assessCapabilities(value);
    if (op === 'or') { assert.equal(result.status, 'unsupported'); return; }
    assert.equal(result.status, 'supported'); assert.equal(result.plan.conditions[0].op, 'and');
    assert.equal(result.plan.criteria.matchMode, 'all');
    assert.equal(matchFeedItemToMediaMention({ title: 'Gucci news' }, result.plan.criteria).matched, false);
    assert.equal(matchFeedItemToMediaMention({ title: 'Gucci and Prada news' }, result.plan.criteria).matched, true);
  });
}

test('co-occurrence is supported; collaboration detection is not', () => {
  const subjects = [individual('g', 'Gucci'), individual('p', 'Prada')];
  const both = fixture('Monitor news mentioning both Gucci and Prada.', subjects, [predicate('n', 'mentions_together', ['g', 'p'])]);
  assert.equal(assessCapabilities(both).status, 'supported');
  const collab = fixture('Notify me when Gucci and Prada announce a collaboration.', subjects,
    [predicate('n', 'relationship', ['g', 'p'], 'collaboration')], { intent: 'event' });
  assert.ok(issues(collab).includes('unsupported_event_detection'));
});

test('topics/exclusions preserve literal matching; optional coverage never becomes a filter', () => {
  const value = fixture('Monitor Gucci concerning Ukraine excluding Prada including collections.',
    [individual('g', 'Gucci'), individual('p', 'Prada')], [predicate('n', 'news_about', ['g']), predicate('exclude', 'news_about', ['p'])],
    { exclusions: ['exclude'], topics: [{ label: 'Ukraine', role: 'required' }, { label: 'collections', role: 'coverage_focus' }] });
  const plan = compileMonitoringPlan(value);
  assert.equal(plan.criteria.query, 'Gucci "Ukraine" -"Prada"'); assert.equal(plan.topics.length, 2);
  assert.deepEqual(plan.criteria.topics, ['Ukraine']); assert.deepEqual(plan.criteria.exclusions, ['Prada']);
});

test('NOT a co-occurrence cannot become NOT each individual; semantic exclusions remain unresolved', () => {
  const value = fixture('Monitor Gucci news excluding items mentioning both Prada and Miu Miu.',
    [individual('g', 'Gucci'), individual('p', 'Prada'), individual('m', 'Miu Miu')],
    [predicate('n', 'news_about', ['g']), predicate('exclude', 'mentions_together', ['p', 'm'])], { exclusions: ['exclude'] });
  assert.equal(assessCapabilities(value).status, 'unsupported');
  const unresolved = fixture('Monitor Gucci excluding misleading coverage.', [individual('g', 'Gucci')], [predicate('n', 'news_about', ['g'])],
    { unresolvedRequirements: [{ text: 'excluding misleading coverage', reason: 'No semantic exclusion support' }] });
  assert.ok(issues(unresolved).includes('unresolved_requirement'));
});

test('currency EN/FR uses existing exact comparisons, unit base and pair direction', () => {
  const en = currency('Notify me once when GBP is above 1.18 EUR.');
  const fr = currency('Préviens-moi une seule fois quand la livre sterling vaut plus de 1,18 euro.'); fr.language = 'fr';
  const a = compileMonitoringPlan(en), b = compileMonitoringPlan(fr);
  assert.deepEqual(a.criteria, b.criteria); assert.equal(a.criteria.policy, 'once');
  assert.equal(evaluateCurrencyRate(a.criteria, { base: 'GBP', quote: 'EUR', rate: '1.18', date: '2026-10-12' }).met, false);
  const reversed = compileMonitoringPlan(currency('Notify me once when EUR is above 1.18 GBP.', 'once', 'gt', 'EUR', 'GBP'));
  assert.equal(reversed.criteria.base, 'EUR'); assert.equal(reversed.criteria.quote, 'GBP');
  const inclusive = compileMonitoringPlan(currency('Notify me once when GBP is at least 1.18 EUR.', 'once', 'gte'));
  assert.equal(evaluateCurrencyRate(inclusive.criteria, { base: 'GBP', quote: 'EUR', rate: '1.18', date: '2026-10-12' }).met, true);
  assert.ok(issues(currency('Notify me once when 2 GBP is above 1.18 EUR.')).includes('unsupported_constraint'));
});

test('currency recurrence is clarified or supported only with actual existing policy guarantees', () => {
  const unspecified = currency('Monitor GBP above 1.18 EUR.', 'unspecified');
  const result = assessCapabilities(unspecified); assert.equal(result.status, 'clarification_required');
  assert.equal(result.clarifications[0].code, 'ambiguous_recurrence'); assert.equal(result.plan, null);
  const crossing = compileMonitoringPlan(currency('Notify me when GBP crosses above 1.18 EUR.', 'crossing'));
  assert.equal(crossing.criteria.policy, 'crossing');
  const unchanged = currency('Notify me at each observation when GBP above 1.18 EUR.', 'per_observation');
  assert.ok(issues(unchanged).includes('unsupported_recurrence'));
  const changed = compileMonitoringPlan(currency('Notify me at each observation of a changed published rate when GBP above 1.18 EUR.', 'per_observation'));
  assert.equal(changed.criteria.policy, 'daily'); assert.ok(changed.limitations.includes('daily_policy_requires_changed_rate'));
});

test('continuous FX, dates and hard geographic/language constraints are not silently converted', () => {
  const forex = currency('Notify me once when GBP above 1.18 EUR using continuous market rates.');
  forex.temporal = [{ text: 'continuous market rates', relation: 'unspecified', start: null, end: null, timezone: null }];
  forex.evidence.push({ path: '/temporal/0', text: forex.originalRequest, start: 0, end: forex.originalRequest.length });
  assert.ok(issues(forex).includes('unsupported_temporal_constraint'));
  const value = fixture('Monitor Jannik Sinner in France after next Monday.', [individual('s', 'Jannik Sinner', 'person')], [predicate('n', 'news_about', ['s'])],
    { geographic: [{ label: 'France', appliesTo: 'event' }], temporal: [{ text: 'after next Monday', relation: 'relative', start: null, end: null, timezone: null }] });
  assert.ok(issues(value).includes('unsupported_geographic_constraint')); assert.ok(issues(value).includes('unsupported_temporal_constraint'));
});

test('BODACC requires its explicit source and a single valid user-provided SIREN', () => {
  const company = request => fixture(request, [individual('acme', 'Acme')], [predicate('n', 'event', ['acme'], 'official_registry_filing')],
    { domain: 'official_company', intent: 'event' });
  const en = company('Monitor official BODACC registry filings for Acme SIREN 905266524.');
  const fr = company('Surveille les annonces officielles BODACC de Acme SIREN 905266524.'); fr.language = 'fr';
  assert.deepEqual(compileMonitoringPlan(en).criteria, compileMonitoringPlan(fr).criteria);
  assert.equal(compileMonitoringPlan(en).criteria.siren, '905266524');
  for (const request of ['Monitor official BODACC filings for Acme.', 'Monitor official BODACC filings for Acme SIREN 123456789.',
    'Monitor official BODACC filings for Acme SIREN 905266524 and 552005969.']) {
    const result = assessCapabilities(company(request)); assert.equal(result.status, 'clarification_required');
    assert.equal(result.clarifications[0].code, 'missing_company_identifier');
  }
  const issuer = fixture('Monitor official company announcements from Acme SIREN 905266524.', [individual('a', 'Acme')],
    [predicate('n', 'event', ['a'], 'official_company_announcement')], { intent: 'event', domain: 'official_company' });
  assert.ok(issues(issuer).includes('unsupported_source_type'));
});

for (const [request, intent, domain, kind, event] of [
  ['Notify me when Masters tickets go on sale.', 'event', 'ticket_availability', 'event', 'ticket_sale'],
  ['Notify me when Product is in stock.', 'event', 'other', 'event', 'stock_available'],
  ['Monitor Product price changes.', 'change', 'other', 'event', 'price_change'],
]) {
  test(`unsupported adapter/event: ${event}`, () => {
    const label = request.includes('Masters') ? 'Masters' : 'Product';
    const result = assessCapabilities(fixture(request, [individual('s', label, 'product')], [predicate('n', kind, ['s'], event)], { intent, domain }));
    assert.equal(result.status, 'unsupported'); assert.ok(result.issues.some(i => i.code === 'unsupported_event_detection')); assert.equal(result.plan, null);
  });
}

test('genuine ambiguity, malformed data and missing references return safe distinct outcomes', () => {
  const ambiguous = fixture('What should I monitor?', [], [], { intent: 'unknown', domain: 'unknown',
    ambiguities: [{ field: 'subject', alternatives: ['person', 'organization'], question: 'Which subject?' }] });
  assert.equal(assessCapabilities(ambiguous).status, 'clarification_required');
  for (const value of [null, {}, { ...single('Monitor Jannik Sinner'), conditions: [predicate('n', 'news_about', ['missing'])] }]) {
    assert.equal(assessCapabilities(value).status, 'invalid_interpretation');
  }
  assert.ok(issues({ ...single('Monitor Jannik Sinner'), conditions: [predicate('n', 'news_about', ['missing'])] }).includes('invalid_subject_reference'));
  const conflict = fixture('Monitor Gucci news excluding Gucci.', [individual('g', 'Gucci')],
    [predicate('n', 'news_about', ['g']), predicate('x', 'news_about', ['g'])], { exclusions: ['x'] });
  assert.equal(assessCapabilities(conflict).status, 'invalid_interpretation');
});

test('optional coverage cannot conflict with a mandatory topic predicate', () => {
  const value = fixture('Monitor Gucci news including collections.', [individual('g', 'Gucci')],
    [{ id: 'root', op: 'and', args: ['news', 'topic'] }, predicate('news', 'news_about', ['g']), predicate('topic', 'topic', ['g'], 'collections')],
    { topics: [{ label: 'collections', role: 'coverage_focus' }] });
  const result = assessCapabilities(value); assert.equal(result.status, 'invalid_interpretation');
  assert.equal(result.issues[0].code, 'contradictory_topic_role');
});

test('extra currency thresholds cannot be omitted from a compiled plan', () => {
  const value = currency('Notify me once when GBP above 1.18 EUR and below 1.3 EUR.');
  const text = 'above 1.18 EUR'; const start = value.originalRequest.indexOf(text);
  value.evidence = value.evidence.map(e => e.path === '/conditions/0' ? { path: e.path, start, end: start + text.length, text } : e);
  assert.ok(issues(value).includes('unsupported_threshold')); assert.equal(assessCapabilities(value).plan, null);
});

test('BODACC cannot satisfy a foreign-country or exact content-language restriction', () => {
  const request = 'Monitor official BODACC filings for Acme SIREN 905266524 in Italy in French.';
  const value = fixture(request, [individual('a', 'Acme')], [predicate('n', 'event', ['a'], 'official_registry_filing')],
    { intent: 'event', domain: 'official_company', geographic: [{ label: 'Italy', appliesTo: 'subject' }, { label: 'French', appliesTo: 'content_language' }] });
  assert.equal(assessCapabilities(value).status, 'unsupported');
  assert.equal(assessCapabilities(value).issues.filter(i => i.code === 'unsupported_geographic_constraint').length, 2);
});

test('plan fingerprint is stable and binds all criteria/provenance; forged adapters/queries cannot pass', () => {
  const value = single('Monitor Jannik Sinner'); const before = structuredClone(value);
  const plan = compileMonitoringPlan(value); assert.deepEqual(value, before);
  assert.deepEqual(compileMonitoringPlan(value), plan); assert.deepEqual(validateCompiledMonitoringPlan(plan, value), plan);
  const forged = structuredClone(plan); forged.criteria.query = 'other';
  assert.throws(() => validateCompiledMonitoringPlan(forged, value), { code: 'INVALID_MONITORING_PLAN' });
  assert.throws(() => validateMonitoringPlan({ ...plan, adapter: 'arbitrary_adapter' }), { code: 'INTERPRETATION_FAILED' });
  assert.throws(() => validateMonitoringPlan({ ...plan, sql: 'DELETE FROM watches' }), { code: 'INTERPRETATION_FAILED' });
  assert.throws(() => validateMonitoringPlan({ ...plan, executable: true }), { code: 'INTERPRETATION_FAILED' });
});

test('assessment and compilation have no AI, network or persistence side effects', () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => assert.fail('No provider/source calls are allowed');
  try { const plan = compileMonitoringPlan(single('Monitor Jannik Sinner')); assert.equal(plan.executable, false); }
  finally { globalThis.fetch = original; }
});
