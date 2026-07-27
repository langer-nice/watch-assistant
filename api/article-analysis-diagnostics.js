import { createArticleAnalysisDiagnosticsMiddleware } from '../server/article-analysis-diagnostics.js';

const middleware = createArticleAnalysisDiagnosticsMiddleware({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  environment: process.env,
});

export default function handler(request, response) {
  return middleware(request, response, () => { response.statusCode = 404; response.end('Not found'); });
}
