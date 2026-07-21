import { getLanguage, setLanguage, t, translatePage } from './i18n.js';

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

const profileIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="4"></circle>
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>
  </svg>
`;

const getNavigationConfig = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('presentation') === 'modal') return null;

  if (document.querySelector('.page--home')) {
    return { pattern: 'none' };
  }
  if (document.querySelector('.page--watches')) {
    return {
      pattern: 'single',
      destination: { href: 'index.html', labelKey: 'common.home' },
    };
  }
  if (document.querySelector('.page--detail')) {
    return {
      pattern: 'breadcrumb',
      destinations: [
        { href: 'index.html', labelKey: 'common.home' },
        { href: 'watches.html', labelKey: 'detail.allWatches' },
      ],
    };
  }
  if (document.querySelector('.page--form')) {
    const fromWatches = params.get('from') === 'watches';
    return {
      pattern: 'single',
      destination: fromWatches
        ? { href: 'watches.html', labelKey: 'newWatch.allWatchesBack' }
        : { href: 'index.html', labelKey: 'newWatch.back' },
      backId: 'newWatchBack',
    };
  }
  if (document.querySelector('.page--follow-story')) {
    return {
      pattern: 'single',
      destination: { href: 'watches.html', labelKey: 'detail.allWatches' },
    };
  }
  return null;
};

const renderLeftNavigation = (config) => {
  if (config.pattern === 'single') {
    const id = config.backId ? ` id="${config.backId}"` : '';
    return `
      <a class="top-navigation__back"${id} href="${config.destination.href}">
        <span data-top-navigation-label data-i18n="${config.destination.labelKey}"></span>
      </a>
    `;
  }
  if (config.pattern === 'breadcrumb') {
    return `
      <div class="top-navigation__breadcrumb">
        <a href="${config.destinations[0].href}" data-i18n="${config.destinations[0].labelKey}"></a>
        <span aria-hidden="true">›</span>
        <a href="${config.destinations[1].href}" data-i18n="${config.destinations[1].labelKey}"></a>
      </div>
    `;
  }
  return '';
};

const closePopover = (popover, trigger, { restoreFocus = true } = {}) => {
  if (!popover || popover.hidden) return;
  popover.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger?.focus({ preventScroll: true });
};

export const initTopNavigation = () => {
  const config = getNavigationConfig();
  const page = document.querySelector('.page');
  if (!config || !page || page.querySelector('.top-navigation')) return;

  const navigation = document.createElement('nav');
  navigation.className = 'top-navigation';
  navigation.dataset.pattern = config.pattern;
  navigation.dataset.i18nAriaLabel = 'topNavigation.label';
  navigation.innerHTML = `
    <div class="top-navigation__left">${renderLeftNavigation(config)}</div>
    <div class="top-navigation__controls">
      <div class="top-navigation__control">
        <button
          class="top-navigation__icon-button"
          type="button"
          data-language-trigger
          aria-controls="topNavigationLanguageMenu"
          aria-haspopup="menu"
          aria-expanded="false"
          data-i18n-aria-label="topNavigation.changeLanguage"
        >${globeIcon}</button>
        <div
          class="top-navigation__popover top-navigation__language-menu"
          id="topNavigationLanguageMenu"
          role="menu"
          data-language-menu
          data-i18n-aria-label="languageSwitcher.label"
          hidden
        >
          ${LANGUAGE_OPTIONS.map(({ code, labelKey }) => `
            <button type="button" role="menuitemradio" data-language="${code}">
              <span class="top-navigation__check" aria-hidden="true">✓</span>
              <span data-i18n="${labelKey}"></span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="top-navigation__control">
        <button
          class="top-navigation__icon-button"
          type="button"
          data-profile-trigger
          aria-controls="topNavigationProfileMenu"
          aria-haspopup="dialog"
          aria-expanded="false"
          data-i18n-aria-label="topNavigation.openProfile"
        >${profileIcon}</button>
        <div
          class="top-navigation__popover top-navigation__profile-menu"
          id="topNavigationProfileMenu"
          role="dialog"
          data-profile-menu
          data-i18n-aria-label="topNavigation.accountMenu"
          hidden
        >
          <p data-i18n="topNavigation.accountComingSoon"></p>
        </div>
      </div>
    </div>
  `;

  page.prepend(navigation);
  navigation.setAttribute('aria-label', t('topNavigation.label'));
  translatePage(navigation);

  const languageTrigger = navigation.querySelector('[data-language-trigger]');
  const languageMenu = navigation.querySelector('[data-language-menu]');
  const profileTrigger = navigation.querySelector('[data-profile-trigger]');
  const profileMenu = navigation.querySelector('[data-profile-menu]');

  const updateLanguageSelection = () => {
    const activeLanguage = getLanguage();
    navigation.querySelectorAll('[data-language]').forEach((button) => {
      const selected = button.dataset.language === activeLanguage;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
  };

  const openLanguageMenu = () => {
    closePopover(profileMenu, profileTrigger, { restoreFocus: false });
    languageMenu.hidden = false;
    languageTrigger.setAttribute('aria-expanded', 'true');
    const selected = languageMenu.querySelector('[aria-checked="true"]');
    window.requestAnimationFrame(() => selected?.focus({ preventScroll: true }));
  };

  const openProfileMenu = () => {
    closePopover(languageMenu, languageTrigger, { restoreFocus: false });
    profileMenu.hidden = false;
    profileTrigger.setAttribute('aria-expanded', 'true');
  };

  languageTrigger.addEventListener('click', () => {
    if (languageMenu.hidden) openLanguageMenu();
    else closePopover(languageMenu, languageTrigger);
  });

  profileTrigger.addEventListener('click', () => {
    if (profileMenu.hidden) openProfileMenu();
    else closePopover(profileMenu, profileTrigger);
  });

  languageMenu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-language]');
    if (!option) return;
    setLanguage(option.dataset.language);
    closePopover(languageMenu, languageTrigger);
  });

  languageMenu.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = [...languageMenu.querySelectorAll('[data-language]')];
    const currentIndex = options.indexOf(document.activeElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[nextIndex]?.focus();
  });

  document.addEventListener('click', (event) => {
    if (languageMenu.hidden && profileMenu.hidden) return;
    if (!navigation.contains(event.target)) {
      closePopover(languageMenu, languageTrigger);
      closePopover(profileMenu, profileTrigger);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!languageMenu.hidden) closePopover(languageMenu, languageTrigger);
    else if (!profileMenu.hidden) closePopover(profileMenu, profileTrigger);
  });

  document.addEventListener('i18n:languageChanged', updateLanguageSelection);
  updateLanguageSelection();
};
