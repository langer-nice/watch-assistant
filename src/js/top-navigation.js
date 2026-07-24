import { t, translatePage } from './i18n.js';
import { createLanguageControl } from './language-control.js';
import { hasCompletedOnboarding } from './intro-flow.js';

const HOME_DESTINATION = 'index.html?entry=navigation';

const primaryDestinations = [
  {
    id: 'home',
    href: HOME_DESTINATION,
    labelKey: 'common.home',
    icon: '<path d="M3.5 10.5 12 3l8.5 7.5"></path><path d="M5.5 9v11h13V9"></path><path d="M9.5 20v-6h5v6"></path>',
  },
  {
    id: 'watches',
    href: 'watches.html',
    labelKey: 'common.watches',
    icon: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
  },
  {
    id: 'new-watch',
    href: 'new-watch.html',
    labelKey: 'topNavigation.newWatch',
    icon: '<path d="M12 5v14M5 12h14"></path>',
  },
];

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
    if (!hasCompletedOnboarding()) return null;
    return {
      pattern: 'none',
      activeSection: 'home',
      showMobileNewWatchAction: true,
    };
  }
  if (document.querySelector('.page--watches')) {
    return {
      pattern: 'none',
      activeSection: 'watches',
      showMobileNewWatchAction: true,
    };
  }
  if (document.querySelector('.page--detail')) {
    return {
      pattern: 'single',
      activeSection: 'watches',
      destination: { href: 'watches.html', labelKey: 'detail.backToAllWatches' },
      showMobileNewWatchAction: true,
    };
  }
  if (document.querySelector('.page--form')) {
    const isEdit = params.has('edit');
    const isGuidedOnboarding = params.get('onboarding') === 'first-watch';
    if (!isGuidedOnboarding) {
      return {
        pattern: 'none',
        activeSection: isEdit ? 'watches' : 'new-watch',
      };
    }
    return {
      pattern: 'single',
      activeSection: 'new-watch',
      showPrimary: false,
      destination: { href: HOME_DESTINATION, labelKey: 'newWatch.back' },
      backId: 'newWatchBack',
    };
  }
  if (document.querySelector('.page--follow-story')) {
    return {
      pattern: 'single',
      activeSection: 'watches',
      destination: { href: 'watches.html', labelKey: 'detail.backToAllWatches' },
      showMobileNewWatchAction: true,
    };
  }
  return null;
};

const renderPrimaryDestinations = (
  activeSection,
  modifier,
  destinationIds = primaryDestinations.map(({ id }) => id),
) => primaryDestinations
  .filter(({ id }) => destinationIds.includes(id))
  .map((destination) => {
    const active = destination.id === activeSection;
    const current = active ? ' aria-current="page"' : '';
    const actionClass = destination.id === 'new-watch' ? ' primary-navigation__item--action' : '';
    return `
      <a class="primary-navigation__item primary-navigation__item--${modifier}${actionClass}" href="${destination.href}"${current}>
        <svg viewBox="0 0 24 24" aria-hidden="true">${destination.icon}</svg>
        <span data-i18n="${destination.labelKey}"></span>
      </a>
    `;
  })
  .join('');

const renderLeftNavigation = (config) => {
  if (config.pattern === 'single') {
    const id = config.backId ? ` id="${config.backId}"` : '';
    return `
      <a class="top-navigation__back"${id} href="${config.destination.href}">
        <span data-top-navigation-label data-i18n="${config.destination.labelKey}"></span>
      </a>
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
  navigation.dataset.primaryNavigation = config.showPrimary === false ? 'hidden' : 'visible';
  navigation.dataset.i18nAriaLabel = 'topNavigation.label';
  navigation.innerHTML = `
    <div class="top-navigation__left">${renderLeftNavigation(config)}</div>
    ${config.showPrimary === false ? '' : `
      <div class="primary-navigation primary-navigation--header">
        ${renderPrimaryDestinations(config.activeSection, 'header', ['home', 'watches'])}
      </div>
    `}
    <div class="top-navigation__controls">
      ${config.showPrimary === false ? '' : `
        <a class="top-navigation__new-watch" href="new-watch.html"${config.activeSection === 'new-watch' ? ' aria-current="page"' : ''}>
          <span aria-hidden="true">+</span>
          <span data-i18n="topNavigation.newWatch"></span>
        </a>
      `}
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

  if (config.showMobileNewWatchAction) {
    const shell = page.closest('.app-shell');
    const mobileAction = document.createElement('div');
    mobileAction.className = 'mobile-new-watch-action';
    mobileAction.innerHTML = `
      <a class="mobile-new-watch-action__button" href="new-watch.html">
        <span aria-hidden="true">+</span>
        <span data-i18n="topNavigation.newWatch"></span>
      </a>
    `;
    translatePage(mobileAction);
    shell?.append(mobileAction);
  }
  navigation.setAttribute('aria-label', t('topNavigation.label'));
  translatePage(navigation);

  const controls = navigation.querySelector('.top-navigation__controls');
  const profileControl = controls.querySelector('.top-navigation__control');
  controls.insertBefore(createLanguageControl({ theme: 'light' }), profileControl);
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
