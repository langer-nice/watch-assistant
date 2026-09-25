import { getCompanyWatchLoadState, hydrateServerCompanyWatches } from './company-watch-server-store.js';
import { getMediaWatchLoadState, synchronizeMediaWatches } from './media-watch-server-store.js';

const labels = {
  en: {
    loading: 'Loading your Watches…',
    unavailable: 'We couldn’t load your Watches right now. A loading error does not delete your Watches.',
    stale: 'Showing the last saved copy for this account. It may be out of date.',
    empty: 'You don’t have any Watches yet.', retry: 'Try again',
  },
  fr: {
    loading: 'Chargement de vos Watches…',
    unavailable: 'Impossible de charger vos Watches pour le moment. Une erreur de chargement ne supprime pas vos Watches.',
    stale: 'La dernière copie enregistrée pour ce compte est affichée. Elle peut être ancienne.',
    empty: 'Vous n’avez pas encore de Watch.', retry: 'Réessayer',
  },
};
export const getWatchListAvailability = () => {
  const states = [getCompanyWatchLoadState(), getMediaWatchLoadState()].filter(s => s.status !== 'idle');
  return {
    active: states.length > 0,
    uncertain: states.some(s => s.status !== 'ready'),
    loading: states.some(s => s.status === 'loading'),
    failed: states.some(s => s.error),
    cached: states.some(s => s.hasSnapshot),
  };
};
let retrying = false;
let latestRender;
export const renderWatchLoadNotice = (language, count) => {
  latestRender = { language, count };
  const root = document.querySelector('.page--home, .page--watches, .page--detail');
  if (!root) return;
  const state = getWatchListAvailability();
  const copy = labels[language === 'fr' ? 'fr' : 'en'];
  let notice = document.getElementById('watchLoadNotice');
  if (!notice) {
    notice = document.createElement('section');
    notice.id = 'watchLoadNotice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.setAttribute('aria-atomic', 'true');
    notice.append(document.createElement('p'));
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button button--secondary';
    retry.addEventListener('click', async () => {
      if (retrying) return;
      retrying = true;
      retry.disabled = true;
      try {
        await Promise.allSettled([
          hydrateServerCompanyWatches(),
          synchronizeMediaWatches({ readOnly: true }),
        ]);
      } finally {
        retrying = false;
        renderWatchLoadNotice(latestRender.language, latestRender.count);
      }
    });
    notice.append(retry);
    const navigation = root.querySelector('.top-navigation');
    if (navigation) navigation.insertAdjacentElement('afterend', notice);
    else root.prepend(notice);
  }
  notice.hidden = !state.active || (!state.uncertain && count > 0);
  notice.setAttribute('aria-busy', String(state.loading));
  notice.querySelector('p').textContent = state.uncertain
    ? [state.failed ? copy.unavailable : state.loading ? copy.loading : '', state.cached ? copy.stale : ''].filter(Boolean).join(' ')
    : copy.empty;
  const retry = notice.querySelector('button');
  retry.textContent = copy.retry;
  retry.hidden = !state.uncertain || (!state.failed && state.loading);
  retry.disabled = retrying || state.loading;
};
