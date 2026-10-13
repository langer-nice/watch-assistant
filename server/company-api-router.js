import { createCompanyWatchMiddleware } from './company-watch-api.js';

const paths = new Map([
  ['/api/company-watches', '/api/company-watches'],
  ['/api/company-watch', '/api/company-watch'],
  ['/api/check-company-watch', '/api/check-company-watch'],
  ['/api/company/company-watches', '/api/company-watches'],
  ['/api/company/company-watch', '/api/company-watch'],
  ['/api/company/check-company-watch', '/api/check-company-watch'],
]);

// Accept the concrete public or rewritten destination path. Vercel's dynamic
// query parameter, request bodies and forwarding headers never select a route.
export const createCompanyApiRouter = (options = {}) => {
  const middleware = createCompanyWatchMiddleware(options);
  return async (request, response) => {
    let url;
    try { url = new URL(request.url || '/', 'http://localhost'); }
    catch { response.statusCode = 400; response.end('Invalid request URL'); return; }
    const path = paths.get(url.pathname);
    if (!path) { response.statusCode = 404; response.end('Not found'); return; }
    const originalUrl = request.url;
    // Preserve the native IncomingMessage, its body/stream, and the full query.
    request.url = path + url.search;
    try { return await middleware(request, response); }
    finally { request.url = originalUrl; }
  };
};
