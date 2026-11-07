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
  assert.equal(error.message,'JWT claims validation or parsing failed.');
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
