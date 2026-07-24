const INTRO_STORAGE_KEY = 'watchAssistantIntro';
const ONBOARDING_COMPLETED_STORAGE_KEY = 'watchAssistant.onboardingCompleted';
const ONBOARDING_FIRST_WATCH_SESSION_KEY = 'watchAssistant.onboardingFirstWatch';
const FIRST_WATCH_CONFIRMATION_SESSION_KEY = 'watchAssistant.firstWatchConfirmation';
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

export const markOnboardingCompleted = () => {
  try {
    localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, 'true');
  } catch {
    // Routing can still fall back to Watch data when storage is unavailable.
  }
};

export const hasCompletedOnboarding = () => {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const beginOnboardingFirstWatch = () => {
  markOnboardingCompleted();
  try {
    sessionStorage.setItem(ONBOARDING_FIRST_WATCH_SESSION_KEY, 'true');
  } catch {
    // The query parameter remains available as an in-page fallback.
  }
};

export const skipOnboarding = () => {
  markOnboardingCompleted();
  try {
    sessionStorage.removeItem(ONBOARDING_FIRST_WATCH_SESSION_KEY);
  } catch {
    // Completion remains persisted even when session storage is unavailable.
  }
};

export const isOnboardingFirstWatch = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('onboarding') === 'first-watch') return true;
  try {
    return sessionStorage.getItem(ONBOARDING_FIRST_WATCH_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
};

export const cancelOnboardingFirstWatch = () => {
  try {
    sessionStorage.removeItem(ONBOARDING_FIRST_WATCH_SESSION_KEY);
  } catch {
    // There is no persistent state to clean up when session storage is unavailable.
  }
};

export const completeOnboardingFirstWatch = (watchId) => {
  markOnboardingCompleted();
  try {
    sessionStorage.removeItem(ONBOARDING_FIRST_WATCH_SESSION_KEY);
    sessionStorage.setItem(FIRST_WATCH_CONFIRMATION_SESSION_KEY, watchId);
  } catch {
    // The Watch remains created even when temporary confirmation state is unavailable.
  }
};

export const consumeFirstWatchConfirmation = () => {
  try {
    const watchId = sessionStorage.getItem(FIRST_WATCH_CONFIRMATION_SESSION_KEY);
    sessionStorage.removeItem(FIRST_WATCH_CONFIRMATION_SESSION_KEY);
    return watchId;
  } catch {
    return null;
  }
};

export const initIntroReplayLink = () => {
  const replayLink = document.querySelector('[data-intro-replay]');
  if (replayLink) {
    replayLink.href = getReplayIntroFlow();
  }
};

export {
  DEFAULT_INTRO_FLOW,
  INTRO_STORAGE_KEY,
  ONBOARDING_COMPLETED_STORAGE_KEY,
  ONBOARDING_FIRST_WATCH_SESSION_KEY,
  FIRST_WATCH_CONFIRMATION_SESSION_KEY,
};
