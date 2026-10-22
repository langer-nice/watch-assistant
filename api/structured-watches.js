import { createStructuredWatchMiddleware } from '../server/structured-watch-api.js';
const middleware = createStructuredWatchMiddleware({ creationOnly:true });
export default function handler(request,response) {
  return middleware(request,response,()=>{ response.statusCode=404;response.end('Not found'); });
}
