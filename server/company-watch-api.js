import { randomUUID } from 'node:crypto';

import { BodaccError } from './bodacc-api.js';
import {
  CompanyWatchRepositoryError,
  createCompanyWatchRepository,
} from './company-watch-repository.js';
import { authenticateSupabaseRequest, SupabaseAuthError } from './supabase-user.js';

export const COMPANY_WATCHES_ENDPOINT = '/api/company-watches';
export const COMPANY_WATCH_ENDPOINT = '/api/company-watch';
export const CHECK_COMPANY_WATCH_ENDPOINT = '/api/check-company-watch';
const MAX_REQUEST_BYTES = 8 * 1024;

const sendJson = (response, statusCode, body) => {
  response.setHeader('Cache-Control', 'no-store');
  if (typeof response.status === 'function' && typeof response.json === 'function') {
    response.status(statusCode).json(body);
    return;
  }
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request) => {
  if (request.body !== undefined) {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw new CompanyWatchRepositoryError('INVALID_BODY', 400, 'The request body must be a JSON object.');
    }
    return request.body;
  }
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      throw new CompanyWatchRepositoryError('INVALID_BODY', 400, 'The request body is too large.');
    }
  }
  try {
    const value = JSON.parse(body || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object');
    return value;
  } catch {
    throw new CompanyWatchRepositoryError('INVALID_BODY', 400, 'The request body must be valid JSON.');
  }
};

const safeError = (cause) => {
  if (
    cause instanceof SupabaseAuthError
    || cause instanceof CompanyWatchRepositoryError
    || cause instanceof BodaccError
  ) return cause;
  return new CompanyWatchRepositoryError('INTERNAL_ERROR', 500, 'The request could not be completed.');
};

export const createCompanyWatchMiddleware = ({
  authenticate = authenticateSupabaseRequest,
  repositoryFactory = createCompanyWatchRepository,
  logger = console,
  createRequestId = randomUUID,
  ...options
} = {}) => async (request, response, next) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (![COMPANY_WATCHES_ENDPOINT, COMPANY_WATCH_ENDPOINT, CHECK_COMPANY_WATCH_ENDPOINT]
    .includes(url.pathname)) {
    next?.();
    return;
  }

  const requestId = createRequestId();
  let authenticated = false;
  let stage = 'request-arrival';
  response.setHeader('X-Request-Id', requestId);
  const log = (level, message, details = {}) => logger?.[level]?.(message, {
    requestId,
    method: request.method,
    path: url.pathname,
    authenticated,
    stage,
    ...details,
  });
  const setStage = (nextStage) => {
    stage = nextStage;
    log('info', '[Company Watches] Request stage.');
  };
  const reply = (statusCode, body) => {
    log('info', '[Company Watches] Response sent.', { statusCode });
    sendJson(response, statusCode, { ...body, requestId });
  };

  log('info', '[Company Watches] Request received.');
  try {
    setStage('authenticate');
    const auth = await authenticate(request, options);
    authenticated = true;
    setStage('authenticated');
    const repository = repositoryFactory({
      ...auth,
      ...options,
      onCompanyWatchStage: setStage,
    });

    if (url.pathname === COMPANY_WATCHES_ENDPOINT) {
      if (request.method === 'GET') {
        setStage('list');
        reply(200, { watches: await repository.list() });
        return;
      }
      if (request.method === 'POST') {
        setStage('read-body');
        const { watch, result } = await repository.create(await readJsonBody(request));
        setStage('create-complete');
        reply(201, { watch, outcome: result.outcome });
        return;
      }
      response.setHeader('Allow', 'GET, POST');
      setStage('method-rejected');
      reply(405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
      return;
    }

    const watchId = url.searchParams.get('id');
    if (url.pathname === CHECK_COMPANY_WATCH_ENDPOINT) {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        setStage('method-rejected');
        reply(405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
        return;
      }
      setStage('check');
      const { watch, result } = await repository.check(watchId);
      reply(200, {
        watch,
        outcome: result.outcome,
        matchedItemIds: result.matchedItems.map(({ id }) => id),
      });
      return;
    }

    if (request.method === 'GET') {
      setStage('get');
      reply(200, { watch: await repository.get(watchId) });
      return;
    }
    if (request.method === 'PATCH') {
      setStage('update');
      reply(200, { watch: await repository.update(watchId, await readJsonBody(request)) });
      return;
    }
    if (request.method === 'DELETE') {
      setStage('delete');
      await repository.remove(watchId);
      reply(200, { deleted: true });
      return;
    }
    response.setHeader('Allow', 'GET, PATCH, DELETE');
    setStage('method-rejected');
    reply(405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
  } catch (cause) {
    const error = safeError(cause);
    log('warn', '[Company Watches] Request failed.', {
      code: error.code || 'INTERNAL_ERROR',
      statusCode: error.statusCode || 500,
    });
    reply(error.statusCode || 500, {
      code: error.code || 'INTERNAL_ERROR',
      error: error.clientMessage || error.message,
    });
  }
};
