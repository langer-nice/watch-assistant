import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { examples, definitions } from '../../server/test-support/watch-definition-fixtures.js';
import { fixture, individual, predicate } from '../../server/test-support/watch-interpretation-fixtures.js';
import { compileMonitoringPlan } from './watch-capabilities.js';
import { createWatchDefinition, validateWatchDefinition, monitoringPlanForDefinition, structuredMonitoringSource,
  definitionFromWatch, hasDefinitionVersion, watchDefinitionSize, WATCH_DEFINITION_MAX_BYTES } from './watch-definition.js';
import { canonicalJSON, contentFingerprint } from './structured-fingerprint.js';
import { mediaWatchDefinition } from './media-watch-definition.js';
import { migrateWatchModel } from './watch-model.js';
import { normalizeCurrencyWatch, currencyCriteriaFor } from './currency-watch.js';
import { mapCompanyWatchRow } from '../../server/company-watch-repository.js';

const watchFor = definition => ({ ...definition, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Fixture',
  monitoringSource: structuredMonitoringSource(definition.plan.criteria), monitoringState: 'paused', status: 'paused',
  mediaPersistence: { ownerId: 'owner', revision: 7, mutation: 'mutation' }, initialContext: { items: [] }, updates: [{ id: 'retained' }] });

test('fingerprints agree with Node SHA-256 including Unicode and block boundaries', () => {
  for (const value of ['', 'a', 'Préviens-moi 🎾', 'x'.repeat(55), 'x'.repeat(64), { z: 1, a: ['é', '😀'] }, ...definitions()]) {
    assert.equal(contentFingerprint(value), createHash('sha256').update(canonicalJSON(value)).digest('hex'));
  }
});
test('supported definitions are compact, bounded and restore a validated non-executing plan', () => {
  for (const value of definitions()) {
    assert.deepEqual(validateWatchDefinition(value), value);
    assert.equal(value.plan.executable, false);
    assert.equal(value.interpretation.originalRequest, undefined);
    assert.equal(value.plan.originalRequest, undefined);
    assert.equal(value.plan.subjects, undefined);
    assert.equal(monitoringPlanForDefinition(value).originalRequest, value.request);
    assert.ok(watchDefinitionSize(value) < WATCH_DEFINITION_MAX_BYTES);
  }
});
test('EN/FR persist identical executable criteria; original whitespace and language survive', () => {
  const values = definitions();
  assert.deepEqual(values[0].plan.criteria, values[1].plan.criteria);
  assert.deepEqual(values[2].plan.criteria, values[3].plan.criteria);
  assert.equal(values[0].request, examples()[0].originalRequest);
  assert.equal(values[1].interpretation.language, 'fr');
});
test('valid supplementary Unicode is preserved; JSONB-incompatible text is rejected without repair', () => {
  for (const prefix of ['🎾 ', '\u0000', '\ud800']) {
    const value = fixture(`${prefix}Keep me updated on Jannik Sinner.`,[individual('s','Jannik Sinner','person')],[predicate('n','news_about',['s'])]);
    const plan = compileMonitoringPlan(value,{structured:true});
    if (prefix === '🎾 ') assert.equal(createWatchDefinition(value,plan).request,value.originalRequest);
    else assert.throws(() => createWatchDefinition(value,plan),{code:'INVALID_WATCH_DEFINITION'});
  }
});
test('serialization/hydration preserve criteria, evidence, identity, revisions and history without regex normalization', () => {
  for (const value of definitions().filter(v => v.plan.domain !== 'official_company')) {
    const watch = watchFor(value);
    const row = JSON.parse(JSON.stringify(mediaWatchDefinition(watch)));
    assert.deepEqual(row.watch_definition, value);
    const hydrated = migrateWatchModel({ ...watch, ...row.watch_definition, monitoringSource: row.monitoring_source }).watch;
    assert.deepEqual(definitionFromWatch(hydrated), value);
    assert.deepEqual(hydrated.mediaPersistence, watch.mediaPersistence);
    assert.deepEqual(hydrated.initialContext, watch.initialContext);
    assert.deepEqual(hydrated.updates, watch.updates);
    assert.equal(hydrated.serverReadOnly, true);
    assert.equal(hydrated.structuredExecutionDisabled, value.plan.domain !== 'media_news');
    assert.deepEqual(normalizeCurrencyWatch(hydrated), hydrated);
    assert.equal(currencyCriteriaFor(hydrated), null);
  }
});
test('company row hydration preserves the compact definition and exact original request', () => {
  const value = definitions().at(-1);
  const watch = mapCompanyWatchRow({ id: watchFor(value).id, title: 'Company', siren: '552100554', request: 'legacy projection',
    watch_definition: value, monitoring_source: structuredMonitoringSource(value.plan.criteria), monitoring_state: 'paused' });
  assert.deepEqual(definitionFromWatch(watch), value);
  assert.equal(watch.serverReadOnly, true);
});
test('explicit versions never downgrade into legacy normalization or serialization', () => {
  for (const version of ['watch-definition.v2', null, '', 1]) {
    const watch = { ...watchFor(definitions()[0]), definitionVersion: version };
    assert.equal(hasDefinitionVersion(watch), true);
    assert.throws(() => mediaWatchDefinition(watch), { code: 'UNSUPPORTED_WATCH_VERSION' });
    const hydrated = migrateWatchModel(watch).watch;
    assert.equal(hydrated.request, watch.request);
    assert.equal(hydrated.structuredDefinitionError, 'UNSUPPORTED_WATCH_VERSION');
    assert.deepEqual(hydrated.plan, watch.plan);
  }
});
test('missing fields, altered criteria, metadata, evidence, plans and source fail closed', () => {
  const original = definitions()[0];
  for (const mutate of [v => { delete v.metadata; }, v => { delete v.interpretation.language; },
    v => { v.plan.criteria.subjects = ['Prada']; }, v => { v.plan.criteria.query = 'Prada'; },
    v => { v.plan.adapter = 'ecb_reference_v1'; }, v => { v.request = v.request.trim(); },
    v => { v.plan.interpretationRef = 'a'.repeat(64); }, v => { v.metadata.planFingerprint = 'b'.repeat(64); },
    v => { v.metadata.compilerVersion = 'future'; }, v => { v.plan.executable = true; },
    v => { v.interpretation.conditions[0].subjects = ['missing']; }, v => { v.extra = true; }]) {
    const value = structuredClone(original); mutate(value);
    assert.throws(() => validateWatchDefinition(value));
  }
  assert.throws(() => validateWatchDefinition(original, { type: 'feed', url: 'https://attacker.test/rss' }), { code: 'WATCH_SOURCE_MISMATCH' });
  const forged = structuredClone(original);
  forged.plan.criteria.subjects = ['Prada']; forged.plan.criteria.query = 'Prada';
  forged.metadata.planFingerprint = contentFingerprint({ ...monitoringPlanForDefinition(original), criteria: forged.plan.criteria });
  assert.throws(() => validateWatchDefinition(forged,structuredMonitoringSource(forged.plan.criteria)));
});
test('ambiguous, unsupported OR and oversized definitions cannot enter the contract', () => {
  const value = examples()[2]; value.ambiguities = [{ field: 'scope', alternatives: ['a','b'], question: 'Which?' }];
  assert.throws(() => compileMonitoringPlan(value, { structured: true }));
  const independent = fixture('Monitor news about Gucci or Prada.', [individual('g','Gucci'),individual('p','Prada')],
    [{ id:'root',op:'or',args:['gn','pn'] },predicate('gn','news_about',['g']),predicate('pn','news_about',['p'])]);
  assert.throws(() => compileMonitoringPlan(independent, { structured: true }));
  const oversized = definitions()[0];
  oversized.interpretation.evidence = Array.from({ length: 96 }, () => ({ path: '/conditions/0', start: 0, end: 500, text: 'x'.repeat(500) }));
  assert.ok(watchDefinitionSize(oversized) > WATCH_DEFINITION_MAX_BYTES);
  assert.throws(() => validateWatchDefinition(oversized));
});
test('currency changed-reference recurrence is grounded in evidence, never inferred from unchanged observations', () => {
  const changed = examples()[4];
  changed.originalRequest = 'Notify me for every published rate: GBP changes and is above 1.18 EUR.';
  changed.recurrence = 'per_observation';
  changed.evidence = [
    ...changed.subjects.map((s,index) => { const start = changed.originalRequest.indexOf(s.label); return { path:`/subjects/${index}/label`,start,end:start+s.label.length,text:s.label }; }),
    { path:'/conditions/0',start:0,end:changed.originalRequest.length,text:changed.originalRequest },
    { path:'/recurrence',start:0,end:changed.originalRequest.length,text:changed.originalRequest },
  ];
  const plan = compileMonitoringPlan(changed, { structured:true });
  assert.equal(createWatchDefinition(changed,plan).plan.criteria.policy,'daily');
  changed.originalRequest = changed.originalRequest.replace('changes','is unchanged');
  changed.evidence = changed.evidence.map(e => { const text = e.path.startsWith('/subjects/') ? e.text : changed.originalRequest; const start = changed.originalRequest.indexOf(text); return {...e,text,start,end:start+text.length}; });
  assert.throws(() => compileMonitoringPlan(changed,{structured:true}));
});
test('legacy media and currency serialization and company mapping remain unversioned', () => {
  const watch = { id: watchFor(definitions()[0]).id, title: 'Legacy', inputType: 'text', request: 'Monitor news about Gucci.',
    category: 'news', mediaMention: { subjects: ['Gucci'], matchMode: 'all' }, monitoringSource: { type: 'feed', url: 'https://example.test/rss' }, status: 'watching' };
  assert.deepEqual(mediaWatchDefinition(watch).watch_definition, { inputType: 'text', request: watch.request, category: 'news', mediaMention: watch.mediaMention });
  assert.equal(hasDefinitionVersion(migrateWatchModel(watch).watch), false);
  const currency = { ...watch, request: 'GBP is above 1.18 EUR.', currencyRevision: watch.id };
  assert.equal(mediaWatchDefinition(currency).watch_definition.currencyCriteria.target, '1.18');
  assert.equal(mapCompanyWatchRow({ siren: '552100554', title: 'Legacy Company' }).inputType, 'company');
});
