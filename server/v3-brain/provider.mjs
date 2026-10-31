import { requestStructuredOutput } from '../request-clarification-api.js';

export function createBrainModel({ apiKey, model = 'gpt-5.6-luna', fetchImpl = fetch, onMeasurement = () => {} } = {}) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return async ({ instructions, input, response_schema }) => {
    const started = performance.now();
    const measure = { model, calls: 0, http_status: null, provider_status: null, usage: null };
    try {
      return await requestStructuredOutput({ apiKey, model, instructions, input: JSON.stringify(input),
        reasoning: { effort: 'low' }, max_output_tokens: 3000, maxOutputBytes: 60_000,
        signal: AbortSignal.timeout(30_000),
        text: { verbosity: 'low', format: { type: 'json_schema', name: 'v3_brain_judgment', strict: true, schema: response_schema } },
        fetchImpl: async (url, options) => {
          measure.calls++;
          const response = await fetchImpl(url, options); measure.http_status = response.status;
          if (response.ok) {
            const body = await response.clone().json(); measure.provider_status = body.status ?? null; measure.usage = body.usage ?? null;
            if (body.status !== 'completed') throw new Error('Provider response is not completed');
          }
          return response;
        },
      });
    } finally { onMeasurement({ ...measure, latency_ms: Math.round(performance.now() - started) }); }
  };
}
