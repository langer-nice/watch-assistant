import test from 'node:test';
import assert from 'node:assert/strict';
import {createV3WatchHandler} from './v3-creation.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env={V3_PILOT_ENABLED:'true',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'master',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true'};
async function invoke({existing=false,row={id,user_id:owner,deleted_at:null},readError=false,persistError=false}={}){
 let models=0,feeds=0,writes=0,reads=0;
 const client={from:table=>{const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){
  if(table==='v3_pilot_watches')return {data:existing?{watch_id:id,engine:'wa-v3-evidence-refs.v1'}:null};
  assert.equal(table,'watches');assert.deepEqual(filters,[['user_id',owner],['id',id]]);reads++;return readError?{error:{code:'42501'}}:{data:row};
 }};return q;},rpc:async (name,args)=>{assert.equal(name,'create_v3_watch');if(args.p_understanding===null)return {data:existing?id:null};writes++;return persistError?{error:{code:'XX000'}}:{data:id};}};
 const api=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,model:async()=>{models++;return {display_title:'AsterCo appeal',intent:{canonical_text:'Follow the AsterCo appeal.',references:[{label:'AsterCo',source_ref:'raw_input'}],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Clear.'}};},feed:async url=>{feeds++;return {source:{url},items:[{id:'seed',title:'AsterCo appeal',url:'https://example.test/story'}]};}});
 let result;const res={setHeader(){},end(s){result={http:this.statusCode,...JSON.parse(s)};}};await api({method:'POST',body:{instruction:'Follow the AsterCo appeal.',watchId:id,captureKind:'FREE_TEXT'}},res);
 return {result,models,feeds,writes,reads};
}
for(const existing of [false,true])test((existing?'existing':'new')+' success requires a scoped non-deleted durable row',async()=>{
 const r=await invoke({existing});assert.equal(r.result.http,200);assert.equal(r.result.persisted,true);assert.equal(r.result.id,id);assert.equal(r.reads,1);assert.equal(r.writes,existing?0:1);assert.equal(r.models,existing?0:1);
});
for(const [name,row,code] of [
 ['deleted',{id,user_id:owner,deleted_at:'2026-11-04T16:22:49Z'},'V3_CREATION_DELETED'],
 ['missing',null,'V3_CREATION_NOT_CONFIRMED'],
 ['foreign',{id,user_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',deleted_at:null},'V3_CREATION_NOT_CONFIRMED'],
])for(const existing of [false,true])test(name+' row cannot produce READY after '+(existing?'idempotent lookup':'persistence return'),async()=>{
 const r=await invoke({existing,row});assert.equal(r.result.http,409);assert.equal(r.result.code,code);assert.equal(r.result.status,undefined);assert.equal(r.result.persisted,undefined);assert.equal(r.reads,1);
 if(existing){assert.equal(r.models,0);assert.equal(r.feeds,0);assert.equal(r.writes,0);}
});
test('RPC failure does not read back or claim creation',async()=>{
 const r=await invoke({persistError:true});assert.equal(r.result.http,503);assert.equal(r.reads,0);assert.equal(r.result.persisted,undefined);
});
test('confirmation read failure after RPC is unconfirmed, never optimistic success',async()=>{
 const r=await invoke({readError:true});assert.equal(r.result.http,503);assert.equal(r.result.persisted,undefined);assert.equal(r.writes,1);assert.equal(r.reads,1);
});
