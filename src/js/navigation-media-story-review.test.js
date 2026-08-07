import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./test-support/json-module-loader.js', import.meta.url);

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }

  toggle(value, force) {
    const enabled = force === undefined ? !this.contains(value) : Boolean(force);
    if (enabled) this.add(value);
    else this.remove(value);
    return enabled;
  }
}

const createElement = (overrides = {}) => {
  const listeners = new Map();
  const attributes = new Map();
  return {
    hidden: false,
    disabled: false,
    readOnly: false,
    value: '',
    textContent: '',
    className: '',
    classList: new FakeClassList(),
    dataset: {},
    style: {},
    scrollHeight: 48,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    async dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        await listener({ preventDefault() {}, ...event });
      }
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
    reportValidity() {
      return true;
    },
    getBoundingClientRect() {
      return { height: 48, top: 100 };
    },
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

test('browser form keeps the local Media Story Review when watch-suggestion returns 503', async () => {
  const originalGlobals = Object.fromEntries(
    ['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator']
      .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const originalWarn = console.warn;
  const originalError = console.error;
  const sourceUrl = 'https://www.bbc.com/news/articles/c87ydw7xdxvo';
  const form = createElement();
  const input = createElement({ value: sourceUrl });
  const note = createElement();
  form.watchRequest = input;
  form.whyFollowing = note;

  const elements = new Map([
    ['#newWatchForm', form],
    ['#watchError', createElement()],
    ['#newWatchSubmit', createElement()],
    ['#newWatchSubmitLabel', createElement()],
    ['#urlAnalysis', createElement({ hidden: true })],
    ['#urlAnalysisProcessing', createElement({ hidden: true })],
    ['#urlAnalysisMessage', createElement()],
    ['#urlReview', createElement({ hidden: true })],
    ['#urlReviewSuccess', createElement({ hidden: true })],
    ['#urlReviewFailure', createElement({ hidden: true })],
    ['#urlReviewHeading', createElement()],
    ['#urlReviewTitleLabel', createElement()],
    ['#urlReviewSummaryLabel', createElement()],
    ['.url-review__source > span', createElement()],
    ['#urlReviewTitle', createElement()],
    ['#urlReviewSummary', createElement()],
    ['#urlReviewSummaryError', createElement({ hidden: true })],
    ['#urlReviewMonitoringScopeField', createElement({ hidden: true })],
    ['#urlReviewMonitoringScope', createElement()],
    ['#urlReviewSource', createElement()],
    ['#urlReviewCreate', createElement()],
    ['#urlReviewEdit', createElement()],
    ['#urlReviewCancel', createElement()],
  ]);
  const storage = createStorage();
  const location = new URL('http://localhost/new-watch.html');
  const windowStub = {
    location,
    localStorage: storage,
    sessionStorage: storage,
    parent: null,
    innerHeight: 800,
    history: { state: null, pushState() {}, replaceState() {} },
    addEventListener() {},
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
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
    documentElement: createElement({ lang: 'en' }),
    body: createElement(),
    activeElement: null,
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => createElement(),
  };
  const calls = [];
  const unexpectedErrors = [];
  const unhandledRejections = [];
  const recordUnhandledRejection = (reason) => unhandledRejections.push(reason);

  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: windowStub },
    document: { configurable: true, writable: true, value: documentStub },
    localStorage: { configurable: true, writable: true, value: storage },
    sessionStorage: { configurable: true, writable: true, value: storage },
    navigator: {
      configurable: true,
      writable: true,
      value: { language: 'en', globalPrivacyControl: false, doNotTrack: '1' },
    },
    fetch: {
      configurable: true,
      writable: true,
      value: async (path) => {
        calls.push(path);
        if (path.startsWith('/api/plan-watch')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              strategy: 'media_story', connector: 'media_story', country: null,
              identifier: sourceUrl, confidence: 1, needsClarification: false,
              clarificationQuestion: null,
            }),
          };
        }
        if (path === '/api/page-title') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              title: 'Brain fog and four easy ways to help fix it',
              description: 'BBC explains practical ways to manage brain fog.',
              articleText: 'Brain fog can affect concentration. The article describes practical ways to manage it.',
              siteName: 'BBC News',
              sourceUrl,
            }),
          };
        }
        if (path === '/api/monitoring-source') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              monitoringSource: {
                url: 'https://feeds.example.com/bbc-story.xml',
                type: 'rss',
                title: 'BBC story monitoring',
                discovery: 'automatic',
              },
            }),
          };
        }
        if (path === '/api/watch-suggestion') {
          return {
            ok: false,
            status: 503,
            json: async () => ({
              error: 'AI article analysis was unavailable.',
              analysisProvider: 'openai',
              analysisStatus: 'failed',
              fallbackReasonCode: 'configuration_missing',
            }),
          };
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    },
  });
  console.warn = () => {};
  console.error = (...args) => unexpectedErrors.push(args);
  process.on('unhandledRejection', recordUnhandledRejection);

  try {
    const { initForm } = await import(`./navigation.js?review-503=${Date.now()}`);
    initForm();
    await form.dispatch('submit');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(elements.get('#urlReview').hidden, false);
    assert.equal(elements.get('#urlReviewSuccess').hidden, false);
    assert.equal(elements.get('#urlReviewFailure').hidden, true);
    assert.equal(
      elements.get('#urlReviewTitle').value,
      'Brain fog and four easy ways to help fix it',
    );
    assert.ok(elements.get('#urlReviewSummary').value.trim());
    assert.equal(elements.get('#urlReviewMonitoringScopeField').hidden, false);
    assert.ok(elements.get('#urlReviewMonitoringScope').textContent.trim());
    assert.equal(elements.get('#urlReviewSource').textContent, 'BBC News');
    assert.equal(form.classList.contains('is-reviewing'), true);
    assert.deepEqual(calls, [
      '/api/plan-watch?scope=migrated_routes',
      '/api/page-title',
      '/api/watch-suggestion',
      '/api/monitoring-source',
    ]);
    assert.deepEqual(unexpectedErrors, []);
    assert.deepEqual(unhandledRejections, []);
  } finally {
    process.removeListener('unhandledRejection', recordUnhandledRejection);
    console.warn = originalWarn;
    console.error = originalError;
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
