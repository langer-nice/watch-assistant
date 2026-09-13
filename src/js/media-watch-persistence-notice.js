import { getMediaPersistenceState, keepLocalMediaChanges, synchronizeMediaWatches } from './media-watch-server-store.js';

const copy = {
  en: {
    pending: 'Changes are saved on this device and waiting to sync. Automatic monitoring uses the last synced version.',
    local: 'This Watch is saved only on this device. Automatic email monitoring is unavailable for this local copy.',
    conflict: 'Your changes are saved on this device. A newer version exists on the server:',
    keep: 'Keep my local changes', retry: 'Retry sync',
  },
  fr: {
    pending: 'Les modifications sont enregistrées sur cet appareil et attendent la synchronisation. Le suivi automatique utilise la dernière version synchronisée.',
    local: 'Cette Watch est enregistrée uniquement sur cet appareil. Le suivi automatique par e-mail est indisponible pour cette copie locale.',
    conflict: 'Vos modifications sont enregistrées sur cet appareil. Une version plus récente existe sur le serveur :',
    keep: 'Conserver mes modifications locales', retry: 'Réessayer la synchronisation',
  },
};
export const renderMediaPersistenceNotice = (watch, title, language) => {
  document.getElementById('watchMediaPersistenceNotice')?.remove();
  const state = getMediaPersistenceState(watch);
  if (!state || state.status === 'saved') return;
  const labels = copy[language === 'fr' ? 'fr' : 'en'];
  const notice = document.createElement('div');
  notice.id = 'watchMediaPersistenceNotice';
  notice.setAttribute('role', 'status');
  const message = document.createElement('p');
  message.textContent = state.status === 'conflict' ? `${labels.conflict} ${state.remoteTitle} — ${state.remoteRequest}`
    : state.status === 'pending' ? labels.pending : labels.local;
  notice.append(message);
  if (state.status === 'pending' || (state.status === 'conflict' && Number.isSafeInteger(state.revision))) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'button button--secondary';
    button.textContent = state.status === 'conflict' ? labels.keep : labels.retry;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        if (state.status === 'conflict') await keepLocalMediaChanges(watch.id, state.revision);
        else await synchronizeMediaWatches();
      } finally { button.disabled = false; }
    });
    notice.append(button);
  }
  title.insertAdjacentElement('afterend', notice);
};
