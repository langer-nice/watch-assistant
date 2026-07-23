const MAX_REQUEST_LENGTH = 500;

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const extractOutputText = (result) => {
  if (typeof result?.output_text === 'string') return result.output_text;
  return result?.output
    ?.flatMap((item) => item.content || [])
    ?.find((item) => item.type === 'output_text')
    ?.text;
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const watchRequest = String(request.body?.request || '').trim();
  const language = request.body?.language === 'fr' ? 'French' : 'English';
  if (!watchRequest || watchRequest.length > MAX_REQUEST_LENGTH) {
    sendJson(response, 400, { error: 'Invalid watch request' });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 503, { error: 'Clarification service is not configured' });
    return;
  }

  try {
    const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6',
        store: false,
        instructions: [
          'Evaluate a request for an automated monitoring watch.',
          'If it is already clear and actionable, set needsClarification to false and return it unchanged.',
          'Otherwise suggest one concise, readable monitoring instruction in the requested language.',
          'Clarify wording only. Preserve the user intent, named entities, and every explicit constraint.',
          'Never invent dates, locations, channels, thresholds, preferences, or other details.',
          'Do not broaden or narrow the requested event. The user will make the final choice.',
        ].join(' '),
        input: `Language: ${language}\nOriginal request: ${watchRequest}`,
        text: {
          format: {
            type: 'json_schema',
            name: 'watch_request_clarification',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                needsClarification: { type: 'boolean' },
                suggestedRequest: { type: 'string' },
              },
              required: ['needsClarification', 'suggestedRequest'],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!openAIResponse.ok) throw new Error(`OpenAI request failed: ${openAIResponse.status}`);
    const outputText = extractOutputText(await openAIResponse.json());
    const result = JSON.parse(outputText || '');
    sendJson(response, 200, result);
  } catch (error) {
    console.error('Watch request clarification failed', error);
    sendJson(response, 502, { error: 'Could not clarify request' });
  }
}
