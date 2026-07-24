import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLARIFICATION_ACTIONS,
  CLARIFICATION_TYPES,
  clarifyWatchRequest,
  createLocalClarification,
  getClarificationActions,
  validateClarification,
} from './request-clarification.js';

test('offers the requested Metallica clarification without applying it', () => {
  assert.deepEqual(createLocalClarification('When Metallica tickets go on sale'), {
    type: CLARIFICATION_TYPES.SUGGESTION,
    needsClarification: true,
    hasSuggestion: true,
    suggestedRequest: 'Notify me when official tickets for Metallica concerts go on sale.',
    clarificationMessage: '',
    originalRequest: 'When Metallica tickets go on sale',
  });
});

test('keeps the acceptance example deterministic when the AI wording varies', () => {
  assert.equal(
    validateClarification({
      type: CLARIFICATION_TYPES.CLEAR,
      suggestedRequest: 'When Metallica tickets go on sale',
    }, 'When Metallica tickets go on sale').suggestedRequest,
    'Notify me when official tickets for Metallica concerts go on sale.',
  );
});

test('classifies sdfqs as clarification required without a false suggestion', () => {
  const result = createLocalClarification('sdfqs');
  assert.equal(result.type, CLARIFICATION_TYPES.CLARIFICATION_REQUIRED);
  assert.equal(result.hasSuggestion, false);
  assert.equal(result.suggestedRequest, '');
  assert.equal(
    result.clarificationMessage,
    'I’m not sure what “sdfqs” refers to. Add more detail, or create the Watch exactly as written.',
  );
  assert.deepEqual(getClarificationActions(result), [
    CLARIFICATION_ACTIONS.EDIT_REQUEST,
    CLARIFICATION_ACTIONS.CREATE_AS_WRITTEN,
  ]);
});

test('classifies Test as generic clarification required', () => {
  const result = createLocalClarification('Test');
  assert.equal(result.type, CLARIFICATION_TYPES.CLARIFICATION_REQUIRED);
  assert.equal(result.hasSuggestion, false);
  assert.equal(
    result.clarificationMessage,
    'This request may be too broad to monitor reliably. Add more detail, or create the Watch exactly as written.',
  );
  assert.deepEqual(getClarificationActions(result), [
    CLARIFICATION_ACTIONS.EDIT_REQUEST,
    CLARIFICATION_ACTIONS.CREATE_AS_WRITTEN,
  ]);
});

test('preserves unknown acronyms and offers edit or explicit creation without a suggestion', () => {
  for (const request of ['qsdgq', 'QSF', 'FAQ']) {
    const result = createLocalClarification(request);
    assert.equal(result.type, CLARIFICATION_TYPES.CLARIFICATION_REQUIRED);
    assert.equal(result.hasSuggestion, false);
    assert.equal(result.suggestedRequest, '');
    assert.match(result.clarificationMessage, new RegExp(`“${request}”`));
    assert.deepEqual(getClarificationActions(result), [
      CLARIFICATION_ACTIONS.EDIT_REQUEST,
      CLARIFICATION_ACTIONS.CREATE_AS_WRITTEN,
    ]);
  }
});

test('renders all three actions only for a non-empty usable suggestion', () => {
  const result = createLocalClarification('When Metallica tickets go on sale');
  assert.deepEqual(getClarificationActions(result), [
    CLARIFICATION_ACTIONS.KEEP_ORIGINAL,
    CLARIFICATION_ACTIONS.USE_SUGGESTION,
    CLARIFICATION_ACTIONS.EDIT_REQUEST,
  ]);
  assert.deepEqual(getClarificationActions({
    type: CLARIFICATION_TYPES.SUGGESTION,
    hasSuggestion: true,
    suggestedRequest: '',
    clarificationMessage: 'Add more detail.',
  }), []);
});

test('rejects an AI request for details as a usable suggestion', () => {
  const result = validateClarification({
    needsClarification: true,
    suggestedRequest: 'Please clarify what “Xxc” refers to and what you want monitored.',
  }, 'Xxc');
  assert.equal(result.type, CLARIFICATION_TYPES.CLARIFICATION_REQUIRED);
  assert.equal(result.hasSuggestion, false);
});

test('returns a complete monitorable suggestion for an improvable request', () => {
  assert.deepEqual(
    createLocalClarification('Cheap EasyJet flights at Christmas').suggestedRequest,
    'Notify me when cheap easyJet flights for Christmas become available.',
  );
});

test('leaves an already clear monitoring instruction unchanged', () => {
  const request = 'Notify me when Apple publishes its 2026 annual results.';
  const result = createLocalClarification(request);
  assert.equal(result.type, CLARIFICATION_TYPES.CLEAR);
  assert.equal(result.suggestedRequest, request);
});

test('rejects empty and unchanged suggestions', () => {
  const original = 'Notify me when the price falls below €500.';
  const result = validateClarification({
    type: CLARIFICATION_TYPES.SUGGESTION,
    suggestedRequest: original,
  }, original);
  assert.equal(result.type, CLARIFICATION_TYPES.CLEAR);
});

test('fragment fallback preserves explicit constraints', () => {
  assert.equal(
    createLocalClarification('When flights to Paris cost less than €200').suggestedRequest,
    'Notify me when flights to Paris cost less than €200.',
  );
});

test('keeps Test in clarification-required state even if the service calls it clear', async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    watchAssistantClarifyRequest: async () => ({
      resultType: CLARIFICATION_TYPES.CLEAR,
      suggestedRequest: 'Test',
      clarificationMessage: '',
    }),
  };
  try {
    const result = await clarifyWatchRequest('Test');
    assert.equal(result.type, CLARIFICATION_TYPES.CLARIFICATION_REQUIRED);
    assert.equal(result.hasSuggestion, false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
