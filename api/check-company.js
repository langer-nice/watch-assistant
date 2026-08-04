import { createCheckCompanyMiddleware } from '../server/bodacc-api.js';

const handleCheckCompany = createCheckCompanyMiddleware();

export default function handler(request, response) {
  return handleCheckCompany(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
}
