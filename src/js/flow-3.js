import { registerCurrentIntroFlow } from './intro-flow.js';
import { initializeLanguage, t } from './i18n.js';
import { initLanguageSwitcher } from './language-switcher.js';

registerCurrentIntroFlow();
initializeLanguage();
initLanguageSwitcher();

const screens = [...document.querySelectorAll('[data-flow-3-screen]')];
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const standardTimelines = [
  [],
  [1400, 1400, 1400, 1400, 1400, 1400, 1400, 1500],
  [1800, 1600, 1600],
];
const reducedMotionTimelines = standardTimelines.map((timeline) => (
  timeline.map(() => 0)
));
const timelines = prefersReducedMotion ? reducedMotionTimelines : standardTimelines;

let activeScreenIndex = 0;
let sequenceVersion = 0;
let sequenceRunning = false;
let activeTimer = null;
let resolveActiveDelay = null;

const wordSequences = [...document.querySelectorAll('[data-flow-3-word-sequence]')];

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

const prepareWordSequence = (element, { preserveProgress = false } = {}) => {
  const previousProgress = preserveProgress
    ? Number(element.dataset.revealedWords || 0)
    : 0;
  const wasComplete = element.dataset.sequenceComplete === 'true';
  const text = t(element.getAttribute('data-flow-3-i18n'));
  const words = text.split(/\s+/);
  const visibleWordCount = wasComplete ? words.length : Math.min(previousProgress, words.length);

  element.setAttribute('aria-label', text);
  element.replaceChildren(...words.map((word, index) => {
    const span = document.createElement('span');
    span.className = 'flow-3__word';
    span.textContent = index < words.length - 1 ? `${word} ` : word;
    span.setAttribute('aria-hidden', 'true');
    if (index < visibleWordCount) span.classList.add('is-visible');
    return span;
  }));
  element.dataset.revealedWords = String(visibleWordCount);
};

const completeWordSequence = (element) => {
  element.removeAttribute('aria-hidden');
  element.dataset.revealedWords = String(element.children.length);
  element.dataset.sequenceComplete = 'true';
  element.querySelectorAll('.flow-3__word').forEach((word) => {
    word.classList.add('is-visible', 'is-instant');
  });
};

const revealWords = async (element, version, interval) => {
  element.removeAttribute('aria-hidden');

  while (Number(element.dataset.revealedWords) < element.children.length) {
    if (version !== sequenceVersion) return false;

    const index = Number(element.dataset.revealedWords);
    element.children[index]?.classList.add('is-visible');
    element.dataset.revealedWords = String(index + 1);

    if (index + 1 < element.children.length) {
      await wait(interval);
    }
  }

  element.dataset.sequenceComplete = 'true';
  return true;
};

const reveal = (element, { immediate = false } = {}) => {
  if (!element) return;

  const examplesList = element.closest('.flow-3__examples');
  if (examplesList) {
    examplesList.hidden = false;
  }

  element.hidden = false;
  element.removeAttribute('aria-hidden');
  if ('disabled' in element) {
    element.disabled = false;
  }
  if (immediate || prefersReducedMotion) {
    element.classList.add('is-visible', 'is-instant');
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

  if (screenIndex === 0) {
    if (prefersReducedMotion) {
      wordSequences.forEach(completeWordSequence);
      reveal(revealElements[0], { immediate: true });
      sequenceRunning = false;
      return;
    }

    await wait(1500);
    if (version !== sequenceVersion || !await revealWords(wordSequences[0], version, 180)) return;
    await wait(1800);
    if (version !== sequenceVersion || !await revealWords(wordSequences[1], version, 150)) return;
    await wait(700);
    if (version !== sequenceVersion) return;
    reveal(revealElements[0]);
    sequenceRunning = false;
    return;
  }

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
    .querySelectorAll('[data-flow-3-word-sequence]')
    .forEach(completeWordSequence);
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
wordSequences.forEach((element) => prepareWordSequence(element));
document.addEventListener('i18n:languageChanged', () => {
  wordSequences.forEach((element) => prepareWordSequence(element, { preserveProgress: true }));
});
runSequence(activeScreenIndex);
