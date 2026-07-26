import { createCheckWatchMiddleware } from '../server/check-watch-api.js';

const handleCheckWatch = createCheckWatchMiddleware();

export default function handler(request, response) {
  return handleCheckWatch(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
}
