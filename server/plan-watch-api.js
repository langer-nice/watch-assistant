import { structuredCreationEnabled, requireStructuredCreationAccess } from './structured-creation-access.js';
import { authenticateSupabaseRequest } from './supabase-user.js';
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
    const mode = new URL(request.url || '/', 'http://localhost').searchParams.get('mode');
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      if (mode !== null) {
        sendJson(response, 405, { mode: 'interpretation.v1', executable: false, code: 'METHOD_NOT_ALLOWED' });
        return;
      }
      sendJson(response, 405, createPlannerDecision({
        clarificationQuestion: 'Send a POST request describing what to monitor.',
      }));
      return;
    }
    try {
      const body = await readJsonBody(request);
      if (mode !== null) {
        if (mode !== 'interpretation.v1') throw Object.assign(new Error('Invalid interpretation mode.'), { code: 'INVALID_INTERPRETATION_REQUEST', statusCode: 400 });
        const env = options.env || process.env;
        if (!structuredCreationEnabled(env)) throw Object.assign(new Error('Unavailable'),{code:'STRUCTURED_FEATURE_UNAVAILABLE',statusCode:404});
        const { user } = await (options.authenticate || authenticateSupabaseRequest)(request,{...options,env});
        requireStructuredCreationAccess(user,env);
        sendJson(response, 200, await planWatch(body.request, { ...options, mode, language: body.language ?? 'und' }));
        return;
      }
      const scope = new URL(request.url || '/', 'http://localhost').searchParams.get('scope');
      const companyOnly = ['official_company', 'migrated_routes'].includes(scope);
      const includeMediaStory = scope !== 'official_company';
      sendJson(response, 200, await planWatch(body.request, {
        ...options,
        companyOnly,
        includeMediaStory,
      }));
    } catch (error) {
      if (mode !== null) {
        const codes = new Set(['STRUCTURED_FEATURE_UNAVAILABLE','AUTH_REQUIRED','INVALID_SESSION','AUTH_UNAVAILABLE','INVALID_INTERPRETATION_REQUEST', 'INTERPRETATION_FAILED', 'AI_SERVICE_UNAVAILABLE', 'AI_TIMEOUT']);
        const code = codes.has(error.code) ? error.code : 'INVALID_INTERPRETATION_REQUEST';
        const reasons = new Set(['DOMAIN_PREDICATE_CONFLICT', 'CONDITION_EVIDENCE_MISMATCH', 'OFFICIAL_SOURCE_UNGROUNDED']);
        sendJson(response, codes.has(error.code) ? error.statusCode : 400, { mode: 'interpretation.v1', executable: false, code,
          ...(code === 'INTERPRETATION_FAILED' && reasons.has(error.reason) ? { reason: error.reason } : {}),
        });
        return;
      }
      sendJson(response, 400, createPlannerDecision({
        clarificationQuestion: 'Provide a valid JSON request describing what to monitor.',
      }));
    }
  }
);
