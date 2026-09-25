import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaWatchMiddleware } from './media-watch-api.js';

for (const code of ['40001', 'PT409']) {
  test(`${code} yields one terminal HTTP 409 without a second RPC`, async () => {
    let calls=0, status, body;
    const handler=createMediaWatchMiddleware({authenticate:async()=>({user:{id:'fixture'},client:{
      rpc:async()=>{calls++;return {data:null,error:{code}};},
    }})});
    await handler({url:'/api/media-watches',method:'POST',body:{
      revision:3,mutation:'00000000-0000-4000-8000-000000000002',deleted:false,
      definition:{id:'00000000-0000-4000-8000-000000000001',title:'Fixture',monitoring_state:'monitoring',
        monitoring_source:{type:'feed',url:'https://fixture.example/rss'},
        watch_definition:{inputType:'text',category:'news',request:'Fixture mentions',mediaMention:{subjects:['Fixture'],matchMode:'all'}}},
    }},{setHeader(){},set statusCode(value){status=value;},end(value){body=JSON.parse(value);}});
    assert.equal(calls,1);assert.equal(status,409);assert.deepEqual(body,{code:'MEDIA_CONFLICT'});
  });
}
