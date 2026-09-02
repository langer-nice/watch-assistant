import { createCompanyMonitoringCronHandler } from '../../server/company-monitoring-cron.js';

const handle = createCompanyMonitoringCronHandler();
export default (request, response) => handle(request, response);
