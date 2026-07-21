import { initApp } from './navigation.js';
import { initializeLanguage } from './i18n.js';
import { initTopNavigation } from './top-navigation.js';
import { initIntroReplayLink } from './intro-flow.js';

initializeLanguage();
initIntroReplayLink();
initTopNavigation();
initApp();
