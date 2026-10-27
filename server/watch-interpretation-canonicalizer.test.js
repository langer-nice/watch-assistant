import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeWatchInterpretation } from './watch-interpretation-canonicalizer.js';
import { interpretWatchRequest } from './watch-interpreter.js';
import { reconstructInterpretation, validateInterpretation } from '../src/js/watch-interpretation.js';
import { createWatchDefinition } from '../src/js/watch-definition.js';
import { assessCapabilities, compileMonitoringPlan } from '../src/js/watch-capabilities.js';
import { fixture, individual, predicate } from './test-support/watch-interpretation-fixtures.js';

const simple = 'Tell me when Microsoft publishes its Q3 2026 earnings results.';
const rich = 'Tell me when Microsoft publishes its Q3 2026 earnings results, including revenue, EPS, guidance or major AI/cloud commentary.';
const labels = ['revenue', 'EPS', 'guidance', 'major AI/cloud commentary'];
const candidate = (request = simple, extra = {}) => fixture(request,
  [individual('company', 'Microsoft')], [predicate('release', 'event', ['company'], 'earnings_release')],
  { intent: 'event', domain: 'media_news', ...extra });
const raw = value => { const { originalRequest, ...body } = value;
  return { ...body, evidence: value.evidence.map(({ path, text }) => ({ path, quote: text, context: null })) }; };
const reconstruct = value => reconstructInterpretation(raw(value), value.originalRequest,
  { canonicalize: canonicalizeWatchInterpretation });
const reject = value => assert.throws(() => reconstruct(value), { code: 'INTERPRETATION_FAILED' });
const manCity = () => {
  const request = 'Let me know there is news about Man City';
  const value = fixture(request, [individual('s1', 'Man City')], [predicate('c1', 'news_about', ['s1'])]);
  value.evidence = [
    { path: '/subjects/0/label', start: 32, end: 40, text: 'Man City' },
    { path: '/conditions/0', start: 21, end: 40, text: 'news about Man City' },
    { path: '/conditions/0', start: 32, end: 40, text: 'Man City' },
  ];
  return value;
};

test('Man City exact semantic/evidence identity and compiled query remain unchanged', () => {
  const before = manCity();
  assert.equal(canonicalizeWatchInterpretation(before), before);
  const after = reconstruct(before);
  assert.deepEqual(after, before);
  assert.deepEqual(compileMonitoringPlan(after, { structured: true }), compileMonitoringPlan(before, { structured: true }));
  assert.equal(compileMonitoringPlan(after, { structured: true }).criteria.query, 'Man City');
  assert.equal(createWatchDefinition(after, compileMonitoringPlan(after, { structured: true })).metadata.planFingerprint,
    'f22ae3b41e66f4e36d6acb5f46a533f4cc375a7911afc070b1838a7e87e6a2b2');
  assert.deepEqual(createWatchDefinition(after, compileMonitoringPlan(after, { structured: true })),
    createWatchDefinition(before, compileMonitoringPlan(before, { structured: true })));
});

test('simple publication has stable source-supported semantic contract, separate from capability', () => {
  const before = candidate(), snapshot = structuredClone(before), result = reconstruct(before);
  assert.deepEqual(before, snapshot);
  assert.equal(result.domain, 'media_news'); assert.equal(result.intent, 'event');
  assert.deepEqual(result.conditions, [predicate('c1', 'event', ['s1'], 'earnings_results_publication')]);
  assert.equal(result.subjects[0].label, 'Microsoft');
  assert.deepEqual(result.temporal, [{ text: 'Q3 2026', relation: 'unspecified', start: null, end: null, timezone: null }]);
  assert.deepEqual(validateInterpretation(result), result);
  assert.deepEqual(canonicalizeWatchInterpretation(result), result);
  const assessment = assessCapabilities(result, { structured: true });
  assert.equal(assessment.status, 'unsupported'); assert.equal(assessment.plan, null);
  assert(assessment.issues.some(i => i.code === 'unsupported_event_detection'));
  assert(assessment.issues.some(i => i.code === 'unsupported_temporal_constraint'));
  assert.throws(() => compileMonitoringPlan(result, { structured: true }), { code: 'MONITORING_PLAN_NOT_SUPPORTED' });
});

test('rich publication retains all optional source focus with the same semantic base', () => {
  const a = reconstruct(candidate()), b = reconstruct(candidate(rich));
  for (const key of ['domain', 'intent', 'subjects', 'conditions', 'condition', 'temporal', 'recurrence']) assert.deepEqual(b[key], a[key]);
  assert.deepEqual(b.topics, labels.map(label => ({ label, role: 'coverage_focus' })));
  for (const e of b.evidence) assert.equal(e.text, rich.slice(e.start, e.end));
});

for (const request of [simple, rich]) test('equivalent supported representation variants converge: '+(request === simple ? 'simple' : 'rich'), () => {
  const expected = reconstruct(candidate(request));
  for (const [domain, intent, kind, value] of [
    ['media_news', 'event', 'event', 'earnings_results_publication'],
    ['official_company', 'event', 'event', 'official_company_announcement'],
    ['official_company', 'event', 'event', 'earnings_release'],
    ['media_news', 'ongoing_news', 'news_about', null],
    ['other', 'unknown', 'event', 'earnings_report'],
  ]) {
    const v = candidate(request, { domain, intent });
    v.conditions[0].kind = kind; v.conditions[0].value = value;
    assert.deepEqual(reconstruct(v), expected);
  }
});

test('no company allowlist; the same semantic vocabulary handles another organization label locally', () => {
  const request = simple.replace('Microsoft', 'Example Corp');
  const v = fixture(request, [individual('company', 'Example Corp')], [predicate('release', 'event', ['company'], 'earnings_release')], { intent: 'event' });
  assert.equal(reconstruct(v).subjects[0].label, 'Example Corp');
});

test('model topic-role/period representation normalizes only with original evidence', () => {
  const v = candidate(rich, { topics: labels.map(label => ({ label, role: 'required' })),
    temporal: [{ text: 'Q3 2026', relation: 'unspecified', start: null, end: null, timezone: null }] });
  assert.deepEqual(reconstruct(v), reconstruct(candidate(rich)));
});

test('official source requirements/preferences and extra qualifiers cannot be silently removed', () => {
  for (const suffix of [' from official sources', ', official sources only', ', preferably from official sources', ' before tomorrow']) {
    const request = simple.slice(0, -1) + suffix + '.';
    reject(candidate(request));
  }
  for (const [path, text] of [['/unresolvedRequirements/0', 'Microsoft']]) {
    const v = candidate(simple, { unresolvedRequirements: [{ text, reason: 'SOURCE_REQUIREMENT' }] });
    v.evidence.push({ path, text, start: simple.indexOf(text), end: simple.indexOf(text) + text.length });
    reject(v);
  }
});

test('malformed/ambiguous/missing evidence, conflicting meaning and time remain rejected', () => {
  for (const mutate of [
    v => { v.subjects.push(individual('other', 'Microsoft')); },
    v => { v.subjects[0].label = 'Other'; },
    v => { v.subjects[0].type = 'unknown'; },
    v => { v.ambiguities = [{ field: 'subject', alternatives: ['a', 'b'], question: 'Which?' }]; },
    v => { v.conditions[0].value = 'acquisition'; },
    v => { v.conditions[0].amount = '5'; },
    v => { v.evidence = v.evidence.filter(e => e.path !== '/conditions/0'); },
    v => { v.evidence[0].text = 'fabricated'; },
    v => { v.topics = [{ label: 'acquisition', role: 'required' }]; },
    v => { v.temporal = [{ text: 'Q4 2026', relation: 'unspecified', start: null, end: null, timezone: null }]; },
    v => { v.temporal = [{ text: 'Q3 2026', relation: 'between', start: '2026-09-30', end: '2026-07-01', timezone: null }]; },
  ]) { const v = candidate(); mutate(v); reject(v); }
  const v = candidate(); v.evidence[0].start++;
  assert.throws(() => canonicalizeWatchInterpretation(v), { code: 'INTERPRETATION_FAILED' });
  for (const entity of ['Microsoft or Apple', 'Microsoft/Apple', 'Microsoft, not Apple']) {
    const ambiguous = simple.replace('Microsoft', entity);
    const a = fixture(ambiguous, [individual('company', entity)], [predicate('release', 'event', ['company'], 'earnings_release')], { intent: 'event' });
    reject(a);
  }
});

test('schema/unique quote errors reject before the hook and final semantic validation cannot be bypassed', () => {
  let calls = 0; const v = candidate(); const out = raw(v); out.evidence[0].quote = 'absent';
  assert.throws(() => reconstructInterpretation(out, simple, { canonicalize: value => { calls++; return value; } }), { code: 'INTERPRETATION_FAILED' });
  assert.equal(calls, 0);
  assert.throws(() => reconstructInterpretation(raw(v), simple, { canonicalize: value => ({ ...value, conditions: [] }) }), { code: 'INTERPRETATION_FAILED' });
  const recurrence = candidate(simple, { recurrence: 'once' }); reject(recurrence);
});

test('interpreter uses one mocked call and returns valid meaning without claiming support or persistence', async () => {
  const v = candidate(rich, { domain: 'official_company' }); let calls = 0;
  const result = await interpretWatchRequest(rich, { apiKey: 'synthetic-only',
    fetchImpl: async () => { calls++; return Response.json({ output_text: JSON.stringify(raw(v)) }); },
    roleResolver: () => assert.fail('No unrelated resolution'),
  });
  assert.equal(calls, 1); assert.equal(result.status, 'interpreted');
  assert.equal(result.executable, false); assert.equal(result.capabilityStatus, 'not_assessed');
  assert.equal(result.interpretation.domain, 'media_news');
  assert.equal(assessCapabilities(result.interpretation, { structured: true }).status, 'unsupported');
});

test('the normalization boundary leaves other existing news constructions unchanged', () => {
  const request = 'Monitor news about Microsoft when it publishes earnings results.';
  const value = fixture(request, [individual('company', 'Microsoft')], [predicate('news', 'news_about', ['company'])]);
  assert.equal(canonicalizeWatchInterpretation(value), value);
  assert.deepEqual(reconstruct(value), validateInterpretation(value));
});
