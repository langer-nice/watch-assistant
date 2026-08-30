import { initApp } from './navigation.js';
import { initializeLanguage } from './i18n.js';
import { initTopNavigation } from './top-navigation.js';
import { initIntroReplayLink } from './intro-flow.js';
import { initializeAnalytics } from './analytics.js';
import { initAuthUi } from './auth-ui.js';
import { configureCompanyWatchServerStore } from './company-watch-server-store.js';

initializeAnalytics();
initializeLanguage();
initIntroReplayLink();
initTopNavigation();
const authUi = initAuthUi();

const start = async () => {
  if (authUi) {
    await authUi.ready;
    await configureCompanyWatchServerStore(authUi.auth);
  }
  initApp();
};

void start();
