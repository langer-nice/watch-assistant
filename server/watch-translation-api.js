const ENDPOINT = '/api/watch-translation';

const sendJson = (response, status, value) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
};

export const translateWatchCopy = async ({ title, summary, language, apiKey, model, fetchImpl = fetch }) => {
  if (!apiKey) throw new Error('Translation service is not configured');
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 350,
      instructions: `Translate the Watch title and monitoring summary into ${language === 'fr' ? 'French' : 'English'}. Preserve proper names, locations, routes, dates, thresholds, and every material condition exactly. Do not invent facts or correct the user's intent. If a field is already in the target language, keep it. Return only the two fields in the requested JSON schema.`,
      input: JSON.stringify({ title, summary }),
      text: { format: {
        type: 'json_schema', name: 'watch_translation', strict: true,
        schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' } }, required: ['title', 'summary'], additionalProperties: false },
      } },
    }),
  });
  if (!response.ok) throw new Error(`Translation failed: ${response.status}`);
  const result = await response.json();
  const output = result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
  const copy = JSON.parse(output || '');
  if (!copy.title?.trim() || typeof copy.summary !== 'string') throw new Error('Invalid translation');
  return { title: copy.title.trim(), summary: copy.summary.trim() };
};

export const createWatchTranslationMiddleware = ({ apiKey, model = 'gpt-5.6-luna' } = {}) => async (request, response, next) => {
  if (new URL(request.url || '/', 'http://localhost').pathname !== ENDPOINT) return next?.();
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Method not allowed' });
  }
  try {
    let body = request.body && typeof request.body === 'object' ? request.body : null;
    if (!body) {
      let raw = '';
      for await (const chunk of request) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 4096) return sendJson(response, 413, { error: 'Request too large' });
      }
      body = JSON.parse(raw || '{}');
    }
    const { title, summary = '', language } = body;
    if (typeof title !== 'string' || !title.trim() || title.length > 500 || typeof summary !== 'string' || summary.length > 1000 || !['en', 'fr'].includes(language)) {
      return sendJson(response, 400, { error: 'Invalid Watch copy' });
    }
    const translated = await translateWatchCopy({ title, summary, language, apiKey, model });
    return sendJson(response, 200, translated);
  } catch (error) {
    console.error('[Watch translation]', error.message);
    return sendJson(response, 502, { error: 'Could not translate Watch copy' });
  }
};
