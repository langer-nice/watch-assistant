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
  return {
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
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
    setAttribute() {}, getAttribute() { return null; },
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

const stories = {
  carol: {
    url: 'https://www.bbc.com/travel/article/20260612-the-snake-rearing-84-year-old-who-lives-on-a-remote-barrier-island',
    title: 'The snake-rearing 84-year-old who lives on a remote barrier island',
    description: 'Carol Ruckdeschel protects Cumberland Island.',
    articleText: 'Carol Ruckdeschel rears snakes and lives off-grid on Cumberland Island.',
    concepts: [
      { label: 'Carol Ruckdeschel', type: 'person' },
      { label: 'Cumberland Island conservation', type: 'phenomenon' },
    ],
  },
  rwe: {
    url: 'https://www.bbc.com/news/articles/c1e1vg0gjl5o',
    title: 'RWE agrees to abandon US offshore wind projects',
    description: 'RWE reached an agreement concerning US offshore wind projects.',
    articleText: 'RWE agreed to abandon US offshore wind projects under a Trump administration policy.',
    concepts: [
      { label: 'RWE', type: 'organization' },
      { label: 'RWE agreement to abandon US offshore wind projects', type: 'event' },
    ],
  },
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

const runRace = async (firstKey, secondKey) => {
  const originalGlobals = Object.fromEntries(
    ['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator']
      .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const originalWarn = console.warn;
  const originalError = console.error;
  const form = createElement();
  const input = createElement({ value: stories[firstKey].url });
  form.watchRequest = input;
  form.whyFollowing = createElement();
  const elements = new Map([
    ['#newWatchForm', form], ['#watchError', createElement()],
    ['#newWatchSubmit', createElement()], ['#newWatchSubmitLabel', createElement()],
    ['#urlAnalysis', createElement({ hidden: true })],
    ['#urlAnalysisProcessing', createElement({ hidden: true })], ['#urlAnalysisMessage', createElement()],
    ['#urlReview', createElement({ hidden: true })],
    ['#urlReviewSuccess', createElement({ hidden: true })],
    ['#urlReviewFailure', createElement({ hidden: true })],
    ['#urlReviewHeading', createElement()], ['#urlReviewTitleLabel', createElement()],
    ['#urlReviewSummaryLabel', createElement()], ['.url-review__source > span', createElement()],
    ['#urlReviewTitle', createElement()], ['#urlReviewSummary', createElement()],
    ['#urlReviewSummaryError', createElement({ hidden: true })],
    ['#urlReviewMonitoringScopeField', createElement({ hidden: true })],
    ['#urlReviewMonitoringScope', createElement()], ['#urlReviewSource', createElement()],
    ['#urlReviewCreate', createElement()], ['#urlReviewEdit', createElement()],
    ['#urlReviewCancel', createElement()], ['#watchKeywordChips', createElement()],
    ['#watchKeywordInput', createElement()], ['#watchKeywordAdd', createElement()],
    ['#watchCategoryInput', createElement()], ['#watchFeedUrlInput', createElement()],
  ]);
  const storage = createStorage();
  const windowStub = {
    location: new URL('http://localhost/new-watch.html'), localStorage: storage,
    sessionStorage: storage, parent: null, innerHeight: 800,
    history: { state: null, pushState() {}, replaceState() {} },
    addEventListener() {}, dispatchEvent() {},
    requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
    setTimeout, clearTimeout,
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
    documentElement: createElement({ lang: 'en' }), body: createElement(), activeElement: null,
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: () => [], addEventListener() {}, createElement: () => createElement(),
  };
  let releaseFirst;
  const delayedFirst = new Promise((resolve) => { releaseFirst = resolve; });
  const requests = [];
  const getStoryByUrl = (url) => Object.values(stories).find((story) => story.url === url);
  const getStoryByTitle = (title) => Object.values(stories).find((story) => story.title === title);
  const suggestionResponse = (story) => ({
    ok: true,
    status: 200,
    json: async () => ({
      concepts: story.concepts.map((concept) => ({ ...concept, reason: 'Central evidence' })),
      confidence: 0.98,
      analysisProvider: 'openai', analysisStatus: 'success', analysisModel: 'gpt-5.6-luna',
    }),
  });

  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: windowStub },
    document: { configurable: true, writable: true, value: documentStub },
    localStorage: { configurable: true, writable: true, value: storage },
    sessionStorage: { configurable: true, writable: true, value: storage },
    navigator: {
      configurable: true, writable: true,
      value: { language: 'en', globalPrivacyControl: false, doNotTrack: '1' },
    },
    fetch: {
      configurable: true,
      writable: true,
      value: async (path, options = {}) => {
        const body = options.body ? JSON.parse(options.body) : {};
        requests.push({ path, body });
        if (path.startsWith('/api/plan-watch')) {
          return {
            ok: true, status: 200,
            json: async () => ({
              strategy: 'media_story', connector: 'media_story', country: null,
              identifier: input.value, confidence: 1, needsClarification: false,
              clarificationQuestion: null,
            }),
          };
        }
        if (path === '/api/page-title') {
          const story = getStoryByUrl(body.url);
          return {
            ok: true, status: 200,
            json: async () => ({ ...story, siteName: 'BBC', sourceUrl: story.url, pageType: 'article' }),
          };
        }
        if (path === '/api/watch-suggestion') {
          const story = getStoryByTitle(body.title);
          return story === stories[firstKey] ? delayedFirst : suggestionResponse(story);
        }
        if (path === '/api/monitoring-source') {
          return {
            ok: true, status: 200,
            json: async () => ({
              monitoringSource: {
                url: 'https://feeds.example.com/story.xml', type: 'rss',
                title: 'Story monitoring', discovery: 'automatic',
              },
            }),
          };
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    },
  });
  console.warn = () => {};
  console.error = () => {};

  try {
    const { initForm } = await import(`./navigation.js?cross-race=${firstKey}-${Date.now()}`);
    initForm();
    await form.dispatch('submit');
    await tick();
    assert.equal(elements.get('#urlReviewTitle').value, stories[firstKey].title);

    await elements.get('#urlReviewCancel').dispatch('click');
    input.value = stories[secondKey].url;
    await form.dispatch('submit');
    await tick();
    await tick();
    assert.equal(elements.get('#urlReviewTitle').value, stories[secondKey].title);
    assert.match(elements.get('#watchKeywordChips').innerHTML, new RegExp(stories[secondKey].concepts[0].label));

    releaseFirst(suggestionResponse(stories[firstKey]));
    await tick();
    await tick();
    assert.equal(elements.get('#urlReviewTitle').value, stories[secondKey].title);
    assert.match(elements.get('#watchKeywordChips').innerHTML, new RegExp(stories[secondKey].concepts[0].label));
    assert.doesNotMatch(elements.get('#watchKeywordChips').innerHTML, new RegExp(stories[firstKey].concepts[0].label));
    assert.deepEqual(
      requests.filter(({ path }) => path === '/api/page-title').map(({ body }) => body.url),
      [stories[firstKey].url, stories[secondKey].url],
    );
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
};

test('late Carol enhancement cannot overwrite a newer RWE Review', async () => {
  await runRace('carol', 'rwe');
});

test('late RWE enhancement cannot overwrite a newer Carol Review', async () => {
  await runRace('rwe', 'carol');
});
