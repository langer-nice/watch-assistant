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
  'audience issuer subject issued at not yet valid nbf exp iat aud iss sub ' +
  'unexpected unsupported algorithm algorithms key keys id kid public ' +
  'unable to find matching signing decode decoding error errors format parts ' +
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
export const productionWatchOwners = async client => {
  let result;
  try { result = await client.rpc('production_watch_owners'); }
  catch (error) { throw productionOwnerFailure(error); }
  if (result.error) throw productionOwnerFailure(result.error, result.status);
  if (!Array.isArray(result.data) || !result.data.every(id =>
    typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    throw productionOwnerFailure(null, result.status);
  }
  return result.data;
};
