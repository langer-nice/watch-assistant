import { createRequestClarificationMiddleware } from '../server/request-clarification-api.js';

const handleRequestClarification = createRequestClarificationMiddleware({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
});

export default function handler(request, response) {
  return handleRequestClarification(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
}
