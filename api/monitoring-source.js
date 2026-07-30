import { createMonitoringSourceMiddleware } from '../server/monitoring-source-api.js';

const middleware = createMonitoringSourceMiddleware();

export default function handler(request, response) {
  return middleware(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
}
