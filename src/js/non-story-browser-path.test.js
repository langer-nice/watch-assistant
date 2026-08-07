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
  const element = {
    hidden: false, disabled: false, readOnly: false, value: '', textContent: '', innerHTML: '',
    className: '', classList: new FakeClassList(), dataset: {}, style: {}, scrollHeight: 48,
    children: [],
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
    replaceChildren(...children) { this.children = children; },
    append(child) { this.children.push(child); },
    contains(child) { return this.children.includes(child); },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    focus() {}, reportValidity() { return true; },
    getBoundingClientRect() { return { height: 48, top: 100 }; },
    ...overrides,
  };
  return element;
};

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('classified non-article pages use the existing advisory clarification instead of Story Review', async () => {
  const originalGlobals = Object.fromEntries(
    ['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator']
      .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const sourceUrl = 'https://www.bbc.com/';
  const form = createElement();
  const input = createElement({ value: sourceUrl });
  form.watchRequest = input;
  form.whyFollowing = createElement();
  const elements = new Map([
    ['#newWatchForm', form],
    ['#inputTypeHint', createElement({ textContent: 'URL detected', hidden: false })],
    ['#watchError', createElement()], ['#newWatchSubmit', createElement()],
    ['#newWatchSubmitLabel', createElement()], ['#urlAnalysis', createElement({ hidden: true })],
    ['#urlAnalysisProcessing', createElement({ hidden: true })], ['#urlAnalysisMessage', createElement()],
    ['#urlReview', createElement({ hidden: true })], ['#urlReviewSuccess', createElement({ hidden: true })],
    ['#urlReviewFailure', createElement({ hidden: true })], ['#urlReviewHeading', createElement()],
    ['#urlReviewTitleLabel', createElement()], ['#urlReviewSummaryLabel', createElement()],
    ['.url-review__source > span', createElement()], ['#urlReviewTitle', createElement()],
    ['#urlReviewSummary', createElement()], ['#urlReviewSummaryError', createElement({ hidden: true })],
    ['#urlReviewMonitoringScopeField', createElement({ hidden: true })],
    ['#urlReviewMonitoringScope', createElement()], ['#urlReviewSource', createElement()],
    ['#urlReviewCreate', createElement()], ['#urlReviewEdit', createElement()],
    ['#urlReviewCancel', createElement()], ['#watchOptions', createElement({ hidden: false })],
    ['#watchKeywordChips', createElement()], ['.watch-keywords__helper', createElement()],
    ['#requestClarification', createElement({ hidden: true })],
    ['#clarificationOriginal', createElement()], ['#clarificationMessage', createElement({ hidden: true })],
    ['#clarificationWarning', createElement({ hidden: true })],
    ['#clarificationSuggestion', createElement()],
    ['#clarificationSuggestionField', createElement()],
    ['#clarificationActions', createElement()],
  ]);
  const storage = createStorage();
  let currentLocation = new URL('http://localhost/new-watch.html');
  const location = {
    get href() { return currentLocation.href; },
    set href(value) { currentLocation = new URL(value, currentLocation); },
    get search() { return currentLocation.search; },
    get origin() { return currentLocation.origin; },
  };
  const windowStub = {
    location, localStorage: storage, sessionStorage: storage, parent: null, innerHeight: 800,
    history: { state: null, pushState() {}, replaceState() {} }, addEventListener() {},
    dispatchEvent() {},
    requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
    setTimeout, clearTimeout,
    getComputedStyle() {
      return { lineHeight: '20', fontSize: '16', paddingTop: '8', paddingBottom: '8',
        borderTopWidth: '1', borderBottomWidth: '1', boxSizing: 'border-box',
        minHeight: '48', maxHeight: '240' };
    },
  };
  windowStub.parent = windowStub;
  const documentStub = {
    documentElement: createElement({ lang: 'en' }), body: createElement(), activeElement: null,
    querySelector: (selector) => elements.get(selector) || null, querySelectorAll: () => [],
    addEventListener() {}, createElement: () => createElement(),
  };
  const calls = [];
  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: windowStub },
    document: { configurable: true, writable: true, value: documentStub },
    localStorage: { configurable: true, writable: true, value: storage },
    sessionStorage: { configurable: true, writable: true, value: storage },
    navigator: { configurable: true, writable: true, value: { language: 'en' } },
    fetch: { configurable: true, writable: true, value: async (path) => {
      calls.push(path);
      if (path.startsWith('/api/plan-watch')) return {
        ok: true, status: 200, json: async () => ({ strategy: 'web_search', connector: 'web_ai',
          country: null, identifier: null, confidence: 0.6, needsClarification: false,
          clarificationQuestion: null }),
      };
      if (path === '/api/page-title') return {
        ok: true, status: 200, json: async () => ({ title: 'BBC - Home',
          description: 'Top stories and navigation.', articleText: '', siteName: 'BBC',
          sourceUrl, pageType: 'homepage' }),
      };
      if (path === '/api/monitoring-source') return {
        ok: true, status: 200, json: async () => ({ monitoringSource: {
          url: 'https://feeds.example.com/bbc.xml', type: 'rss', title: 'BBC',
          discovery: 'automatic' } }),
      };
      if (path === '/api/check-watch') return {
        ok: true, status: 200, json: async () => ({
          items: [], checkedAt: '2026-08-06T12:00:00.000Z',
          source: { title: 'BBC', url: 'https://feeds.example.com/bbc.xml' },
        }),
      };
      throw new Error(`Unexpected request: ${path}`);
    } },
  });

  try {
    const { initForm } = await import(`./navigation.js?non-story=${Date.now()}`);
    initForm();
    await form.dispatch('submit');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(elements.get('#urlReview').hidden, true);
    assert.equal(elements.get('#requestClarification').hidden, false);
    assert.equal(elements.get('#clarificationOriginal').textContent, sourceUrl);
    assert.match(elements.get('#clarificationMessage').textContent, /news homepage or section/);
    assert.match(elements.get('#clarificationMessage').textContent, /very large number of unrelated updates/);
    assert.equal(elements.get('#clarificationWarning').hidden, false);
    assert.deepEqual(
      elements.get('#clarificationActions').children.map((button) => button.textContent),
      ['Edit my request', 'Create Watch anyway'],
    );
    assert.deepEqual(
      elements.get('#clarificationActions').children.map((button) => button.className),
      ['button button--primary', 'button button--secondary'],
    );
    assert.equal(elements.get('#urlReviewMonitoringScopeField').hidden, true);
    assert.equal(elements.get('#urlReviewMonitoringScope').textContent, '');
    assert.equal(elements.get('#watchKeywordChips').innerHTML, '');
    assert.equal(calls.includes('/api/watch-suggestion'), false);

    const createAnyway = elements.get('#clarificationActions').children[1];
    createAnyway.closest = () => createAnyway;
    await elements.get('#clarificationActions').dispatch('click', { target: createAnyway });
    await elements.get('#clarificationActions').dispatch('click', { target: createAnyway });
    assert.equal(calls.filter((path) => path === '/api/page-title').length, 1);
    assert.equal(calls.filter((path) => path === '/api/monitoring-source').length, 1);
    assert.equal(calls.filter((path) => path === '/api/check-watch').length, 1);
    assert.equal(elements.get('#watchError').textContent, '');
    assert.match(window.location.href, /watch-detail\.html\?id=/);
  } finally {
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
