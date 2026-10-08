import { getCompanyWatchLoadState, hydrateServerCompanyWatches } from './company-watch-server-store.js';
import { getMediaWatchLoadState, synchronizeMediaWatches } from './media-watch-server-store.js';

const labels = {
  en: {
    loading: 'Loading your Watches…', retrying: 'Retrying…',
    incompatible: 'Some saved Watches require another application version and are shown read-only. Other Watches have loaded.',
    partial: 'Some Watch sources could not be loaded. Available Watches remain visible.',
    unavailable: 'We couldn’t load your Watches right now. A loading error does not delete your Watches.',
    stale: 'Showing the last saved copy for this account. It may be out of date.',
    empty: 'You don’t have any Watches yet.', retry: 'Try again',
  },
  fr: {
    loading: 'Chargement de vos Watches…', retrying: 'Nouvelle tentative…',
    incompatible: 'Certaines Watches enregistrées nécessitent une autre version de l’application et sont affichées en lecture seule. Les autres Watches sont chargées.',
    partial: 'Certaines sources de Watches n’ont pas pu être chargées. Les Watches disponibles restent visibles.',
    unavailable: 'Impossible de charger vos Watches pour le moment. Une erreur de chargement ne supprime pas vos Watches.',
    stale: 'La dernière copie enregistrée pour ce compte est affichée. Elle peut être ancienne.',
    empty: 'Vous n’avez pas encore de Watch.', retry: 'Réessayer',
  },
};
export const getWatchListAvailability = () => {
  const states = [getCompanyWatchLoadState(), getMediaWatchLoadState()].filter(s => s.status !== 'idle');
  return {
    active: states.length > 0,
    incompatible: states.some(s => s.incompatible > 0),
    partial: states.some(s => s.error) && states.some(s => s.status === 'ready'),
    codes: [...new Set(states.filter(s => s.error).map(s => ['TIMEOUT','AUTH_REQUIRED','AUTH_REFRESH_REQUIRED','INVALID_PERSISTED_WATCHES','INVALID_PERSISTED_WATCH','INVALID_RESPONSE','NETWORK_ERROR','REQUEST_FAILED','DATABASE_ERROR'].includes(s.error.code) ? s.error.code : 'LOAD_FAILED'))],
    uncertain: states.some(s => s.status !== 'ready'),
    loading: states.some(s => s.status === 'loading' || s.refreshing),
    waiting: states.some(s => s.waiting),
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
  const examples = document.getElementById('exampleWatches');
  if (examples) examples.hidden = state.uncertain;
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
      renderWatchLoadNotice(latestRender.language, latestRender.count);
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
  const silentRead = !state.failed && (state.waiting || (state.cached && state.loading));
  notice.hidden = !state.active || (!retrying && !state.incompatible && (silentRead || (!state.uncertain && count > 0)));
  notice.setAttribute('aria-busy', String(retrying || state.loading));
  notice.querySelector('p').textContent = retrying ? copy.loading : state.uncertain
    ? [state.failed ? [copy.unavailable, state.partial ? copy.partial : '', state.codes.length ? `(${state.codes.join(', ')})` : ''].filter(Boolean).join(' ') : state.loading ? copy.loading : '', state.cached ? copy.stale : ''].filter(Boolean).join(' ')
    : state.incompatible ? copy.incompatible : copy.empty;
  const retry = notice.querySelector('button');
  retry.textContent = retrying ? copy.retrying : copy.retry;
  retry.hidden = !state.failed && !retrying;
  retry.disabled = retrying || state.loading;
};
