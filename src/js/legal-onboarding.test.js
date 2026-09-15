import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { getOnboardingFlows, getOnboardingJourneys, getJourneyFromLocation, getJourneyExamples } from './onboarding-journeys.js';
import { configureJourneyPresentation, configureOnboardingRequest } from './onboarding-presentation.js';

register('./test-support/json-module-loader.js', import.meta.url);
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};
const browser = (t, html, url) => {
  const { document, window: domWindow } = parseHTML(html);
  // Match native dataset semantics (Linkedom inserts hyphens around digits).
  Object.defineProperty(domWindow.Element.prototype, 'dataset', {
    configurable: true,
    get() {
      const element = this;
      const attribute = (key) => `data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
      return new Proxy({}, {
        get: (_target, key) => element.getAttribute(attribute(key)),
        set: (_target, key, value) => { element.setAttribute(attribute(key), String(value)); return true; },
        deleteProperty: (_target, key) => { element.removeAttribute(attribute(key)); return true; },
      });
    },
  });
  Object.defineProperty(document, 'baseURI', { value: url });
  const localStorage = storage();
  const sessionStorage = storage();
  const window = {
    location: new URL(url), localStorage, sessionStorage,
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    setTimeout: (callback, delay) => setTimeout(callback, Math.min(delay, 1)),
    clearTimeout, scrollTo() {},
    history: { replaceState(_state, _unused, next) { window.location = new URL(next, window.location); } },
  };
  domWindow.HTMLElement.prototype.scrollTo = () => {};
  const globals = { document, window, localStorage, sessionStorage, CustomEvent: domWindow.CustomEvent, navigator: { language: 'en' } };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
  return { document, window, localStorage, sessionStorage };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 35));

test('dashboard renders four matching cards and copies every Launch URL', async (t) => {
  const { document, window } = browser(t, await read('../../dashboard.html'), 'https://watch.example/dashboard.html');
  let copied;
  window.isSecureContext = true;
  navigator.clipboard = { writeText: async (text) => { copied = text; } };
  // Keep feedback visible without a real 1.8 second timer in this DOM test.
  window.setTimeout = () => 0;
  await import('./dashboard.js');
  const cards = [...document.querySelectorAll('.introduction-card')];
  assert.deepEqual(cards.map((card) => card.querySelector('h2').textContent), ['General', 'Sales & Marketing', 'Coworking Owner (Monaco)', 'Legal Professionals']);
  assert.equal(cards[3].querySelector('p').textContent, 'Personalized onboarding for lawyers and legal professionals.');
  for (const [index, card] of cards.entries()) {
    assert.equal(card.querySelector('a').getAttribute('href'), `flow-3.html?flow=${index + 1}`);
    card.querySelector('button').click();
    await settle();
    assert.equal(copied, `https://watch.example/flow-3.html?flow=${index + 1}`);
    assert.equal(card.querySelector('[role="status"]').textContent, 'Copied!');
  }
});

test('legal direct route uses language gate and the same three editorial screens in order', async (t) => {
  const { document, window, sessionStorage } = browser(t, await read('../../flow-3.html'), 'https://watch.example/flow-3.html?flow=4');
  await import('./flow-3.js?legal-order');
  assert.ok(document.querySelector('[data-flow-language-selection]'));
  document.querySelector('[data-flow-language="en"]').click();
  await settle();
  assert.equal(window.location.search, '?flow=4&lang=en');
  const active = () => document.querySelector('[data-flow-3-screen]:not([hidden])');
  assert.equal(active().getAttribute('data-flow-3-screen'), '0');
  assert.equal(active().querySelector('h1').textContent, 'Keep checking between tasks?');
  active().querySelector('[data-flow-3-next]').click();
  await settle();
  assert.equal(active().getAttribute('data-flow-3-screen'), '1');
  assert.equal(active().querySelector('h1').textContent, 'What do you keep checking?');
  assert.equal(active().querySelectorAll('li').length, 7);
  assert.equal(document.querySelectorAll('input, select, textarea').length, 0);
  const examples = active().textContent;
  for (const phrase of ['official notice', 'planning application', 'real estate', 'court decision', 'direct flight', 'sporting event', 'investment']) assert.ok(examples.includes(phrase));
  active().querySelector('[data-flow-3-next]').click();
  await settle();
  assert.equal(active().getAttribute('data-flow-3-screen'), '2');
  const create = active().querySelector('[data-onboarding-first-watch]');
  assert.equal(create.getAttribute('href'), 'new-watch.html?onboarding=first-watch&flow=4');
  create.click();
  assert.equal(sessionStorage.getItem('watchAssistant.onboardingFirstWatch'), 'true');
});

test('reload or returning to the legal URL restarts safely with the same audience', async (t) => {
  const { document } = browser(t, await read('../../flow-3.html'), 'https://watch.example/flow-3.html?flow=4&lang=en');
  await import('./flow-3.js?legal-reload');
  await settle();
  assert.equal(document.querySelector('[data-flow-3-screen]:not([hidden])').getAttribute('data-flow-3-screen'), '0');
  assert.equal(getJourneyFromLocation().id, 'legal-professionals');
  assert.equal(document.querySelectorAll('[data-flow-3-examples] li').length, 7);
});

test('legal composer decorates the existing input with a localized accessible notice, without creating data', async (t) => {
  const { document, window, localStorage } = browser(t, await read('../../new-watch.html'), 'https://watch.example/new-watch.html?onboarding=first-watch&flow=4');
  const form = document.querySelector('#newWatchForm');
  const input = document.querySelector('#newWatchInput');
  configureOnboardingRequest();
  configureOnboardingRequest();
  const { setLanguage } = await import('./i18n.js');
  setLanguage('en');
  assert.equal(document.querySelectorAll('#onboardingRequestNotice').length, 1);
  assert.equal(document.querySelector('#onboardingRequestNotice').textContent, 'Watch Assistant monitors publicly available information. Do not enter confidential client or case information.');
  assert.equal(input.getAttribute('aria-describedby'), 'onboardingRequestNotice');
  assert.equal(document.querySelector('#newWatchForm'), form);
  assert.equal(document.querySelector('#newWatchInput'), input);
  assert.equal(localStorage.getItem('watchAssistant.watches'), null);
  setLanguage('fr');
  assert.match(document.querySelector('#onboardingRequestNotice').textContent, /informations publiques/);
  assert.match(document.querySelector('.watch-composer__helper').textContent, /Décrivez/);
  window.location = new URL('https://watch.example/flow-3.html?flow=4&lang=fr');
  assert.equal(getJourneyFromLocation().id, 'legal-professionals');
});

test('original flows keep their copy, markup and first-Watch destination; normal composer stays untouched', async (t) => {
  const { document, window } = browser(t, await read('../../flow-3.html'), 'https://watch.example/flow-3.html');
  const before = document.toString();
  const flows = getOnboardingFlows();
  assert.deepEqual(flows.slice(0, 3).map(({ id, journeyId }) => [id, journeyId]), [['1', 'general'], ['2', 'sales-marketing'], ['3', 'coworking-owner']]);
  for (const journey of getOnboardingJourneys().slice(0, 3)) {
    configureJourneyPresentation(document, journey);
    assert.equal(document.toString(), before);
    assert.equal(getJourneyExamples(journey, 'en').length, 7);
    assert.equal(getJourneyExamples(journey, 'fr').length, 7);
  }
  const { document: composer } = parseHTML(await read('../../new-watch.html'));
  const composerBefore = composer.toString();
  for (const search of ['', '?onboarding=first-watch&flow=1', '?onboarding=first-watch&flow=2', '?onboarding=first-watch&flow=3', '?flow=4', '?onboarding=first-watch&flow=4&edit=existing']) {
    window.location = new URL(`https://watch.example/new-watch.html${search}`);
    configureOnboardingRequest(composer);
    assert.equal(composer.toString(), composerBefore);
  }
});
