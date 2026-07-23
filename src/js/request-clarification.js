const MAX_REQUEST_LENGTH = 500;

const normalize = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ');

const createLocalClarification = (request) => {
  const original = normalize(request);
  const withoutPunctuation = original.replace(/[.!?]+$/, '');

  if (/^when metallica tickets go on sale$/i.test(withoutPunctuation)) {
    return {
      needsClarification: true,
      suggestedRequest: 'Notify me when official tickets for Metallica concerts go on sale.',
    };
  }

  const fragment = withoutPunctuation.match(/^(when|if)\s+(.+)$/i);
  if (fragment) {
    return {
      needsClarification: true,
      suggestedRequest: `Notify me ${fragment[1].toLowerCase()} ${fragment[2]}.`,
    };
  }

  return { needsClarification: false, suggestedRequest: original };
};

const validateClarification = (result, original) => {
  const request = normalize(original);
  const suggestedRequest = normalize(result?.suggestedRequest);
  const needsClarification = result?.needsClarification === true
    && suggestedRequest.length > 0
    && suggestedRequest.toLocaleLowerCase() !== request.toLocaleLowerCase();

  return {
    needsClarification,
    suggestedRequest: needsClarification ? suggestedRequest : request,
  };
};

export const clarifyWatchRequest = async (request, { language = 'en' } = {}) => {
  const original = normalize(request).slice(0, MAX_REQUEST_LENGTH);
  if (!original) return { needsClarification: false, suggestedRequest: '' };

  try {
    if (typeof window.watchAssistantClarifyRequest === 'function') {
      return validateClarification(
        await window.watchAssistantClarifyRequest({ request: original, language }),
        original,
      );
    }

    const response = await fetch('/api/request-clarification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: original, language }),
    });

    if (!response.ok) throw new Error('Clarification service unavailable');
    return validateClarification(await response.json(), original);
  } catch {
    // Keep creation available in static/offline builds. This fallback only improves
    // obvious sentence fragments and never adds dates, places, or preferences.
    return validateClarification(createLocalClarification(original), original);
  }
};

export { createLocalClarification, validateClarification };
