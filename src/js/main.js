import { initApp } from './navigation.js';
import { initializeLanguage } from './i18n.js';
import { initLanguageSwitcher } from './language-switcher.js';
import { initIntroReplayLink } from './intro-flow.js';

initializeLanguage();
initIntroReplayLink();
initApp();
initLanguageSwitcher();
