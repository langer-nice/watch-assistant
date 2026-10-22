import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { definitions } from './test-support/watch-definition-fixtures.js';
import { structuredMonitoringSource } from '../src/js/watch-definition.js';
import { authorizationConfiguration,authorizationBindings,issuePlanAuthorization,verifyPlanAuthorization } from './structured-watch-authorization.js';

const config = authorizationConfiguration({STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4)});
const clock = Date.UTC(2026,9,12);
const definition = definitions()[0];
const bindings = authorizationBindings({ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',watchId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  mutationId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',operation:'create',expectedRevision:0,title:'Sinner',definition,source:structuredMonitoringSource(definition.plan.criteria)});
const token = issuePlanAuthorization(bindings,config,clock).token;
const resign = mutate => {
  const [head,body] = token.split('.'); const claims = JSON.parse(Buffer.from(body,'base64url'));
  mutate(claims); const changed = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${head}.${changed}.${createHmac('sha256',config.secret).update(`${head}.${changed}`).digest('base64url')}`;
};
test('valid authorization binds exact content and conservative configurable TTL', () => {
  assert.equal(verifyPlanAuthorization(token,bindings,config,clock).exp,clock/1000+300);
  assert.equal(authorizationConfiguration({STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4),STRUCTURED_WATCH_AUTH_TTL_SECONDS:'30'}).ttl,30);
});
test('signature, algorithm header and malformed tokens are rejected', () => {
  for (const value of [token.replace(/.$/,token.endsWith('A')?'B':'A'),`none.${token.split('.').slice(1).join('.')}`,null,'bad', 'x'.repeat(4097)]) {
    assert.throws(() => verifyPlanAuthorization(value,bindings,config,clock),{code:'INVALID_PLAN_AUTHORIZATION'});
  }
});
for (const [field,code] of Object.entries({ownerId:'PLAN_OWNER_MISMATCH',watchId:'PLAN_WATCH_MISMATCH',operation:'PLAN_OPERATION_MISMATCH',
  mutationId:'PLAN_MUTATION_MISMATCH',expectedRevision:'PLAN_REVISION_MISMATCH',definitionFingerprint:'PLAN_DEFINITION_MISMATCH',
  payloadFingerprint:'PLAN_DEFINITION_MISMATCH',compilerVersion:'PLAN_VERSION_MISMATCH',validatorVersion:'PLAN_VERSION_MISMATCH',
  definitionVersion:'PLAN_VERSION_MISMATCH',planVersion:'PLAN_VERSION_MISMATCH',interpretationVersion:'PLAN_VERSION_MISMATCH'})) {
  test(`authorization rejects changed ${field}`, () => assert.throws(() => verifyPlanAuthorization(token,{...bindings,[field]:field==='expectedRevision'?1:'different'},config,clock),{code}));
}
test('expiry, future issuance, excessive lifetime and wrong purpose/version fail closed', () => {
  assert.throws(() => verifyPlanAuthorization(token,bindings,config,clock+300000),{code:'EXPIRED_PLAN_AUTHORIZATION'});
  for (const mutate of [v=>{v.iat+=31;v.exp+=31;},v=>{v.exp++;},v=>{v.iat='today';},v=>{v.extra=true;}]) {
    assert.throws(() => verifyPlanAuthorization(resign(mutate),bindings,config,clock),{code:'INVALID_PLAN_AUTHORIZATION'});
  }
  for (const field of ['audience','purpose']) assert.throws(() => verifyPlanAuthorization(resign(v=>{v[field]='other';}),bindings,config,clock),{code:'PLAN_AUDIENCE_MISMATCH'});
  assert.throws(() => verifyPlanAuthorization(resign(v=>{v.version='future';}),bindings,config,clock),{code:'UNSUPPORTED_AUTHORIZATION_VERSION'});
});
test('missing/invalid signing configuration is rejected without exposing values', () => {
  for (const env of [{},{STRUCTURED_WATCH_SIGNING_SECRET:'short'},{STRUCTURED_WATCH_SIGNING_SECRET:' '.repeat(40)},
    {STRUCTURED_WATCH_SIGNING_SECRET:'fixture-only-'.repeat(4),STRUCTURED_WATCH_AUTH_TTL_SECONDS:'601'}]) assert.throws(() => authorizationConfiguration(env),{code:'SERVER_NOT_CONFIGURED'});
});
