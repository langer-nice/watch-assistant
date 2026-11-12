import { createHash } from 'node:crypto';
import sdkPackage from '@supabase/supabase-js/package.json' with { type: 'json' };

// Separate opt-in; the existing Preview/test rollout is not widened.
export const productionProjectMatches = env => env?.VERCEL_ENV === 'production'
  && env.VERCEL_PROJECT_ID === 'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF'
  && env.VERCEL_GIT_COMMIT_REF === 'master'
  && env.SUPABASE_URL === 'https://cztpitujsnzhhenedwjn.supabase.co'
  && (!env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL === env.SUPABASE_URL)
  && ['STRUCTURED_WATCH_TEST_USER_IDS','STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED',
    'STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS','STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS']
    .every(key => env[key] === undefined || env[key] === '');
export const structuredProductionEnabled = env => productionProjectMatches(env)
  && env.STRUCTURED_PRODUCTION_ENABLED === 'true';
export const productionExecutionEnabled = env => structuredProductionEnabled(env)
  && env.STRUCTURED_MEDIA_SCHEDULED_ENABLED === 'true';
export const productionReportsEnabled = env => productionProjectMatches(env)
  && env.MORNING_REPORT_PRODUCTION_ENABLED === 'true';
// Only authentication vocabulary may survive arbitrary upstream text. Pattern
// redaction alone cannot exclude names, owner data or opaque credentials.
// Keep original wording/case/punctuation for recognized words; values and
// unrecognized words are removed. Do not retain raw messages or error causes.
const authWords = new Set(('jwt jwterror jwsexpired jwtexpired jwtinvalidclaims jwsinvalidsignature jwtissuedatfuture jwtclaimssetdecodeerror jwtclaimssetdecodingerror jwtinvalidsignature jwtinvalidaudience jwtinvalidissuer jwsinvalidalg jwtnotyetvalid jwsnosignatures jwserror ' +
  'invalid expired expiration expiry signature verification verify failed failure ' +
  'claims claim validation parsing parse malformed token tokens missing required ' +
  'audience issuer subject issued at future not yet valid nbf exp iat aud iss sub ' +
  'unexpected unsupported algorithm algorithms key keys id kid public ' +
  'unable to find suitable matching wrong type signing decode decoding compactdecodeerror error errors format parts ' +
  'expected got could no be found is was has been the a an of for in on ' +
  'with or and must use contain contains does do allow allowed clock skew ' +
  'authentication authorization denied unauthorized access permission service role ' +
  'production owner context unavailable transport network fetch request timed out ' +
  'timeout connection refused reset aborted aborterror typeerror redacted ' +
  'jwk jwks json web set header headers value values mismatch does cannot ' +
  'claimnotpresent').split(/\s+/));
const safeOwnerMessage = value => {
  if (typeof value !== 'string' || !value.trim()) return 'Production owner context unavailable.';
  return value.slice(0, 8192)
    .replace(/authorization\s*[:=][^\r\n]*/gi, '[redacted]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, '[redacted]')
    .replace(/\bsb_(?:secret|publishable)_[^\s,;]+/gi, '[redacted]')
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[redacted]')
    .replace(/"[^"\r\n]*"|'[^'\r\n]*'/g, '[redacted]')
    .replace(/\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*[^\s,;]+/g, '[redacted]')
    .replace(/[A-Za-z0-9_@/+=-]+(?:\.[A-Za-z0-9_@/+=-]+)*/g, word => authWords.has(word.toLowerCase()) ? word : '[redacted]')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 400) || '[redacted]';
};
export const productionOwnerFailure = (error, status) => {
  const code = /^(PGRST[0-9]{3}|[0-9]{2}[0-9A-Z]{3}|P[0-9][0-9A-Z]{3}|XX[0-9]{3})$/.test(error?.code || '')
    ? error.code : 'PRODUCTION_OWNER_CONTEXT_UNAVAILABLE';
  return Object.assign(new Error(safeOwnerMessage(error?.message)), {
    code,
    stage: 'production_watch_owners',
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { upstreamStatus: status } : {}),
  });
};
// Temporary, failure-only evidence at the existing RPC boundary. No transport
// hooks: supabase-js does not expose response headers in its RPC result.
const logOwnerRpcFailure = (error, status, env) => {
  try {
    const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const secrets = [key, env.CRON_SECRET?.trim()].filter(Boolean);
    const event = {
      event: 'owner_rpc_auth_failure', timestamp: new Date().toISOString(),
      rpc: 'production_watch_owners', sdkVersion: sdkPackage.version, nodeVersion: process.version,
    };
    if (Number.isInteger(status) && status >= 100 && status <= 599) event.httpStatus = status;
    if (/^(PGRST[0-9]{3}|[0-9]{2}[0-9A-Z]{3}|P[0-9][0-9A-Z]{3}|XX[0-9]{3})$/.test(error?.code || '')
      && !secrets.some(secret => error.code.includes(secret))) event.code = error.code;
    for (const field of ['message', 'details', 'hint']) {
      if (typeof error?.[field] !== 'string' || !error[field].trim()) continue;
      const text = secrets.reduce((value, secret) => value.split(secret).join('[redacted]'), error[field]);
      event[field] = safeOwnerMessage(text.replace(/\b(?:apikey|cookie|set-cookie|access_token|refresh_token)\s*[:=][^\r\n]*/gi, '[redacted]'));
    }
    if (key) {
      event.keyFamily = key.startsWith('sb_secret_') ? 'sb_secret'
        : key.startsWith('sb_publishable_') ? 'sb_publishable'
          : key.split('.').length === 3 ? 'jwt' : 'unknown';
      event.keyFingerprint = createHash('sha256').update(key).digest('hex').slice(0, 8);
    }
    if (/^[0-9a-f]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA || '')) event.deploymentCommit = env.VERCEL_GIT_COMMIT_SHA;
    if (['production', 'preview', 'development'].includes(env.VERCEL_ENV)) event.deploymentEnvironment = env.VERCEL_ENV;
    console.error(JSON.stringify(event));
  } catch { /* Observability must never replace or prevent the existing error. */ }
};

export const productionWatchOwners = async (client, { env = process.env } = {}) => {
  let result;
  try { result = await client.rpc('production_watch_owners'); }
  catch (error) { logOwnerRpcFailure(error, undefined, env); throw productionOwnerFailure(error); }
  if (result.error) {
    logOwnerRpcFailure(result.error, result.status, env);
    throw productionOwnerFailure(result.error, result.status);
  }
  if (!Array.isArray(result.data) || !result.data.every(id =>
    typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    logOwnerRpcFailure(null, result.status, env);
    throw productionOwnerFailure(null, result.status);
  }
  return result.data;
};
