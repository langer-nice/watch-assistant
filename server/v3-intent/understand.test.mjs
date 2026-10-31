import assert from 'node:assert/strict';
import test from 'node:test';
import { createCapture } from './capture.mjs';
import { createIntent } from './intent.mjs';
import { createDecision } from './decision.mjs';
import { understandCapture, INSTRUCTIONS } from './understand.mjs';
import { fixtures, EXACT_URL } from './fixtures.mjs';
import { CAPTURE_KINDS, OUTPUT_SCHEMA } from './schema.mjs';
import { containsExactLiteral } from './validate.mjs';

const clone = value => structuredClone(value);
const run = (fixture, output = clone(fixture.output), options = {}) =>
  understandCapture(fixture.capture, [], { model: async () => output, ...options });
const byId = id => fixtures.find(f => f.id === id);

// These assertions inspect controlled examples, not arbitrary live language.
function checkMeaning(fixture, output) {
  const canonical = output.intent.canonical_text.toLowerCase();
  for (const term of fixture.required) assert.ok(canonical.includes(term.toLowerCase()), `Missing ${term}`);
  // Questions may legitimately offer alternative scopes. Invention checks target Intent only.
  const intent = JSON.stringify(output.intent).toLowerCase();
  for (const term of fixture.forbidden) assert.ok(!intent.includes(term.toLowerCase()), `Invented ${term}`);
}

for (const fixture of fixtures) {
  test(`${fixture.id}: controlled fixture shape, status, meaning and exact constraints`, async () => {
    let calls = 0;
    const result = await run(fixture, clone(fixture.output), { model: async request => {
      calls++;
      assert.equal(request.instructions, INSTRUCTIONS);
      assert.deepEqual(request.response_schema, OUTPUT_SCHEMA);
      assert.ok(Object.isFrozen(request.input.capture));
      assert.deepEqual(request.input.capture, fixture.capture);
      return clone(fixture.output);
    } });
    assert.equal(calls, 1);
    assert.equal(result.capture_id, fixture.id);
    assert.equal(result.decision.status, fixture.expected_status);
    assert.ok(result.intent.canonical_text.trim());
    assert.equal(Object.hasOwn(result.decision, 'clarification_question'), fixture.expected_status === 'NEEDS_CLARIFICATION');
    checkMeaning(fixture, result);
    for (const constraint of fixture.output.intent.explicit_constraints ?? []) {
      assert.ok(result.intent.explicit_constraints.some(actual => JSON.stringify(actual) === JSON.stringify(constraint)));
    }
    if (fixture.capture.kind === 'URL') assert.equal(result.intent.references[0].exact_url, EXACT_URL);
    assert.ok(Object.isFrozen(result.intent.references));
  });

  test(`${fixture.id}: forbidden-invention oracle rejects every declared mutation`, () => {
    assert.ok(fixture.forbidden.length);
    for (const term of fixture.forbidden) {
      const bad = clone(fixture.output);
      bad.intent.canonical_text += ` ${term}`;
      assert.throws(() => checkMeaning(fixture, bad), /Invented/);
    }
  });
}

test('exactly 15 conceptual fixtures, all unique', () => {
  assert.equal(fixtures.length, 15);
  assert.equal(new Set(fixtures.map(f => f.id)).size, 15);
  for (const fixture of fixtures) {
    assert.equal(fixture.expected_status, ['T7', 'T8'].includes(fixture.id) ? 'NEEDS_CLARIFICATION' : 'READY_TO_MONITOR');
  }
});

test('all five Capture kinds use the same core, including shared context', async () => {
  for (const kind of CAPTURE_KINDS) {
    const capture = createCapture({ kind, raw_input: 'Monitor this resource',
      context: [{ id: 'resource', kind: 'page', text: 'Jobs', url: EXACT_URL }] });
    assert.equal((await understandCapture(capture, [], { model: async () => clone(byId('T13').output) })).decision.status, 'READY_TO_MONITOR');
  }
});

test('Capture clones and deeply freezes context and metadata without changing exact text', () => {
  const input = { kind: 'FREE_TEXT', raw_input: '  Exact input\n', context: [{ id: 'p', kind: 'prior', text: 'Original' }] };
  const capture = createCapture(input);
  input.context[0].text = 'Changed';
  assert.equal(capture.raw_input, '  Exact input\n');
  assert.equal(capture.context[0].text, 'Original');
  assert.throws(() => { capture.context[0].text = 'Mutation'; }, TypeError);
  assert.throws(() => { capture.source_metadata.captured_at = 'Mutation'; }, TypeError);
});

test('Capture rejects technical fields, invalid kind, empty input and duplicate/reserved sources', () => {
  const base = { kind: 'FREE_TEXT', raw_input: 'An input' };
  for (const extra of ['provider', 'plan', 'polling_frequency', 'capability', 'monitoring_strategy']) {
    assert.throws(() => createCapture({ ...base, [extra]: 'forbidden' }), TypeError);
  }
  assert.throws(() => createCapture({ ...base, kind: 'WATCH' }), TypeError);
  assert.throws(() => createCapture({ ...base, raw_input: '' }), TypeError);
  for (const id of ['raw_input', 'conversation:0']) {
    assert.throws(() => createCapture({ ...base, context: [{ id, kind: 'prior', text: 'Data' }] }), TypeError);
  }
  assert.throws(() => createCapture({ ...base, context: [
    { id: 'same', kind: 'prior', text: 'One' }, { id: 'same', kind: 'prior', text: 'Two' },
  ] }), TypeError);
});

test('schema rejects empty canonical text, unknown fields and non-string exact numbers', () => {
  for (const update of [{ canonical_text: '' }, { plan: {} }, { canonical_text: null }]) {
    assert.throws(() => createIntent({ ...clone(byId('T3').output.intent), ...update }), TypeError);
  }
  const bad = clone(byId('T3').output.intent);
  bad.explicit_constraints[0].value = 1.17;
  assert.throws(() => createIntent(bad), TypeError);
});

test('decision state/question/ambiguity consistency is enforced', () => {
  const ready = createIntent(byId('T1').output.intent);
  const unclear = createIntent(byId('T7').output.intent);
  assert.throws(() => createDecision({ status: 'UNKNOWN', reason: 'Reason' }, ready), TypeError);
  assert.throws(() => createDecision({ status: 'NEEDS_CLARIFICATION', reason: 'Reason' }, unclear), TypeError);
  assert.equal(createDecision({ status: 'NEEDS_CLARIFICATION', reason: 'Reason', clarification_question: 'Which?' }, ready).status, 'NEEDS_CLARIFICATION');
  for (const status of ['READY_TO_MONITOR', 'UNSUPPORTED_FOR_NOW']) {
    assert.throws(() => createDecision({ status, reason: 'Reason', clarification_question: 'Which?' }, ready), TypeError);
    assert.throws(() => createDecision({ status, reason: 'Reason', suggestions: [] }, ready), TypeError);
    assert.throws(() => createDecision({ status, reason: 'Reason' }, unclear), TypeError);
  }
});

test('changed thresholds, comparator, period, exclusion, condition and relation are rejected', async () => {
  for (const [id, index, value] of [['T3', 0, '1.18'], ['T3', 1, '>='], ['T2', 0, 'Q4 2026'],
    ['T4', 0, 'or'], ['T5', 0, 'all beauty'], ['T6', 0, 'French sources']]) {
    const fixture = byId(id);
    const bad = clone(fixture.output);
    bad.intent.explicit_constraints[index].value = value;
    await assert.rejects(run(fixture, bad), /Exact value/);
    bad.intent.explicit_constraints[index].text = value;
    await assert.rejects(run(fixture, bad), /quote/);
  }
});

test('exact duration, date, OR and original decimal formatting are preserved without parsing', async () => {
  const capture = createCapture({ kind: 'FREE_TEXT', raw_input: 'A OR B; above 01.170; for 3 days; until 2026-12-01.' });
  const output = clone(byId('T3').output);
  output.intent.references = [{ label: 'A', source_ref: 'raw_input' }];
  output.intent.explicit_constraints = [['relation', 'OR'], ['threshold', '01.170'], ['duration', '3 days'], ['period', '2026-12-01']]
    .map(([kind, text]) => ({ kind, text, value: text, source_ref: 'raw_input' }));
  const result = await understandCapture(capture, [], { model: async () => output });
  assert.deepEqual(result.intent.explicit_constraints, output.intent.explicit_constraints);
});

test('literal grounding rejects word/number fragments without interpreting phrases', () => {
  assert.equal(containsExactLiteral('informed', 'or'), false);
  assert.equal(containsExactLiteral('1.170', '1.17'), false);
  assert.equal(containsExactLiteral('above 1.17.', '1.17'), true);
  assert.equal(containsExactLiteral('A OR B', 'OR'), true);
});

test('conflicting model URL bytes, quote, value and reference are rejected', async () => {
  const fixture = byId('T13');
  for (const mutate of [
    out => { out.intent.references[0].exact_url = EXACT_URL.toLowerCase(); },
    out => { out.intent.explicit_constraints[0].text = 'https://example.com/jobs'; },
    out => { out.intent.explicit_constraints[0].value = 'https://example.com/jobs'; },
  ]) {
    const bad = clone(fixture.output); mutate(bad);
    await assert.rejects(run(fixture, bad), /URL|resource/);
  }
});

test('unknown grounding sources are rejected', async () => {
  const bad = clone(byId('T3').output);
  bad.intent.explicit_constraints[0].source_ref = 'invented';
  await assert.rejects(run(byId('T3'), bad), /Unknown source/);
});

test('optional conversation is frozen, passed to AI and usable as provenance', async () => {
  const conversation = ['The company is Gucci.'];
  const output = clone(byId('T9').output);
  output.intent.references[0].source_ref = 'conversation:0';
  const result = await understandCapture(byId('T8').capture, conversation, { model: async request => {
    assert.deepEqual(request.input.conversation, conversation);
    assert.ok(Object.isFrozen(request.input.conversation));
    return output;
  } });
  assert.equal(result.decision.status, 'READY_TO_MONITOR');
  assert.deepEqual(conversation, ['The company is Gucci.']);
});

test('unsupported preserves understood intent and requires declared limitation', async () => {
  const output = clone(byId('T1').output);
  output.decision = { status: 'UNSUPPORTED_FOR_NOW', reason: 'Private database access is unavailable.' };
  const capture = createCapture({ kind: 'FREE_TEXT', raw_input: 'Follow the private inventory database.' });
  output.intent = { canonical_text: 'Follow changes to the private inventory database.',
    references: [{ label: 'private inventory database', source_ref: 'raw_input' }] };
  const result = await understandCapture(capture, [], {
    model: async () => output, limitations: ['Private database access is unavailable.'],
  });
  assert.equal(result.decision.status, 'UNSUPPORTED_FOR_NOW');
  assert.equal(result.intent.unresolved_ambiguities.length, 0);
  await assert.rejects(understandCapture(capture, [], { model: async () => output }), /declared limitation/);
});

test('model failure and invalid output do not retry or fabricate a Decision', async () => {
  for (const invalid of [null, {}, { ...clone(byId('T1').output), monitoring_plan: {} }]) {
    let calls = 0;
    await assert.rejects(understandCapture(byId('T1').capture, [], { model: async () => { calls++; return invalid; } }), TypeError);
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(understandCapture(byId('T1').capture, [], { model: async () => { calls++; throw new Error('Transport failed'); } }), /Transport failed/);
  assert.equal(calls, 1);
});

test('invalid input or missing model fails before a semantic call', async () => {
  let calls = 0;
  await assert.rejects(understandCapture({ kind: 'INVALID', raw_input: 'Text' }, [], { model: async () => { calls++; } }), TypeError);
  assert.equal(calls, 0);
  await assert.rejects(understandCapture({ kind: 'URL', raw_input: 'Monitor this page' }, [], {
    model: async () => { calls++; },
  }), /exactly one supplied resource/);
  assert.equal(calls, 0);
  await assert.rejects(understandCapture(byId('T1').capture), /model function/);
});
