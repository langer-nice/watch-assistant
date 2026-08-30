import { createCompanyWatchMiddleware } from '../server/company-watch-api.js';

const handle = createCompanyWatchMiddleware();
export default (request, response) => handle(request, response);
