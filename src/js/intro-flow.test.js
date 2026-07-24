import test from 'node:test';
import assert from 'node:assert/strict';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const setupBrowserState = (search = '') => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  globalThis.localStorage = localStorage;
  globalThis.sessionStorage = sessionStorage;
  globalThis.window = {
    location: { pathname: '/index.html', search },
  };
  return { localStorage, sessionStorage };
};

test('onboarding completion is independent from Watch data', async (t) => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  });

  const { localStorage } = setupBrowserState();
  const { hasCompletedOnboarding, skipOnboarding } = await import('./intro-flow.js?completion');
  assert.equal(hasCompletedOnboarding(), false);
  skipOnboarding();
  assert.equal(hasCompletedOnboarding(), true);
  assert.equal(localStorage.getItem('watchAssistant.onboardingCompleted'), 'true');
});

test('first Watch session is consumed once after onboarding creation', async (t) => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  });

  setupBrowserState('?onboarding=first-watch');
  const {
    beginOnboardingFirstWatch,
    completeOnboardingFirstWatch,
    consumeFirstWatchConfirmation,
    isOnboardingFirstWatch,
  } = await import('./intro-flow.js?first-watch');

  beginOnboardingFirstWatch();
  assert.equal(isOnboardingFirstWatch(), true);
  completeOnboardingFirstWatch('watch-123');
  globalThis.window.location.search = '';
  assert.equal(isOnboardingFirstWatch(), false);
  assert.equal(consumeFirstWatchConfirmation(), 'watch-123');
  assert.equal(consumeFirstWatchConfirmation(), null);
});
