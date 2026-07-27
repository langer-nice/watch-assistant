import { createArticleAnalysisDiagnosticsMiddleware } from '../server/article-analysis-diagnostics.js';

const middleware = createArticleAnalysisDiagnosticsMiddleware({ environment: process.env });

export default function handler(request, response) {
  return middleware(request, response, () => { response.statusCode = 404; response.end('Not found'); });
}
