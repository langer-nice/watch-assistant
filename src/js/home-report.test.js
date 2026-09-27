import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configureAccountStorage } from './account-storage.js';
import { selectHomeReport } from './home-report.js';
import { generateReport } from './report-service.js';
import { normalizeReport, saveReport, getLatestReport } from './report-storage.js';

const owner = 'synthetic-report-owner';
const account = id => configureAccountStorage({ getState: () => ({status:'authenticated', session:{user:{id}}}) });
account(owner);
const startedAt='2026-09-27T08:00:00.000Z';
const completedAt='2026-09-27T08:01:00.000Z';
const bitcoin={id:'bitcoin',title:'Bitcoin',status:'watching',createdAt:'2026-09-22T13:48:58Z',lastChecked:completedAt,lastCheckAttempt:{status:'succeeded',outcome:'no-new-items'},updates:[]};
const reportFor = specs => normalizeReport({version:2,ownerId:owner,id:'fixture-report',startedAt,completedAt,
  watchIdsConsidered:specs.map(s=>s.id),watchIdsChecked:specs.filter(s=>s.status!=='skipped').map(s=>s.id),watchIdsSkipped:specs.filter(s=>s.status==='skipped').map(s=>s.id),
  attempts:specs.map(s=>({watchId:s.id,status:s.status||'succeeded',startedAt,completedAt,outcome:s.classification==='updated'?'matched':'no-new-items',resultIds:s.classification==='updated'?['result-1']:[]})),
  entries:specs.map(s=>({watchId:s.id,title:s.id,category:'news',classification:s.classification||'watching',attemptStatus:s.status||'succeeded',checkedAt:completedAt})),
});
const counts = result => [result.totalChecked,result.quietWatches.length];

test('no Watches and no checks produces zero in both report measures',()=>{
  assert.deepEqual(counts(selectHomeReport()),[0,0]);assert.deepEqual(counts(selectHomeReport({report:reportFor([])})),[0,0]);
});

test('Bitcoin live check without a saved report must not invent a completed report check',()=>{
  for(const report of [null,reportFor([])]){
    const result=selectHomeReport({report,serverWatches:[bitcoin],watches:[bitcoin]});
    assert.deepEqual(counts(result),[0,0]);assert.deepEqual(result.watches,[]);
  }
});

test('one Bitcoin check included in the report without change yields one above and one below',()=>{
  const report=reportFor([{id:'bitcoin'}]);const result=selectHomeReport({report,serverWatches:[bitcoin]});
  assert.deepEqual(counts(result),[1,1]);assert.equal(result.quietWatches[0].id,'bitcoin');assert.deepEqual(result.watches,[]);
});

test('one check with a change is completed but not in Everything else',()=>{
  const result=selectHomeReport({report:reportFor([{id:'bitcoin',classification:'updated'}])});
  assert.deepEqual(counts(result),[1,0]);assert.equal(result.updatedWatches.length,1);
});

test('mixed results count completed attempts; only successful quiet results enter Everything else',()=>{
  const report=reportFor([{id:'quiet'},{id:'updated',classification:'updated'},{id:'failed',status:'failed',classification:'attention'},{id:'paused',status:'skipped'},{id:'missing-source',status:'skipped',classification:'attention'}]);
  const result=selectHomeReport({report});assert.deepEqual(counts(result),[3,1]);
  assert.equal(result.attentionWatches.length,2);assert.equal(result.updatedWatches.length,1);
  assert.equal(report.counts.succeeded,2);assert.equal(report.counts.failed,1);assert.equal(report.counts.skipped,2);
});

test('a failed or skipped check cannot be counted as a quiet success even with a stale Watching entry',()=>{
  const result=selectHomeReport({report:reportFor([{id:'failed',status:'failed'},{id:'paused',status:'skipped'}])});
  assert.deepEqual(counts(result),[1,0]);
});

test('pause or deletion after the report preserves its historical results; unrelated live Watches never enter it',()=>{
  const report=reportFor([{id:'bitcoin'}]);
  for(const serverWatches of [[],[{...bitcoin,status:'paused'}],[{...bitcoin,deleted_at:completedAt}],[{id:'other',status:'watching'}]]){
    assert.deepEqual(counts(selectHomeReport({report,serverWatches})),[1,1]);
  }
});

test('cache, revalidation, and navigation inside the 15-second gate use the same detached snapshot',()=>{
  const report=reportFor([{id:'bitcoin'}]);const before=selectHomeReport({report,serverWatches:[bitcoin]});
  const cached=JSON.parse(JSON.stringify(report));
  for(const seconds of [0,1,14,15,16]){
    const result=selectHomeReport({report:cached,serverWatches:[{...bitcoin,status:'updated'},{id:'extra',status:'watching'}],now:new Date(Date.parse(completedAt)+seconds*1000)});
    assert.deepEqual(result,before);
  }
  report.attempts.length=0;report.entries[0].classification='updated';
  assert.deepEqual(counts(before),[1,1]);assert.equal(before.report.entries[0].classification,'watching');
});

test('report membership and classifications do not drift across midnight, DST, 24 hours or timezone offsets',()=>{
  const report=reportFor([{id:'bitcoin'},{id:'new',classification:'new'}]);const original=structuredClone(report);
  for(const now of ['2026-09-27T23:59:59+02:00','2026-09-28T00:00:00+02:00','2026-10-25T02:30:00+02:00','2026-10-25T02:30:00+01:00','2026-09-27T08:01:00Z','2026-09-27T10:01:00+02:00']){
    const selected=selectHomeReport({report,now:new Date(now),serverWatches:[{...bitcoin,lastChecked:'2026-10-25T10:00:00Z'}]});
    assert.deepEqual(counts(selected),[2,1]);assert.equal(selected.newlyCreatedWatches.length,1);assert.deepEqual(selected.report,original);
  }
});

test('report storage remains isolated across accounts and rejects a foreign cached report',t=>{
  const previous=globalThis.localStorage;const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  t.after(()=>{globalThis.localStorage=previous;account(owner);});account(owner);saveReport(reportFor([{id:'bitcoin'}]));
  assert.deepEqual(counts(selectHomeReport({report:getLatestReport()})),[1,1]);
  account('another-owner');assert.equal(getLatestReport(),null);assert.deepEqual(counts(selectHomeReport({report:getLatestReport(),serverWatches:[bitcoin]})),[0,0]);
  account(owner);assert.deepEqual(counts(selectHomeReport({report:getLatestReport()})),[1,1]);
});

test('generation persists the completed quiet result and selection does not reclassify it as a new live Watch',async()=>{
  let watch={...bitcoin,inputType:'text',monitoringSource:{type:'feed',url:'https://fixture.example/rss'},createdAt:startedAt};
  const report=await generateReport({watches:[watch],getWatch:()=>watch,saveWatch:(_,patch)=>(watch={...watch,...patch}),checkController:{check:async()=>({outcome:'no-new-items',matchedItems:[],watch})},clock:()=>new Date(completedAt),loadReports:()=>[],save:normalizeReport,idFactory:()=> 'fixture-generated'});
  assert.deepEqual(counts(selectHomeReport({report:normalizeReport(JSON.parse(JSON.stringify(report))),serverWatches:[watch]})),[1,1]);
});

test('FR/EN singular/plural use the same report totals and quiet subset; renderer hides an empty quiet section',async()=>{
  for(const language of ['fr','en']){
    const labels=JSON.parse(await readFile(new URL(`../locales/${language}.json`,import.meta.url),'utf8')).home;
    for(const count of [0,1,2]){
      const r=selectHomeReport({report:reportFor(Array.from({length:count},(_,i)=>({id:String(i)})))});
      assert.equal(r.totalChecked,r.quietWatches.length);
      for(const key of ['checkedAway','everythingChecked']){
        const text=labels[key][count===1?'one':'other'].replace('{count}',String(count));assert.ok(text.includes(String(count)));
      }
    }
  }
  const source=await readFile(new URL('./navigation.js',import.meta.url),'utf8');
  assert.match(source,/if \(allQuiet\) allQuiet.hidden = !hasQuietItems/);
  assert.match(source,/pluralKey\('home.checkedAway', totalChecked\)/);
  assert.match(source,/pluralKey\('home.everythingChecked', quietWatches.length\)/);
});
