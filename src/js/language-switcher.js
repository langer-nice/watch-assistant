import { getLanguage, setLanguage, t, translatePage } from './i18n.js';

const LANGUAGES = ['en', 'fr'];

/** Add one shared, compact language control to the current page. */
export const initLanguageSwitcher = () => {
  const shell = document.querySelector('.app-shell');
  if (
    !shell
    || document.body.classList.contains('is-edit-modal')
    || shell.querySelector('.language-switcher')
  ) {
    return;
  }

  const switcher = document.createElement('nav');
  switcher.className = 'language-switcher';
  switcher.dataset.i18nAriaLabel = 'languageSwitcher.label';
  switcher.innerHTML = `
    <button type="button" data-language="en" data-i18n-aria-label="languageSwitcher.english">EN</button>
    <span aria-hidden="true">/</span>
    <button type="button" data-language="fr" data-i18n-aria-label="languageSwitcher.french">FR</button>
  `;

  const updateActiveLanguage = () => {
    const activeLanguage = getLanguage();
    switcher.querySelectorAll('[data-language]').forEach((button) => {
      const isActive = button.dataset.language === activeLanguage;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  };

  switcher.addEventListener('click', (event) => {
    const button = event.target.closest('[data-language]');
    if (button && LANGUAGES.includes(button.dataset.language)) {
      setLanguage(button.dataset.language);
    }
  });

  document.addEventListener('i18n:languageChanged', updateActiveLanguage);
  shell.append(switcher);
  switcher.setAttribute('aria-label', t('languageSwitcher.label'));
  translatePage(switcher);
  updateActiveLanguage();
};
