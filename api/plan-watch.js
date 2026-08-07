import { createPlanWatchMiddleware } from '../server/plan-watch-api.js';

const middleware = createPlanWatchMiddleware();

export default function handler(request, response) {
  return middleware(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
}

