import { registerCurrentIntroFlow } from './intro-flow.js';
import { setLanguage, t } from './i18n.js';
import { initLanguageSwitcher } from './language-switcher.js';
import { initializeFlowLanguage } from './flow-language-gate.js';

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

const getSequenceWords = (element) => (
  t(element.getAttribute('data-flow-3-i18n')).split(/\s+/)
);

const createWord = (word, index, wordCount, { immediate = false } = {}) => {
  const span = document.createElement('span');
  span.className = 'flow-3__word';
  span.textContent = index < wordCount - 1 ? `${word} ` : word;
  span.setAttribute('aria-hidden', 'true');

  if (immediate) span.classList.add('is-visible', 'is-instant');
  return span;
};

const prepareWordSequence = (element, { preserveProgress = false } = {}) => {
  const previousProgress = preserveProgress
    ? Number(element.dataset.revealedWords || 0)
    : 0;
  const wasComplete = element.dataset.sequenceComplete === 'true';
  const text = t(element.getAttribute('data-flow-3-i18n'));
  const words = getSequenceWords(element);
  const visibleWordCount = wasComplete ? words.length : Math.min(previousProgress, words.length);

  element.setAttribute('aria-label', text);
  element.replaceChildren(...words
    .slice(0, visibleWordCount)
    .map((word, index) => createWord(word, index, words.length, { immediate: true })));
  element.dataset.revealedWords = String(visibleWordCount);
};

const completeWordSequence = (element) => {
  const words = getSequenceWords(element);
  element.removeAttribute('aria-hidden');
  element.replaceChildren(...words.map((word, index) => (
    createWord(word, index, words.length, { immediate: true })
  )));
  element.dataset.revealedWords = String(words.length);
  element.dataset.sequenceComplete = 'true';
};

const revealWords = async (element, version, interval) => {
  element.removeAttribute('aria-hidden');

  while (true) {
    if (version !== sequenceVersion) return false;

    const words = getSequenceWords(element);
    const index = Number(element.dataset.revealedWords);
    if (index >= words.length) break;

    const word = createWord(words[index], index, words.length);
    element.append(word);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => word.classList.add('is-visible'));
    });
    element.dataset.revealedWords = String(index + 1);

    if (index + 1 < words.length) {
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
    if (examplesList) {
      examplesList.closest('[data-flow-3-examples-scroll]')?.scrollTo({
        top: examplesList.scrollHeight,
        behavior: 'auto',
      });
    }
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      element.classList.add('is-visible');
      if (examplesList) {
        examplesList.closest('[data-flow-3-examples-scroll]')?.scrollTo({
          top: examplesList.scrollHeight,
          behavior: 'smooth',
        });
      }
    });
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

const resetIntroState = () => {
  sequenceVersion += 1;
  cancelActiveDelay();
  sequenceRunning = false;
  activeScreenIndex = 0;

  screens.forEach((screen, index) => {
    screen.hidden = index !== 0;
  });

  wordSequences.forEach((element) => {
    element.replaceChildren();
    element.dataset.revealedWords = '0';
    delete element.dataset.sequenceComplete;
    element.setAttribute('aria-hidden', 'true');
    prepareWordSequence(element);
  });

  screens[0].querySelectorAll('[data-flow-3-reveal]').forEach((element) => {
    element.hidden = false;
    element.classList.remove('is-visible', 'is-instant');
    element.setAttribute('aria-hidden', 'true');
    if ('disabled' in element) element.disabled = true;
  });
};

const waitForVisibleIntro = () => new Promise((resolve) => {
  window.requestAnimationFrame(resolve);
});

const startIntroFromLanguageSelection = async (language, revealFlow) => {
  setLanguage(language);
  resetIntroState();
  revealFlow();
  await waitForVisibleIntro();
  runSequence(0);
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

const handleFlowClick = (event) => {
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
};

let introStartedFromLanguageSelection = false;

initializeFlowLanguage({
  onLanguageSelection: async (language, revealFlow) => {
    await startIntroFromLanguageSelection(language, revealFlow);
    introStartedFromLanguageSelection = true;
  },
}).then(async () => {
  registerCurrentIntroFlow();
  initLanguageSwitcher();
  screens.forEach((screen, index) => {
    if (index > 0) resetScreen(screen);
  });
  document.addEventListener('i18n:languageChanged', () => {
    wordSequences.forEach((element) => prepareWordSequence(element, { preserveProgress: true }));
  });
  document.addEventListener('click', handleFlowClick);

  if (!introStartedFromLanguageSelection) {
    resetIntroState();
    await waitForVisibleIntro();
    runSequence(0);
  }
});
