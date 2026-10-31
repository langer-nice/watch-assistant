import assert from 'node:assert/strict';
import test from 'node:test';
import { createResponsesModel } from './provider.mjs';
import { understandCapture, INSTRUCTIONS } from './understand.mjs';
import { OUTPUT_SCHEMA } from './schema.mjs';
import { fixtures } from './fixtures.mjs';

test('Responses transport preserves instructions/schema/input and uses one fixed call', async () => {
  let calls = 0;
  const measurements = [];
  const model = createResponsesModel({ apiKey: 'synthetic-test-credential',
    onMeasurement: value => measurements.push(value),
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'gpt-5.6-luna');
      assert.equal(body.store, false);
      assert.equal(body.instructions, INSTRUCTIONS);
      assert.deepEqual(body.text.format.schema, OUTPUT_SCHEMA);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.max_output_tokens, 3000);
      assert.deepEqual(body.reasoning, { effort: 'low' });
      assert.equal(Object.hasOwn(body, 'temperature'), false);
      assert.deepEqual(JSON.parse(body.input).capture, fixtures[0].capture);
      const wire = structuredClone(fixtures[0].output);
      wire.intent.references.forEach(ref => { ref.exact_url = null; });
      wire.decision.clarification_question = null;
      wire.decision.suggestions = null;
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [
        { type: 'output_text', text: JSON.stringify(wire) },
      ] }], usage: { input_tokens: 100, output_tokens: 50 } });
    } });
  const result = await understandCapture(fixtures[0].capture, [], { model });
  assert.equal(result.decision.status, 'READY_TO_MONITOR');
  assert.equal(calls, 1);
  assert.equal(measurements[0].calls, 1);
  assert.equal(measurements[0].http_status, 200);
  assert.deepEqual(measurements[0].usage, { input_tokens: 100, output_tokens: 50 });
  assert.ok(!JSON.stringify(measurements).includes('synthetic-test-credential'));
});

test('transport refuses incomplete responses, auth failure and malformed JSON without retry', async () => {
  for (const mode of ['incomplete', 'auth', 'json', 'network']) {
    let calls = 0;
    const measurements = [];
    const model = createResponsesModel({ apiKey: 'synthetic-test-credential',
      onMeasurement: value => measurements.push(value), fetchImpl: async () => {
        calls++;
        if (mode === 'network') throw new Error('Synthetic network failure');
        if (mode === 'auth') return Response.json({ error: 'Do not log body' }, { status: 401 });
        return Response.json({ status: mode === 'incomplete' ? 'incomplete' : 'completed', output_text: 'invalid JSON' });
      } });
    await assert.rejects(understandCapture(fixtures[0].capture, [], { model }));
    assert.equal(calls, 1);
    assert.equal(measurements.length, 1);
  }
});
