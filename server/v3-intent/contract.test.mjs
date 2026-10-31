import assert from 'node:assert/strict';
import test from 'node:test';
import { understandCapture } from './understand.mjs';
import { normalizeV3UnderstandingOutput } from './normalize.mjs';
import { fixtures } from './fixtures.mjs';
import { OUTPUT_SCHEMA } from './schema.mjs';

const minimal = () => ({ intent: { canonical_text: 'Follow general developments about the supplied subject.' },
  decision: { status: 'READY_TO_MONITOR', reason: 'The requested scope is clear.' } });
const run = output => understandCapture(fixtures[0].capture, [], { model: async () => output });

test('READY admits missing or empty optional references', async () => {
  for (const references of [undefined, null, []]) {
    const output = minimal();
    if (references !== undefined) output.intent.references = references;
    const result = await run(output);
    assert.deepEqual(result.intent.references, []);
    assert.equal(result.decision.status, 'READY_TO_MONITOR');
  }
});

for (const question of [null, '', '   ']) {
  test(`READY normalizes harmless clarification metadata ${JSON.stringify(question)}`, async () => {
    const output = minimal();
    output.decision.clarification_question = question;
    output.decision.suggestions = [];
    const result = await run(output);
    assert.equal(Object.hasOwn(result.decision, 'clarification_question'), false);
    assert.equal(Object.hasOwn(result.decision, 'suggestions'), false);
  });
}

test('READY rejects a substantive question or suggestions and unresolved ambiguity', async () => {
  for (const extra of [{ clarification_question: 'Which scope do you want?' }, { suggestions: ['A scope'] }]) {
    const output = minimal(); Object.assign(output.decision, extra);
    await assert.rejects(run(output), /Only clarification/);
  }
  const output = minimal(); output.intent.unresolved_ambiguities = ['Scope unresolved'];
  await assert.rejects(run(output), /Only clarification/);
});

test('clarification requires a meaningful question, with optional ambiguity metadata', async () => {
  const output = minimal();
  output.decision.status = 'NEEDS_CLARIFICATION';
  output.decision.clarification_question = 'Which subject would you like to follow?';
  const result = await run(output);
  assert.equal(result.decision.clarification_question, output.decision.clarification_question);
  assert.deepEqual(result.intent.unresolved_ambiguities, []);
});

test('clarification rejects missing, null or empty question', async () => {
  for (const question of [undefined, null, '', '   ']) {
    const output = minimal(); output.decision.status = 'NEEDS_CLARIFICATION';
    if (question !== undefined) output.decision.clarification_question = question;
    await assert.rejects(run(output), /clarification_question/);
  }
});

test('unsupported accepts absent/null clarification without references; known limitation still required', async () => {
  for (const question of [undefined, null, '']) {
    const output = minimal();
    output.decision = { status: 'UNSUPPORTED_FOR_NOW', reason: 'Private access is unavailable.' };
    if (question !== undefined) output.decision.clarification_question = question;
    const result = await understandCapture(fixtures[0].capture, [], {
      model: async () => output, limitations: ['Private access is unavailable.'],
    });
    assert.equal(result.decision.status, 'UNSUPPORTED_FOR_NOW');
    assert.equal(Object.hasOwn(result.decision, 'clarification_question'), false);
  }
});

test('missing canonical text, status or reason remains invalid', async () => {
  for (const [owner, field] of [['intent', 'canonical_text'], ['decision', 'status'], ['decision', 'reason']]) {
    const output = minimal(); delete output[owner][field];
    await assert.rejects(run(output), TypeError);
  }
});

test('normalizer never rewrites canonical text, status, references or constraints', () => {
  const output = structuredClone(fixtures[2].output);
  const before = structuredClone(output);
  const normalized = normalizeV3UnderstandingOutput(output);
  assert.equal(normalized.intent.canonical_text, before.intent.canonical_text);
  assert.equal(normalized.decision.status, before.decision.status);
  assert.deepEqual(normalized.intent.references, before.intent.references);
  assert.deepEqual(normalized.intent.explicit_constraints, before.intent.explicit_constraints);
  assert.deepEqual(output, before);
  const simple = normalizeV3UnderstandingOutput(minimal());
  assert.equal(Object.hasOwn(simple.intent, 'references'), false);
  assert.equal(Object.hasOwn(simple.intent, 'explicit_constraints'), false);
});

test('normalization is idempotent and preserves malformed values for rejection', async () => {
  const output = minimal();
  Object.assign(output.intent, { references: null, explicit_constraints: [], unresolved_ambiguities: null });
  Object.assign(output.decision, { clarification_question: null, suggestions: null });
  const once = normalizeV3UnderstandingOutput(output);
  assert.deepEqual(normalizeV3UnderstandingOutput(once), once);
  for (const references of ['', {}, [null]]) {
    const bad = minimal(); bad.intent.references = references;
    await assert.rejects(run(bad), TypeError);
  }
  const unknown = minimal(); unknown.intent.monitoring_plan = {};
  await assert.rejects(run(unknown), TypeError);
});

test('strict-wire null optional metadata normalizes without affecting exact constraints', async () => {
  const output = structuredClone(fixtures[2].output);
  output.intent.references[0].exact_url = null;
  output.intent.explicit_constraints[0].value = null;
  output.decision.clarification_question = null;
  output.decision.suggestions = null;
  const result = await understandCapture(fixtures[2].capture, [], { model: async () => output });
  assert.equal(result.intent.explicit_constraints[0].text, '1.17');
  assert.equal(result.intent.explicit_constraints[1].value, 'above');
  assert.equal(Object.hasOwn(result.intent.references[0], 'exact_url'), false);
  assert.equal(Object.hasOwn(result.intent.explicit_constraints[0], 'value'), false);
});

test('strict schema requires all wire keys while permitting null optional metadata', () => {
  function inspect(schema) {
    if (schema.properties) {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, Object.keys(schema.properties));
      Object.values(schema.properties).forEach(inspect);
    }
    if (schema.items) inspect(schema.items);
  }
  inspect(OUTPUT_SCHEMA);
  const intent = OUTPUT_SCHEMA.properties.intent.properties;
  for (const key of ['references', 'explicit_constraints', 'unresolved_ambiguities']) assert.ok(intent[key].type.includes('null'));
  assert.equal(intent.canonical_text.type, 'string');
  const decision = OUTPUT_SCHEMA.properties.decision.properties;
  assert.equal(decision.status.type, 'string');
  assert.equal(decision.reason.type, 'string');
  assert.ok(decision.clarification_question.type.includes('null'));
  assert.ok(decision.suggestions.type.includes('null'));
});

test('previous harmless READY response shape is admitted without inventing references', async () => {
  const output = minimal();
  output.intent.references = [];
  output.intent.explicit_constraints = [];
  output.decision.clarification_question = '';
  output.decision.suggestions = [];
  const result = await run(output);
  assert.equal(result.intent.canonical_text, output.intent.canonical_text);
  assert.deepEqual(result.intent.references, []);
  assert.equal(result.decision.status, output.decision.status);
});
