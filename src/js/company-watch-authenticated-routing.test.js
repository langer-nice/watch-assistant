import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./test-support/json-module-loader.js', import.meta.url);

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.contains(value) : Boolean(force);
    if (enabled) this.add(value); else this.remove(value);
    return enabled;
  }
}

const createElement = (overrides = {}) => {
  const listeners = new Map();
  const attributes = new Map();
  return {
    hidden: false, disabled: false, readOnly: false, value: '', textContent: '', innerHTML: '',
    className: '', classList: new FakeClassList(), dataset: {}, style: {}, scrollHeight: 48,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    async dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        await listener({ preventDefault() {}, ...event });
      }
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    focus() {}, reportValidity() { return true; },
    getBoundingClientRect() { return { height: 48, top: 100 }; },
    ...overrides,
  };
};

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('authenticated CEMEX creation never falls back to the removed check-company route', async () => {
  const originalGlobals = Object.fromEntries(
    ['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator']
      .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const originalWarn = console.warn;
  const request = 'CEMEX GRANULATS, SIREN 552005969.';
  const form = createElement();
  const input = createElement({ value: request });
  form.watchRequest = input;
  form.whyFollowing = createElement();
  const elements = new Map([
    ['#newWatchForm', form], ['#watchError', createElement()],
    ['#newWatchSubmit', createElement()], ['#newWatchSubmitLabel', createElement()],
    ['#urlAnalysis', createElement({ hidden: true })],
    ['#urlAnalysisProcessing', createElement({ hidden: true })], ['#urlAnalysisMessage', createElement()],
    ['#urlReview', createElement({ hidden: true })], ['#urlReviewSuccess', createElement({ hidden: true })],
    ['#urlReviewFailure', createElement({ hidden: true })], ['#urlReviewHeading', createElement()],
    ['#urlReviewTitleLabel', createElement()], ['#urlReviewSummaryLabel', createElement()],
    ['.url-review__source > span', createElement()], ['#urlReviewTitle', createElement()],
    ['#urlReviewSummary', createElement()], ['#urlReviewSummaryError', createElement({ hidden: true })],
    ['#urlReviewMonitoringScopeField', createElement({ hidden: true })],
    ['#urlReviewMonitoringScope', createElement()], ['#urlReviewSource', createElement()],
    ['#urlReviewCreate', createElement()], ['#urlReviewEdit', createElement()],
    ['#urlReviewCancel', createElement()], ['#companyReviewAdministrativeStatus', createElement()],
    ['#companyReviewAdministrativeStatusBadge', createElement()],
    ['#companyReviewAdministrativeStatusDescription', createElement()],
    ['#companyReviewStatus', createElement()], ['#companyReviewStatusBadge', createElement()],
    ['#companyReviewStatusDescription', createElement()],
    ['#companyReviewStatusFollowUp', createElement()], ['#companyReviewWarning', createElement()],
    ['#companyReviewWarningTitle', createElement()], ['#companyReviewWarningCopy', createElement()],
  ]);
  const storage = createStorage();
  let currentLocation = new URL('https://preview.example/new-watch.html');
  const location = {
    get href() { return currentLocation.href; },
    set href(value) { currentLocation = new URL(value, currentLocation); },
    get search() { return currentLocation.search; },
    get origin() { return currentLocation.origin; },
  };
  const windowStub = {
    location, localStorage: storage, sessionStorage: storage, parent: null, innerHeight: 800,
    history: { state: null, pushState() {}, replaceState() {} }, addEventListener() {},
    dispatchEvent() {}, requestAnimationFrame(callback) { callback(); return 1; },
    cancelAnimationFrame() {}, setTimeout, clearTimeout,
    getComputedStyle() {
      return {
        lineHeight: '20', fontSize: '16', paddingTop: '8', paddingBottom: '8',
        borderTopWidth: '1', borderBottomWidth: '1', boxSizing: 'border-box',
        minHeight: '48', maxHeight: '240',
      };
    },
  };
  windowStub.parent = windowStub;
  const documentStub = {
    documentElement: createElement({ lang: 'fr' }), body: createElement(), activeElement: null,
    querySelector: (selector) => elements.get(selector) || null, querySelectorAll: () => [],
    addEventListener() {}, createElement: () => createElement(),
  };
  const calls = [];
  const persistedWatch = {
    id: '00000000-0000-4000-8000-00000000000c',
    inputType: 'company', title: 'CEMEX GRANULATS', createdAt: '2026-08-29T16:00:00.000Z',
    company: { siren: '552005969', name: 'CEMEX GRANULATS' },
  };

  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: windowStub },
    document: { configurable: true, writable: true, value: documentStub },
    localStorage: { configurable: true, writable: true, value: storage },
    sessionStorage: { configurable: true, writable: true, value: storage },
    navigator: { configurable: true, writable: true, value: { language: 'fr' } },
    fetch: { configurable: true, writable: true, value: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === '/api/company-watches' && !options.method) {
        return Response.json({ watches: [] });
      }
      if (path.startsWith('/api/plan-watch')) {
        return Response.json({
          strategy: 'official_company', connector: 'bodacc', country: 'FR',
          identifier: '552005969', confidence: 1, needsClarification: false,
          clarificationQuestion: null,
        });
      }
      if (path === '/api/check-company') {
        return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
      }
      if (path === '/api/company-watches' && options.method === 'POST') {
        return Response.json({ watch: persistedWatch, outcome: 'baseline' }, { status: 201 });
      }
      throw new Error(`Unexpected request: ${path}`);
    } },
  });
  console.warn = () => {};

  try {
    let authState = {
      status: 'authenticated',
      session: { access_token: 'header.payload.signature' },
    };
    let publishAuthState = null;
    const auth = {
      getState: () => authState,
      subscribe(callback) { publishAuthState = callback; return () => {}; },
    };
    const store = await import('./company-watch-server-store.js');
    await store.configureCompanyWatchServerStore(auth);

    authState = { status: 'loading', session: null };
    await publishAuthState(authState);

    const { initForm } = await import(`./navigation.js?authenticated-cemex=${Date.now()}`);
    initForm();
    await form.dispatch('submit');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(elements.get('#urlReview').hidden, false);
    await elements.get('#urlReviewCreate').dispatch('click');

    assert.deepEqual(calls.map(({ path }) => path), [
      '/api/company-watches',
      '/api/plan-watch?scope=migrated_routes',
      '/api/company-watches',
    ]);
    assert.equal(calls.some(({ path }) => path === '/api/check-company'), false);
    const createCall = calls.at(-1);
    assert.equal(createCall.options.method, 'POST');
    assert.match(createCall.options.headers.Authorization, /^Bearer /u);
    assert.deepEqual(JSON.parse(createCall.options.body), {
      siren: '552005969',
      title: 'CEMEX GRANULATS',
      request,
      summary: 'This Watch will follow relevant future reporting, including major developments and significant follow-up reporting.',
      companyName: 'CEMEX GRANULATS',
    });
    assert.equal(storage.getItem('watchAssistant.watches'), null);
    assert.match(window.location.href, /watch-detail\.html\?id=00000000-0000-4000-8000-00000000000c/u);
  } finally {
    console.warn = originalWarn;
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
