import { createUrlWatchMiddleware } from '../server/url-watch-api.js';

const handleUrlWatchRequest = createUrlWatchMiddleware({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
});

export default function handler(request, response) {
  return handleUrlWatchRequest(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
}
