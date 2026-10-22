import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJSON } from '../src/js/structured-fingerprint.js';

export const AUTHORIZATION_VERSION = 'structured-watch-authorization.v1';
export const AUTHORIZATION_AUDIENCE = 'watch-assistant.structured-persistence';
const purpose = 'confirm-structured-watch';
const header = Buffer.from(JSON.stringify({ alg:'HS256', typ:'WA-CONFIRM', version:1 })).toString('base64url');
const fields = ['version','audience','purpose','ownerId','watchId','operation','mutationId','expectedRevision',
  'definitionFingerprint','payloadFingerprint','interpretationVersion','planVersion','definitionVersion','compilerVersion','validatorVersion','iat','exp'];
export const authorizationError = (code, statusCode = 403) => Object.assign(new Error('Structured confirmation authorization was rejected.'), { code, statusCode });
export const fingerprint = value => createHash('sha256').update(canonicalJSON(value)).digest('hex');
export const authorizationConfiguration = (env = process.env) => {
  const secret = env.STRUCTURED_WATCH_SIGNING_SECRET;
  const rawTTL = env.STRUCTURED_WATCH_AUTH_TTL_SECONDS ?? '300';
  if (typeof secret !== 'string' || !secret.trim() || Buffer.byteLength(secret) < 32 || Buffer.byteLength(secret) > 512
    || !/^\d+$/.test(rawTTL) || Number(rawTTL) < 30 || Number(rawTTL) > 600) throw authorizationError('SERVER_NOT_CONFIGURED',503);
  return { secret, ttl:Number(rawTTL) };
};
export const authorizationBindings = ({ ownerId, watchId, operation, mutationId, expectedRevision, definition, source, title }) => ({
  ownerId, watchId, operation, mutationId, expectedRevision,
  definitionFingerprint:fingerprint(definition), payloadFingerprint:fingerprint({definition,source,title}),
  interpretationVersion:definition.interpretation.schemaVersion, planVersion:definition.plan.schemaVersion,
  definitionVersion:definition.definitionVersion, compilerVersion:definition.metadata.compilerVersion, validatorVersion:definition.metadata.validatorVersion,
});
export const issuePlanAuthorization = (bindings, config, now = Date.now()) => {
  const iat = Math.floor(now / 1000);
  const claims = { ...bindings,version:AUTHORIZATION_VERSION,audience:AUTHORIZATION_AUDIENCE,purpose,iat,exp:iat+config.ttl };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256',config.secret).update(`${header}.${body}`).digest('base64url');
  return { token:`${header}.${body}.${signature}`, expiresAt:claims.exp };
};
export const verifyPlanAuthorization = (token, expected, config, now = Date.now()) => {
  if (typeof token !== 'string' || token.length > 4096) throw authorizationError('INVALID_PLAN_AUTHORIZATION');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== header || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw authorizationError('INVALID_PLAN_AUTHORIZATION');
  const signature = Buffer.from(parts[2],'base64url');
  const computed = createHmac('sha256',config.secret).update(`${parts[0]}.${parts[1]}`).digest();
  if (signature.toString('base64url') !== parts[2] || signature.length !== computed.length || !timingSafeEqual(signature,computed)) throw authorizationError('INVALID_PLAN_AUTHORIZATION');
  let claims;
  try {
    const decoded = Buffer.from(parts[1],'base64url');
    if (decoded.toString('base64url') !== parts[1]) throw Error();
    claims = JSON.parse(decoded.toString('utf8'));
  } catch { throw authorizationError('INVALID_PLAN_AUTHORIZATION'); }
  if (!claims || Array.isArray(claims) || Object.keys(claims).length !== fields.length || !fields.every(key => Object.hasOwn(claims,key))) throw authorizationError('INVALID_PLAN_AUTHORIZATION');
  if (claims.version !== AUTHORIZATION_VERSION) throw authorizationError('UNSUPPORTED_AUTHORIZATION_VERSION',422);
  if (claims.audience !== AUTHORIZATION_AUDIENCE || claims.purpose !== purpose) throw authorizationError('PLAN_AUDIENCE_MISMATCH');
  const seconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.iat > seconds + 30
    || claims.exp <= claims.iat || claims.exp - claims.iat > config.ttl || claims.exp - claims.iat < 30) throw authorizationError('INVALID_PLAN_AUTHORIZATION');
  if (claims.exp <= seconds) throw authorizationError('EXPIRED_PLAN_AUTHORIZATION',410);
  const codes = {ownerId:'PLAN_OWNER_MISMATCH',watchId:'PLAN_WATCH_MISMATCH',operation:'PLAN_OPERATION_MISMATCH',mutationId:'PLAN_MUTATION_MISMATCH',
    expectedRevision:'PLAN_REVISION_MISMATCH',definitionFingerprint:'PLAN_DEFINITION_MISMATCH',payloadFingerprint:'PLAN_DEFINITION_MISMATCH'};
  for (const key of fields.filter(key => !['version','audience','purpose','iat','exp'].includes(key))) {
    if (claims[key] !== expected[key]) throw authorizationError(codes[key] || 'PLAN_VERSION_MISMATCH',key === 'expectedRevision' ? 409 : 403);
  }
  return claims;
};
