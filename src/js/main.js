import { initApp } from './navigation.js';
import { initializeLanguage } from './i18n.js';
import { initLanguageSwitcher } from './language-switcher.js';

initializeLanguage();
initApp();
initLanguageSwitcher();
