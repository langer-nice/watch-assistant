import { t, translatePage } from './i18n.js';
import { createLanguageControl } from './language-control.js';

const HOME_DESTINATION = 'index.html?entry=navigation';

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
      destination: { href: HOME_DESTINATION, labelKey: 'common.home' },
    };
  }
  if (document.querySelector('.page--detail')) {
    return {
      pattern: 'breadcrumb',
      destinations: [
        { href: HOME_DESTINATION, labelKey: 'common.home' },
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
        : { href: HOME_DESTINATION, labelKey: 'newWatch.back' },
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

  const controls = navigation.querySelector('.top-navigation__controls');
  controls.prepend(createLanguageControl({ theme: 'light' }));
  const profileTrigger = navigation.querySelector('[data-profile-trigger]');
  const profileMenu = navigation.querySelector('[data-profile-menu]');

  const openProfileMenu = () => {
    document.dispatchEvent(new CustomEvent('profile-control:opening'));
    profileMenu.hidden = false;
    profileTrigger.setAttribute('aria-expanded', 'true');
  };

  profileTrigger.addEventListener('click', () => {
    if (profileMenu.hidden) openProfileMenu();
    else closePopover(profileMenu, profileTrigger);
  });

  document.addEventListener('click', (event) => {
    if (profileMenu.hidden || navigation.contains(event.target)) return;
    closePopover(profileMenu, profileTrigger, {
      restoreFocus: navigation.contains(document.activeElement),
    });
  });

  document.addEventListener('language-control:opening', () => {
    closePopover(profileMenu, profileTrigger, { restoreFocus: false });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!profileMenu.hidden) closePopover(profileMenu, profileTrigger);
  });
};
