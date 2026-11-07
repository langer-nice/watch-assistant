import test from 'node:test';
import assert from 'node:assert/strict';
import {productionWatchOwners} from './structured-production-access.js';

test('owner RPC preserves status/code and excludes upstream payload and credentials', async () => {
 const secret='Bearer secret-token eyJhbGciOiJIUzI1NiJ9.payload.signature';
 await assert.rejects(productionWatchOwners({rpc:async name=>{
  assert.equal(name,'production_watch_owners');
  return {status:401,error:{code:'PGRST303',message:secret,details:secret,hint:secret},data:null};
 }}),error=>{
  assert.equal(error.code,'PGRST303');assert.equal(error.upstreamStatus,401);
  assert.equal(error.stage,'production_watch_owners');
  assert.equal(error.message,'[redacted] [redacted]');
  assert.equal(JSON.stringify(error).includes(secret),false);assert.equal(error.cause,undefined);
  return true;
 });
});
test('owner transport rejection and invalid owner payload fail closed with safe diagnostics', async()=>{
 for(const rpc of [async()=>{throw {message:'secret',code:'Bearer secret'};},async()=>({status:200,data:['not-an-owner']}),async()=>({status:401,error:{code:'secret-token',message:'secret'}})]){
  await assert.rejects(productionWatchOwners({rpc}),error=>{
   assert.equal(error.code,'PRODUCTION_OWNER_CONTEXT_UNAVAILABLE');
   assert.equal(error.stage,'production_watch_owners');assert.equal(error.message.includes('secret'),false);return true;
  });
 }
 const owners=['b4757e02-fc75-4984-b50e-8d933ae7ec04'];
 assert.deepEqual(await productionWatchOwners({rpc:async()=>({data:owners})}),owners);
});

for (const message of ['JWT expired', 'Invalid JWT: signature verification failed', 'JWSError (JWSInvalidSignature)', 'JWT not yet valid', 'JWT invalid audience', 'JWT issued in the future', 'No suitable key or wrong key type', 'JWSError (CompactDecodeError)']) test(`original safe rejection retained: ${message}`, async () => {
 await assert.rejects(productionWatchOwners({rpc:async()=>({status:401,error:{code:'PGRST303',message}})}), error=>{
  assert.equal(error.message,message);return true;
 });
});
test('mixed secrets, arbitrary values and personal data are redacted before propagation',async()=>{
 const sensitive=['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.signature','sb_secret_syntheticPrivateKey','opaquePrivateCredential','alice@example.test','Alice','b4757e02-fc75-4984-b50e-8d933ae7ec04','https://private.example.test/path'];
 const message=`JWT expired; ${sensitive.join(' ')}; password=opaquePassword; "private name"; Authorization: Basic opaqueHeaderValue`;
 await assert.rejects(productionWatchOwners({rpc:async()=>({status:401,error:{code:'PGRST303',message,details:message,hint:message,cause:{message}}})}),error=>{
  assert.match(error.message,/^JWT expired;/);
  for(const value of [...sensitive,'opaquePassword','private name','opaqueHeaderValue'])assert.equal((error.message+JSON.stringify(error)).includes(value),false);
  assert.deepEqual(Object.keys(error).sort(),['code','stage','upstreamStatus']);
  assert.equal(error.cause,undefined);assert.equal(error.stack.includes('opaquePrivateCredential'),false);return true;
 });
});
test('optional metadata and absent messages are safe; text is bounded and cannot inject log lines',async()=>{
 for(const result of [{error:{code:'PGRST303'}},{error:{code:'PGRST303',message:null}},{status:'401',error:{code:'PGRST303'}}]){
  await assert.rejects(productionWatchOwners({rpc:async()=>result}),error=>{
   assert.equal(error.message,'Production owner context unavailable.');assert.equal(error.upstreamStatus,undefined);return true;
  });
 }
 await assert.rejects(productionWatchOwners({rpc:async()=>({error:{code:'ALICE',message:'JWT expired\n'+('invalid signature '.repeat(200))}})}),error=>{
  assert.equal(error.code,'PRODUCTION_OWNER_CONTEXT_UNAVAILABLE');assert(error.message.length<=400);assert(!error.message.includes('\n'));return true;
 });
});
