import { currencyCriteriaFor } from './currency-watch.js';
import { getMediaWatchLoadState, getMediaPersistenceState, keepLocalMediaChanges, synchronizeMediaWatches } from './media-watch-server-store.js';
import { claimLocalMediaWatch, getWatchById } from './watch-storage.js';

const copy = {
  en: {
    currencyEnabled: 'This Watch is synced. Email is enabled when the daily ECB rate meets the target, once per condition.',
    saved: 'This Watch is synced. Email notifications are disabled.',
    enabled: 'This Watch is synced. Email notifications are enabled for new matching articles after the first automatic check.',
    pending: 'Changes are saved on this device and waiting to sync. Automatic monitoring starts after the first sync; until then, only a previously synced version can run.',
    local: 'This Watch is saved only on this device. It will not appear on other devices or send automatic emails. Open Edit Watch to review the request and monitoring source; wait for a synced confirmation before relying on it.',
    claimable: 'This Watch is saved only on this device. Select Sync this Watch to save this existing Watch to your account, then wait for confirmation.',
    conflict: 'Your changes are saved on this device. A newer version exists on the server:',
    syncing: 'Syncing…', failed: 'Sync failed. Your changes are still saved on this device.',
    keep: 'Keep my local changes', retry: 'Retry sync', claim: 'Sync this Watch',
  },
  fr: {
    currencyEnabled: 'Cette Watch est synchronisée. Un e-mail sera envoyé lorsque le cours quotidien BCE satisfait le seuil, une fois par condition.',
    saved: 'Cette Watch est synchronisée. Les notifications par e-mail sont désactivées.',
    enabled: 'Cette Watch est synchronisée. Les notifications par e-mail sont activées pour les nouveaux articles correspondants après le premier contrôle automatique.',
    pending: 'Les modifications sont enregistrées sur cet appareil et attendent la synchronisation. Le suivi automatique commence après la première synchronisation ; jusque-là, seule une version déjà synchronisée peut fonctionner.',
    local: 'Cette Watch est enregistrée uniquement sur cet appareil. Elle ne sera pas visible sur vos autres appareils et n’enverra pas d’e-mails automatiques. Ouvrez Modifier pour vérifier la demande et la source de surveillance ; attendez la confirmation de synchronisation.',
    claimable: 'Cette Watch est enregistrée uniquement sur cet appareil. Choisissez Synchroniser cette Watch pour enregistrer cette Watch existante dans votre compte, puis attendez la confirmation.',
    conflict: 'Vos modifications sont enregistrées sur cet appareil. Une version plus récente existe sur le serveur :',
    syncing: 'Synchronisation en cours…', failed: 'La synchronisation a échoué. Vos modifications restent enregistrées sur cet appareil.',
    keep: 'Conserver mes modifications locales', retry: 'Réessayer la synchronisation', claim: 'Synchroniser cette Watch',
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
      : state.status === 'saved' ? (state.emailEnabled ? (currencyCriteriaFor(watch) ? labels.currencyEnabled : labels.enabled) : labels.saved)
        : state.status === 'pending' ? labels.pending
          : state.canClaim ? labels.claimable : labels.local;
  let button = notice.querySelector('button');
  const actionable = state.canClaim || state.status === 'pending'
    || (state.status === 'conflict' && Number.isSafeInteger(state.revision));
  if (!actionable) { button?.remove(); return; }
  if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'button button--secondary';
    notice.append(button);
  }
  button.textContent = state.canClaim ? labels.claim
    : state.status === 'conflict' ? labels.keep : labels.retry;
  button.disabled = sync.syncing;
  button.onclick = async () => {
    if (button.disabled) return;
    const hadFocus = document.activeElement === button;
    button.disabled = true;
    message.textContent = labels.syncing;
    notice.setAttribute('aria-busy', 'true');
    try {
      if (state.canClaim && !claimLocalMediaWatch(watch.id)) throw new Error('Local claim unavailable');
      const result = state.status === 'conflict'
        ? await keepLocalMediaChanges(watch.id, state.revision) : await synchronizeMediaWatches();
      if (!result?.ok) message.textContent = labels.failed;
      else renderMediaPersistenceNotice(getWatchById(watch.id) || watch, title, language);
    } catch { message.textContent = labels.failed; }
    finally {
      button.disabled = false; notice.setAttribute('aria-busy', 'false');
      if (hadFocus && button.isConnected && document.activeElement === document.body) button.focus();
    }
  };
};
