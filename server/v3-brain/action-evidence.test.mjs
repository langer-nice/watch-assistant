import assert from 'node:assert/strict';
import test from 'node:test';
import { createJudgment } from './judgment.mjs';
import { ACTIONS, EVIDENCE_STATUSES, JUDGMENT_SCHEMA } from './schema.mjs';
import { fixtures } from './fixtures.mjs';

const fixture = fixtures[0];
const output = (action, evidence_status, reason = evidence_status === 'STRONG_UNCONFIRMED'
  ? 'Credible reports support this, but it is not officially confirmed.'
  : 'The decision follows supplied intent, prior state and evidence.') => ({
  action, evidence_status, reason, evidence_basis: fixture.mock.evidence_basis,
});

for (const status of EVIDENCE_STATUSES) {
  test(`NO_ALERT + ${status} is structurally valid`, () => {
    const result = createJudgment(output('NO_ALERT', status), fixture.input.evidence);
    assert.equal(result.action, 'NO_ALERT'); assert.equal(result.evidence_status, status);
  });
  test(`ALERT + ${status} consistency`, () => {
    if (['CONFIRMED', 'STRONG_UNCONFIRMED'].includes(status)) {
      assert.equal(createJudgment(output('ALERT', status), fixture.input.evidence).action, 'ALERT');
    } else assert.throws(() => createJudgment(output('ALERT', status), fixture.input.evidence), /cannot support ALERT/);
  });
}
test('strong unconfirmed ALERT accepts varied explicit qualification wording', () => {
  for (const reason of ['Multiple independent credible reports support this; it remains unconfirmed.',
    'Strong reports support this, but it is not yet officially confirmed.',
    'Credible reports are consistent; official confirmation is still pending.',
    'Strong reports suggest this development, pending official confirmation.']) {
    assert.equal(createJudgment(output('ALERT', 'STRONG_UNCONFIRMED', reason), fixture.input.evidence).reason, reason);
  }
});
test('strong unconfirmed ALERT rejects missing qualification', () => {
  for (const reason of ['This has happened.', 'Credible reports describe an imminent announcement.', 'This is officially confirmed.']) {
    assert.throws(() => createJudgment(output('ALERT', 'STRONG_UNCONFIRMED', reason), fixture.input.evidence), /requires explicit qualification/);
  }
});
test('action and evidence status are required independently; no extra dimensions', () => {
  assert.deepEqual(ACTIONS, ['ALERT', 'NO_ALERT']);
  assert.deepEqual(Object.keys(JUDGMENT_SCHEMA.properties), ['action', 'evidence_status', 'reason', 'evidence_basis', 'novelty_summary']);
  for (const field of ['action', 'evidence_status']) {
    const bad = output('ALERT', 'CONFIRMED'); delete bad[field];
    assert.throws(() => createJudgment(bad, fixture.input.evidence), TypeError);
  }
  assert.throws(() => createJudgment({ ...output('ALERT', 'CONFIRMED'), confidence: 0.9 }, fixture.input.evidence), TypeError);
});
test('J3 status explicitly describes the established unrelated event, not relevance', () => {
  const j3 = fixtures.find(f => f.id === 'J3');
  assert.deepEqual(j3.expected, { action: 'NO_ALERT', evidence_status: 'CONFIRMED' });
});
