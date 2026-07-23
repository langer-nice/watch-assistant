import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRequestClarificationMiddleware,
  generateRequestClarification,
} from '../server/request-clarification-api.js';

const createResponse = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('reports missing server-side configuration without exposing a key', async () => {
  const originalError = console.error;
  console.error = () => {};
  const response = createResponse();
  const middleware = createRequestClarificationMiddleware();

  try {
    await middleware({
      method: 'POST',
      url: '/api/request-clarification',
      body: { request: 'When Metallica tickets go on sale', language: 'en' },
    }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: 'Clarification service is not configured' });
});

test('requests a strict clarification response from the configured model', async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          output_text: JSON.stringify({
            needsClarification: true,
            suggestedRequest: 'Notify me when official tickets for Metallica concerts go on sale.',
          }),
        };
      },
    };
  };
  const result = await generateRequestClarification({
    request: 'When Metallica tickets go on sale',
    language: 'en',
    apiKey: 'test-key',
    model: 'gpt-5.6-luna',
    fetchImpl,
  });

  assert.equal(requestBody.model, 'gpt-5.6-luna');
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(requestBody.text.format.strict, true);
  assert.deepEqual(result, {
    needsClarification: true,
    suggestedRequest: 'Notify me when official tickets for Metallica concerts go on sale.',
  });
});
