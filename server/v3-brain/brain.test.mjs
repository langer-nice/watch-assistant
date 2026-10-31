import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeEvidence } from './brain.mjs';
import { createVerifiedIntent, createEvidence, createPriorState } from './input.mjs';
import { createBrainModel } from './provider.mjs';
import { createJudgment } from './judgment.mjs';
import { compareDecimals } from './validate.mjs';
import { INSTRUCTIONS } from './prompt.mjs';
import { JUDGMENT_SCHEMA } from './schema.mjs';
import { fixtures, LIVE_CASES } from './fixtures.mjs';

const clone = value => structuredClone(value);
const byId = id => fixtures.find(f => f.id === id);
const run = (fixture, output = clone(fixture.mock)) => judgeEvidence(fixture.input, { model: async () => output });

for (const fixture of fixtures) {
  test(`${fixture.id}: controlled judgment contract, expected action/status and immutable semantic input`, async () => {
    let calls = 0;
    const before = clone(fixture.input);
    const result = await judgeEvidence(fixture.input, { model: async request => {
      calls++;
      assert.equal(request.instructions, INSTRUCTIONS);
      assert.deepEqual(request.response_schema, JUDGMENT_SCHEMA);
      assert.equal(request.input.intent.canonical_text, fixture.input.intent.canonical_text);
      assert.deepEqual(request.input.intent.explicit_constraints, fixture.input.intent.explicit_constraints);
      assert.deepEqual(request.input.evidence, fixture.input.evidence);
      assert.deepEqual(request.input.prior_state, fixture.input.prior_state);
      assert.ok(Object.isFrozen(request.input.intent.explicit_constraints));
      assert.ok(Object.isFrozen(request.input.evidence));
      assert.ok(Object.isFrozen(request.input.prior_state.entries));
      return clone(fixture.mock);
    } });
    assert.equal(calls, 1);
    assert.equal(result.action, fixture.expected.action);
    assert.equal(result.evidence_status, fixture.expected.evidence_status);
    assert.ok(result.reason.trim());
    assert.ok(result.evidence_basis.length);
    assert.equal(Object.hasOwn(result, 'verdict'), false);
    assert.deepEqual(fixture.input, before);
    assert.ok(Object.isFrozen(result.evidence_basis));
  });
}

test('exactly thirteen fixtures and only seven approved live selections', () => {
  assert.equal(fixtures.length, 13);
  assert.equal(new Set(fixtures.map(f => f.id)).size, 13);
  assert.deepEqual(LIVE_CASES.map(c => c.fixture), ['J1', 'J2', 'J4', 'J6', 'J10', 'J12', 'J13']);
});
test('required history-heavy fixtures contain five to ten real structured prior facts', () => {
  for (const id of ['J1', 'J2', 'J11', 'J12']) {
    const entries = byId(id).input.prior_state.entries;
    assert.ok(entries.length >= 5 && entries.length <= 10);
    assert.ok(entries.every(e => e.fact && e.date && typeof e.alerted === 'boolean'));
    assert.equal(new Set(entries.map(e => e.fact)).size, entries.length);
  }
  assert.ok(byId('J2').input.prior_state.entries.some(e => e.alerted));
});
test('evidence rejects verdict/score/hidden-label fields; prior state rejects invented shape', () => {
  for (const key of ['expected', 'action', 'evidence_status', 'verdict', 'score', 'hidden_label']) {
    assert.throws(() => createEvidence({ ...clone(byId('J1').input.evidence), [key]: 'ALERT' }), TypeError);
  }
  assert.throws(() => createPriorState({ entries: [{ id: 'p', fact: 'Fact', alerted: 'true' }] }), TypeError);
  assert.throws(() => createPriorState({ entries: [
    { id: 'p', fact: 'One', alerted: false }, { id: 'p', fact: 'Two', alerted: false },
  ] }), TypeError);
});
test('input models clone before freezing without mutating caller objects', () => {
  const input = clone(byId('J4').input);
  const verified = createVerifiedIntent(input.intent), evidence = createEvidence(input.evidence), prior = createPriorState(input.prior_state);
  input.intent.numeric_condition.threshold = 'changed';
  input.intent.explicit_constraints[0].value = 'changed';
  input.evidence.measurement.value = 'changed';
  input.prior_state.entries.push({ id: 'p', fact: 'New', alerted: false });
  assert.equal(verified.numeric_condition.threshold, '1.17');
  assert.equal(verified.explicit_constraints[0].value, '1.17');
  assert.equal(evidence.measurement.value, '1.171');
  assert.equal(prior.entries.length, 0);
});
test('only a verified, unambiguous natural-language intent is admitted', () => {
  assert.throws(() => createVerifiedIntent({ canonical_text: '' }), TypeError);
  assert.throws(() => createVerifiedIntent({ canonical_text: 'Follow this', unresolved_ambiguities: ['Which subject?'] }), TypeError);
  assert.deepEqual(createVerifiedIntent({ canonical_text: 'Follow this known subject.' }).references, []);
});
test('judgment rejects unknown action/status, missing reason/basis, extra plan or rewritten intent', () => {
  const fixture = byId('J1');
  for (const change of [{ action: 'MAYBE' }, { evidence_status: 'MAYBE' }, { reason: '' }, { reason: 'x'.repeat(4001) }, { evidence_basis: [] }, { plan: {} }, { intent: {} }]) {
    assert.throws(() => createJudgment({ ...clone(fixture.mock), ...change }, fixture.input.evidence), TypeError);
  }
});
test('grounding rejects fabricated basis and the old contract is not accepted', async () => {
  const fixture = byId('J10');
  const output = clone(fixture.mock); output.evidence_basis = [{ quote: 'A fabricated official confirmation' }];
  await assert.rejects(run(fixture, output), /exact supplied claim text/);
  for (const extra of [{ verdict: 'IGNORE' }, { uncertainty_reason: 'Unsure' }]) {
    await assert.rejects(run(fixture, { ...clone(fixture.mock), ...extra }), TypeError);
  }
});
test('optional novelty summary may be absent or null without intent echo', async () => {
  for (const value of [undefined, null]) {
    const output = clone(byId('J1').mock);
    if (value === undefined) delete output.novelty_summary; else output.novelty_summary = value;
    const result = await run(byId('J1'), output);
    assert.equal(Object.hasOwn(result, 'novelty_summary'), false);
  }
});
test('exact decimal comparisons avoid binary floating-point and preserve strict equality', () => {
  for (const [a, b, expected] of [['1.171', '1.17', 1], ['1.169', '1.17', -1], ['1.170', '1.17', 0],
    ['1.17000000000000000001', '1.17', 1], ['-0.001', '0', -1], ['001.170', '1.17', 0]]) {
    assert.equal(compareDecimals(a, b), expected);
  }
  assert.throws(() => compareDecimals(1.17, '1.17'), TypeError);
  assert.throws(() => compareDecimals('1e3', '1.17'), TypeError);
});
test('below-threshold ALERT is rejected, never silently rewritten', async () => {
  const output = clone(byId('J5').mock); output.action = 'ALERT';
  await assert.rejects(run(byId('J5'), output), /exact numeric condition/);
  assert.equal(output.action, 'ALERT');
});
test('strict boundary equality fails gt but satisfies gte; true condition does not force ALERT', async () => {
  const input = clone(byId('J4').input);
  input.evidence.content = 'GBP/EUR = 1.17'; input.evidence.measurement = { metric: 'GBP/EUR', value: '1.17', quote: 'GBP/EUR = 1.17' };
  const output = { action: 'ALERT', evidence_status: 'CONFIRMED', reason: 'Threshold met.', evidence_basis: [{ quote: 'GBP/EUR = 1.17' }] };
  await assert.rejects(judgeEvidence(input, { model: async () => output }), /exact numeric condition/);
  input.intent.numeric_condition.operator = 'gte';
  assert.equal((await judgeEvidence(input, { model: async () => output })).action, 'ALERT');
  assert.equal((await run(byId('J4'), { ...clone(byId('J4').mock), action: 'NO_ALERT' })).action, 'NO_ALERT');
});
test('exact measurements require grounded metric/value, and conflicting numeric metadata is rejected', async () => {
  for (const value of ['1.18', '1.1']) {
    const input = clone(byId('J4').input); input.evidence.measurement.value = value;
    await assert.rejects(judgeEvidence(input, { model: async () => clone(byId('J4').mock) }), /exact supplied evidence/);
  }
  const input = clone(byId('J4').input); input.intent.numeric_condition.threshold = '1.18';
  await assert.rejects(judgeEvidence(input, { model: async () => clone(byId('J4').mock) }), /verified intent/);
});
test('ALERT cannot use absent or inverted-pair numeric evidence as an exact match', async () => {
  const input = clone(byId('J4').input); delete input.evidence.measurement;
  await assert.rejects(judgeEvidence(input, { model: async () => ({ ...clone(byId('J4').mock), evidence_basis: [{ quote: 'GBP/EUR = 1.171' }] }) }), /matching exact measurement/);
  input.evidence.content = 'EUR/GBP = 1.171'; input.evidence.measurement = { metric: 'EUR/GBP', value: '1.171', quote: 'EUR/GBP = 1.171' };
  await assert.rejects(judgeEvidence(input, { model: async () => ({ ...clone(byId('J4').mock), evidence_basis: [{ quote: 'EUR/GBP = 1.171' }] }) }), /matching exact measurement/);
});
test('exclusion, condition and period metadata are forwarded unchanged without output duplication', async () => {
  for (const id of ['J6', 'J8', 'J12']) {
    const fixture = byId(id); const before = clone(fixture.input.intent);
    await judgeEvidence(fixture.input, { model: async request => {
      assert.deepEqual(request.input.intent.explicit_constraints, before.explicit_constraints);
      return clone(fixture.mock);
    } });
    assert.deepEqual(fixture.input.intent, before);
  }
});
test('failures perform one call with no repair, fallback or fabricated action', async () => {
  for (const mode of ['throw', 'shape']) {
    let calls = 0;
    await assert.rejects(judgeEvidence(byId('J1').input, { model: async () => {
      calls++; if (mode === 'throw') throw new Error('Synthetic transport failure'); return {};
    } }));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(judgeEvidence({ intent: {} }, { model: async () => { calls++; } }), TypeError);
  assert.equal(calls, 0);
});
test('provider uses the exact judgment contract and fixed one-call settings', async () => {
  let calls = 0; const measurements = [];
  const model = createBrainModel({ apiKey: 'synthetic-test-credential', onMeasurement: m => measurements.push(m), fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5.6-luna'); assert.equal(body.store, false);
    assert.deepEqual(body.reasoning, { effort: 'low' }); assert.equal(body.max_output_tokens, 3000);
    assert.equal(body.text.format.strict, true); assert.deepEqual(body.text.format.schema, JUDGMENT_SCHEMA);
    assert.equal(body.instructions, INSTRUCTIONS);
    assert.equal(Object.hasOwn(body, 'temperature'), false);
    assert.equal(JSON.parse(body.input).intent.canonical_text, byId('J1').input.intent.canonical_text);
    return Response.json({ status: 'completed', output_text: JSON.stringify(byId('J1').mock), usage: { input_tokens: 10, output_tokens: 5 } });
  } });
  assert.equal((await judgeEvidence(byId('J1').input, { model })).action, 'ALERT');
  assert.equal(calls, 1); assert.equal(measurements[0].calls, 1);
  assert.ok(!JSON.stringify(measurements).includes('synthetic-test-credential'));
});
test('provider does not retry network, auth, incomplete or malformed output failures', async () => {
  for (const mode of ['network', 'auth', 'incomplete', 'json']) {
    let calls = 0;
    const model = createBrainModel({ apiKey: 'synthetic-test-credential', fetchImpl: async () => {
      calls++; if (mode === 'network') throw new Error('Synthetic network failure');
      if (mode === 'auth') return Response.json({}, { status: 401 });
      return Response.json({ status: mode === 'incomplete' ? 'incomplete' : 'completed', output_text: 'bad JSON' });
    } });
    await assert.rejects(judgeEvidence(byId('J1').input, { model }));
    assert.equal(calls, 1);
  }
});
