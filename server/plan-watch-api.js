import { createPlannerDecision, planWatch } from './watch-planner.js';

const ENDPOINT = '/api/plan-watch';
const MAX_BODY_BYTES = 4_096;

const readJsonBody = async (request) => {
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
    return request.body;
  }
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  }
  const parsed = JSON.parse(body || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_BODY');
  return parsed;
};

const sendJson = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
};

export const createPlanWatchMiddleware = (options = {}) => (
  async (request, response, next) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname !== ENDPOINT) {
      next?.();
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendJson(response, 405, createPlannerDecision({
        clarificationQuestion: 'Send a POST request describing what to monitor.',
      }));
      return;
    }
    try {
      const body = await readJsonBody(request);
      const companyOnly = new URL(request.url || '/', 'http://localhost')
        .searchParams.get('scope') === 'official_company';
      sendJson(response, 200, await planWatch(body.request, { ...options, companyOnly }));
    } catch {
      sendJson(response, 400, createPlannerDecision({
        clarificationQuestion: 'Provide a valid JSON request describing what to monitor.',
      }));
    }
  }
);
