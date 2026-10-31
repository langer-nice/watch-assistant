import assert from 'node:assert/strict';
import test from 'node:test';
import { createCapture } from './capture.mjs';
import { understandCapture } from './understand.mjs';
import { normalizeV3UnderstandingOutput } from './normalize.mjs';
import { resourceFromCapture } from './resource.mjs';
import { fixtures, EXACT_URL } from './fixtures.mjs';

const urlCapture = fixtures.find(f => f.id === 'T13').capture;
const minimal = (text = 'Follow meaningful changes to this page.') => ({
  intent: { canonical_text: text },
  decision: { status: 'READY_TO_MONITOR', reason: 'The requested resource and intent are known.' },
});
const run = (output = minimal(), capture = urlCapture) => understandCapture(capture, [], { model: async () => structuredClone(output) });

test('URL resource is admitted when the model omits all duplicate metadata', async () => {
  const result = await run();
  assert.deepEqual(result.resource, { source_ref: 'resource', exact_url: EXACT_URL });
  assert.deepEqual(result.intent.references, []);
  assert.deepEqual(result.intent.explicit_constraints, []);
});
test('semantic this-page wording does not need to prove the resource', async () => {
  const output = minimal('Keep track of this page.');
  const result = await run(output);
  assert.equal(result.intent.canonical_text, output.intent.canonical_text);
  assert.equal(result.resource.exact_url, EXACT_URL);
});
test('same exact duplicate URL metadata is accepted', async () => {
  const fixture = fixtures.find(f => f.id === 'T13');
  assert.equal((await run(fixture.output)).resource.exact_url, EXACT_URL);
});
test('different URL in reference, value or text is rejected without override', async () => {
  for (const different of ['https://other.example/jobs', 'https://example.com/jobs', EXACT_URL.toLowerCase(), EXACT_URL + '&extra=1']) {
    for (const metadata of [
      { references: [{ label: 'page', source_ref: 'resource', exact_url: different }] },
      { explicit_constraints: [{ kind: 'exact_resource', source_ref: 'resource', text: EXACT_URL, value: different }] },
      { explicit_constraints: [{ kind: 'exact_resource', source_ref: 'resource', text: different }] },
    ]) {
      const output = minimal(); Object.assign(output.intent, metadata);
      await assert.rejects(run(output), /URL|resource/);
    }
  }
  assert.equal(urlCapture.context[0].url, EXACT_URL);
});
test('Capture URL bytes are never normalized or reserialized', async () => {
  const url = 'https://EXAMPLE.com/a%2fb?x=One+Two&y=%2F#ExactCase';
  const capture = createCapture({ kind: 'URL', raw_input: 'Track this resource.', context: [{ id: 'r', kind: 'page', text: '', url }] });
  const result = await run(minimal(), capture);
  assert.equal(result.resource.exact_url, url);
  assert.ok(Object.isFrozen(result.resource));
  assert.throws(() => { result.resource.exact_url = 'changed'; }, TypeError);
});
test('generic monitor-this-page contract validates without duplicate grounding', async () => {
  const capture = createCapture({ kind: 'URL', raw_input: 'Monitor this page.', context: urlCapture.context });
  const output = minimal();
  output.intent.explicit_constraints = [{ kind: 'exact_resource', text: 'Monitor this page.', source_ref: 'raw_input', value: EXACT_URL }];
  const result = await run(output, capture);
  assert.equal(result.decision.status, 'READY_TO_MONITOR');
  assert.equal(result.resource.exact_url, EXACT_URL);
  assert.deepEqual(result.intent.explicit_constraints, output.intent.explicit_constraints);
});
test('narrower jobs/Nice meaning stays model-owned with Capture-owned identity', async () => {
  const capture = fixtures.find(f => f.id === 'T14').capture;
  const output = minimal('Tell me when new jobs in Nice appear on this page.');
  const result = await run(output, capture);
  assert.equal(result.intent.canonical_text, output.intent.canonical_text);
  assert.equal(result.resource.exact_url, EXACT_URL);
  assert.deepEqual(result.intent.explicit_constraints, []);
});
test('FREE_TEXT containing a URL is not promoted to authoritative URL Capture', async () => {
  const capture = createCapture({ kind: 'FREE_TEXT', raw_input: 'Follow ' + EXACT_URL, context: urlCapture.context });
  const result = await run(minimal(), capture);
  assert.equal(Object.hasOwn(result, 'resource'), false);
  const output = minimal();
  output.intent.explicit_constraints = [{ kind: 'exact_resource', text: capture.raw_input, source_ref: 'raw_input', value: EXACT_URL }];
  await assert.rejects(run(output, capture), /Exact resource/);
});
test('normalization cannot mutate Capture resource and remains idempotent', () => {
  const authority = resourceFromCapture(urlCapture);
  const output = minimal(); output.intent.references = null; output.decision.clarification_question = null;
  const normalized = normalizeV3UnderstandingOutput(output);
  assert.deepEqual(normalizeV3UnderstandingOutput(normalized), normalized);
  assert.deepEqual(resourceFromCapture(urlCapture), authority);
  assert.equal(urlCapture.context[0].url, EXACT_URL);
});
test('invalid Capture URL syntax is rejected before any model call', async () => {
  const capture = createCapture({ kind: 'URL', raw_input: 'Follow this page.', context: [{ id: 'r', kind: 'page', text: '', url: 'not an absolute URL' }] });
  let calls = 0;
  await assert.rejects(understandCapture(capture, [], { model: async () => { calls++; return minimal(); } }), /valid absolute resource URL/);
  assert.equal(calls, 0);
});
test('omitted duplicate fields do not require inferred references or constraints', async () => {
  const fixture = fixtures.find(f => f.id === 'T13');
  for (const mutate of [out => { delete out.intent.references[0].exact_url; }, out => { out.intent.explicit_constraints = []; }]) {
    const output = structuredClone(fixture.output); mutate(output);
    assert.equal((await run(output)).resource.exact_url, EXACT_URL);
  }
});
test('a conflicting URL embedded in a source quote remains a conflict', async () => {
  const other = 'https://other.example/page';
  const capture = createCapture({ kind: 'URL', raw_input: 'Monitor ' + other, context: urlCapture.context });
  const output = minimal();
  output.intent.explicit_constraints = [{ kind: 'exact_resource', text: capture.raw_input, source_ref: 'raw_input' }];
  await assert.rejects(run(output, capture), /conflicts with Capture URL/);
});
