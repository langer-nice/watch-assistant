import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { configureAccountStorage } from './account-storage.js';
import { configureCompanyWatchServerStore, hydrateServerCompanyWatches } from './company-watch-server-store.js';
import { addWatch, getWatchById, getStoredWatches } from './watch-storage.js';
register('./test-support/json-module-loader.js', import.meta.url);
const { initForm } = await import('./navigation.js');
const PRIVATE = 'PRIVATE REQUEST FOR SYNTHETIC USER A';
const NOTE = 'PRIVATE NOTE FOR SYNTHETIC USER A';
const WATCH = { id: 'synthetic-editor', title: PRIVATE, request: PRIVATE, whyFollowing: NOTE,
  inputType: 'text', category: 'general', status: 'watching', createdAt: '2026-09-16T08:00:00Z', updates: [] };
const storage = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null,
  setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) }; };
let originals, auth, document, window, redirects, requests;
const render = async (query = '?edit=synthetic-editor') => {
  ({ document, window } = parseHTML(await readFile(new URL('../../new-watch.html', import.meta.url), 'utf8')));
  globalThis.window = window; globalThis.document = document;
  globalThis.Event = window.Event; globalThis.CustomEvent = window.CustomEvent;
  globalThis.HTMLElement = window.HTMLElement;
  let url = new URL(`https://example.test/new-watch.html${query}`);
  window.location = { get href() { return url.href; }, get search() { return url.search; },
    get pathname() { return url.pathname; }, get origin() { return url.origin; },
    set href(value) { redirects.push(value); }, replace(value) { redirects.push(value); } };
  window.history = { state: null, replaceState(_state,_title,value) { url = new URL(value,url); }, pushState() {} };
  window.requestAnimationFrame = fn => { fn(); return 1; }; window.cancelAnimationFrame = () => {};
  window.matchMedia = () => ({ matches: true }); window.scrollTo = () => {};
  window.getComputedStyle = () => ({ lineHeight:'20px',fontSize:'16px',paddingTop:'0',paddingBottom:'0',borderTopWidth:'0',borderBottomWidth:'0', minHeight:'48px',maxHeight:'240px',boxSizing:'border-box' });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({height:48,top:100});
  const form = document.querySelector('#newWatchForm');
  assert.equal(form.getAttribute('autocomplete'), 'off', 'disable browser-restored drafts');
  form.watchRequest = document.querySelector('#newWatchInput'); form.whyFollowing = document.querySelector('#whyFollowingInput');
  for (const el of document.querySelectorAll('input,textarea')) {
    el.reportValidity = () => true; el.setCustomValidity = () => {};
  }
  // Match native select.value, which is getter-only in Linkedom.
  Object.defineProperty(document.querySelector('#watchCategoryInput'), 'value', { configurable:true,writable:true,value:'general' });
  initForm();
  return form;
};
test.beforeEach(() => {
  originals = Object.fromEntries(['window','document','Event','CustomEvent','HTMLElement','localStorage','sessionStorage','navigator','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language:'en'}});
  requests = []; redirects = [];
  globalThis.fetch = async (...args) => { requests.push(args); return Response.json({}); };
  let state; const listeners = new Set();
  auth = { getState:()=>state, subscribe(fn) {listeners.add(fn);return ()=>listeners.delete(fn);},
    emit(status,id) {state={status,session:id?{user:{id},access_token:`synthetic-token-${id}`}:null};listeners.forEach(fn=>fn(state));} };
  auth.emit('authenticated','synthetic-user-a'); configureAccountStorage(auth); addWatch(WATCH);
});
test.afterEach(async () => {
  await configureCompanyWatchServerStore(null);
  for (const [key,descriptor] of Object.entries(originals)) {
    if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
  }
  configureAccountStorage(null);
});
const assertCleared = () => {
  assert.equal(document.body.textContent.includes(PRIVATE),false);
  assert.equal(document.body.textContent.includes(NOTE),false);
  assert.equal([...document.querySelectorAll('input,textarea')].some(e=>e.value.includes('SYNTHETIC USER A')),false);
  assert.equal(window.location.search.includes('edit='),false);
};

test('sign-out immediately clears the saved request, private note, derived editor and edit URL', async () => {
  await render();
  assert.equal(document.querySelector('#newWatchInput').value,PRIVATE);
  assert.equal(document.querySelector('#whyFollowingInput').value,NOTE);
  auth.emit('signing-out');
  assertCleared();
  assert.equal(redirects.length,0,'wait for logout to finish before navigating');
  auth.emit('anonymous');
  assert.equal(redirects.at(-1),'new-watch.html');
});

test('A → B clears the editor, and detached submit/review actions cannot save A into B', async () => {
  const form = await render();
  const save = document.querySelector('#urlReviewCreate');
  auth.emit('authenticated','synthetic-user-b'); assertCleared();
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); save.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(getStoredWatches(),[]); assert.equal(requests.length,0);
});

test('unknown authentication and inaccessible edit URLs do not reveal or adopt a Watch', async () => {
  auth.emit('loading'); await render(); assertCleared();
  auth.emit('authenticated','synthetic-user-b');
  await render();
  assert.equal(document.body.textContent.includes(PRIVATE),false);
  assert.equal(document.querySelector('#newWatchInput')?.value || '','');
  assert.deepEqual(getStoredWatches(),[]);
});

test('same-owner refresh preserves editing, and A can reopen its own Watch after B', async () => {
  await render(); auth.emit('authenticated','synthetic-user-a');
  assert.equal(document.querySelector('#newWatchInput').value,PRIVATE);
  assert.equal(redirects.length,0);
  auth.emit('authenticated','synthetic-user-b'); assertCleared();
  auth.emit('authenticated','synthetic-user-a'); await render();
  assert.equal(document.querySelector('#whyFollowingInput').value,NOTE);
  assert.equal(getWatchById(WATCH.id).request,PRIVATE);
});

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('a delayed A planner response cannot save or repopulate the editor after B signs in', async () => {
  let resolvePlanner;
  globalThis.fetch = (...args) => {
    requests.push(args);
    return new Promise(resolve => { resolvePlanner = resolve; });
  };
  const form = await render();
  document.querySelector('#whyFollowingInput').value = `${NOTE} edited`;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.equal(requests.length, 1);
  auth.emit('authenticated', 'synthetic-user-b');
  assertCleared();
  resolvePlanner(Response.json({}));
  await settle();
  assertCleared();
  assert.deepEqual(getStoredWatches(), []);
  assert.equal(requests.length, 1, 'no follow-up API request under the new account');
  auth.emit('authenticated', 'synthetic-user-a');
  assert.equal(getWatchById(WATCH.id).whyFollowing, NOTE);
});

test('pagehide scrubs a frozen editor and persisted pageshow requires a blank restart', async () => {
  await render();
  window.dispatchEvent(new Event('pagehide'));
  assertCleared();
  auth.emit('authenticated', 'synthetic-user-b');
  const restored = new Event('pageshow');
  Object.defineProperty(restored, 'persisted', { value: true });
  window.dispatchEvent(restored);
  assertCleared();
  assert.equal(redirects.at(-1), 'new-watch.html');
  // Both reload and non-bfcache history traversal create a new document.
  await render();
  assert.equal(document.querySelector('#newWatchInput')?.value || '', '');
  assert.deepEqual(getStoredWatches(), []);
});

test('new-Watch drafts and validation/derived DOM are removed on authentication loss', async () => {
  const form = await render('');
  form.watchRequest.value = PRIVATE;
  form.whyFollowing.value = NOTE;
  document.querySelector('#watchKeywordInput').value = PRIVATE;
  document.querySelector('#watchFeedUrlInput').value = 'https://example.test/private-a';
  document.querySelector('#watchError').textContent = PRIVATE;
  auth.emit('loading');
  assertCleared();
  assert.equal(form.watchRequest.value, '');
  assert.equal(form.whyFollowing.value, '');
  assert.equal(form.watchRequest.disabled, true);
  assert.equal(redirects.length, 0);
});

test('normal same-owner editing still saves a private-note change', async () => {
  const form = await render();
  form.whyFollowing.value = `${NOTE} edited`;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  await settle();
  assert.equal(getWatchById(WATCH.id).whyFollowing, `${NOTE} edited`);
  assert.equal(getWatchById(WATCH.id).request, PRIVATE);
  assert.match(redirects.at(-1), /watch-detail\.html\?id=synthetic-editor/);
});


test('delayed server hydration from A cannot populate B, and returning A can reopen its server Watch', async () => {
  const serverWatch = { ...WATCH, id: 'synthetic-server-editor', inputType: 'company',
    company: { siren: '123456789', name: 'Synthetic company' } };
  globalThis.fetch = async () => Response.json({ watches: [serverWatch] });
  await configureCompanyWatchServerStore(auth);
  await render('?edit=synthetic-server-editor');
  assert.equal(document.querySelector('#whyFollowingInput').value, NOTE);
  let resolveHydration;
  globalThis.fetch = () => new Promise(resolve => { resolveHydration = resolve; });
  const delayed = hydrateServerCompanyWatches().catch(error => error.code);
  await Promise.resolve();
  await Promise.resolve();
  globalThis.fetch = async () => Response.json({ watches: [] });
  auth.emit('authenticated', 'synthetic-user-b');
  assertCleared();
  resolveHydration(Response.json({ watches: [serverWatch] }));
  assert.equal(await delayed, 'AUTH_SESSION_CHANGED');
  await settle();
  await render('?edit=synthetic-server-editor');
  assert.equal(document.querySelector('#newWatchInput')?.value || '', '');
  assert.equal(getWatchById(serverWatch.id), null);
  globalThis.fetch = async () => Response.json({ watches: [serverWatch] });
  auth.emit('authenticated', 'synthetic-user-a');
  await settle();
  await render('?edit=synthetic-server-editor');
  assert.equal(document.querySelector('#newWatchInput').value, PRIVATE);
  assert.equal(document.querySelector('#whyFollowingInput').value, NOTE);
});
