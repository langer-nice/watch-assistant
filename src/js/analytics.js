import { inject, track } from '@vercel/analytics';

const OWNER_EXCLUSION_KEY = 'watchAssistantAnalyticsExcluded';
const ANALYTICS_DISABLED_KEY = 'watchAssistantAnalyticsDisabled';
const OWNER_QUERY_PARAMETER = 'owner';
const INTERNAL_PATHS = new Set([
  '/dashboard.html',
]);

export const PRODUCT_EVENTS = Object.freeze({
  LANDING_PAGE_VIEWED: 'Landing Page Viewed',
  ONBOARDING_STARTED: 'Onboarding Started',
  ONBOARDING_COMPLETED: 'Onboarding Completed',
  EXAMPLE_SELECTED: 'Example Selected',
  CREATE_WATCH_PAGE_VIEWED: 'Create Watch Page Viewed',
  TEXT_ENTERED: 'Text Entered',
  URL_PASTED: 'URL Pasted',
  MICROPHONE_CLICKED: 'Microphone Clicked',
  URL_ANALYSIS_STARTED: 'URL Analysis Started',
  URL_ANALYSIS_SUCCEEDED: 'URL Analysis Succeeded',
  URL_ANALYSIS_FAILED: 'URL Analysis Failed',
  WATCH_REVIEW_DISPLAYED: 'Watch Review Displayed',
  WATCH_CREATION_CANCELLED: 'Watch Creation Cancelled',
  WATCH_CREATED: 'Watch Created',
  WATCH_DETAIL_VIEWED: 'Watch Detail Viewed',
  MORNING_REPORT_VIEWED: 'Morning Report Viewed',
});

let initialized = false;
let ownerPreferenceChangedThisLoad = false;
const trackedOnce = new Set();

const readStorage = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const updateOwnerPreference = () => {
  const url = new URL(window.location.href);
  const ownerValue = url.searchParams.get(OWNER_QUERY_PARAMETER);
  if (ownerValue !== '1' && ownerValue !== '0') return;

  ownerPreferenceChangedThisLoad = true;
  try {
    if (ownerValue === '1') {
      window.localStorage.setItem(OWNER_EXCLUSION_KEY, 'true');
    } else {
      window.localStorage.removeItem(OWNER_EXCLUSION_KEY);
    }
  } catch {
    // The current owner=1 page is still excluded when storage is unavailable.
  }

  url.searchParams.delete(OWNER_QUERY_PARAMETER);
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
};

const isOwnerExcluded = () => (
  readStorage(OWNER_EXCLUSION_KEY) === 'true'
  || new URL(window.location.href).searchParams.get(OWNER_QUERY_PARAMETER) === '1'
);

const isExplicitlyDisabled = () => (
  import.meta.env.VITE_ANALYTICS_DISABLED === 'true'
  || readStorage(ANALYTICS_DISABLED_KEY) === 'true'
  || navigator.globalPrivacyControl === true
  || navigator.doNotTrack === '1'
);

const isProductionDeployment = () => (
  import.meta.env.PROD
  && import.meta.env.VITE_VERCEL_ENV === 'production'
  && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
);

const getPathname = (url = window.location.href) => {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  } catch {
    return window.location.pathname;
  }
};

const isInternalPath = (url) => {
  const pathname = getPathname(url);
  return INTERNAL_PATHS.has(pathname) || INTERNAL_PATHS.has(`/${pathname.split('/').pop()}`);
};

const canSendAnalytics = (url = window.location.href) => (
  isProductionDeployment()
  && !ownerPreferenceChangedThisLoad
  && !isOwnerExcluded()
  && !isExplicitlyDisabled()
  && !isInternalPath(url)
);

const redactEventUrl = (event) => {
  try {
    const url = new URL(event.url, window.location.origin);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.href };
  } catch {
    return event;
  }
};

const beforeSend = (event) => (
  canSendAnalytics(event.url) ? redactEventUrl(event) : null
);

export const initializeAnalytics = () => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  updateOwnerPreference();

  if (!import.meta.env.PROD && isOwnerExcluded()) {
    console.info('Watch Assistant analytics excluded for this browser.');
  }

  if (!canSendAnalytics()) return;

  try {
    inject({
      mode: 'production',
      beforeSend,
      framework: 'vite',
    });
  } catch {
    // Analytics must never interfere with the prototype experience.
  }
};

export const trackProductEvent = (eventName, properties) => {
  if (!Object.values(PRODUCT_EVENTS).includes(eventName) || !canSendAnalytics()) return false;

  try {
    track(eventName, properties);
    return true;
  } catch {
    // Custom Events may be unavailable on the current Vercel plan.
    return false;
  }
};

export const trackProductEventOnce = (eventName, properties, key = eventName) => {
  if (trackedOnce.has(key)) return false;
  trackedOnce.add(key);
  return trackProductEvent(eventName, properties);
};

export {
  ANALYTICS_DISABLED_KEY,
  INTERNAL_PATHS,
  OWNER_EXCLUSION_KEY,
};
