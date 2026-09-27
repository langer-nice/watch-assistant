import { getMediaWatchLoadState, getMediaPersistenceState, keepLocalMediaChanges, synchronizeMediaWatches } from './media-watch-server-store.js';

const copy = {
  en: {
    saved: 'This Watch is synced. Email notifications are disabled.',
    enabled: 'This Watch is synced. Email notifications are enabled for new matching articles after the first automatic check.',
    pending: 'Changes are saved on this device and waiting to sync. Automatic monitoring starts after the first sync; until then, only a previously synced version can run.',
    local: 'This Watch is saved only on this device. Automatic email monitoring is unavailable for this local copy.',
    conflict: 'Your changes are saved on this device. A newer version exists on the server:',
    syncing: 'Syncing…', failed: 'Sync failed. Your changes are still saved on this device.',
    keep: 'Keep my local changes', retry: 'Retry sync',
  },
  fr: {
    saved: 'Cette Watch est synchronisée. Les notifications par e-mail sont désactivées.',
    enabled: 'Cette Watch est synchronisée. Les notifications par e-mail sont activées pour les nouveaux articles correspondants après le premier contrôle automatique.',
    pending: 'Les modifications sont enregistrées sur cet appareil et attendent la synchronisation. Le suivi automatique commence après la première synchronisation ; jusque-là, seule une version déjà synchronisée peut fonctionner.',
    local: 'Cette Watch est enregistrée uniquement sur cet appareil. Le suivi automatique par e-mail est indisponible pour cette copie locale.',
    conflict: 'Vos modifications sont enregistrées sur cet appareil. Une version plus récente existe sur le serveur :',
    syncing: 'Synchronisation en cours…', failed: 'La synchronisation a échoué. Vos modifications restent enregistrées sur cet appareil.',
    keep: 'Conserver mes modifications locales', retry: 'Réessayer la synchronisation',
  },
};
export const renderMediaPersistenceNotice = (watch, title, language) => {
  let notice = document.getElementById('watchMediaPersistenceNotice');
  const state = getMediaPersistenceState(watch);
  if (!state) { notice?.remove(); return; }
  const labels = copy[language === 'fr' ? 'fr' : 'en'];
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'watchMediaPersistenceNotice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.setAttribute('aria-atomic', 'true');
    notice.append(document.createElement('p'));
    title.insertAdjacentElement('afterend', notice);
  }
  const sync = getMediaWatchLoadState();
  notice.setAttribute('aria-busy', String(sync.syncing));
  const message = notice.querySelector('p');
  message.textContent = sync.syncing ? labels.syncing : sync.syncError ? labels.failed
    : state.status === 'conflict' ? `${labels.conflict} ${state.remoteTitle} — ${state.remoteRequest}`
      : state.status === 'saved' ? (state.emailEnabled ? labels.enabled : labels.saved)
        : state.status === 'pending' ? labels.pending : labels.local;
  let button = notice.querySelector('button');
  const actionable = state.status === 'pending' || (state.status === 'conflict' && Number.isSafeInteger(state.revision));
  if (!actionable) { button?.remove(); return; }
  if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'button button--secondary';
    notice.append(button);
  }
  button.textContent = state.status === 'conflict' ? labels.keep : labels.retry;
  button.disabled = sync.syncing;
  button.onclick = async () => {
    if (button.disabled) return;
    const hadFocus = document.activeElement === button;
    button.disabled = true;
    message.textContent = labels.syncing;
    notice.setAttribute('aria-busy', 'true');
    try {
      const result = state.status === 'conflict'
        ? await keepLocalMediaChanges(watch.id, state.revision) : await synchronizeMediaWatches();
      if (!result?.ok) message.textContent = labels.failed;
      else renderMediaPersistenceNotice(watch, title, language);
    } catch { message.textContent = labels.failed; }
    finally {
      button.disabled = false; notice.setAttribute('aria-busy', 'false');
      if (hadFocus && button.isConnected && document.activeElement === document.body) button.focus();
    }
  };
};
