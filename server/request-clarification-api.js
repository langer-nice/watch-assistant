const ENDPOINT = '/api/request-clarification';
const MAX_BODY_BYTES = 4_096;
const MAX_REQUEST_LENGTH = 500;

const extractOutputText = (result) => {
  if (typeof result?.output_text === 'string') return result.output_text;
  return result?.output
    ?.flatMap((item) => item.content || [])
    ?.find((item) => item.type === 'output_text')
    ?.text;
};

const readJsonBody = async (request) => {
  if (request.body && typeof request.body === 'object') return request.body;
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
};

const sendJson = (response, statusCode, body) => {
  if (typeof response.status === 'function' && typeof response.json === 'function') {
    response.status(statusCode).json(body);
    return;
  }
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

export const generateRequestClarification = async ({
  request,
  language = 'en',
  apiKey,
  model = 'gpt-5.6-luna',
  fetchImpl = fetch,
}) => {
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: [
        'Evaluate a request for an automated monitoring Watch.',
        'Return resultType "clear" when it is already clear and actionable; return the original wording in suggestedRequest and leave clarificationMessage empty.',
        'Return resultType "suggestion" only when you can provide one complete, precise monitoring instruction that can be used directly as a Watch; leave clarificationMessage empty.',
        'A suggestion must state what to monitor and the expected change or event. It must never be a question or an instruction asking the user to clarify, specify, explain, or add details.',
        'Return resultType "clarification_required" when the request is too ambiguous or incoherent to produce a reliable Watch.',
        'For clarification_required, leave suggestedRequest empty and provide a brief clarificationMessage that asks for the missing person, organisation, place or event and the change that matters.',
        'Clarify wording only. Preserve the user intent, named entities, and every explicit constraint.',
        'Never invent dates, locations, venues, tours, channels, thresholds, preferences, or other details.',
        'Do not broaden or narrow the requested event. The user will make the final choice.',
      ].join(' '),
      input: `Language: ${language === 'fr' ? 'French' : 'English'}\nOriginal request: ${request}`,
      reasoning: { effort: 'low' },
      max_output_tokens: 250,
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'watch_request_clarification',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              resultType: {
                type: 'string',
                enum: ['clear', 'suggestion', 'clarification_required'],
              },
              suggestedRequest: { type: 'string' },
              clarificationMessage: { type: 'string' },
            },
            required: ['resultType', 'suggestedRequest', 'clarificationMessage'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const error = new Error(`OpenAI request failed with status ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }
  const result = JSON.parse(extractOutputText(await response.json()) || '');
  const validTypes = new Set(['clear', 'suggestion', 'clarification_required']);
  if (
    !validTypes.has(result.resultType)
    || typeof result.suggestedRequest !== 'string'
    || typeof result.clarificationMessage !== 'string'
    || (result.resultType === 'suggestion' && !result.suggestedRequest.trim())
    || (result.resultType === 'clarification_required' && !result.clarificationMessage.trim())
    || (result.resultType === 'clarification_required' && result.suggestedRequest.trim())
  ) {
    const error = new Error('The AI returned an invalid clarification.');
    error.statusCode = 502;
    throw error;
  }
  return {
    resultType: result.resultType,
    suggestedRequest: result.suggestedRequest.trim(),
    clarificationMessage: result.clarificationMessage.trim(),
  };
};

export const createRequestClarificationMiddleware = ({ apiKey, model } = {}) => (
  async (request, response, next) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname !== ENDPOINT) {
      next?.();
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const watchRequest = String(body.request || '').trim();
      if (!watchRequest || watchRequest.length > MAX_REQUEST_LENGTH) {
        sendJson(response, 400, { error: 'Invalid watch request' });
        return;
      }
      const clarification = await generateRequestClarification({
        request: watchRequest,
        language: body.language,
        apiKey,
        model,
      });
      sendJson(response, 200, clarification);
    } catch (error) {
      console.error('[Watch clarification] Request failed:', error.message);
      sendJson(response, error.statusCode || 502, {
        error: error.statusCode === 503
          ? 'Clarification service is not configured'
          : 'Could not clarify request',
      });
    }
  }
);
