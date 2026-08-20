import { initApp } from './navigation.js';
import { initializeLanguage } from './i18n.js';
import { initTopNavigation } from './top-navigation.js';
import { initIntroReplayLink } from './intro-flow.js';
import { initializeAnalytics } from './analytics.js';
import { initAuthUi } from './auth-ui.js';

initializeAnalytics();
initializeLanguage();
initIntroReplayLink();
initTopNavigation();
initAuthUi();
initApp();
