import { createCleanCreateTrace } from './clean-create-trace.js';
import { safeValidationDiagnostic } from '../src/js/watch-interpretation.js';
import { structuredCreationEnabled, requireStructuredCreationAccess } from './structured-creation-access.js';
import { safeInterpretationFailureCategory } from './watch-interpreter.js';
import { authenticateSupabaseRequest } from './supabase-user.js';
import { createPlannerDecision, planWatch } from './watch-planner.js';
import { createCoreReviewEnabled } from './create-contract-capability.js';
import { CREATE_AB_MODE,createABEntryEnabled } from './create-role-access.js';

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
    const cleanMode=mode==='create-core.v1'||mode===CREATE_AB_MODE;
    const cleanTrace=cleanMode?createCleanCreateTrace(options.logger||console,mode):undefined;
    cleanTrace?.start('request');
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      if (mode !== null) {
        cleanTrace?.finish(405,'METHOD_NOT_ALLOWED');
        sendJson(response, 405, { mode: cleanMode ? mode : 'interpretation.v1', executable: false, code: 'METHOD_NOT_ALLOWED' });
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
        if (!['interpretation.v1','create-core.v1',CREATE_AB_MODE].includes(mode)) throw Object.assign(new Error('Invalid interpretation mode.'), { code: 'INVALID_INTERPRETATION_REQUEST', statusCode: 400 });
        const env = options.env || process.env;
        if (mode === 'create-core.v1' && !createCoreReviewEnabled(env)) throw Object.assign(new Error('Unavailable'),{code:'STRUCTURED_FEATURE_UNAVAILABLE',statusCode:404});
        if (mode === CREATE_AB_MODE && !createABEntryEnabled(env)) throw Object.assign(new Error('Unavailable'),{code:'STRUCTURED_FEATURE_UNAVAILABLE',statusCode:404});
        if (!structuredCreationEnabled(env)) throw Object.assign(new Error('Unavailable'),{code:'STRUCTURED_FEATURE_UNAVAILABLE',statusCode:404});
        const { user } = await (options.authenticate || authenticateSupabaseRequest)(request,{...options,env});
        requireStructuredCreationAccess(user,env);
        if (cleanMode && (body.operation !== 'create'
          || typeof body.request !== 'string' || !body.request.trim() || body.request.length>500
          || !['en','fr','mixed','und'].includes(body.language??'und')
          || Object.keys(body).some(key=>!['request','language','operation'].includes(key)))) throw Object.assign(new Error('New Create only'),{code:'INVALID_INTERPRETATION_REQUEST',statusCode:400});
        cleanTrace?.pass('request');
        sendJson(response, 200, await planWatch(body.request, { ...options,...(mode===CREATE_AB_MODE?{env}:{}),mode, language: body.language ?? 'und',cleanTrace }));
        cleanTrace?.finish(200);
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
        if (cleanMode) {
          const allowed=new Set(['STRUCTURED_FEATURE_UNAVAILABLE','AUTH_REQUIRED','INVALID_SESSION','AUTH_UNAVAILABLE',
            'INVALID_INTERPRETATION_REQUEST','INTERPRETATION_FAILED','AI_SERVICE_UNAVAILABLE','AI_TIMEOUT',
            'INVALID_CREATE_CONTRACT','CREATE_CLARIFICATION_REQUIRED']);
          const code=allowed.has(error.code)?error.code:'INVALID_CREATE_CONTRACT';
          cleanTrace?.finish(allowed.has(error.code)?error.statusCode||422:422,code);
          sendJson(response,allowed.has(error.code)?error.statusCode||422:422,{mode,executable:false,code});
          return;
        }
        const codes = new Set(['STRUCTURED_FEATURE_UNAVAILABLE','AUTH_REQUIRED','INVALID_SESSION','AUTH_UNAVAILABLE','INVALID_INTERPRETATION_REQUEST', 'INTERPRETATION_FAILED', 'AI_SERVICE_UNAVAILABLE', 'AI_TIMEOUT']);
        const code = codes.has(error.code) ? error.code : 'INVALID_INTERPRETATION_REQUEST';
        const reasons = new Set(['DOMAIN_PREDICATE_CONFLICT', 'CONDITION_EVIDENCE_MISMATCH', 'OFFICIAL_SOURCE_UNGROUNDED']);
        const env = options.env || process.env;
        // Temporary diagnostic in enabled Preview/Production only. Never log prompts, provider bodies,
        // credentials, arbitrary exception text or user/account identifiers.
        const diagnostic = ['preview', 'production'].includes(env.VERCEL_ENV) && structuredCreationEnabled(env)
          ? {failureCategory:safeInterpretationFailureCategory(error)} : {};
        if (diagnostic.failureCategory) {
          try {
            const validation = code === 'INTERPRETATION_FAILED' && diagnostic.failureCategory === 'STRUCTURED_VALIDATION'
              ? safeValidationDiagnostic(error) : undefined;
            (options.logger || console).warn('structured_interpretation_failed', {code,...diagnostic,
              ...(code === 'INTERPRETATION_FAILED' && reasons.has(error.reason) ? {reason:error.reason} : {}),
              ...(validation ? {validation} : {})});
          }
          catch { /* Diagnostics must never change the response contract. */ }
        }
        sendJson(response, codes.has(error.code) ? error.statusCode : 400, { mode: 'interpretation.v1', executable: false, code, ...diagnostic,
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
