import test from 'node:test';
import assert from 'node:assert/strict';
import {createWatchCheckController} from './watch-monitoring.js';
import {detailUxFixtures} from './test-support/watch-detail-ux-fixtures.js';
const make=(request,source=detailUxFixtures[2])=>{
 let watch=structuredClone(source);const writes=[];
 const controller=createWatchCheckController({getWatch:()=>watch,saveWatch:(_,changes)=>{writes.push(changes);watch={...watch,...changes};return watch;},checkStoredWatch:request,checkTimeoutMs:10});
 return {controller,writes,current:()=>watch};
};
test('successful and failed checks release single-flight and retain their actual results',async()=>{
 const changes={lastChecked:'2026-10-22T09:30:00Z'};
 for(const source of [detailUxFixtures[0],detailUxFixtures[2]]){
 const successful=make(async()=>({changes,matchedItems:[],outcome:'no-new-items'}),source);
 const result=await successful.controller.check('w');assert.equal(result.outcome,'no-new-items');assert.equal(successful.current().lastChecked,changes.lastChecked);assert.equal(successful.controller.isChecking('w'),false);
 }
 const failed=make(async()=>{throw Object.assign(Error('Network unavailable'),{code:'NETWORK_ERROR'});});
 await assert.rejects(failed.controller.check('w'),/Network unavailable/);assert.equal(failed.current().lastCheckAttempt.status,'failed');assert.equal(failed.controller.isChecking('w'),false);
});
test('a stalled request times out, aborts, blocks duplicate clicks and ignores late results',async()=>{
 let finish,signal,calls=0;const fixture=make((_,options)=>{calls++;if(calls>1)return {changes:{lastChecked:'2026-10-22T09:31:00Z'},matchedItems:[],outcome:'no-new-items'};signal=options.signal;return new Promise(resolve=>{finish=resolve;});});
 const before=fixture.current().lastChecked,first=fixture.controller.check('w'),duplicate=fixture.controller.check('w');assert.equal(first,duplicate);
 await assert.rejects(first,error=>error.code==='TIMEOUT');assert.equal(calls,1);assert.equal(signal.aborted,true);assert.equal(fixture.controller.isChecking('w'),false);
 assert.equal(fixture.current().lastCheckAttempt.code,'TIMEOUT');assert.equal(fixture.current().lastChecked,before);
 const writes=fixture.writes.length;finish({changes:{lastChecked:'2099-01-01'},matchedItems:[],outcome:'matching-items'});await new Promise(resolve=>setImmediate(resolve));assert.equal(fixture.writes.length,writes);assert.equal(fixture.current().lastChecked,before);
 const retry=await fixture.controller.check('w');assert.equal(retry.outcome,'no-new-items');assert.equal(calls,2);assert.equal(fixture.controller.isChecking('w'),false);
});

test('the deadline signal aborts the authenticated request rather than only changing UI state',async()=>{
 const {watchRequest}=await import('./watch-server-resilience.js');const original=globalThis.fetch;const aborter=new AbortController();let observed;
 globalThis.fetch=async(_,options)=>{observed=options.signal;return new Promise((_,reject)=>{options.signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true});});};
 try{const request=watchRequest('/synthetic-check',{signal:aborter.signal});aborter.abort();await assert.rejects(request,error=>error.code==='TIMEOUT');assert.equal(observed.aborted,true);}finally{globalThis.fetch=original;}
});
