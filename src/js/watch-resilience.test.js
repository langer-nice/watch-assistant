import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createWatchRequestGate, watchRequest } from './watch-server-resilience.js';

const storage = () => {
  const values = {};
  Object.defineProperties(values, {
    getItem: { value: k => values[k] ?? null },
    setItem: { value: (k,v) => { values[k] = String(v); } },
    removeItem: { value: k => { delete values[k]; } },
  });
  return values;
};
const tick = () => new Promise(r => setTimeout(r, 0));
const company = { id:'company', title:'Company', inputType:'company', category:'general', status:'watching' };
const media = (status = 'monitoring') => ({
  id: status === 'paused' ? '00000000-0000-4000-8000-000000000002' : '00000000-0000-4000-8000-000000000001',
  title:'Fixture', monitoring_state:status, current_status:status === 'paused' ? 'paused' : 'watching', media_revision:1,
  watch_definition:{inputType:'text', request:'Fixture mentions', mediaMention:{subjects:['Fixture'],matchMode:'all'},category:'news'},
  monitoring_source:{url:'https://fixture.example/rss',type:'feed'},
});

test('account snapshots, failure modes, explicit empty, races and bounded retries', async t => {
  const originals = { fetch:globalThis.fetch, localStorage:globalThis.localStorage, window:globalThis.window, document:globalThis.document };
  globalThis.localStorage = storage();
  globalThis.window = new EventTarget();
  t.after(() => { for (const [k,v] of Object.entries(originals)) { if(v === undefined) delete globalThis[k]; else globalThis[k]=v; } });
  let state = {status:'authenticated',session:{user:{id:'account-a'},access_token:'token-a'}};
  const listeners = new Set();
  const auth = {getState:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const switchTo = id => {state=id?{status:'authenticated',session:{user:{id},access_token:id}}:{status:'anonymous'};listeners.forEach(fn=>fn(state));};
  let mode = 'normal'; let calls = []; let release;
  globalThis.fetch = async (path, options) => {
    calls.push([path, options.method || 'GET']);
    if (mode === 'hold') await new Promise(r=>{release=r;});
    if (mode === 'timeout') throw Object.assign(new Error('Timeout'),{code:'TIMEOUT'});
    if ([500,503].includes(mode)) return Response.json({code:'DATABASE_ERROR'},{status:mode});
    if (mode === 'malformed') return Response.json({watches:[{}]});
    if (mode === 'missing') return Response.json({});
    if (options.method === 'POST') return Response.json({watch:{media_revision:2}});
    return Response.json({watches:mode === 'empty' ? [] : path.includes('company') ? [company] : [media(),media('paused')]});
  };
  const cs = await import('./company-watch-server-store.js');
  const ms = await import('./media-watch-server-store.js');
  await cs.configureCompanyWatchServerStore(auth);
  await ms.configureMediaWatchServerStore(auth);
  assert.equal(cs.getServerCompanyWatches().length,1);
  assert.equal(ms.getMediaServerWatches().length,2);
  assert.equal(cs.getCompanyWatchLoadState().status,'ready');
  for (const failure of [500,503,'timeout','malformed','missing']) {
    await t.test(`${failure} preserves both lists and watching/paused states`, async()=>{
      mode=failure;
      await assert.rejects(cs.hydrateServerCompanyWatches());
      assert.equal((await ms.synchronizeMediaWatches()).ok,false);
      assert.equal(cs.getServerCompanyWatches().length,1);
      assert.deepEqual(ms.getMediaServerWatches().map(w=>w.status),['watching','paused']);
      assert.equal(cs.getCompanyWatchLoadState().status,'stale');
      assert.equal(ms.getMediaWatchLoadState().status,'stale');
    });
  }
  mode=503;
  switchTo('account-b'); await tick(); await tick();
  assert.deepEqual(cs.getServerCompanyWatches(),[]);
  assert.deepEqual(ms.getMediaServerWatches(),[]);
  assert.equal(cs.getCompanyWatchLoadState().status,'unavailable');
  switchTo(null);
  assert.deepEqual(ms.getMediaServerWatches(),[]);
  switchTo('account-a'); await tick(); await tick();
  assert.equal(cs.getServerCompanyWatches().length,1,'restore only A cache');
  assert.equal(ms.getMediaServerWatches().length,2);
  mode='normal';
  await cs.hydrateServerCompanyWatches(); await ms.synchronizeMediaWatches();
  const owned={...ms.getMediaServerWatches()[0]};
  const edited=ms.prepareMediaWatch({...owned,title:'Local edit'},owned);
  mode=503; await tick();
  const jobKey=Object.keys(localStorage).find(k=>k.startsWith('watchAssistant.mediaSync.account-a.'));
  assert.equal(JSON.parse(localStorage.getItem(jobKey)).pending,true);
  assert.equal(ms.mergeMediaWatches([]).length,2,'an orphan journal must not hide the confirmed remote row');
  const start=calls.length;
  const results=await Promise.all([ms.synchronizeMediaWatches(),ms.synchronizeMediaWatches()]);
  assert.ok(results.every(r=>!r.ok));
  assert.equal(calls.slice(start).filter(c=>c[1]==='POST').length,1,'double submission coalesces');
  const after=calls.length;
  for(let i=0;i<20;i++) {window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));}
  await tick(); await tick();
  assert.equal(calls.length,after,'focus and reconnect respect backoff');
  mode='normal'; assert.equal((await ms.synchronizeMediaWatches()).ok,true);
  assert.equal(JSON.parse(localStorage.getItem(jobKey)).pending,false);
  ms.prepareMediaWatch({...edited,request:''},edited); await tick();
  assert.equal(JSON.parse(localStorage.getItem(jobKey)).localOnly,true);
  assert.equal(JSON.parse(localStorage.getItem(jobKey)).definition.monitoring_state,'monitoring');
  const writeCount=calls.filter(c=>c[1]==='POST').length;
  await ms.synchronizeMediaWatches();
  assert.equal(calls.filter(c=>c[1]==='POST').length,writeCount,'invalid edits never write or pause');
  mode='empty';
  await cs.hydrateServerCompanyWatches(); await ms.synchronizeMediaWatches();
  assert.deepEqual(cs.getServerCompanyWatches(),[]);
  assert.deepEqual(ms.getMediaServerWatches(),[]);
  assert.equal(ms.getMediaWatchLoadState().status,'ready');
  mode='hold';
  const old=cs.hydrateServerCompanyWatches(); await tick();
  switchTo(null); mode='normal'; release(); await assert.rejects(old,e=>e.code==='AUTH_SESSION_CHANGED');
  assert.deepEqual(cs.getServerCompanyWatches(),[],'late result after logout is discarded');
  await cs.configureCompanyWatchServerStore(null); await ms.configureMediaWatchServerStore(null);
});

test('request timeout actually aborts and releases the single flight', async t=>{
  const old=globalThis.fetch;
  t.after(()=>{globalThis.fetch=old;});
  let aborted=false;
  globalThis.fetch=(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));}));
  await assert.rejects(watchRequest('/fixture',{},5),e=>e.code==='TIMEOUT');
  assert.equal(aborted,true);
});

test('gate deduplicates work and enforces cooldown without scheduling loops',async t=>{
  const old=globalThis.localStorage;globalThis.localStorage=storage();t.after(()=>{globalThis.localStorage=old;});
  const gate=createWatchRequestGate('fixture');let calls=0;let release;
  const work=()=>{calls++;return new Promise(r=>{release=r;});};
  const a=gate('user',work);const b=gate('user',work);await tick();assert.equal(calls,1);release('ok');
  assert.deepEqual(await Promise.all([a,b]),['ok','ok']);
  await gate('user',work,{automatic:true});assert.equal(calls,1);
});

test('FR/EN notices expose status, keyboard buttons and confirmed empty',async t=>{
  const old=globalThis.document;
  globalThis.document=parseHTML('<html><body><main class="page--watches"></main></body></html>').document;
  t.after(()=>{globalThis.document=old;});
  const {renderWatchLoadNotice}=await import('./watch-load-notice.js');
  for(const lang of ['fr','en']) {
    renderWatchLoadNotice(lang,0);
    const notice=document.getElementById('watchLoadNotice');
    assert.equal(notice.getAttribute('role'),'status');
    assert.equal(notice.getAttribute('aria-live'),'polite');
    assert.equal(notice.querySelector('button').getAttribute('type'),'button');
    assert.equal(notice.querySelector('button').textContent,lang==='fr'?'Réessayer':'Try again');
  }
});
