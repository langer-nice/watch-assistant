import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';
import { parseHTML } from 'linkedom';

register('./test-support/json-module-loader.js', import.meta.url);

const { getLanguage, setLanguage } = await import('./i18n.js');
const { initTopNavigation } = await import('./top-navigation.js');

const PREVIEW_ENV = { DEV: false, VITE_VERCEL_ENV: 'preview' };
const PRODUCTION_ENV = { DEV: false, VITE_VERCEL_ENV: 'production' };

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
};

// Linkedom currently treats digits in data-* names as a word boundary, so
// `data-i18n` cannot be read through dataset.i18n. Keep the production code on
// the native DOM API and make the test DOM follow browser dataset semantics.
const installBrowserDatasetSemantics = (window) => {
  const toAttribute = (property) => `data-${String(property).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

  Object.defineProperty(window.Element.prototype, 'dataset', {
    configurable: true,
    get() {
      const element = this;
      return new Proxy({}, {
        deleteProperty: (_target, property) => {
          element.removeAttribute(toAttribute(property));
          return true;
        },
        get: (_target, property) => element.getAttribute(toAttribute(property)),
        set: (_target, property, value) => {
          element.setAttribute(toAttribute(property), String(value));
          return true;
        },
      });
    },
  });
};

const withRenderedPage = async (file, url, callback) => {
  const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
  const { window, document } = parseHTML(html);
  installBrowserDatasetSemantics(window);
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originals = {
    CustomEvent: globalThis.CustomEvent,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    window: globalThis.window,
  };

  window.location = new URL(url);
  window.requestAnimationFrame = (callbackFrame) => {
    callbackFrame(Date.now());
    return 1;
  };
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.document = document;
  globalThis.localStorage = createStorage();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en' },
    writable: true,
  });
  globalThis.sessionStorage = createStorage();
  globalThis.window = window;

  try {
    await callback({ document, window });
  } finally {
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
};

const assertSharedDestinations = (document, expectedLabels) => {
  const navigation = document.querySelector('.top-navigation');
  const home = navigation.querySelector('a[href="index.html?entry=navigation"]');
  const watches = navigation.querySelector('a[href="watches.html"]');
  const newWatch = navigation.querySelector('a.top-navigation__new-watch[href="new-watch.html"]');

  assert.equal(document.querySelectorAll('.top-navigation').length, 1);
  assert.equal(document.querySelectorAll('.primary-navigation--header').length, 1);
  assert.equal(document.querySelectorAll('.language-control').length, 1);
  assert.equal(document.querySelectorAll('.mobile-new-watch-action').length, 1);
  assert.equal(home.textContent.trim(), expectedLabels.home);
  assert.equal(watches.textContent.trim(), expectedLabels.watches);
  assert.match(newWatch.textContent, new RegExp(expectedLabels.newWatch));
};

test('Report renders one English shared header on / and /index.html after rerenders and refreshes', async () => {
  for (const url of ['http://watch-assistant.local/', 'http://watch-assistant.local/index.html']) {
    await withRenderedPage('index.html', url, async ({ document }) => {
      setLanguage('en', { persist: false });
      initTopNavigation({ env: PREVIEW_ENV });
      initTopNavigation({ env: PREVIEW_ENV });

      assertSharedDestinations(document, {
        home: 'Home', watches: 'All Watches', newWatch: 'New Watch',
      });
      assert.equal(document.querySelector('.top-navigation').getAttribute('aria-label'), 'Product navigation');
      assert.equal(document.querySelector('#homeAllQuiet a'), null);
      assert.doesNotMatch(document.body.textContent, /View everything I’m watching/);
    });
  }
});

test('Report renders one French shared header and its language selector changes the rendered DOM', async () => {
  await withRenderedPage('index.html', 'http://watch-assistant.local/index.html', async ({ document }) => {
    setLanguage('fr', { persist: false });
    initTopNavigation({ env: PREVIEW_ENV });
    initTopNavigation({ env: PREVIEW_ENV });

    assertSharedDestinations(document, {
      home: 'Accueil', watches: 'Toutes les Watches', newWatch: 'Nouvelle Watch',
    });
    assert.equal(document.documentElement.lang, 'fr');
    assert.equal(document.querySelector('#homeAllQuiet a'), null);
    assert.doesNotMatch(document.querySelector('#homeAllQuiet').textContent, /Voir toutes les Watches/);

    document.querySelector('[data-language-trigger]').click();
    document.querySelector('[data-language="en"]').click();

    assert.equal(getLanguage(), 'en');
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(
      document.querySelector('a[href="index.html?entry=navigation"]').textContent.trim(),
      'Home',
    );
    assert.equal(document.querySelectorAll('.top-navigation').length, 1);
  });
});

test('production onboarding remains shell-free until completion', async () => {
  await withRenderedPage('index.html', 'https://watch-assistant.example/index.html', async ({ document }) => {
    setLanguage('en', { persist: false });
    initTopNavigation({ env: PRODUCTION_ENV });

    assert.equal(document.querySelector('.top-navigation'), null);
    assert.equal(document.querySelector('.language-control'), null);
  });
});

test('shared navigation remains unchanged on the existing application pages', async () => {
  const cases = [
    ['watches.html', '.page--watches', 'a[href="watches.html"]'],
    ['watch-detail.html', '.page--detail', 'a[href="watches.html"]'],
    ['new-watch.html', '.page--form', 'a.top-navigation__new-watch[href="new-watch.html"]'],
    ['follow-story.html', '.page--follow-story', '.primary-navigation a[href="watches.html"]'],
  ];

  for (const [file, pageSelector, activeSelector] of cases) {
    await withRenderedPage(file, `http://watch-assistant.local/${file}`, async ({ document }) => {
      setLanguage('en', { persist: false });
      initTopNavigation({ env: PRODUCTION_ENV });
      initTopNavigation({ env: PRODUCTION_ENV });

      assert.ok(document.querySelector(pageSelector));
      assert.equal(document.querySelectorAll('.top-navigation').length, 1);
      assert.equal(document.querySelectorAll('.language-control').length, 1);
      assert.equal(
        document.querySelector(activeSelector).getAttribute('aria-current'),
        'page',
        `${file} keeps its existing active navigation destination`,
      );
    });
  }
});
