import { configureAccountStorage, localWatchStorageKey } from './account-storage.js';
configureAccountStorage({ getState: () => ({ status: 'authenticated', session: { user: { id: 'synthetic-local-owner' } } }) });
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { getOnboardingFlows, getOnboardingJourneys, getJourneyFromLocation, getJourneyExamples } from './onboarding-journeys.js';
import { configureJourneyPresentation, configureOnboardingRequest } from './onboarding-presentation.js';

register('./test-support/json-module-loader.js', import.meta.url);
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
// Exact approved copy: four professional examples followed by three personal examples.
const expectedLegalExamples = {
  en: {
    professional: [
      'A company you follow appears in a new BODACC notice.',
      'A regulation affecting your area of practice changes.',
      'A court decision relevant to your practice is published.',
      'An authority announces a new requirement or deadline.',
    ],
    personal: [
      'A new direct flight to a destination is announced.',
      'Your favourite band announces a European tour.',
      'Registration opens for an activity your children would enjoy.',
    ],
  },
  fr: {
    professional: [
      'Une entreprise que vous suivez fait l’objet d’une nouvelle annonce au BODACC.',
      'Une réglementation concernant votre domaine évolue.',
      'Une décision de justice susceptible d’affecter votre pratique est publiée.',
      'Une autorité publie une nouvelle obligation ou échéance.',
    ],
    personal: [
      'Une nouvelle liaison aérienne vers une destination est annoncée.',
      'Votre groupe préféré annonce une tournée européenne.',
      'Les inscriptions ouvrent pour une activité qui intéresse vos enfants.',
    ],
  },
};
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};
const browser = (t, html, url, { controlledTimers = false } = {}) => {
  const { document, window: domWindow } = parseHTML(html);
  const timers = new Map();
  const listeners = [];
  const dataset = Object.getOwnPropertyDescriptor(domWindow.Element.prototype, 'dataset');
  const scrollTo = Object.getOwnPropertyDescriptor(domWindow.HTMLElement.prototype, 'scrollTo');
  const addEventListener = document.addEventListener;
  document.addEventListener = function (...args) {
    listeners.push(args);
    return addEventListener.apply(this, args);
  };
  const schedule = (callback, delay = 0) => {
    const id = controlledTimers ? Symbol('timer') : setTimeout(() => {
      timers.delete(id);
      callback();
    }, Math.min(delay, 1));
    timers.set(id, callback);
    return id;
  };
  const cancel = id => { if (!controlledTimers) clearTimeout(id); timers.delete(id); };
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
    requestAnimationFrame: schedule,
    setTimeout: schedule,
    clearTimeout: cancel, scrollTo() {},
    history: { replaceState(_state, _unused, next) { window.location = new URL(next, window.location); } },
  };
  domWindow.HTMLElement.prototype.scrollTo = () => {};
  t.after(() => {
    for (const id of timers.keys()) cancel(id);
    for (const args of listeners) document.removeEventListener(...args);
    document.addEventListener = addEventListener;
    for (const [prototype, key, descriptor] of [
      [domWindow.Element.prototype, 'dataset', dataset],
      [domWindow.HTMLElement.prototype, 'scrollTo', scrollTo],
    ]) {
      if (descriptor) Object.defineProperty(prototype, key, descriptor);
      else delete prototype[key];
    }
  });
  const globals = { document, window, localStorage, sessionStorage, CustomEvent: domWindow.CustomEvent, navigator: { language: 'en' } };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
  const waitFor = (predicate, description) => new Promise((resolve, reject) => {
    const observer = new domWindow.MutationObserver(check);
    // Failure bound only: completion is driven by DOM state, never elapsed time.
    const timeout = setTimeout(() => { cleanup(); reject(new Error(`Not ready: ${description}`)); }, 2000);
    function cleanup() { clearTimeout(timeout); observer.disconnect(); }
    function check() { if (predicate()) { cleanup(); resolve(); } }
    t.after(cleanup);
    observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
    check();
  });
  const screenReady = async index => {
    await waitFor(() => {
      const screen = document.querySelector(`[data-flow-3-screen="${index}"]`);
      const action = screen?.querySelector(index === 2 ? '[data-onboarding-first-watch]' : '[data-flow-3-next]');
      const reveals = [...(screen?.querySelectorAll('[data-flow-3-reveal]') || [])];
      return screen && !screen.hidden && action && !action.disabled
        && reveals.every(el => !el.hidden && el.classList.contains('is-visible'));
    }, `screen ${index} and its actions`);
    // Language selection reveals the intro before its promise chain installs
    // navigation listeners. Drain that task before simulating the next user action.
    await new Promise(resolve => setImmediate(resolve));
  };
  const advanceTimer = async () => {
    const entry = timers.entries().next().value;
    assert.ok(entry, 'expected an outstanding transition callback');
    timers.delete(entry[0]);
    entry[1]();
    await new Promise(resolve => setImmediate(resolve));
  };
  return { document, window, localStorage, sessionStorage, waitFor, screenReady, advanceTimer, timers };
};

test('dashboard renders four matching cards and copies every Launch URL', async (t) => {
  const { document, window, waitFor } = browser(t, await read('../../dashboard.html'), 'https://watch.example/dashboard.html');
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
    await waitFor(() => card.querySelector('[role="status"]').textContent === 'Copied!', 'clipboard feedback');
    assert.equal(copied, `https://watch.example/flow-3.html?flow=${index + 1}`);
    assert.equal(card.querySelector('[role="status"]').textContent, 'Copied!');
  }
});

test('legal direct route uses language gate and the same three editorial screens in order', async (t) => {
  const { document, window, sessionStorage, screenReady } = browser(t, await read('../../flow-3.html'), 'https://watch.example/flow-3.html?flow=4');
  await import('./flow-3.js?legal-order');
  assert.ok(document.querySelector('[data-flow-language-selection]'));
  document.querySelector('[data-flow-language="en"]').click();
  await screenReady(0);
  assert.equal(window.location.search, '?flow=4&lang=en');
  const active = () => document.querySelector('[data-flow-3-screen]:not([hidden])');
  assert.equal(active().getAttribute('data-flow-3-screen'), '0');
  assert.equal(active().querySelector('h1').textContent, 'Tell us what matters...');
  active().querySelector('[data-flow-3-next]').click();
  await screenReady(1);
  assert.equal(active().getAttribute('data-flow-3-screen'), '1');
  assert.equal(active().querySelector('h1').textContent, 'What do you keep checking?');
  assert.equal(active().querySelectorAll('li').length, 7);
  assert.equal(document.querySelectorAll('input, select, textarea').length, 0);
  assert.deepEqual([...active().querySelectorAll('li')].map((item) => item.textContent), [
    ...expectedLegalExamples.en.professional, ...expectedLegalExamples.en.personal,
  ]);
  active().querySelector('[data-flow-3-next]').click();
  await screenReady(2);
  assert.equal(active().getAttribute('data-flow-3-screen'), '2');
  const create = active().querySelector('[data-onboarding-first-watch]');
  assert.equal(create.getAttribute('href'), 'new-watch.html?onboarding=first-watch&flow=4');
  create.click();
  assert.equal(sessionStorage.getItem('watchAssistant.onboardingFirstWatch'), 'true');
});

test('reload or returning to the legal URL restarts safely with the same audience', async (t) => {
  const { document, screenReady } = browser(t, await read('../../flow-3.html'), 'https://watch.example/flow-3.html?flow=4&lang=en');
  await import('./flow-3.js?legal-reload');
  await screenReady(0);
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
  assert.equal(localStorage.getItem(localWatchStorageKey('watchAssistant.watches')), null);
  setLanguage('fr');
  assert.equal(document.querySelector('#onboardingRequestNotice').textContent, 'Watch Assistant surveille les informations publiques. Ne saisissez aucune information confidentielle sur vos clients ou vos dossiers.');
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


for (const language of ['en', 'fr']) {
  test(`Sales & Marketing and Legal Professionals share exact core keys and rendered copy in ${language}`, async (t) => {
    const rendered = [];
    const messages = JSON.parse(await read(`../locales/${language}.json`));
    for (const flow of ['2', '4']) {
      await t.test(`flow ${flow}`, async (t) => {
        const { document, localStorage, sessionStorage, screenReady } = browser(t, await read('../../flow-3.html'), `https://watch.example/flow-3.html?flow=${flow}&lang=${language}`);
        await import(`./flow-3.js?shared-copy=${language}-${flow}`);
        await screenReady(0);
        const screens = [...document.querySelectorAll('[data-flow-3-screen]')];
        const copy = (screen) => [...screen.querySelectorAll('[data-i18n], [data-flow-3-i18n]')].map((element) => ({
          key: element.getAttribute('data-i18n') || element.getAttribute('data-flow-3-i18n'),
          text: element.textContent,
        }));
        const intro = copy(screens[0]);
        assert.equal(screens[0].querySelector('h1').textContent, messages.flow3.promiseHeadline);
        screens[0].querySelector('[data-flow-3-next]').click();
        await screenReady(1);
        assert.equal(screens[1].querySelector('h1').textContent, language === 'fr' ? 'Que vérifiez-vous sans arrêt ?' : 'What do you keep checking?');
        assert.equal(screens[1].querySelector('[data-flow-3-next]').textContent.replace(/\s+/g, ' ').trim(), language === 'fr' ? 'Continuer →' : 'Continue →');
        const examples = [...screens[1].querySelectorAll('li')].map((item) => item.textContent);
        screens[1].querySelector('[data-flow-3-next]').click();
        await screenReady(2);
        assert.equal(screens[2].hidden, false, 'Continue opens the final explanation');
        const final = copy(screens[2]);
        for (const { key, text } of [...intro, ...final]) {
          assert.ok(!key.startsWith('legalOnboarding.'));
          assert.equal(text, key.split('.').reduce((value, part) => value[part], messages));
        }
        for (const key of ['promiseHeadline', 'promiseSupporting', 'solutionOpening', 'solutionWatch', 'solutionRelief']) {
          assert.equal(messages.legalOnboarding[key], undefined, 'Audience-specific core copy must not return');
        }
        screens[2].querySelector('[data-onboarding-first-watch]').click();
        assert.equal(sessionStorage.getItem('watchAssistant.onboardingFirstWatch'), 'true');
        for (const index of [0, 2]) {
          screens[index].querySelector('[data-onboarding-skip]').click();
          assert.equal(localStorage.getItem('watchAssistant.onboardingCompleted'), 'true');
          assert.equal(sessionStorage.getItem('watchAssistant.onboardingFirstWatch'), null);
        }
        rendered.push({ intro, final, examples });
      });
    }
    assert.deepEqual(rendered[1].intro, rendered[0].intro);
    assert.deepEqual(rendered[1].final, rendered[0].final);
    assert.notDeepEqual(rendered[1].examples, rendered[0].examples);
    const { professional, personal } = expectedLegalExamples[language];
    assert.equal(professional.length, 4);
    assert.equal(personal.length, 3);
    assert.equal(rendered[1].examples.length, 7);
    assert.deepEqual(rendered[1].examples.slice(0, 4), professional);
    assert.deepEqual(rendered[1].examples.slice(4), personal);
    assert.match(rendered[1].examples[0], /BODACC/);
    assert.equal(rendered[1].examples[2], language === 'fr'
      ? 'Une décision de justice susceptible d’affecter votre pratique est publiée.'
      : 'A court decision relevant to your practice is published.');
    assert.doesNotMatch(rendered[1].examples.join(' '), /habitation|habitability|heating|ventilation|landlord|propriétaire|règles fiscales|tax or business|employment tribunal|prud[’']hom/i);
    assert.deepEqual(rendered[1].examples, [...professional, ...personal]);
    assert.deepEqual(rendered[1].examples, getJourneyExamples(getOnboardingJourneys()[3], language));
  });
}

for (const language of ['en', 'fr']) {
  test(`legal transition waits for every scheduled reveal in ${language}`, async (t) => {
    const { document, screenReady, advanceTimer, timers } = browser(t,
      await read('../../flow-3.html'), `https://watch.example/flow-3.html?flow=4&lang=${language}`,
      { controlledTimers: true });
    await import(`./flow-3.js?controlled-reveals=${language}`);
    await advanceTimer(); // Initial animation frame; no wall-clock sleep.
    await screenReady(0);
    const screens = [...document.querySelectorAll('[data-flow-3-screen]')];
    for (const index of [1, 2]) {
      screens[index - 1].querySelector('[data-flow-3-next]').click();
      let ready = false;
      const completed = screenReady(index).then(() => { ready = true; });
      const reveals = [...screens[index].querySelectorAll('[data-flow-3-reveal]')];
      for (const [position, element] of reveals.entries()) {
        assert.equal(ready, false, 'readiness cannot precede the last reveal');
        assert.equal(element.hidden, true);
        assert.equal(timers.size, 1, 'exactly one sequential reveal is outstanding');
        await advanceTimer();
        assert.equal(element.hidden, false);
        if (position < reveals.length - 1) assert.equal(ready, false);
      }
      await completed;
      assert.equal(screens[index].hidden, false);
      assert.equal(timers.size, 0);
    }
  });
}
