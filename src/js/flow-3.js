import { registerCurrentIntroFlow } from './intro-flow.js';
import { initializeLanguage } from './i18n.js';
import { initLanguageSwitcher } from './language-switcher.js';

registerCurrentIntroFlow();
initializeLanguage();
initLanguageSwitcher();

const screens = [...document.querySelectorAll('[data-flow-3-screen]')];
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const standardTimelines = [
  [900, 850, 800, 700, 600, 500, 400],
  [900, 800, 700, 600, 500, 400],
  [1800, 1800],
];
const reducedMotionTimelines = standardTimelines.map((timeline) => (
  timeline.map(() => 100)
));
const timelines = prefersReducedMotion ? reducedMotionTimelines : standardTimelines;

let activeScreenIndex = 0;
let sequenceVersion = 0;
let sequenceRunning = false;
let activeTimer = null;
let resolveActiveDelay = null;

const wait = (duration) => new Promise((resolve) => {
  const finishDelay = () => {
    activeTimer = null;
    resolveActiveDelay = null;
    resolve();
  };

  resolveActiveDelay = finishDelay;
  activeTimer = window.setTimeout(finishDelay, duration);
});

const cancelActiveDelay = () => {
  if (activeTimer !== null) {
    window.clearTimeout(activeTimer);
  }
  resolveActiveDelay?.();
};

const reveal = (element, { immediate = false } = {}) => {
  if (!element) return;

  const examplesList = element.closest('.flow-3__examples');
  if (examplesList) {
    examplesList.hidden = false;
  }

  element.hidden = false;
  if (immediate || prefersReducedMotion) {
    element.classList.add('is-visible');
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => element.classList.add('is-visible'));
  });
};

const resetScreen = (screen) => {
  screen.querySelectorAll('[data-flow-3-reveal]').forEach((element) => {
    element.hidden = true;
    element.classList.remove('is-visible');
  });
  screen.querySelectorAll('.flow-3__examples').forEach((list) => {
    list.hidden = true;
  });
};

const runSequence = async (screenIndex) => {
  const screen = screens[screenIndex];
  const revealElements = [...screen.querySelectorAll('[data-flow-3-reveal]')];
  const timeline = timelines[screenIndex];
  const version = sequenceVersion;
  sequenceRunning = true;

  for (let index = 0; index < revealElements.length; index += 1) {
    await wait(timeline[index]);
    if (version !== sequenceVersion) return;
    reveal(revealElements[index]);
  }

  sequenceRunning = false;
};

const completeCurrentSequence = () => {
  if (!sequenceRunning) return;

  sequenceVersion += 1;
  sequenceRunning = false;
  cancelActiveDelay();
  screens[activeScreenIndex]
    .querySelectorAll('[data-flow-3-reveal]')
    .forEach((element) => reveal(element, { immediate: true }));
};

const showScreen = (screenIndex) => {
  if (!screens[screenIndex]) return;

  sequenceVersion += 1;
  cancelActiveDelay();
  screens[activeScreenIndex].hidden = true;
  activeScreenIndex = screenIndex;
  resetScreen(screens[activeScreenIndex]);
  screens[activeScreenIndex].hidden = false;
  screens[activeScreenIndex].focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
  runSequence(activeScreenIndex);
};

document.addEventListener('click', (event) => {
  if (event.target.closest('.language-switcher')) {
    return;
  }

  if (sequenceRunning) {
    completeCurrentSequence();
    return;
  }

  if (event.target.closest('[data-flow-3-next]')) {
    showScreen(activeScreenIndex + 1);
  }
});

screens.forEach((screen, index) => {
  if (index > 0) resetScreen(screen);
});
runSequence(activeScreenIndex);
