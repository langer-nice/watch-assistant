const INTRO_STORAGE_KEY = 'watchAssistantIntro';
const DEFAULT_INTRO_FLOW = 'flow-3.html';
const INTRO_FILENAME_PATTERN = /^flow-[a-z0-9]+(?:-[a-z0-9]+)*\.html$/i;

export const isValidIntroFlow = (value) => (
  typeof value === 'string' && INTRO_FILENAME_PATTERN.test(value)
);

export const getCurrentIntroFlow = () => {
  const filename = window.location.pathname.split('/').pop();
  return isValidIntroFlow(filename) ? filename : null;
};

export const registerCurrentIntroFlow = () => {
  const filename = getCurrentIntroFlow();
  if (!filename) return null;

  try {
    localStorage.setItem(INTRO_STORAGE_KEY, filename);
  } catch {
    // The introduction still works when storage is unavailable.
  }

  return filename;
};

export const getReplayIntroFlow = () => {
  try {
    const storedFlow = localStorage.getItem(INTRO_STORAGE_KEY);
    return isValidIntroFlow(storedFlow) ? storedFlow : DEFAULT_INTRO_FLOW;
  } catch {
    return DEFAULT_INTRO_FLOW;
  }
};

export const initIntroReplayLink = () => {
  const replayLink = document.querySelector('[data-intro-replay]');
  if (replayLink) {
    replayLink.href = getReplayIntroFlow();
  }
};

export { DEFAULT_INTRO_FLOW, INTRO_STORAGE_KEY };
