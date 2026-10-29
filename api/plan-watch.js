import { createPlanWatchMiddleware } from '../server/plan-watch-api.js';

export function createPlanWatchHandler(options={}){
const middleware = createPlanWatchMiddleware({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  ...options,
});

return function handler(request, response) {
  return middleware(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
};
}
export default createPlanWatchHandler();

