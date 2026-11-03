import test from 'node:test';
import assert from 'node:assert/strict';
import {configureMediaWatchServerStore, synchronizeMediaWatches, prepareMediaWatch, queueMediaWatchDeletion,
  getMediaServerWatches, getMediaPersistenceState, mergeMediaWatches, ensureMediaWatchSaved} from './media-watch-server-store.js';
import {migrateWatchModel} from './watch-model.js';
import {v3ClientProjection, sameV3Definition, isV3FormattingJob} from './v3-media-identity.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const titles=['Keep me updated on important new developments concerning protests, strikes and major social movements in France.',
  'Keep me informed of any news about Taylor Swift.','Keep me informed of the French elections.'];
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
class Storage {getItem(k){return this[k]??null;}setItem(k,v){this[k]=String(v);}removeItem(k){delete this[k];}}
const key=id=>`watchAssistant.mediaSync.${owner}.${id}`;
const makeRow=(title,i)=>({id:ids[i],user_id:owner,title,watch_definition:{inputType:'url',request:title,category:'news',
  storyProfile:{concepts:[{label:title,type:'condition'}],userAddedConcepts:[]}},monitoring_source:{type:'feed',url:'https://example.test/feed'},
  monitoring_state:'monitoring',current_status:'watching',media_revision:1,v3Engine:'wa-v3-evidence-refs.v1',
  created_at:'2026-11-01T00:00:00Z',last_checked_at:'2026-11-03T06:35:00Z'});
const formattingJob=row=>{
 const definition=v3ClientProjection(row);definition.watch_definition.storyProfile.concepts[0].label=row.title.slice(0,-1);
 return {definition,revision:1,mutation:crypto.randomUUID(),baseMutation:null,pending:true,deleted:false,operation:'saving',errorCode:'PERSISTENCE_UNAVAILABLE'};
};
test('V3 identity never becomes a legacy self-mutation; formatting journals retire without data loss',async t=>{
 const originals=Object.fromEntries(['window','localStorage','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(async()=>{await configureMediaWatchServerStore(null);for(const [k,d] of Object.entries(originals)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 let records,calls,failRead;
 const fixture=async()=>{
  await configureMediaWatchServerStore(null);globalThis.window=new EventTarget();globalThis.localStorage=new Storage();
  records=titles.map(makeRow);calls=[];failRead=false;
  globalThis.fetch=async(path,options={})=>{
   assert.equal(path,'/api/media-watches'); // No manual/scheduled check endpoint.
   const body=options.body?JSON.parse(options.body):null;calls.push(body);
   if(body){const row=records.find(r=>r.id===body.definition.id);
    const expected=v3ClientProjection(row);expected.monitoring_state=body.definition.monitoring_state;
    assert(sameV3Definition(body.definition,expected),'POST must retain exact server identity');
    row.monitoring_state=body.deleted?'paused':body.definition.monitoring_state;
    row.media_revision++;row.media_mutation_id=body.mutation;
    if(body.deleted)row.deleted_at='2026-11-03T12:00:00Z';
    return Response.json({watch:row});
   }
   return failRead?Response.json({code:'PERSISTENCE_UNAVAILABLE'},{status:503}):Response.json({watches:records});
  };
  await configureMediaWatchServerStore({getState:()=>({status:'authenticated',session:{access_token:'fixture',user:{id:owner}}}),subscribe:()=>()=>{}});calls=[];
 };
 const current=(i=0)=>getMediaServerWatches().find(w=>w.id===ids[i]);
 const read=(i=0)=>JSON.parse(localStorage.getItem(key(ids[i])));
 const settle=()=>synchronizeMediaWatches();
 for(let i=0;i<3;i++)await t.test(['France','Taylor','elections'][i]+' normalization preserves exact identity and produces no write',async()=>{
  await fixture();const watch=current(i),normalized=migrateWatchModel(watch).watch;
  assert.deepEqual(normalized.storyProfile,watch.storyProfile);
  prepareMediaWatch(normalized,watch);await settle();assert.equal(calls.filter(Boolean).length,0);assert.equal(read(i),null);
 });
 await t.test('already normalized local punctuation/whitespace creates no invalid job',async()=>{
  await fixture();const w=current();const local=structuredClone(w);local.storyProfile.concepts[0].label='  '+w.title.slice(0,-1)+'  ';
  prepareMediaWatch(local,w);await settle();assert.equal(read(),null);assert.equal(calls.filter(Boolean).length,0);
 });
 await t.test('derived presentation/provenance/status changes are not identity mutations',async()=>{
  await fixture();const w=current();prepareMediaWatch({...w,status:'attention',lastChecked:'2026-11-03T09:00:00Z',selectedKeywords:['display'],monitoringSummary:'display'},w);
  await settle();assert.equal(read(),null);assert.equal(calls.filter(Boolean).length,0);
 });
 await t.test('real instruction/title/source/concept changes rejected before queueing',async()=>{
  await fixture();const w=current();for(const change of [{request:'Something else'},{title:'Renamed'},
    {monitoringSource:{type:'feed',url:'https://other.test/feed'}},{storyProfile:{concepts:[{label:'Other',type:'condition'}],userAddedConcepts:[]}}]){
    assert.throws(()=>prepareMediaWatch({...w,...change},w),{code:'V3_IDENTITY_IMMUTABLE'});
  }assert.equal(read(),null);
 });
 await t.test('pause and resume use raw immutable identity and existing revision protocol',async()=>{
  await fixture();const w=current();prepareMediaWatch({...w,status:'paused'},w);await settle();assert.equal(read().pending,false);assert.equal(records[0].monitoring_state,'paused');
  const paused=current();prepareMediaWatch({...paused,status:'watching'},paused);await settle();assert.equal(records[0].monitoring_state,'monitoring');assert.equal(read().pending,false);
 });
 await t.test('terminal formatting job retains payload/id/error; no POST or infinite retry',async()=>{
  await fixture();const original=formattingJob(records[0]);localStorage.setItem(key(ids[0]),JSON.stringify(original));
  for(let n=0;n<3;n++)assert.equal((await settle()).ok,true);
  const terminal=read();assert.equal(terminal.pending,false);assert.equal(terminal.terminalIdentity.reason,'V3_IDENTITY_FORMATTING');
  for(const k of ['definition','mutation','revision','errorCode'])assert.deepEqual(terminal[k],original[k]);
  assert.equal(calls.filter(Boolean).length,0);assert.equal(getMediaPersistenceState(current()).status,'saved');
  assert.equal((await ensureMediaWatchSaved(current())).id,ids[0]);
 });
 await t.test('fresh failed GET cannot retire a job or pretend it was saved',async()=>{
  await fixture();localStorage.setItem(key(ids[0]),JSON.stringify(formattingJob(records[0])));failRead=true;
  assert.equal((await settle()).ok,false);assert.equal(read().pending,true);assert.equal(read().terminalIdentity,undefined);assert.equal(calls.filter(Boolean).length,0);
 });
 await t.test('valid pause after retirement preserves rejected evidence in its journal',async()=>{
  await fixture();const original=formattingJob(records[0]);localStorage.setItem(key(ids[0]),JSON.stringify(original));await settle();
  const w=current();prepareMediaWatch({...w,status:'paused'},w);await settle();
  assert.equal(read().pending,false);assert.equal(read().rejectedMutations[0].mutation,original.mutation);assert.deepEqual(read().rejectedMutations[0].definition,original.definition);
 });
 await t.test('normal result save cannot replace an ambiguous rejected draft',async()=>{
  await fixture();const original=formattingJob(records[0]);original.definition.watch_definition.request='Real unconfirmed edit';
  localStorage.setItem(key(ids[0]),JSON.stringify(original));const before=localStorage.getItem(key(ids[0]));
  prepareMediaWatch({...current(),lastChecked:'2026-11-03T09:00:00Z'},current());assert.equal(localStorage.getItem(key(ids[0])),before);
  assert.throws(()=>prepareMediaWatch({...current(),status:'paused'},current()),{code:'MEDIA_CONFLICT'});
 });
 await t.test('formatting recovery hydrates server identity/results without masking a real newer check failure',async()=>{
  await fixture();const original=formattingJob(records[0]);localStorage.setItem(key(ids[0]),JSON.stringify(original));await settle();
  const w=structuredClone(current());w.storyProfile.concepts[0].label=w.title.slice(0,-1);w.lastChecked='2026-11-02T06:35:00Z';
  const merged=mergeMediaWatches([w]).find(w=>w.id===ids[0]);assert.equal(merged.storyProfile.concepts[0].label,records[0].title);
  assert.equal(merged.lastChecked,records[0].last_checked_at);assert.equal(merged.monitoringAvailability,'saved');
  const failed={...current(),lastCheckAttempt:{status:'failed',code:'REAL_CHECK_FAILURE',attemptedAt:'2026-11-03T10:00:00Z'}};
  assert.equal(mergeMediaWatches([failed]).find(w=>w.id===ids[0]).lastCheckAttempt.code,'REAL_CHECK_FAILURE');
 });
 await t.test('explicit soft deletion retains exact identity and archived rejection',async()=>{
  await fixture();localStorage.setItem(key(ids[0]),JSON.stringify(formattingJob(records[0])));await settle();await queueMediaWatchDeletion(current());
  assert.equal(read().pending,false);assert(read().confirmedDeletedAt);assert.equal(read().rejectedMutations.length,1);
 });
 await t.test('strict recovery fences reject other owner, revision, deletion, conflict, base mutation, state or substantive edit',async()=>{
  await fixture();const r=records[0],job=formattingJob(r);assert(isV3FormattingJob(job,r,owner));
  for(const modified of [{...job,revision:2},{...job,deleted:true},{...job,conflict:true},{...job,localOnly:true},{...job,baseMutation:crypto.randomUUID()},
   {...job,definition:{...job.definition,monitoring_state:'paused'}},{...job,definition:{...job.definition,title:'Changed'}}])assert(!isV3FormattingJob(modified,r,owner));
  assert(!isV3FormattingJob(job,{...r,user_id:'other'},owner));assert(!isV3FormattingJob(job,{...r,v3Engine:undefined},owner));
 });
 await t.test('no confirmed V3 row means no fallback legacy mutation generation',async()=>{
  await fixture();const w=current();records=[];await settle();prepareMediaWatch({...w,status:'paused'},w);assert.equal(read(),null);
 });
});
