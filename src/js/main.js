import { getAccountEpoch, getAccountOwner } from './account-storage.js';
import { configureMediaWatchServerStore } from './media-watch-server-store.js';
import { initApp } from './navigation.js';
import { initializeLanguage, setLanguage } from './i18n.js';
import { initTopNavigation } from './top-navigation.js';
import { initIntroReplayLink } from './intro-flow.js';
import { initializeAnalytics } from './analytics.js';
import { initAuthUi } from './auth-ui.js';
import { configureCompanyWatchServerStore } from './company-watch-server-store.js';
import { configureOnboardingRequest } from './onboarding-presentation.js';

initializeAnalytics();
configureOnboardingRequest();
initializeLanguage();
const callbackLanguage = new URLSearchParams(window.location.search).get('lang');
if (['en', 'fr'].includes(callbackLanguage)) setLanguage(callbackLanguage);
initIntroReplayLink();
initTopNavigation();
let appStarted = false;
const authUi = initAuthUi({ onResume: async (request, owner) => {
  const epoch = getAccountEpoch();
  await configureCompanyWatchServerStore(authUi.auth);
  await configureMediaWatchServerStore(authUi.auth);
  if (appStarted || owner !== getAccountOwner() || epoch !== getAccountEpoch()) return;
  if (!authUi.canEnterEditor()) return;
  document.querySelector('#newWatchInput').value = request;
  appStarted = true;
  initApp();
  authUi.revealEditor();
  document.querySelector('#newWatchForm').requestSubmit();
} });
// Drop sensitive DOM before a page can enter the back/forward cache. Restoration
// must resolve the session again rather than reuse a frozen account snapshot.
window.addEventListener('pagehide', () => authUi?.auth.suspend());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void authUi?.auth.initialize();
});

const start = async () => {
  if (authUi) {
    await authUi.ready;
    await configureCompanyWatchServerStore(authUi.auth);
    await configureMediaWatchServerStore(authUi.auth);
  }
  if (authUi && !authUi.canEnterEditor()) return;
  if (appStarted) return;
  appStarted = true;
  initApp();
  authUi?.revealEditor();
};

void start();
