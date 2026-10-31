import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { resolveEvidenceBasis } from './evidence-basis.mjs';
import { createJudgment } from './judgment.mjs';
import { judgeEvidence } from './brain.mjs';
import { EVIDENCE_REFERENCE_SCHEMA } from './schema.mjs';
import { fixtures } from './fixtures.mjs';

const byId = id => fixtures.find(f => f.id === id);
const evidence = { id: 'opaque-id', title: 'Official quarterly results', content: 'Revenue was USD 72.4 billion.',
  source: 'Example Investor Relations', url: 'https://example.com/Results?Q=3#Figures',
  published_at: '2026-10-31T10:00:00Z', retrieved_at: '2026-10-31T10:06:00Z' };
const judge = (basis, source = evidence, action = 'ALERT', evidence_status = 'CONFIRMED', reason = 'New relevant figures.') =>
  createJudgment({ action, evidence_status, reason, evidence_basis: basis }, source);

test('quote-only title claim resolves without model field choice', () => {
  const item = { quote: 'quarterly results' };
  assert.equal(resolveEvidenceBasis(evidence, item).field, 'title');
  assert.deepEqual(judge([item]).evidence_basis, [item]);
});
test('quote-only content claim resolves without model field choice', () => {
  const item = { quote: evidence.content };
  assert.equal(resolveEvidenceBasis(evidence, item).field, 'content');
  assert.equal(judge([item]).action, 'ALERT');
});
test('canonical measurement is exact and takes precedence over its validated content copy', async () => {
  const f = byId('J4'), item = { quote: f.input.evidence.measurement.quote };
  assert.equal(resolveEvidenceBasis(f.input.evidence, item).field, 'measurement');
  assert.equal(resolveEvidenceBasis(f.input.evidence, item).role, 'MEASUREMENT');
  assert.equal((await judgeEvidence(f.input, { model: async () => structuredClone(f.mock) })).action, 'ALERT');
});
test('claim wire variant has only quote; provenance variant only field', () => {
  const [claim, provenance] = EVIDENCE_REFERENCE_SCHEMA.anyOf;
  assert.deepEqual(claim.required, ['quote']); assert.deepEqual(Object.keys(claim.properties), ['quote']);
  assert.deepEqual(provenance.required, ['field']); assert.deepEqual(Object.keys(provenance.properties), ['field']);
  assert.equal(claim.additionalProperties, false); assert.equal(provenance.additionalProperties, false);
  for (const field of ['title', 'content', 'measurement']) {
    assert.throws(() => resolveEvidenceBasis(evidence, { field, quote: evidence.content }), TypeError);
    assert.throws(() => resolveEvidenceBasis(evidence, { field }), /Unsupported provenance/);
  }
});
test('no-match, paraphrase and fuzzy approximate partial claims reject', () => {
  for (const quote of ['Unknown development.', 'The company earned USD 72.4 billion.', 'revenue was USD 72.4 billion.', 'Revenue was USD 72,4 billion.']) {
    assert.throws(() => resolveEvidenceBasis(evidence, { quote }), /exact supplied claim text/);
  }
  // Explicit ordered ellipsis fragments are now resolved to the verbatim source span.
  assert.equal(resolveEvidenceBasis(evidence, { quote: 'Revenue was ... 72.4 billion.' }).value, evidence.content);
  // Existing exact contiguous substring matching is not fuzzy matching.
  assert.equal(resolveEvidenceBasis(evidence, { quote: 'USD 72.4 billion' }).field, 'content');
});
test('existing one-pair decorative normalization remains exact', () => {
  assert.deepEqual(judge([{ quote: '“' + evidence.content + '”' }]).evidence_basis, [{ quote: evidence.content }]);
  assert.throws(() => judge([{ quote: '""' + evidence.content + '""' }]), /exact supplied claim text/);
});
test('exact raw match in any claim field wins before decorative normalization elsewhere', () => {
  const e = { title: '“Alpha”', content: 'Alpha' };
  assert.equal(resolveEvidenceBasis(e, { quote: '“Alpha”' }).field, 'title');
});
test('ambiguous text across different title/content contexts rejects without fallback', () => {
  assert.throws(() => resolveEvidenceBasis({ title: 'Alpha confirmed', content: 'Alpha remains disputed.' }, { quote: 'Alpha' }), /Ambiguous evidence basis/);
});
test('identical entire title/content fields resolve deterministically to content', () => {
  const e = { title: 'Same exact observation.', content: 'Same exact observation.' };
  assert.equal(resolveEvidenceBasis(e, { quote: 'exact observation' }).field, 'content');
});
test('arbitrary fields, nested values and provenance values are never claim search targets', () => {
  const e = { ...evidence, extra: 'Secret elsewhere', nested: { text: 'Nested elsewhere' } };
  for (const quote of ['opaque-id', evidence.source, evidence.url, evidence.published_at, evidence.retrieved_at, e.extra, e.nested.text]) {
    assert.throws(() => resolveEvidenceBasis(e, { quote }), /exact supplied claim text/);
  }
  for (const field of ['id', 'retrieved_at', 'nested.text', 'measurement.quote', '__proto__', 'unknown']) {
    assert.throws(() => resolveEvidenceBasis(e, { field }), /Unsupported provenance/);
  }
});
test('source, URL and publication provenance resolve exact server-owned values', () => {
  for (const field of ['source', 'url', 'published_at']) {
    const r = resolveEvidenceBasis(evidence, { field });
    assert.equal(r.role, 'PROVENANCE'); assert.equal(r.value, evidence[field]); assert.deepEqual(r.reference, { field });
    for (const extra of [{ quote: evidence[field] }, { value: evidence[field] }, { quote: null }]) {
      assert.throws(() => resolveEvidenceBasis(evidence, { field, ...extra }), TypeError);
    }
  }
  const e = { ...evidence }; delete e.source;
  assert.throws(() => resolveEvidenceBasis(e, { field: 'source' }), /field is absent/);
});
test('source-only and URL-only ALERT reject; same provenance may support NO_ALERT', () => {
  for (const basis of [[{ field: 'source' }], [{ field: 'url' }], [{ field: 'source' }, { field: 'published_at' }]]) {
    assert.throws(() => judge(basis), /substantive claim-capable/);
    assert.equal(judge(basis, evidence, 'NO_ALERT').action, 'NO_ALERT');
  }
});
test('exact substantive quote plus provenance supports ALERT', () => {
  const basis = [{ quote: evidence.content }, { field: 'source' }];
  assert.deepEqual(judge(basis).evidence_basis, basis);
});
const dev = JSON.parse(fs.readFileSync(new URL('../v3-brain-lab/cases/development.json', import.meta.url), 'utf8'));
const historical = JSON.parse(fs.readFileSync(new URL('../v3-brain-lab/results/failure-review.json', import.meta.url), 'utf8'));
for (const id of ['R05', 'R06']) {
  test(`${id} historical exact claim quotes resolve to content with no case-specific runtime rule`, () => {
    const c = dev.find(c => c.id === id);
    const row = historical.find(r => r.id === id && r.stage === 'brain-dev-1');
    for (const { reference } of row.references.filter(r => r.reference.quote)) {
      const item = { quote: reference.quote };
      assert.equal(resolveEvidenceBasis(c.evidence, item).field, 'content');
      assert.equal(judge([item], c.evidence, c.expected_action).action, c.expected_action);
    }
  });
}
test('duplicate, exclusion and condition NO_ALERT behavior remains unchanged', () => {
  for (const id of ['J2', 'J6', 'J8']) {
    const f = byId(id); assert.equal(createJudgment(f.mock, f.input.evidence).action, 'NO_ALERT');
  }
});
test('weak-unconfirmed suppression and strong-unconfirmed qualification stay unchanged', () => {
  const weak = byId('J10'), strong = byId('J13');
  assert.throws(() => createJudgment({ ...structuredClone(weak.mock), action: 'ALERT' }, weak.input.evidence), /cannot support ALERT/);
  assert.equal(createJudgment(strong.mock, strong.input.evidence).action, 'ALERT');
  assert.throws(() => createJudgment({ ...structuredClone(strong.mock), reason: 'The concerts are confirmed.' }, strong.input.evidence), /requires explicit qualification/);
});
test('exact threshold guard still rejects rather than repairs a wrong ALERT', async () => {
  const f = byId('J5'), output = structuredClone(f.mock); output.action = 'ALERT';
  await assert.rejects(judgeEvidence(f.input, { model: async () => output }), /exact numeric condition/);
  assert.equal(output.action, 'ALERT');
});
test('grounding is deterministic/idempotent, frozen, and leaves evidence intact', () => {
  const before = structuredClone(evidence);
  for (const item of [{ quote: evidence.title }, { quote: '“' + evidence.content + '”' }, { field: 'source' }, { field: 'url' }]) {
    const r = resolveEvidenceBasis(evidence, item);
    const again = resolveEvidenceBasis(evidence, r.reference);
    for (const key of ['reference', 'field', 'role', 'value']) assert.deepEqual(again[key], r[key]);
    assert.ok(Object.isFrozen(r));
  }
  assert.deepEqual(evidence, before);
});
test('untyped strings, missing/extra keys and serialized field fragments reject', () => {
  for (const item of ['source: Example Investor Relations', 'source":"Example Investor Relations"', {}, { quote: '' }, { quote: evidence.content, path: 'content' }]) {
    assert.throws(() => resolveEvidenceBasis(evidence, item), TypeError);
  }
});
