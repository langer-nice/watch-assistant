import assert from 'node:assert/strict';
import test from 'node:test';
import { createCapture } from './capture.mjs';
import { understandCapture, INSTRUCTIONS } from './understand.mjs';
import { normalizeV3UnderstandingOutput } from './normalize.mjs';
import { fixtures, EXACT_URL } from './fixtures.mjs';

const byId = id => fixtures.find(f => f.id === id);
const ready = text => ({ intent: { canonical_text: text },
  decision: { status: 'READY_TO_MONITOR', reason: 'Subject and general intent are identified.' } });
const clarify = (text, question, ambiguity) => ({
  intent: { canonical_text: text, unresolved_ambiguities: [ambiguity] },
  decision: { status: 'NEEDS_CLARIFICATION', reason: ambiguity, clarification_question: question },
});
async function controlled(capture, output) {
  let calls = 0;
  const result = await understandCapture(capture, [], { model: async request => {
    calls++;
    assert.equal(request.instructions, INSTRUCTIONS);
    assert.ok(request.instructions.includes('optional refinement must not block'));
    assert.ok(request.instructions.includes('do not bundle optional refinement questions'));
    return structuredClone(output);
  } });
  assert.equal(calls, 1);
  return result;
}
const general = createCapture({ kind: 'FREE_TEXT', raw_input: 'Keep me informed about Northstar.' });

// Controlled contract examples: these do not claim real-model semantic accuracy.
test('exact resource and general monitor instruction admit READY', async () => {
  const result = await controlled(byId('T13').capture, byId('T13').output);
  assert.equal(result.decision.status, 'READY_TO_MONITOR');
});
test('known entity and general following admit READY', async () => {
  assert.equal((await controlled(general, ready(general.raw_input))).decision.status, 'READY_TO_MONITOR');
});
test('unresolved company referent remains a required clarification', async () => {
  assert.equal((await controlled(byId('T8').capture, byId('T8').output)).decision.status, 'NEEDS_CLARIFICATION');
});
test('missing-company clarification asks only for the necessary referent', async () => {
  const result = await controlled(byId('T8').capture, byId('T8').output);
  assert.equal(result.decision.clarification_question, 'Which company would you like to follow?');
  assert.doesNotMatch(result.decision.clarification_question, /sources|scope|types|developments/i);
});
test('material importance ambiguity remains clarification', async () => {
  assert.equal((await controlled(byId('T7').capture, byId('T7').output)).decision.status, 'NEEDS_CLARIFICATION');
});
test('absent optional source preference does not require a field or question', async () => {
  const result = await controlled(general, ready(general.raw_input));
  assert.equal(result.decision.status, 'READY_TO_MONITOR');
  assert.equal(Object.hasOwn(result.decision, 'clarification_question'), false);
});
test('absent optional category preference does not block general scope', async () => {
  const result = await controlled(byId('T9').capture, byId('T9').output);
  assert.equal(result.decision.status, 'READY_TO_MONITOR');
  assert.deepEqual(result.intent.explicit_constraints, []);
});
test('uninterpretable explicit condition remains a blocking question', async () => {
  const capture = createCapture({ kind: 'FREE_TEXT', raw_input: 'Follow Northstar only if that condition is met.' });
  const output = clarify(capture.raw_input, 'Which condition must be met?', 'The explicit condition is unidentified.');
  assert.equal((await controlled(capture, output)).decision.status, 'NEEDS_CLARIFICATION');
});
test('policy path retains exact resource bytes', async () => {
  const result = await controlled(byId('T13').capture, byId('T13').output);
  assert.equal(result.intent.references[0].exact_url, EXACT_URL);
  assert.equal(result.intent.explicit_constraints[0].text, EXACT_URL);
});
test('clarification policy adds no inferred intent or constraints', async () => {
  const output = ready(general.raw_input);
  const result = await controlled(general, output);
  assert.equal(result.intent.canonical_text, output.intent.canonical_text);
  assert.deepEqual(result.intent.references, []);
  assert.deepEqual(result.intent.explicit_constraints, []);
});
test('policy path does not silently resolve supplied material ambiguity', async () => {
  const result = await controlled(byId('T7').capture, byId('T7').output);
  assert.deepEqual(result.intent.unresolved_ambiguities, byId('T7').output.intent.unresolved_ambiguities);
  assert.equal(result.decision.clarification_question, byId('T7').output.decision.clarification_question);
});
test('normalization remains structural and idempotent', () => {
  const output = ready(general.raw_input);
  output.intent.references = null;
  output.decision.clarification_question = null;
  output.decision.suggestions = null;
  const normalized = normalizeV3UnderstandingOutput(output);
  assert.deepEqual(normalized, ready(general.raw_input));
  assert.deepEqual(normalizeV3UnderstandingOutput(normalized), normalized);
  assert.equal(output.decision.clarification_question, null);
});
