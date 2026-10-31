import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEvidenceQuote } from './evidence-quote.mjs';
import { createJudgment } from './judgment.mjs';
import { fixtures } from './fixtures.mjs';

const evidence = fixtures[0].input.evidence;
const sentence = 'Manchester City officially confirmed that Player X has signed a five-year contract.';
const judge = (quote, source = evidence) => createJudgment({ action: 'ALERT', evidence_status: 'CONFIRMED', reason: 'A confirmed new development.', evidence_basis: [{ quote }] }, source);

test('exact unwrapped quote is accepted unchanged', () => {
  assert.deepEqual(judge(sentence).evidence_basis, [{ quote: sentence }]);
});
test('one straight double wrapper pair is accepted', () => {
  assert.deepEqual(judge('"' + sentence + '"').evidence_basis, [{ quote: sentence }]);
});
test('one curly double wrapper pair is accepted', () => {
  assert.deepEqual(judge('“' + sentence + '”').evidence_basis, [{ quote: sentence }]);
});
test('straight and curly single wrapper pairs are accepted', () => {
  for (const [left, right] of [["'", "'"], ['‘', '’']]) assert.deepEqual(judge(left + sentence + right).evidence_basis, [{ quote: sentence }]);
});
test('unmatched leading wrapper is preserved and unsupported citation rejected', () => {
  const raw = '"' + sentence;
  assert.equal(normalizeEvidenceQuote(raw, evidence), raw);
  assert.throws(() => judge(raw), /exact supplied claim text/);
});
test('unmatched trailing or mismatched wrappers are not stripped', () => {
  for (const raw of [sentence + '"', '“' + sentence + '"', "'" + sentence + '”']) {
    assert.equal(normalizeEvidenceQuote(raw, evidence), raw);
    assert.throws(() => judge(raw), /exact supplied claim text/);
  }
});
test('internal quotation marks and actual source wrappers remain intact', () => {
  const source = { title: '', content: 'The club said "confirmed" today. It also said “complete”.' };
  const quote = 'The club said "confirmed" today.';
  assert.deepEqual(judge('“' + quote + '”', source).evidence_basis, [{ quote }]);
  assert.equal(normalizeEvidenceQuote('"confirmed"', source), '"confirmed"');
});
test('different wording, capitalization or accents cannot ground as a paraphrase', () => {
  for (const raw of ['"Manchester City announced the signing of Player X."', '"manchester City officially confirmed that Player X has signed a five-year contract."', '"Mánchester City officially confirmed that Player X has signed a five-year contract."']) {
    assert.throws(() => judge(raw), /exact supplied claim text/);
  }
});
test('words omitted from inside a source sentence are not repaired', () => {
  assert.throws(() => judge('"Manchester City confirmed that Player X has signed a five-year contract."'), /exact supplied claim text/);
});
test('extra words and arbitrary punctuation are not stripped', () => {
  for (const raw of ['"Official update: ' + sentence + '"', '(' + sentence + ')', '...' + sentence]) assert.throws(() => judge(raw), /exact supplied claim text/);
});
test('whitespace normalization resolves back to verbatim source text', () => {
  const source = { title: '', content: 'Alpha  beta\nGamma.' };
  for (const raw of ['"Alpha  beta\nGamma."', '"Alpha beta\nGamma."', ' "Alpha  beta\nGamma." ', '" Alpha  beta\nGamma. "']) {
    assert.deepEqual(judge(raw, source).evidence_basis, [{ quote: source.content }]);
  }
});
test('normalization is idempotent for supported, unsupported and nested wrappers', () => {
  const source = { title: '', content: 'Alpha. "Beta."' };
  for (const raw of ['Alpha.', '“Alpha.”', '"Alpha."', "'\"Beta.\"'", '"\"Alpha.\""', '“Unknown.”', '"Alpha.']) {
    const once = normalizeEvidenceQuote(raw, source);
    assert.equal(normalizeEvidenceQuote(once, source), once);
  }
  // Two decorative pairs cannot be stripped recursively to find bare Alpha.
  assert.throws(() => judge('"\"Alpha.\""', source), /exact supplied claim text/);
});
test('only basis presentation changes; judgment semantics and caller input remain intact', () => {
  const input = { ...structuredClone(fixtures[0].mock), evidence_basis: [{ quote: '“' + sentence + '”' }] };
  const before = structuredClone(input); const result = createJudgment(input, evidence);
  assert.equal(result.action, before.action); assert.equal(result.evidence_status, before.evidence_status); assert.equal(result.reason, before.reason);
  assert.equal(result.novelty_summary, before.novelty_summary);
  assert.deepEqual(input, before); assert.deepEqual(result.evidence_basis, [{ quote: sentence }]);
});
test('decorative wrappers inside structured content references are admitted', () => {
  const input = { ...structuredClone(fixtures[0].mock), evidence_basis: [{ quote: '"' + sentence + '"' }, { quote: '"The transfer is complete."' }] };
  const result = createJudgment(input, evidence);
  assert.equal(result.action, 'ALERT');
  assert.deepEqual(result.evidence_basis, [{ quote: sentence }, { quote: 'The transfer is complete.' }]);
});
test('current title and repeated exact-substring support behavior is preserved', () => {
  const source = { title: 'Title quote', content: 'Repeated. Repeated.' };
  assert.deepEqual(judge('“Title quote”', source).evidence_basis, [{ quote: 'Title quote' }]);
  assert.deepEqual(judge('“Repeated.”', source).evidence_basis, [{ quote: 'Repeated.' }]);
});
