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
    focus() {}, setSelectionRange() {}, reportValidity() { return true; },
    getBoundingClientRect() { return { height: 48, top: 100 }; },
    ...overrides,
  };
};

const createStorage = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const withBrowserForm = async ({ request, language = 'en', fetchImpl }, assertion) => {
  const originalGlobals = Object.fromEntries(
    ['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator']
      .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
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
    ['#urlReviewCancel', createElement()], ['#watchOptions', createElement({ hidden: false })],
    ['#watchKeywordChips', createElement()], ['.watch-keywords__helper', createElement()],
    ['#requestClarification', createElement({ hidden: true })],
    ['#requestClarificationTitle', createElement()], ['#requestClarificationIntro', createElement()],
    ['#clarificationOriginal', createElement()], ['#clarificationMessage', createElement({ hidden: true })],
    ['#clarificationWarning', createElement({ hidden: true })],
    ['#clarificationSuggestion', createElement()], ['#clarificationSuggestionField', createElement()],
    ['#clarificationActions', createElement()],
  ]);
  const storage = createStorage();
  storage.setItem('watchAssistant.language', language);
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
    dispatchEvent() {}, requestAnimationFrame(callback) { callback(); return 1; },
    cancelAnimationFrame() {}, setTimeout, clearTimeout,
    getComputedStyle() {
      return { lineHeight: '20', fontSize: '16', paddingTop: '8', paddingBottom: '8',
        borderTopWidth: '1', borderBottomWidth: '1', boxSizing: 'border-box',
        minHeight: '48', maxHeight: '240' };
    },
  };
  windowStub.parent = windowStub;
  const documentStub = {
    documentElement: createElement({ lang: language }), body: createElement(), activeElement: null,
    querySelector: (selector) => elements.get(selector) || null, querySelectorAll: () => [],
    addEventListener() {}, dispatchEvent() {}, createElement: () => createElement(),
  };
  const calls = [];
  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: windowStub },
    document: { configurable: true, writable: true, value: documentStub },
    localStorage: { configurable: true, writable: true, value: storage },
    sessionStorage: { configurable: true, writable: true, value: storage },
    navigator: { configurable: true, writable: true, value: { language } },
    fetch: { configurable: true, writable: true, value: async (path, options) => {
      calls.push({ path, options });
      return fetchImpl(path, options);
    } },
  });

  try {
    const { initializeLanguage } = await import('./i18n.js');
    initializeLanguage();
    const { initForm } = await import(`./navigation.js?routing-clarification=${Date.now()}-${Math.random()}`);
    initForm();
    await form.dispatch('submit');
    await new Promise((resolve) => setImmediate(resolve));
    await assertion({ elements, form, input, calls, storage, window: windowStub });
  } finally {
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
};

for (const language of ['en', 'fr']) {
  test(`BBC Live reaches Media Story Review in ${language} without generic routing`, async () => {
    const sourceUrl = 'https://www.bbc.com/news/live/cvgjnz67ymzt';
    await withBrowserForm({
      request: sourceUrl,
      language,
      fetchImpl: async (path) => {
        if (path.startsWith('/api/plan-watch')) return {
          ok: true, json: async () => ({ strategy: 'media_story', connector: 'media_story',
            country: null, identifier: sourceUrl, confidence: 0.9,
            needsClarification: false, clarificationQuestion: null }),
        };
        if (path === '/api/page-title') return {
          ok: true, json: async () => ({ title: 'BBC Live: Major event updates',
            description: 'Live reporting and verified updates from the BBC.',
            articleText: 'The BBC is reporting live updates as the event develops.',
            siteName: 'BBC News', sourceUrl, pageType: 'live_page',
            jsonLdTypes: ['LiveBlogPosting'] }),
        };
        if (path === '/api/watch-suggestion') return { ok: false, status: 503, json: async () => ({}) };
        if (path === '/api/monitoring-source') return {
          ok: true, json: async () => ({ monitoringSource: {
            url: 'https://feeds.example.com/bbc-live.xml', type: 'rss', title: 'BBC Live',
            discovery: 'automatic' } }),
        };
        throw new Error(`Unexpected request: ${path}`);
      },
    }, async ({ elements, form, calls }) => {
      assert.equal(elements.get('#urlReview').hidden, false);
      assert.equal(elements.get('#urlReviewSuccess').hidden, false);
      assert.equal(elements.get('#requestClarification').hidden, true);
      assert.equal(form.classList.contains('is-reviewing'), true);
      assert.deepEqual(calls.map(({ path }) => path), [
        '/api/plan-watch?scope=migrated_routes',
        '/api/page-title',
        '/api/watch-suggestion',
        '/api/monitoring-source',
      ]);
    });
  });
}

for (const language of ['en', 'fr']) {
  test(`complete flight-price request shows a localized capability limitation in ${language}`, async () => {
    const request = 'Monitor easyJet one-way flights from Nice to London in August 2026 under €150';
    await withBrowserForm({
      request,
      language,
      fetchImpl: async (path) => {
        if (path.startsWith('/api/plan-watch')) return {
          ok: true, json: async () => ({ strategy: 'web_search', connector: 'web_ai',
            country: null, identifier: null, confidence: 0.5,
            needsClarification: false, clarificationQuestion: null }),
        };
        throw new Error(`Unexpected request: ${path}`);
      },
    }, async ({ elements, calls, input }) => {
      assert.equal(elements.get('#requestClarification').hidden, false);
      assert.equal(elements.get('#clarificationOriginal').textContent, request);
      assert.doesNotMatch(elements.get('#clarificationMessage').textContent, /add more detail|plus de détails/i);
      assert.match(elements.get('#clarificationMessage').textContent, language === 'fr'
        ? /surveillance automatique des prix de vols.*n’est pas disponible/iu
        : /flight-price monitoring.*not currently available/iu);
      assert.match(elements.get('#clarificationMessage').textContent, /easyJet.*Nice.*London.*2026.*€150/u);
      assert.deepEqual(elements.get('#clarificationActions').children.map((button) => button.textContent), [
        language === 'fr' ? 'Modifier ma demande' : 'Edit my request',
      ]);
      assert.deepEqual(
        calls.map(({ path }) => path),
        ['/api/plan-watch?scope=migrated_routes'],
      );

      const edit = elements.get('#clarificationActions').children[0];
      edit.closest = () => edit;
      await elements.get('#clarificationActions').dispatch('click', { target: edit });
      assert.equal(input.value, request);
      assert.equal(elements.get('#requestClarification').hidden, true);
    });
  });
}

test('Create as written surfaces source failure, preserves input, and resets for retry', async () => {
  const request = 'sdfqs';
  await withBrowserForm({
    request,
    fetchImpl: async (path) => {
      if (path.startsWith('/api/plan-watch')) return {
        ok: true, json: async () => ({ strategy: 'web_search', connector: 'web_ai',
          country: null, identifier: null, confidence: 0.5,
          needsClarification: false, clarificationQuestion: null }),
      };
      if (path === '/api/request-clarification') return {
        ok: true, json: async () => ({ type: 'clarification_required', needsClarification: true,
          suggestedRequest: '', clarificationMessage: 'What does “sdfqs” refer to?' }),
      };
      if (path === '/api/monitoring-source') return {
        ok: false, status: 422, json: async () => ({ code: 'NO_COMPATIBLE_SOURCE' }),
      };
      throw new Error(`Unexpected request: ${path}`);
    },
  }, async ({ elements, input, calls, storage, form }) => {
    const create = elements.get('#clarificationActions').children[1];
    create.closest = () => create;
    await elements.get('#clarificationActions').dispatch('click', { target: create });

    assert.equal(elements.get('#requestClarification').hidden, false);
    assert.match(elements.get('#clarificationMessage').textContent, /couldn’t find a monitoring source/iu);
    assert.equal(elements.get('#clarificationOriginal').textContent, request);
    assert.deepEqual(elements.get('#clarificationActions').children.map((button) => button.textContent), [
      'Edit my request',
    ]);
    assert.equal(storage.getItem('watchAssistant.watches'), null);
    assert.equal(calls.filter(({ path }) => path === '/api/check-watch').length, 0);

    const edit = elements.get('#clarificationActions').children[0];
    edit.closest = () => edit;
    await elements.get('#clarificationActions').dispatch('click', { target: edit });
    assert.equal(input.value, request);
    assert.equal(form.classList.contains('is-clarifying'), false);

    await form.dispatch('submit');
    assert.equal(calls.filter(({ path }) => path === '/api/request-clarification').length, 2);
  });
});

for (const fixture of [
  {
    language: 'en',
    request: 'Tell me when Elon Musk and Tesla are mentioned in the media',
    query: 'Elon Musk and Tesla',
    title: 'Elon Musk and Tesla media mentions',
    clarificationMessage: 'Should the Watch alert you when a media item mentions both Elon Musk and Tesla, or when either one is mentioned?',
  },
  {
    language: 'fr',
    request: 'Dis-moi quand Elon Musk et Tesla sont mentionnés dans les médias',
    query: 'Elon Musk et Tesla',
    title: 'Elon Musk et Tesla dans les médias',
    clarificationMessage: 'La Watch doit-elle vous alerter lorsque les deux sujets sont mentionnés, ou lorsqu’un seul est mentionné ?',
  },
]) {
  test(`resolved ${fixture.language} media co-occurrence bypasses contradictory clarification`, async () => {
    const sourceUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(fixture.query)}`;
    await withBrowserForm({
      request: fixture.request,
      language: fixture.language,
      fetchImpl: async (path) => {
        if (path.startsWith('/api/plan-watch')) return {
          ok: true,
          json: async () => ({
            strategy: 'web_search', connector: 'web_ai', country: null, identifier: null,
            confidence: 0.5, needsClarification: false, clarificationQuestion: null,
          }),
        };
        if (path === '/api/request-clarification') return {
          ok: true,
          json: async () => ({
            resultType: 'clarification_required',
            suggestedRequest: '',
            clarificationMessage: fixture.clarificationMessage,
          }),
        };
        if (path === '/api/monitoring-source') return {
          ok: true,
          json: async () => ({ monitoringSource: {
            url: sourceUrl,
            type: 'rss',
            title: `${fixture.query} - Google News`,
            discovery: 'news-search',
            query: fixture.query,
          } }),
        };
        if (path === '/api/check-watch') return {
          ok: true,
          json: async () => ({
            checkedAt: '2026-08-11T10:00:00.000Z',
            source: { title: `${fixture.query} - Google News`, url: sourceUrl },
            items: [],
          }),
        };
        throw new Error(`Unexpected request: ${path}`);
      },
    }, async ({ elements, calls, storage, window }) => {
      assert.equal(elements.get('#requestClarification').hidden, true);
      assert.doesNotMatch(
        elements.get('#clarificationMessage').textContent,
        /both|either|les deux|un seul/iu,
      );
      assert.equal(calls.some(({ path }) => path === '/api/request-clarification'), false);
      assert.match(elements.get('#watchKeywordChips').innerHTML, /Elon Musk/u);
      assert.match(elements.get('#watchKeywordChips').innerHTML, /Tesla/u);

      const watches = JSON.parse(storage.getItem('watchAssistant.watches') || '[]');
      assert.equal(watches.length, 1);
      assert.equal(watches[0].request, fixture.request);
      assert.equal(watches[0].title, fixture.title);
      assert.equal(watches[0].category, 'news');
      assert.deepEqual(watches[0].storyProfile.concepts.map(({ label }) => label), [
        'Elon Musk',
        'Tesla',
      ]);
      assert.deepEqual(watches[0].mediaMention, {
        subjects: ['Elon Musk', 'Tesla'],
        matchMode: 'all',
      });
      assert.equal(watches[0].monitoringSource.type, 'rss');
      assert.equal(watches[0].monitoringSource.discovery, 'news-search');
      assert.equal(watches[0].monitoringSource.query, fixture.query);
      assert.equal(watches[0].monitoringSnapshot.itemIds.length, 0);
      assert.equal(watches[0].updates.length, 0);
      assert.match(window.location.href, /watch-detail\.html\?id=/u);
    });
  });
}

for (const request of [
  'Tell me when Elon Musk or Tesla is mentioned in the media.',
  'Tell me when Elon Musk and maybe Tesla are mentioned in the media.',
  'Tell me when they are mentioned in the media.',
]) {
  test(`ambiguous media request still enters clarification: ${request}`, async () => {
    await withBrowserForm({
      request,
      fetchImpl: async (path) => {
        if (path.startsWith('/api/plan-watch')) return {
          ok: true,
          json: async () => ({
            strategy: 'web_search', connector: 'web_ai', country: null, identifier: null,
            confidence: 0.5, needsClarification: false, clarificationQuestion: null,
          }),
        };
        if (path === '/api/request-clarification') return {
          ok: true,
          json: async () => ({
            resultType: 'clarification_required',
            suggestedRequest: '',
            clarificationMessage: 'What exact monitoring condition should this Watch use?',
          }),
        };
        throw new Error(`Unexpected request: ${path}`);
      },
    }, async ({ elements, calls, storage }) => {
      assert.equal(elements.get('#requestClarification').hidden, false);
      assert.equal(
        elements.get('#clarificationMessage').textContent,
        'What exact monitoring condition should this Watch use?',
      );
      assert.deepEqual(calls.map(({ path }) => path), [
        '/api/plan-watch?scope=migrated_routes',
        '/api/request-clarification',
      ]);
      assert.equal(storage.getItem('watchAssistant.watches'), null);
    });
  });
}
