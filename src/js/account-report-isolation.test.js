import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import {
  accountStorageKey, configureAccountStorage, getAccountEpoch, getAccountOwner,
  localWatchStorageKey, ACCOUNT_STORAGE_CHANGED_EVENT,
} from './account-storage.js';
import { getLatestReport, getReports, getReportsStorageKey, normalizeReport, saveReport } from './report-storage.js';
import { createAuthSession } from './auth-session.js';
import { generateReport } from './report-service.js';

register('./test-support/json-module-loader.js', import.meta.url);
const A = 'synthetic-user-a';
const B = 'synthetic-user-b';
const PRIVATE = 'PRIVATE REPORT FOR SYNTHETIC USER A';
const date = '2026-09-15T12:00:00.000Z';
const report = (ownerId = A, title = PRIVATE) => ({
  version: 2, ownerId, id: 'synthetic-report', startedAt: date, completedAt: date,
  watchIdsConsidered: ['synthetic-watch'], watchIdsChecked: ['synthetic-watch'], watchIdsSkipped: [],
  attempts: [{ watchId: 'synthetic-watch', status: 'succeeded', startedAt: date, completedAt: date }],
  entries: [{ watchId: 'synthetic-watch', classification: 'updated', title,
    updateTitle: `${title} UPDATE`, summary: `${title} SUMMARY`, checkedAt: date, attemptStatus: 'succeeded' }],
});
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const session = (id) => id ? { user: { id } } : null;
const mockAuth = (initial = { status: 'loading', session: null }) => {
  let state = initial;
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    emit(status, id) { state = { status, session: session(id) }; listeners.forEach((fn) => fn(state)); },
  };
};
let auth;
let originals;
test.beforeEach(() => {
  originals = Object.fromEntries(['localStorage', 'sessionStorage', 'window', 'document', 'Event', 'CustomEvent', 'navigator', 'fetch']
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  globalThis.window = new EventTarget();
  auth = mockAuth();
  configureAccountStorage(auth);
});
test.afterEach(() => {
  configureAccountStorage(null);
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});

test('A → sign-out → B → A preserves only each resolved owner’s reports', () => {
  assert.equal(getLatestReport(), null);
  auth.emit('authenticated', A);
  saveReport(report());
  const aKey = getReportsStorageKey();
  assert.equal(getLatestReport().entries[0].title, PRIVATE);
  auth.emit('signing-out');
  assert.equal(getLatestReport(), null);
  assert.ok(localStorage.getItem(aKey), 'owned continuity is preserved after sign-out');
  auth.emit('anonymous');
  assert.equal(getLatestReport(), null);
  auth.emit('authenticated', B);
  assert.notEqual(getReportsStorageKey(), aKey);
  assert.equal(getLatestReport(), null);
  saveReport(report(B, 'REPORT FOR SYNTHETIC USER B'));
  assert.equal(getReports().length, 1);
  assert.equal(getLatestReport().entries[0].title, 'REPORT FOR SYNTHETIC USER B');
  auth.emit('authenticated', A);
  assert.equal(getReports().length, 1);
  assert.equal(getLatestReport().entries[0].title, PRIVATE);
});

test('normalization and reads reject mismatched, absent, malformed ownership and malformed schemas', () => {
  auth.emit('authenticated', A);
  for (const invalid of [
    { ownerId: B }, { ownerId: undefined }, { ownerId: {} }, { ownerId: ['synthetic-user-a'] },
    { ownerId: '' }, { ownerId: ' synthetic-user-a' }, { ownerId: 'a@example.test' },
    { version: 1 }, { entries: {} }, { entries: [null] }, { attempts: null }, { id: '' },
  ]) {
    const rejected = { ...report(), ...invalid };
    assert.equal(normalizeReport(rejected), null);
    localStorage.setItem(getReportsStorageKey(), JSON.stringify([rejected]));
    assert.deepEqual(getReports(), []);
    assert.throws(() => saveReport(rejected), /valid report/);
  }
  auth.emit('loading');
  assert.equal(normalizeReport(report()), null);
});

test('legacy shared reports and Watch snapshots are never adopted; disposal also runs on sign-out', () => {
  const legacy = report(); delete legacy.ownerId; legacy.version = 1;
  localStorage.setItem('watchAssistant.reports.v1', JSON.stringify([legacy]));
  localStorage.setItem('watchAssistant.watches', JSON.stringify([{ title: PRIVATE }]));
  assert.equal(getLatestReport(), null);
  auth.emit('authenticated', B);
  assert.equal(localStorage.getItem('watchAssistant.reports.v1'), null);
  assert.equal(localStorage.getItem('watchAssistant.watches'), null);
  assert.equal(getLatestReport(), null);
  assert.equal(localStorage.getItem(getReportsStorageKey()), null);
  localStorage.setItem('watchAssistant.reports.v1', JSON.stringify([legacy]));
  auth.emit('signing-out');
  assert.equal(localStorage.getItem('watchAssistant.reports.v1'), null);
});

test('unknown auth clears the active view; same-owner token refresh preserves its epoch and report', () => {
  auth.emit('authenticated', A); saveReport(report());
  const epoch = getAccountEpoch();
  let invalidations = 0;
  window.addEventListener(ACCOUNT_STORAGE_CHANGED_EVENT, () => { invalidations += 1; });
  auth.emit('authenticated', A);
  assert.equal(getAccountEpoch(), epoch);
  assert.equal(invalidations, 0);
  assert.ok(getLatestReport());
  auth.emit('confirming');
  assert.equal(getLatestReport(), null);
  assert.equal(invalidations, 1);
  auth.emit('authenticated', B);
  assert.equal(getLatestReport(), null);
});

test('corruption and unavailable localStorage fail closed without uncaught storage errors', () => {
  auth.emit('authenticated', A);
  for (const value of ['{broken', 'null', '{}', '"string"']) {
    localStorage.setItem(getReportsStorageKey(), value);
    assert.deepEqual(getReports(), []);
  }
  globalThis.localStorage = { getItem() { throw new Error('unavailable'); },
    setItem() { throw new Error('unavailable'); }, removeItem() { throw new Error('unavailable'); } };
  assert.doesNotThrow(() => saveReport(report()));
  assert.deepEqual(getReports(), []);
  assert.doesNotThrow(() => auth.emit('anonymous'));
});

test('distinct synthetic account keys cannot collide and invalid identities have no key', () => {
  assert.notEqual(accountStorageKey('reports', A), accountStorageKey('reports', B));
  for (const owner of [null, undefined, {}, '', 'a.b', 'a/b', 'a b']) {
    assert.equal(accountStorageKey('reports', owner), null);
  }
});

test('local Watches and acknowledgement state are isolated; guest data cannot enter an account', async () => {
  const { addWatch, getWatches, markUpdateAsRead } = await import('./watch-storage.js');
  auth.emit('authenticated', A);
  addWatch({ id: 'synthetic-watch', title: PRIVATE, createdAt: date,
    updates: [{ id: 'synthetic-update', sourceTitle: PRIVATE, timestamp: date, status: 'new' }] });
  markUpdateAsRead('synthetic-watch', 'synthetic-update');
  assert.equal(getWatches()[0].updates[0].status, 'read');
  auth.emit('authenticated', B);
  assert.deepEqual(getWatches(), []);
  addWatch({ id: 'synthetic-watch', title: 'REPORT FOR SYNTHETIC USER B', createdAt: date });
  auth.emit('authenticated', A);
  assert.equal(getWatches()[0].title, PRIVATE);
  assert.equal(getWatches()[0].updates[0].status, 'read');
  auth.emit('anonymous');
  assert.deepEqual(getWatches(), []);
  addWatch({ id: 'guest-watch', title: 'SYNTHETIC GUEST', createdAt: date });
  const guestKey = localWatchStorageKey('watchAssistant.watches');
  auth.emit('authenticated', B);
  assert.notEqual(localWatchStorageKey('watchAssistant.watches'), guestKey);
  assert.equal(getWatches().some(({ title }) => title.includes('GUEST')), false);
});

test('a pending report cannot write provenance or report content after an account change', async () => {
  auth.emit('authenticated', A);
  const pending = deferred();
  let writes = 0;
  const watch = { id: 'synthetic-watch', title: PRIVATE, feedUrl: 'https://example.test/feed' };
  const generation = generateReport({ watches: [watch], getWatch: () => watch,
    saveWatch: () => { writes += 1; }, checkController: { check: () => pending.promise } });
  auth.emit('authenticated', B);
  pending.resolve({ matchedItems: [{ id: 'synthetic-update' }], watch, outcome: 'matching-items' });
  await assert.rejects(generation, /session has changed/);
  assert.equal(writes, 0);
  assert.deepEqual(getReports(), []);
  auth.emit('authenticated', A);
  assert.deepEqual(getReports(), []);
});

test('auth initialization cannot overwrite a newer auth event and sign-out clears before its request resolves', async () => {
  const restore = deferred(); const logout = deferred(); let emit;
  const realAuth = createAuthSession({ location: new URL('https://example.test/'), client: { auth: {
    getSession: () => restore.promise,
    onAuthStateChange: (fn) => { emit = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: () => logout.promise,
  } } });
  configureAccountStorage(realAuth);
  const ready = realAuth.initialize();
  emit('SIGNED_IN', session(B));
  restore.resolve({ data: { session: session(A) }, error: null });
  await ready;
  assert.equal(getAccountOwner(), B);
  saveReport(report(B, 'REPORT FOR SYNTHETIC USER B'));
  const signingOut = realAuth.signOut();
  assert.equal(realAuth.getState().session, null);
  assert.equal(getLatestReport(), null);
  logout.resolve({ error: null }); await signingOut;
});

test('real Home DOM removes all A text synchronously on sign-out, unknown auth and B sign-in', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const dom = parseHTML(html);
  globalThis.window = dom.window;
  globalThis.document = dom.document;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en' } });
  window.location = new URL('https://example.test/index.html?entry=navigation');
  window.history = { state: null, replaceState() {} };
  window.matchMedia = () => ({ matches: true });
  window.requestAnimationFrame = (fn) => { fn(); return 1; };
  localStorage.setItem('watchAssistant.onboardingCompleted', 'true');
  const { initApp } = await import('./navigation.js');
  auth.emit('authenticated', A); saveReport(report());
  initApp();
  assert.ok(document.body.textContent.includes(PRIVATE));
  assert.ok(document.body.textContent.includes(`${PRIVATE} SUMMARY`));
  auth.emit('signing-out');
  assert.equal(document.body.textContent.includes(PRIVATE), false);
  auth.emit('loading');
  assert.equal(document.body.textContent.includes(PRIVATE), false);
  auth.emit('authenticated', B);
  assert.equal(document.body.textContent.includes(PRIVATE), false);
  assert.equal(document.querySelector('#homeUpdatedCount').textContent, '0');
  assert.equal(document.querySelector('#homeEmptyState').hidden, false);
  saveReport(report(B, 'REPORT FOR SYNTHETIC USER B'));
  assert.ok(document.body.textContent.includes('REPORT FOR SYNTHETIC USER B'));
  assert.equal(document.body.textContent.includes(PRIVATE), false);
  window.dispatchEvent(new Event('storage'));
  assert.equal(document.body.textContent.includes(PRIVATE), false);
  auth.emit('authenticated', A);
  assert.ok(document.body.textContent.includes(PRIVATE));
  assert.equal(document.body.textContent.includes('REPORT FOR SYNTHETIC USER B'), false);
});


test('late Company responses cannot repopulate the next account’s hydrated cache', async () => {
  const store = await import('./company-watch-server-store.js');
  const pending = deferred();
  globalThis.fetch = async (_path, options = {}) => options.method === 'POST'
    ? pending.promise : Response.json({ watches: [] });
  auth.emit('authenticated', A);
  // The server adapter requires a token; this fixture never leaves the mocked fetch.
  const serverAuth = mockAuth({ status: 'authenticated', session: { ...session(A), access_token: 'synthetic-token-a' } });
  const source = {
    getState: () => {
      const state = serverAuth.getState();
      return { ...state, session: state.session ? { ...state.session, access_token: 'synthetic-token' } : null };
    },
    subscribe: (fn) => serverAuth.subscribe(() => fn(source.getState())),
  };
  await store.configureCompanyWatchServerStore(source);
  const saving = store.createServerCompanyWatch({ title: PRIVATE, company: { siren: '000000000' } });
  serverAuth.emit('authenticated', B);
  pending.resolve(Response.json({ watch: { id: 'synthetic-company', inputType: 'company', title: PRIVATE } }));
  await assert.rejects(saving, { code: 'AUTH_SESSION_CHANGED' });
  assert.deepEqual(store.getServerCompanyWatches(), []);
  await store.configureCompanyWatchServerStore(null);
});
