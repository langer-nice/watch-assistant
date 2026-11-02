import test from 'node:test';
import assert from 'node:assert/strict';
import {configureMediaWatchServerStore, synchronizeMediaWatches, checkStoredMediaWatch, getMediaServerWatches} from './media-watch-server-store.js';
import {createWatchCheckController} from './watch-monitoring.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
class Storage { getItem(k){return this[k]??null;}setItem(k,v){this[k]=String(v);}removeItem(k){delete this[k];} }
const row=(id,title)=>({id,user_id:owner,title,watch_definition:{inputType:'url',request:'Follow '+title,category:'news',storyProfile:{concepts:[{label:title,type:'condition'}],userAddedConcepts:[]}},monitoring_source:{type:'feed',url:'https://example.test/feed'},monitoring_state:'monitoring',current_status:'watching',created_at:'2026-11-01T00:00:00Z',last_checked_at:'2026-11-02T06:35:00Z',media_revision:1,media_mutation_id:'44444444-4444-4444-8444-444444444444',v3Engine:'wa-v3-evidence-refs-pilot.v1'});
const key=(id,user=owner)=>`watchAssistant.mediaSync.${user}.${id}`;
const job=id=>({definition:{id,title:'changed '+id},revision:1,mutation:'55555555-5555-4555-8555-555555555555',pending:true,deleted:false});

test('per-Watch mutation failures cannot poison another stored check',async t=>{
 const originals=Object.fromEntries(['window','localStorage','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(async()=>{await configureMediaWatchServerStore(null);for(const [k,d] of Object.entries(originals)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 let state,records,calls,invalid,failRead,hold,started,checkRuns;
 const fixture=async()=>{
  await configureMediaWatchServerStore(null);globalThis.window=new EventTarget();globalThis.localStorage=new Storage();
  state={status:'authenticated',session:{access_token:'fixture-user-token',user:{id:owner}}};records=[row(a,'Invalid A'),row(b,'Apple Mac product announcements'),row(c,'Manchester City important developments')];calls=[];invalid=new Set();failRead=false;hold=null;started=null;checkRuns=0;
  globalThis.fetch=async(path,options={})=>{
   const body=options.body?JSON.parse(options.body):null;calls.push({path,body,authorization:options.headers.Authorization});
   if(path.includes('action=check')){checkRuns++;return Response.json({outcome:'no-new-items',changes:{lastCheckAttempt:{status:'succeeded'},lastChecked:'2026-11-02T12:00:00Z'},matchedItems:[]});}
   if(options.method==='POST'){
    started?.();if(hold)await hold;
    if(invalid.has(body.definition.id))return Response.json({code:'PERSISTENCE_UNAVAILABLE'},{status:503});
    const found=records.find(r=>r.id===body.definition.id);found.media_revision++;found.media_mutation_id=body.mutation;return Response.json({watch:found});
   }
   return failRead?Response.json({code:'PERSISTENCE_UNAVAILABLE'},{status:503}):Response.json({watches:records.filter(r=>r.user_id===state.session.user.id)});
  };
  await configureMediaWatchServerStore({getState:()=>state,subscribe:()=>()=>{}});calls=[];
 };
 const enqueue=id=>localStorage.setItem(key(id),JSON.stringify(job(id)));
 const current=id=>getMediaServerWatches().find(w=>w.id===id);
 await t.test('valid mutation is confirmed with the existing user credential',async()=>{await fixture();enqueue(a);assert.equal((await synchronizeMediaWatches()).ok,true);assert.equal(JSON.parse(localStorage.getItem(key(a))).pending,false);assert(calls.every(x=>x.authorization==='Bearer fixture-user-token'));});
 await t.test('rejected identity mutation stays pending, failed and observable',async()=>{await fixture();enqueue(a);invalid.add(a);const r=await synchronizeMediaWatches();assert.equal(r.ok,false);assert.equal(r.readConfirmed,true);assert.deepEqual(r.failedWatchIds,[a]);assert.equal(JSON.parse(localStorage.getItem(key(a))).errorCode,'PERSISTENCE_UNAVAILABLE');assert.equal(JSON.parse(localStorage.getItem(key(a))).pending,true);});
 await t.test('valid remaining mutation processes once after another rejection',async()=>{await fixture();enqueue(a);enqueue(c);invalid.add(a);await synchronizeMediaWatches();assert.equal(JSON.parse(localStorage.getItem(key(c))).pending,false);assert.deepEqual(calls.filter(x=>x.body).map(x=>x.body.definition.id),[a,c]);});
 await t.test('Apple manual controller reaches its own check transport and saves its result despite A',async()=>{await fixture();enqueue(a);invalid.add(a);let saved;const controller=createWatchCheckController({getWatch:()=>current(b),saveWatch:(id,changes)=>{assert.equal(id,b);saved=changes;return {...current(b),...changes};},checkStoredWatch:checkStoredMediaWatch});const result=await controller.check(b);assert.equal(result.outcome,'no-new-items');assert.equal(checkRuns,1);assert.equal(saved.lastCheckAttempt.status,'succeeded');assert.equal(JSON.parse(localStorage.getItem(key(a))).pending,true);});
 await t.test('second unrelated V3 Watch also reaches its own stored check',async()=>{await fixture();enqueue(a);invalid.add(a);await checkStoredMediaWatch(current(c));assert.equal(checkRuns,1);assert.equal(calls.at(-1).body.id,c);});
 await t.test('own rejected mutation still blocks the selected Watch',async()=>{await fixture();enqueue(b);invalid.add(b);await assert.rejects(checkStoredMediaWatch(current(b)),{code:'PERSISTENCE_UNAVAILABLE'});assert.equal(checkRuns,0);});
 await t.test('failed authoritative read cannot be ignored alongside unrelated failure',async()=>{await fixture();const target=current(b);enqueue(a);invalid.add(a);failRead=true;await assert.rejects(checkStoredMediaWatch(target),{code:'PERSISTENCE_UNAVAILABLE'});assert.equal(checkRuns,0);});
 await t.test('same-account in-flight background rejection cannot transfer to another check',async()=>{await fixture();enqueue(a);invalid.add(a);let release,entered;hold=new Promise(r=>{release=r;});const entry=new Promise(r=>{entered=r;});started=entered;const background=synchronizeMediaWatches();await entry;const check=checkStoredMediaWatch(current(b));release();assert.equal((await background).ok,false);await check;assert.equal(checkRuns,1);assert.equal(calls.filter(x=>x.body?.definition).length,1);});
 await t.test('different account journal remains untouched and unsubmitted',async()=>{await fixture();localStorage.setItem(key(a,other),JSON.stringify(job(a)));const before=localStorage.getItem(key(a,other));await checkStoredMediaWatch(current(b));assert.equal(checkRuns,1);assert.equal(calls.filter(x=>x.body?.definition).length,0);assert.equal(localStorage.getItem(key(a,other)),before);});
 await t.test('session owner change while a mutation is in flight blocks the old check',async()=>{await fixture();enqueue(a);invalid.add(a);let release,entered;hold=new Promise(r=>{release=r;});const entry=new Promise(r=>{entered=r;});started=entered;const target=current(b);const check=checkStoredMediaWatch(target);await entry;state={status:'authenticated',session:{access_token:'other-token',user:{id:other}}};release();await assert.rejects(check,{code:'PERSISTENCE_UNAVAILABLE'});assert.equal(checkRuns,0);});
 await t.test('missing selected row is not made successful by unrelated-error metadata',async()=>{await fixture();const target=current(b);records=records.filter(r=>r.id!==b);enqueue(a);invalid.add(a);await assert.rejects(checkStoredMediaWatch(target),{code:'PERSISTENCE_UNAVAILABLE'});assert.equal(checkRuns,0);});
 await t.test('legacy owned Watch retains its normal save/check protocol',async()=>{await fixture();delete records[1].v3Engine;enqueue(b);await checkStoredMediaWatch(current(b));assert.equal(checkRuns,1);assert.equal(JSON.parse(localStorage.getItem(key(b))).pending,false);});
});
