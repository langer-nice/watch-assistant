import { configureMediaWatchServerStore } from './media-watch-server-store.js';
import { initApp } from './navigation.js';
import { initializeLanguage } from './i18n.js';
import { initTopNavigation } from './top-navigation.js';
import { initIntroReplayLink } from './intro-flow.js';
import { initializeAnalytics } from './analytics.js';
import { initAuthUi } from './auth-ui.js';
import { configureCompanyWatchServerStore } from './company-watch-server-store.js';
import { configureOnboardingRequest } from './onboarding-presentation.js';

initializeAnalytics();
configureOnboardingRequest();
initializeLanguage();
initIntroReplayLink();
initTopNavigation();
const authUi = initAuthUi();
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
  initApp();
};

void start();
