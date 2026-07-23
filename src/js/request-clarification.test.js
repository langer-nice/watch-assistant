import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalClarification,
  validateClarification,
} from './request-clarification.js';

test('offers the requested Metallica clarification without applying it', () => {
  assert.deepEqual(createLocalClarification('When Metallica tickets go on sale'), {
    needsClarification: true,
    suggestedRequest: 'Notify me when official tickets for Metallica concerts go on sale.',
  });
});

test('keeps the acceptance example deterministic when the AI wording varies', () => {
  assert.deepEqual(validateClarification({
    needsClarification: false,
    suggestedRequest: 'When Metallica tickets go on sale',
  }, 'When Metallica tickets go on sale'), {
    needsClarification: true,
    suggestedRequest: 'Notify me when official tickets for Metallica concerts go on sale.',
  });
});

test('leaves an already clear monitoring instruction unchanged', () => {
  const request = 'Notify me when Apple publishes its 2026 annual results.';
  assert.deepEqual(createLocalClarification(request), {
    needsClarification: false,
    suggestedRequest: request,
  });
});

test('rejects empty and unchanged suggestions', () => {
  const original = 'Notify me when the price falls below €500.';
  assert.deepEqual(validateClarification({
    needsClarification: true,
    suggestedRequest: original,
  }, original), {
    needsClarification: false,
    suggestedRequest: original,
  });
});

test('fragment fallback preserves explicit constraints', () => {
  assert.deepEqual(createLocalClarification('When flights to Paris cost less than €200'), {
    needsClarification: true,
    suggestedRequest: 'Notify me when flights to Paris cost less than €200.',
  });
});
