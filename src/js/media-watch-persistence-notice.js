import { planLocalMediaRecovery } from './local-media-recovery.js';
import { getAccountOwner } from './account-storage.js';
import { currencyCriteriaFor } from './currency-watch.js';
import { getMediaWatchLoadState, getMediaPersistenceState, keepLocalMediaChanges, synchronizeMediaWatches } from './media-watch-server-store.js';
import { claimLocalMediaWatch, recoverLocalMediaWatch, getWatchById } from './watch-storage.js';

const copy = {
  en: {
    unsupported: 'Automatic monitoring is not configured. This request is kept on this device. Edit it to clarify a supported news topic or source.',
    recover: 'Review automatic monitoring', confirmRecovery: 'Activate this news Watch',
    recovery: 'Search: {query}. Save this existing Watch to your account? The first server check creates a new baseline without alerts for existing articles. Past local results remain on this device; they are not uploaded as a server baseline.',
    currencyEnabled: 'This Watch is synced. Email is enabled when the daily ECB rate meets the target, once per condition.',
    saved: 'This Watch is synced. Email notifications are disabled.',
    enabled: 'This Watch is synced. Email notifications are enabled for new matching articles after the first automatic check.',
    pending: 'Changes are saved on this device and waiting to sync. Automatic monitoring starts after the first sync; until then, only a previously synced version can run.',
    local: 'This Watch is saved only on this device. It will not appear on other devices or send automatic emails. Open Edit Watch to review the request and monitoring source; wait for a synced confirmation before relying on it.',
    claimable: 'This Watch is saved only on this device. Select Sync this Watch to save this existing Watch to your account, then wait for confirmation.',
    conflict: 'Your changes are saved on this device. A newer version exists on the server:',
    loading: 'Loading saved Watch…',
    unknown: 'This Watch is saved. Email notification settings are not yet confirmed.',
    saving: 'Saving changes…', syncing: 'Syncing…', failed: 'Sync failed. Your changes are still saved on this device.',
    keep: 'Keep my local changes', retry: 'Retry sync', claim: 'Sync this Watch',
  },
  fr: {
    unsupported: 'Le suivi automatique n’est pas configuré. Cette demande reste sur cet appareil. Modifiez-la pour préciser un sujet d’actualité ou une source compatible.',
    recover: 'Vérifier le suivi automatique', confirmRecovery: 'Activer cette Watch d’actualité',
    recovery: 'Recherche : {query}. Enregistrer cette Watch existante dans votre compte ? Le premier contrôle serveur établira une nouvelle référence sans alerte pour les articles existants. Les anciens résultats restent sur cet appareil ; ils ne deviennent pas une référence serveur.',
    currencyEnabled: 'Cette Watch est synchronisée. Un e-mail sera envoyé lorsque le cours quotidien BCE satisfait le seuil, une fois par condition.',
    saved: 'Cette Watch est synchronisée. Les notifications par e-mail sont désactivées.',
    enabled: 'Cette Watch est synchronisée. Les notifications par e-mail sont activées pour les nouveaux articles correspondants après le premier contrôle automatique.',
    pending: 'Les modifications sont enregistrées sur cet appareil et attendent la synchronisation. Le suivi automatique commence après la première synchronisation ; jusque-là, seule une version déjà synchronisée peut fonctionner.',
    local: 'Cette Watch est enregistrée uniquement sur cet appareil. Elle ne sera pas visible sur vos autres appareils et n’enverra pas d’e-mails automatiques. Ouvrez Modifier pour vérifier la demande et la source de surveillance ; attendez la confirmation de synchronisation.',
    claimable: 'Cette Watch est enregistrée uniquement sur cet appareil. Choisissez Synchroniser cette Watch pour enregistrer cette Watch existante dans votre compte, puis attendez la confirmation.',
    conflict: 'Vos modifications sont enregistrées sur cet appareil. Une version plus récente existe sur le serveur :',
    loading: 'Chargement de la Watch enregistrée…',
    unknown: 'Cette Watch est enregistrée. Les paramètres des notifications par e-mail ne sont pas encore confirmés.',
    saving: 'Enregistrement…', syncing: 'Synchronisation en cours…', failed: 'La synchronisation a échoué. Vos modifications restent enregistrées sur cet appareil.',
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
  notice.dataset.watchId = watch.id;
  const account = getAccountOwner();
  const isCurrent = () => notice.isConnected && notice.dataset.watchId === watch.id && getAccountOwner() === account;
  const sync = getMediaWatchLoadState();
  notice.setAttribute('aria-busy', String(Boolean(state.operation)));
  const message = notice.querySelector('p');
  const reviewingRecovery = state.canRecover && notice.dataset.recoveryRequest === watch.request;
  const text = reviewingRecovery ? labels.recovery.replace('{query}', planLocalMediaRecovery(watch, { language }).monitoringSource.query) : state.status === 'unsupported' ? labels.unsupported : state.status === 'failed' && !state.operation ? labels.failed : state.operation ? labels[state.operation] : sync.syncError && state.status === 'pending' ? labels.failed
    : state.status === 'conflict' ? `${labels.conflict} ${state.remoteTitle} — ${state.remoteRequest}`
      : state.status === 'saved' ? (state.emailEnabled == null ? labels.unknown : state.emailEnabled ? (currencyCriteriaFor(watch) ? labels.currencyEnabled : labels.enabled) : labels.saved)
        : state.status === 'loading' ? labels.loading
        : state.status === 'pending' ? labels.pending
          : state.canClaim ? labels.claimable : labels.local;
  // Leave the live region untouched during ordinary background reads.
  if (message.textContent !== text) message.textContent = text;
  let button = notice.querySelector('button');
  const actionable = state.canRecover || state.canClaim || ['pending','failed'].includes(state.status)
    || (state.status === 'conflict' && Number.isSafeInteger(state.revision));
  if (!actionable) { button?.remove(); return; }
  if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'button button--secondary';
    notice.append(button);
  }
  button.textContent = state.canRecover ? (reviewingRecovery ? labels.confirmRecovery : labels.recover) : state.canClaim ? labels.claim
    : state.status === 'conflict' ? labels.keep : labels.retry;
  button.disabled = sync.syncing;
  button.onclick = async () => {
    if (button.disabled || !isCurrent()) return;
    if (state.canRecover && !reviewingRecovery) {
      notice.dataset.recoveryRequest = watch.request;
      renderMediaPersistenceNotice(watch, title, language);
      return;
    }
    const hadFocus = document.activeElement === button;
    button.disabled = true;
    message.textContent = state.canClaim ? labels.syncing : labels.saving;
    notice.setAttribute('aria-busy', 'true');
    try {
      if (state.canRecover && !recoverLocalMediaWatch(watch.id, watch.request, language)) throw new Error('Recovery unavailable');
      if (!state.canRecover && state.canClaim && !claimLocalMediaWatch(watch.id)) throw new Error('Local claim unavailable');
      const result = state.status === 'conflict'
        ? await keepLocalMediaChanges(watch.id, state.revision) : await synchronizeMediaWatches();
      if (!isCurrent() || result?.code === 'AUTH_SESSION_CHANGED') return;
      if (!result?.ok) message.textContent = labels.failed;
      else renderMediaPersistenceNotice(getWatchById(watch.id) || watch, title, language);
    } catch { if (isCurrent()) message.textContent = labels.failed; }
    finally {
      if (!isCurrent()) return;
      button.disabled = false; notice.setAttribute('aria-busy', 'false');
      if (hadFocus && button.isConnected && document.activeElement === document.body) button.focus();
    }
  };
};
