import { createWatchTranslationMiddleware } from '../server/watch-translation-api.js';

const handler = createWatchTranslationMiddleware({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
});

export default function watchTranslation(request, response) {
  return handler(request, response);
}
