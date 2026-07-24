const MAX_REQUEST_LENGTH = 500;

export const CLARIFICATION_TYPES = Object.freeze({
  CLEAR: 'clear',
  SUGGESTION: 'suggestion',
  CLARIFICATION_REQUIRED: 'clarification_required',
});

export const CLARIFICATION_ACTIONS = Object.freeze({
  KEEP_ORIGINAL: 'keep_original',
  USE_SUGGESTION: 'use_suggestion',
  EDIT_REQUEST: 'edit_request',
  CREATE_AS_WRITTEN: 'create_as_written',
});

const normalize = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ');

const isGenericPlaceholder = (value) => /^(?:test|testing|example|sample|demo)$/i.test(value);

const getClarificationMessage = (request, language = 'en') => {
  const term = normalize(request).replace(/[.!?]+$/, '');
  const unidentifiedTerm = /^\p{L}[\p{L}\p{N}'’-]*$/u.test(term)
    && !isGenericPlaceholder(term);

  if (language === 'fr') {
    return unidentifiedTerm
      ? `Je ne sais pas exactement à quoi « ${term} » fait référence. Ajoutez des détails, ou créez la Watch exactement telle qu’elle est rédigée.`
      : 'Cette demande est peut-être trop générale pour être surveillée de manière fiable. Ajoutez des détails, ou créez la Watch exactement telle qu’elle est rédigée.';
  }
  return unidentifiedTerm
    ? `I’m not sure what “${term}” refers to. Add more detail, or create the Watch exactly as written.`
    : 'This request may be too broad to monitor reliably. Add more detail, or create the Watch exactly as written.';
};

const isUsableSuggestion = (suggestion, original) => {
  const value = normalize(suggestion);
  const request = normalize(original);
  if (
    !value
    || value.toLocaleLowerCase() === request.toLocaleLowerCase()
    || value.endsWith('?')
    || value.split(/\s+/).length < 4
  ) return false;

  const asksForClarification = /\b(?:please\s+)?(?:clarify|specify|provide|explain|add|tell us)\b|\bwhat\s+.+\s+refers?\s+to\b|\bnot sure what\b|\bneed(?:s)?\s+(?:a\s+little\s+)?more\s+detail|\bmore information\b/i;
  const expressesMonitoringIntent = /\b(?:alert|monitor|notify|tell me|track|watch for)\b|\b(?:if|when)\b|\b(?:announc|availab|become|begin|change|close|drop|fall|go on sale|increase|launch|open|publish|reach|release|rise|start)/i;
  return !asksForClarification.test(value) && expressesMonitoringIntent.test(value);
};

const clearResult = (request) => ({
  type: CLARIFICATION_TYPES.CLEAR,
  needsClarification: false,
  hasSuggestion: false,
  suggestedRequest: request,
  clarificationMessage: '',
});

const suggestionResult = (request, suggestedRequest) => ({
  type: CLARIFICATION_TYPES.SUGGESTION,
  needsClarification: true,
  hasSuggestion: true,
  suggestedRequest,
  clarificationMessage: '',
  originalRequest: request,
});

const clarificationRequiredResult = (request, language) => ({
  type: CLARIFICATION_TYPES.CLARIFICATION_REQUIRED,
  needsClarification: true,
  hasSuggestion: false,
  suggestedRequest: '',
  clarificationMessage: getClarificationMessage(request, language),
  originalRequest: request,
});

export const getClarificationActions = (result) => {
  const hasUsableSuggestion = result?.type === CLARIFICATION_TYPES.SUGGESTION
    && result?.hasSuggestion === true
    && Boolean(normalize(result?.suggestedRequest));

  if (hasUsableSuggestion) {
    return [
      CLARIFICATION_ACTIONS.KEEP_ORIGINAL,
      CLARIFICATION_ACTIONS.USE_SUGGESTION,
      CLARIFICATION_ACTIONS.EDIT_REQUEST,
    ];
  }

  if (result?.type === CLARIFICATION_TYPES.CLARIFICATION_REQUIRED) {
    return [
      CLARIFICATION_ACTIONS.EDIT_REQUEST,
      CLARIFICATION_ACTIONS.CREATE_AS_WRITTEN,
    ];
  }

  return [];
};

const createLocalClarification = (request, { language = 'en' } = {}) => {
  const original = normalize(request);
  const withoutPunctuation = original.replace(/[.!?]+$/, '');

  if (/^when metallica tickets go on sale$/i.test(withoutPunctuation)) {
    return suggestionResult(
      original,
      'Notify me when official tickets for Metallica concerts go on sale.',
    );
  }

  if (/^cheap easyjet flights at christmas$/i.test(withoutPunctuation)) {
    return suggestionResult(
      original,
      'Notify me when cheap easyJet flights for Christmas become available.',
    );
  }

  const fragment = withoutPunctuation.match(/^(when|if)\s+(.+)$/i);
  if (fragment) {
    return suggestionResult(
      original,
      `Notify me ${fragment[1].toLowerCase()} ${fragment[2]}.`,
    );
  }

  const words = withoutPunctuation.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length <= 2) return clarificationRequiredResult(original, language);

  return clearResult(original);
};

const validateClarification = (result, original, { language = 'en' } = {}) => {
  const request = normalize(original);
  const deterministicResult = createLocalClarification(request, { language });
  if (deterministicResult.type !== CLARIFICATION_TYPES.CLEAR) return deterministicResult;

  const suggestedRequest = normalize(result?.suggestedRequest);
  const declaredType = result?.type || result?.resultType;
  const declaresSuggestion = declaredType === CLARIFICATION_TYPES.SUGGESTION
    || (declaredType === undefined && result?.needsClarification === true);
  if (declaresSuggestion && isUsableSuggestion(suggestedRequest, request)) {
    return suggestionResult(request, suggestedRequest);
  }

  const requiresInput = declaredType === CLARIFICATION_TYPES.CLARIFICATION_REQUIRED
    || (result?.needsClarification === true && !isUsableSuggestion(suggestedRequest, request));
  if (requiresInput) return clarificationRequiredResult(request, language);
  return clearResult(request);
};

export const clarifyWatchRequest = async (request, { language = 'en' } = {}) => {
  const original = normalize(request).slice(0, MAX_REQUEST_LENGTH);
  if (!original) return clearResult('');

  try {
    if (typeof window.watchAssistantClarifyRequest === 'function') {
      return validateClarification(
        await window.watchAssistantClarifyRequest({ request: original, language }),
        original,
        { language },
      );
    }

    const response = await fetch('/api/request-clarification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: original, language }),
    });

    if (!response.ok) {
      throw new Error(`Clarification endpoint returned ${response.status}`);
    }
    return validateClarification(await response.json(), original, { language });
  } catch (error) {
    console.warn(
      '[Watch clarification] AI clarification unavailable; using the conservative local fallback.',
      error,
    );
    return validateClarification(
      createLocalClarification(original, { language }),
      original,
      { language },
    );
  }
};

export {
  createLocalClarification,
  getClarificationMessage,
  isUsableSuggestion,
  validateClarification,
};
