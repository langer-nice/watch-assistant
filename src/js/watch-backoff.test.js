import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { accountStorageKey } from './account-storage.js';
import { writeWatchCache } from './watch-server-resilience.js';
import * as company from './company-watch-server-store.js';
import * as media from './media-watch-server-store.js';
import { renderWatchLoadNotice, getWatchListAvailability } from './watch-load-notice.js';

const row = title => ({ id:'00000000-0000-4000-8000-000000000001', title,
  monitoring_state:'monitoring', current_status:'watching', media_revision:1,
  watch_definition:{inputType:'text',request:'Fixture mentions',mediaMention:{subjects:['Fixture'],matchMode:'all'},category:'news'},
  monitoring_source:{url:'https://fixture.example/rss',type:'feed'},
});
const flush = async () => { for(let i=0;i<60;i++) await Promise.resolve(); };
const setup = async t => {
  await company.configureCompanyWatchServerStore(null); await media.configureMediaWatchServerStore(null);
  const originals = Object.fromEntries(['localStorage','window','document','fetch','setTimeout','clearTimeout'].map(k=>[k,globalThis[k]]));
  const dateNow=Date.now;let now=100000;let seq=0;const timers=new Map();const values={};
  Object.defineProperties(values,{getItem:{value:k=>values[k]??null},setItem:{value:(k,v)=>{values[k]=String(v);}},removeItem:{value:k=>delete values[k]}});
  globalThis.localStorage=values;
  globalThis.window=new EventTarget();
  Date.now=()=>now;
  globalThis.setTimeout=(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:now+ms});return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const advance=async ms=>{const end=now+ms;await flush();while(true){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();};
  let state;let mode='ok';let title='Fresh';const listeners=new Set();const calls=[];
  const auth={getState:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const setAccount=id=>{state={status:'authenticated',session:{user:{id},access_token:`fixture-${id}`}};};setAccount('a');
  globalThis.fetch=async(path,options={})=>{
    assert.equal(options.method||'GET','GET','deferred refresh must never replay mutations');
    calls.push({path,token:options.headers.Authorization,at:now});
    if(mode==='timeout')return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
    if(mode==='network')throw new TypeError('Failed to fetch');
    if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,7000));
    if(typeof mode==='number')return Response.json({code:mode===401?'AUTH_REQUIRED':'DATABASE_ERROR'},{status:mode});
    return Response.json({watches:path.includes('company')?[]:[row(title)]});
  };
  const seed=(owner='a',cache=true)=>{for(const kind of ['company','media']){if(cache)writeWatchCache(kind,owner,kind==='company'?[]:[row(`Cache ${owner}`)]);localStorage.setItem(accountStorageKey(`watchAssistant.request.${kind}.v1`,owner),JSON.stringify({startedAt:now-1,nextAt:now+15000}));}};
  const configure=()=>Promise.all([company.configureCompanyWatchServerStore(auth),media.configureMediaWatchServerStore(auth)]);
  const switchAccount=async id=>{setAccount(id);listeners.forEach(fn=>fn(state));await flush();};
  const notices=(hidden,retry,count=1)=>{for(const page of ['home','watches','detail'])for(const language of ['fr','en']){
    globalThis.document=parseHTML(`<main class="page--${page}"><header>Unchanged</header></main>`).document;
    renderWatchLoadNotice(language,count);const n=document.getElementById('watchLoadNotice');
    assert.equal(n.hidden,hidden,`${page}/${language} visibility`);assert.equal(n.querySelector('button').hidden,!retry,`${page}/${language} retry`);
    if(retry)assert.match(n.textContent,language==='fr'?/Impossible de charger.*Réessayer/:/couldn’t load.*Try again/);
    assert.equal(document.querySelector('header').textContent,'Unchanged');
  }};
  t.after(async()=>{await company.configureCompanyWatchServerStore(null);await media.configureMediaWatchServerStore(null);Date.now=dateNow;for(const [k,v]of Object.entries(originals)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
  return {calls,seed,configure,advance,switchAccount,notices,setMode:v=>{mode=v;},setTitle:v=>{title=v;}};
};

test('rapid navigation: cached data stays usable, no notice on all three pages in FR/EN, one silent deferred read',async t=>{
  const h=await setup(t);h.seed();await h.configure();
  assert.equal(media.getMediaServerWatches()[0].title,'Cache a');assert.equal(getWatchListAvailability().uncertain,false);h.notices(true,false);
  for(let i=0;i<20;i++)await Promise.all([company.hydrateServerCompanyWatches({automatic:true}),media.synchronizeMediaWatches({automatic:true,readOnly:true})]);
  await h.advance(14999);assert.equal(h.calls.length,0);h.notices(true,false);
  await h.advance(1);assert.equal(h.calls.length,2);assert.equal(media.getMediaServerWatches()[0].title,'Fresh');h.notices(true,false);
  await h.advance(300000);assert.equal(h.calls.length,2,'success does not start a polling loop');
});

for(const failure of [503,401,'network','timeout'])test(`deferred ${failure} is terminal and visible even with valid cache`,async t=>{
  const h=await setup(t);h.seed();h.setMode(failure);await h.configure();h.notices(true,false);
  await h.advance(failure==='timeout'?23000:15000);assert.equal(h.calls.length,2);h.notices(false,true);
  assert.equal(media.getMediaServerWatches()[0].title,'Cache a');
  assert.equal(media.getMediaWatchLoadState().error.code,failure==='timeout'?'TIMEOUT':failure===401?'AUTH_REQUIRED':failure===503?'DATABASE_ERROR':undefined);
  await h.advance(300000);assert.equal(h.calls.length,2,'failure is not automatically retried');
});

test('first load without cache shows loading, not an error or retry, then data',async t=>{
  const h=await setup(t);h.setMode('slow');const pending=h.configure();await flush();h.notices(false,false,0);
  assert.equal(getWatchListAvailability().failed,false);await h.advance(7000);await pending;h.notices(true,false);assert.equal(h.calls.length,2);
});

test('no cache during cooldown: no false error, final real failure exposes retry',async t=>{
  const h=await setup(t);h.seed('a',false);h.setMode(503);await h.configure();h.notices(true,false,0);
  await h.advance(15000);h.notices(false,true,0);assert.equal(media.getMediaWatchLoadState().status,'unavailable');
});

test('successful slow 200 after cached cooldown remains silent while refreshing',async t=>{
  const h=await setup(t);h.seed();h.setMode('slow');await h.configure();await h.advance(15000);h.notices(true,false);
  await h.advance(6999);h.notices(true,false);await h.advance(1);h.notices(true,false);assert.equal(media.getMediaServerWatches()[0].title,'Fresh');assert.equal(h.calls.length,2);
});

test('account change cancels old deferred reads and never displays another account cache',async t=>{
  const h=await setup(t);h.seed();await h.configure();h.setMode('slow');await h.switchAccount('b');
  assert.deepEqual(media.getMediaServerWatches(),[]);await h.advance(7000);assert.equal(media.getMediaServerWatches()[0].title,'Fresh');
  await h.advance(20000);assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>c.token==='Bearer fixture-b'));
});

test('an explicit read supersedes a pending automatic refresh without a duplicate timer request',async t=>{
  const h=await setup(t);h.seed();await h.configure();
  await Promise.all([company.hydrateServerCompanyWatches(),media.synchronizeMediaWatches({readOnly:true})]);assert.equal(h.calls.length,2);
  await h.advance(300000);assert.equal(h.calls.length,2);h.notices(true,false);
});


test('deferred refresh never replays a pending media mutation',async t=>{
  const h=await setup(t);h.seed();
  const key='watchAssistant.mediaSync.a.00000000-0000-4000-8000-000000000001';
  localStorage.setItem(key,JSON.stringify({pending:true,revision:1,mutation:'fixture-mutation',definition:{...row('Pending').watch_definition,id:row('').id}}));
  await h.configure();await h.advance(15000);
  assert.equal(h.calls.length,2);assert.equal(JSON.parse(localStorage.getItem(key)).pending,true);
});

test('immediate server failure without any cache remains visible and is not retried',async t=>{
  const h=await setup(t);h.setMode(503);await h.configure();h.notices(false,true,0);
  await h.advance(300000);assert.equal(h.calls.length,2);
});
