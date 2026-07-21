import { getLanguage, setLanguage, translatePage } from './i18n.js';

const LANGUAGE_OPTIONS = [
  { code: 'en', labelKey: 'languageSwitcher.englishName' },
  { code: 'fr', labelKey: 'languageSwitcher.frenchName' },
];

const globeIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>
  </svg>
`;

const closeMenu = (control, { restoreFocus = true } = {}) => {
  const trigger = control.querySelector('[data-language-trigger]');
  const menu = control.querySelector('[data-language-menu]');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger?.focus({ preventScroll: true });
};

export const createLanguageControl = ({ theme = 'light' } = {}) => {
  const control = document.createElement('div');
  control.className = `language-control language-control--${theme}`;
  control.setTheme = (nextTheme) => {
    control.classList.toggle('language-control--dark', nextTheme === 'dark');
    control.classList.toggle('language-control--light', nextTheme !== 'dark');
  };
  control.innerHTML = `
    <button
      class="language-control__trigger"
      type="button"
      data-language-trigger
      aria-haspopup="menu"
      aria-expanded="false"
      data-i18n-aria-label="topNavigation.changeLanguage"
    >${globeIcon}</button>
    <div
      class="language-control__menu"
      role="menu"
      data-language-menu
      data-i18n-aria-label="languageSwitcher.label"
      hidden
    >
      ${LANGUAGE_OPTIONS.map(({ code, labelKey }) => `
        <button type="button" role="menuitemradio" data-language="${code}">
          <span class="language-control__check" aria-hidden="true">✓</span>
          <span data-i18n="${labelKey}"></span>
        </button>
      `).join('')}
    </div>
  `;

  translatePage(control);
  const trigger = control.querySelector('[data-language-trigger]');
  const menu = control.querySelector('[data-language-menu]');

  const updateSelection = () => {
    const activeLanguage = getLanguage();
    control.querySelectorAll('[data-language]').forEach((button) => {
      const selected = button.dataset.language === activeLanguage;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
  };

  const openMenu = () => {
    document.dispatchEvent(new CustomEvent('language-control:opening', { detail: { control } }));
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const selected = menu.querySelector('[aria-checked="true"]');
    window.requestAnimationFrame(() => selected?.focus({ preventScroll: true }));
  };

  trigger.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeMenu(control);
  });

  menu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-language]');
    if (!option) return;
    setLanguage(option.dataset.language);
    closeMenu(control);
  });

  menu.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = [...menu.querySelectorAll('[data-language]')];
    const currentIndex = options.indexOf(document.activeElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[nextIndex]?.focus();
  });

  document.addEventListener('language-control:opening', (event) => {
    if (event.detail?.control !== control) closeMenu(control, { restoreFocus: false });
  });

  document.addEventListener('profile-control:opening', () => {
    closeMenu(control, { restoreFocus: false });
  });

  document.addEventListener('click', (event) => {
    if (menu.hidden || control.contains(event.target)) return;
    closeMenu(control, { restoreFocus: control.contains(document.activeElement) });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) closeMenu(control);
  });

  document.addEventListener('i18n:languageChanged', updateSelection);
  updateSelection();
  return control;
};

export const mountOnboardingLanguageControl = () => {
  const shell = document.querySelector('.app-shell');
  if (!shell) return null;
  const existingControl = shell.querySelector('.language-control');
  if (existingControl) return existingControl;

  const control = createLanguageControl({ theme: 'dark' });
  control.classList.add('language-control--onboarding');
  shell.append(control);
  return control;
};
