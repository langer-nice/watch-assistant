import { planLocalMediaRecovery } from './local-media-recovery.js';
import { currencyCriteriaFor } from './currency-watch.js';
import { createWatchRequestGate, readWatchCache, writeWatchCache, watchRequest } from './watch-server-resilience.js';
import { getAccountOwner, localWatchStorageKey, safeStorage } from './account-storage.js';
import { addUpdateToWatch } from './watch-updates.js';
import { isMediaWatch, mediaWatchDefinition } from './media-watch-definition.js';
import { WATCH_STORAGE_CHANGED_EVENT } from './watch-storage-events.js';

const PREFIX = 'watchAssistant.mediaSync.';
let authSource;
let unsubscribe;
let generation = 0;
let latestRead = 0;
let identity = null;
let rows = [];
let emailEnabled = null;
let activeWrites = new Map();
let running = null;
let loadError = null;
let syncError = null;
let loaded = false;
let waiting = false;
let loading = false;
let refreshAttempted = false;
const gate = createWatchRequestGate('media');
const validateRow = (row) => {
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' || !row.watch_definition || !row.monitoring_source?.url || !['monitoring', 'paused'].includes(row.monitoring_state)) {
    throw Object.assign(new Error('Invalid media Watch list.'), { code: 'INVALID_PERSISTED_WATCHES' });
  }
  try { mediaWatchDefinition({ ...row.watch_definition, id: row.id, title: row.title,
    isStory: row.watch_definition.inputType === 'url', monitoringSource: row.monitoring_source,
    status: row.monitoring_state === 'paused' ? 'paused' : 'watching' });
  } catch {
    // A newer persisted definition is readable but cannot be edited by this client.
    return { ...row, clientReadOnly: true };
  }
  return { ...row, clientReadOnly: false };
};
export const getMediaWatchLoadState = () => ({
  status: !owner() ? 'idle' : loadError ? (loaded ? 'stale' : 'unavailable') : loaded ? 'ready' : 'loading',
  hasSnapshot: loaded, incompatible: rows.filter(row => !row.deleted_at && row.clientReadOnly).length, error: loadError, waiting, refreshing: loading, syncing: Boolean(running), syncError,
});
const session = () => {
  const state = authSource?.getState?.();
  return state?.status === 'authenticated' ? state.session : null;
};
const owner = () => session()?.user?.id || null;
const notify = () => globalThis.window?.dispatchEvent(new Event(WATCH_STORAGE_CHANGED_EVENT));
const key = (user, id) => `${PREFIX}${user}.${id}`;
const read = (user, id) => {
  try { return JSON.parse(localStorage.getItem(key(user, id)) || 'null'); } catch { return null; }
};
const write = (user, id, value) => localStorage.setItem(key(user, id), JSON.stringify(value));
const request = async (token, options = {}) => {
  const response = await watchRequest('/api/media-watches', {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Media persistence unavailable.'), { code: body.code, statusCode: response.status });
  return body;
};

// An older browser-only Watch may be claimed only by an explicit action in its
// current account, after a successful server list and local definition check.
export const canClaimLocalMediaWatch = (watch) => {
  const user = owner();
  if (!user || user !== getAccountOwner() || user !== identity || !loaded || loadError
    || !watch || watch.mediaPersistence?.ownerId || !isMediaWatch(watch)
    || rows.some((row) => row.id === watch.id) || read(user, watch.id)) return false;
  try { mediaWatchDefinition(watch); return true; }
  catch { return false; }
};

export const canRecoverLocalMediaWatch = (watch) => {
  const user = owner();
  if (!user || user !== getAccountOwner() || user !== identity || !loaded || loadError
    || watch?.mediaPersistence?.ownerId || rows.some(row => row.id === watch?.id) || read(user, watch?.id)) return false;
  try {
    const local = JSON.parse(safeStorage.getItem(localWatchStorageKey('watchAssistant.watches')) || '[]');
    if (!local.some(item => item.id === watch.id && item.request === watch.request && !item.mediaPersistence?.ownerId)) return false;
    planLocalMediaRecovery(watch);
    return true;
  } catch { return false; }
};

// Called before local creation/update is committed. Never adopt an existing unowned Watch.
export const prepareMediaWatch = (watch, previous, { claimExistingLocal = false } = {}) => {
  if (watch?.serverReadOnly || rows.some(row => row.id === watch?.id && row.clientReadOnly)) throw Object.assign(new Error('Read-only Watch definition'), { code: 'UNSUPPORTED_WATCH_VERSION' });
  if (!isMediaWatch(watch) && !previous?.mediaPersistence?.ownerId) return watch;
  const user = owner();
  const ownership = previous?.mediaPersistence?.ownerId || watch.mediaPersistence?.ownerId;
  const explicitClaim = claimExistingLocal && previous?.id === watch.id
    && !ownership && canClaimLocalMediaWatch(watch);
  if (!user || (previous && ownership !== user && !explicitClaim)
    || (ownership && ownership !== user)) return watch;
  const owned = { ...watch, mediaPersistence: { ownerId: user } };
  try {
    const definition = mediaWatchDefinition(owned);
    const existing = read(user, watch.id);
    const confirmedRow = rows.find(row => row.id === watch.id);
    if (previous && previous.status === watch.status && confirmedRow && !existing?.pending) {
      definition.monitoring_state = confirmedRow.monitoring_state;
    }
    if (existing?.deleted) return owned;
    // A hydrated Watch may have no local journal. Reading a result or adding
    // report provenance changes only device state, not the saved definition.
    // Compare with the confirmed server definition before creating a mutation;
    // never clear or replace an existing pending/failed/conflicted job here.
    const confirmedDefinition = !existing && confirmedRow && !confirmedRow.deleted_at
      ? mediaWatchDefinition({ ...confirmedRow.watch_definition, id: confirmedRow.id,
        title: confirmedRow.title, isStory: confirmedRow.watch_definition.inputType === 'url',
        monitoringSource: confirmedRow.monitoring_source,
        status: confirmedRow.monitoring_state === 'paused' ? 'paused' : 'watching' })
      : null;
    if (!existing && JSON.stringify(confirmedDefinition) === JSON.stringify(definition)) return owned;
    if (JSON.stringify(existing?.definition) !== JSON.stringify(definition)) {
      const remote = rows.find((row) => row.id === watch.id);
      write(user, watch.id, {
        definition, revision: existing?.revision ?? Number(remote?.media_revision ?? 0),
        mutation: crypto.randomUUID(), baseMutation: existing?.pending ? existing.baseMutation || existing.mutation : null, pending: true, deleted: false, operation: explicitClaim ? 'syncing' : 'saving',
      });
      queueMicrotask(() => { void synchronizeMediaWatches(); });
    }
  } catch {
    // Validation is not a monitoring decision. Retain the edit without sending a pause.
    const existing = read(user, watch.id);
    if (!existing?.deleted) {
      try { write(user, watch.id, { ...existing, localOnly: true, validationError: true }); }
      catch { /* The local Watch remains the source of the unsynced edit. */ }
    }
  }

  return owned;
};

export const queueMediaWatchDeletion = (watch) => {
  if (watch?.serverReadOnly) throw Object.assign(new Error('Read-only Watch definition'), { code: 'UNSUPPORTED_WATCH_VERSION' });
  const user = owner();
  if (!user || watch?.mediaPersistence?.ownerId !== user) return;
  const existing = read(user, watch.id);
  const remote = rows.find((row) => row.id === watch.id);
  if (!existing && !remote) return;
  // Retain a tombstone even when creation is still in flight.
  write(user, watch.id, {
    definition: existing?.definition || mediaWatchDefinition(watch),
    revision: existing?.revision ?? Number(remote?.media_revision ?? 0),
    mutation: crypto.randomUUID(), baseMutation: existing?.pending ? existing.baseMutation || existing.mutation : null, pending: true, deleted: true,
  });
  queueMicrotask(() => { void synchronizeMediaWatches(); });
};

// Only explicitly owned, synchronized media Watches use the authenticated path.
export const canCheckStoredMediaWatch = (watch) => Boolean(owner()
  && watch?.mediaPersistence?.ownerId === owner());
export const ensureMediaWatchSaved = async (watch) => {
  const user = owner(); const epoch = generation;
  if (watch?.serverReadOnly) throw Object.assign(new Error('Read-only Watch definition'), { code: 'UNSUPPORTED_WATCH_VERSION' });
  if (!user || watch?.mediaPersistence?.ownerId !== user) throw Object.assign(new Error('Not owned'), { code: 'AUTH_REQUIRED' });
  let synced = await synchronizeMediaWatches();
  // A coalesced in-flight read may have started before this new Watch was queued.
  // Drain that new job once; never retry a failed network/database write here.
  if (epoch === generation && user === owner()
    && (synced?.ok || synced?.code === 'BACKOFF') && read(user, watch.id)?.pending) {
    synced = await synchronizeMediaWatches();
  }
  const saved = read(user, watch.id);
  const remote = rows.find(row => row.id === watch.id && !row.deleted_at);
  if (!synced?.ok || saved?.pending || saved?.conflict || saved?.localOnly || !remote
    || epoch !== generation || user !== owner()) throw Object.assign(new Error('Watch not synchronized'), { code: 'PERSISTENCE_UNAVAILABLE' });
  return remote;
};
export const checkStoredMediaWatch = async (watch) => {
  const user = owner(); const epoch = generation;
  const remote = await ensureMediaWatchSaved(watch);
  const response = await watchRequest('/api/media-watches?action=check', {
    method: 'POST', headers: { Authorization: `Bearer ${session().access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: watch.id, revision: Number(remote.media_revision) }),
  }, 15000);
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error('Check failed'), { code: result.code || 'CHECK_FAILED' });
  if (epoch !== generation || user !== owner()) throw Object.assign(new Error('Account changed'), { code: 'AUTH_SESSION_CHANGED' });
  return result;
};
const feedSnapshot = row => Array.isArray(row.media_watch_snapshots) ? row.media_watch_snapshots[0] : row.media_watch_snapshots;
const feedState = row => {
  const snapshot = feedSnapshot(row);
  return {
    initialContext: snapshot?.initial_items == null ? null : { checkedAt: snapshot.baseline_at, items: snapshot.initial_items },
    ...(snapshot ? { monitoringSnapshot: { checkedAt: snapshot.checked_at, itemIds: snapshot.item_ids, items: snapshot.items } } : {}),
    lastCheckOutcome: row.last_check_outcome ? { type: row.last_check_outcome } : null,
    lastCheckAttempt: row.last_check_error_code ? { status: 'failed', code: row.last_check_error_code, attemptedAt: row.updated_at }
      : row.last_checked_at ? { status: 'succeeded', attemptedAt: row.last_checked_at } : null,
  };
};

export const getMediaServerWatches = () => (owner() && owner() === identity ? rows : []).filter((row) => !row.deleted_at).map((row) => ({
  id: row.id, title: row.title, ...row.watch_definition, serverReadOnly: Boolean(row.clientReadOnly),
  ...(row.watch_definition.inputType === 'url' ? { isStory: true } : {}),
  monitoringSource: row.monitoring_source, feedUrl: row.monitoring_source.url,
  monitoringState: row.monitoring_state,
  status: row.monitoring_state === 'paused' ? 'paused' : row.current_status,
  createdAt: row.watch_definition?.localCreatedAt || row.created_at,
  ...(!row.watch_definition.currencyCriteria ? feedState(row) : {}),
  lastChecked: row.last_checked_at || null,
  ...(row.watch_definition.currencyCriteria ? {
    currencyEvaluation: row.currency_evaluation || null,
    currencySatisfied: Boolean(row.last_change_item_id?.startsWith(`currency:${row.watch_definition.currencyRevision}:`)),
    lastCheckOutcome: row.last_check_outcome ? { type: row.last_check_outcome } : null,
    lastCheckAttempt: row.last_check_error_code ? { status: 'failed', code: row.last_check_error_code, attemptedAt: row.updated_at }
      : row.last_checked_at ? { status: 'succeeded', attemptedAt: row.last_checked_at } : null,
  } : {}),
  updates: row.currency_watch_events?.length ? row.currency_watch_events.map(event => ({ id: event.id, timestamp: event.detected_at, sourceTitle: event.article.title, sourceUrl: event.article.url, summary: event.article.excerpt, publishedAt: event.article.publishedAt, currencyEvaluation: event.evaluation, status: 'new' })) : row.last_change_item_id ? [{ id: row.last_change_item_id, timestamp: row.media_last_change_detected_at,
    sourceTitle: row.last_change_title, sourceUrl: row.last_change_url, summary: row.last_change_summary,
    publishedAt: row.last_change_published_at, status: 'new' }] : [],
  mediaPersistence: { ownerId: owner() },
}));
export const mergeMediaWatches = (local) => {
  const user = owner();
  const visible = local.filter((watch) => !watch.mediaPersistence?.ownerId || watch.mediaPersistence.ownerId === user);
  const merged = new Map(visible.map((watch) => [watch.id, watch]));
  for (const row of (user && user === identity ? rows : [])) {
    const saved = read(user, row.id);
    if (saved?.deleted || row.deleted_at) { merged.delete(row.id); continue; }
    if ((saved?.pending || saved?.localOnly) && merged.has(row.id)) continue;
    const remote = getMediaServerWatches().find((watch) => watch.id === row.id);
    // Never replace a local Watch with uncertain ownership.
    if (!merged.has(row.id) || merged.get(row.id).mediaPersistence?.ownerId === user) {
      const localWatch = merged.get(row.id);
      let hydrated = { ...localWatch, ...remote, updates: localWatch?.updates || [] };
      // A scheduled hydration must not erase a more recent manual check on this device.
      const currency = Boolean(currencyCriteriaFor(hydrated));
      let sameCriteria = localWatch?.currencyRevision === hydrated.currencyRevision && localWatch?.currencyPolicy === hydrated.currencyPolicy;
      if (!currency) {
        try {
          const localDefinition = mediaWatchDefinition(localWatch);
          const remoteDefinition = mediaWatchDefinition(remote);
          sameCriteria = JSON.stringify(localDefinition.watch_definition) === JSON.stringify(remoteDefinition.watch_definition)
            && localDefinition.monitoring_source.url === remoteDefinition.monitoring_source.url;
        } catch { sameCriteria = false; }
      }
      if (sameCriteria && Date.parse(localWatch?.lastChecked) > (Date.parse(remote.lastChecked) || 0)) {
        hydrated.lastChecked = localWatch.lastChecked;
        if (!currency) for (const key of ['initialContext','monitoringSnapshot','lastCheckOutcome','lastCheckAttempt']) {
          if (localWatch[key] !== undefined) hydrated[key] = localWatch[key];
        }
        if (currencyCriteriaFor(hydrated) && localWatch.currencyRevision === hydrated.currencyRevision) {
          for (const key of ['currencyEvaluation','currencySatisfied','lastCheckOutcome']) hydrated[key] = localWatch[key];
        }
      }
      if (sameCriteria && Date.parse(localWatch?.lastCheckAttempt?.attemptedAt) > (Date.parse(remote.lastCheckAttempt?.attemptedAt) || 0)) {
        hydrated.lastCheckAttempt = localWatch.lastCheckAttempt;
      }
      for (const update of remote.updates) hydrated = addUpdateToWatch(hydrated, update);
      merged.set(row.id, hydrated);
    }
  }
  return [...merged.values()].map(watch => {
    const state = getMediaPersistenceState(watch);
    return state ? { ...watch, monitoringAvailability: state.status } : watch;
  });
};

export const getMediaPersistenceState = (watch) => {
  if (watch?.serverReadOnly) return { status: 'incompatible' };
  if (!isMediaWatch(watch) && !watch?.mediaPersistence?.ownerId) {
    return ['text', 'url'].includes(watch?.inputType) ? { status: 'unsupported', canRecover: canRecoverLocalMediaWatch(watch) } : null;
  }
  const user = owner();
  if (!user || watch.mediaPersistence?.ownerId !== user) {
    return { status: 'local-only', canClaim: canClaimLocalMediaWatch(watch), canRecover: canRecoverLocalMediaWatch(watch) };
  }
  const job = read(user, watch.id);
  const remote = user === identity ? rows.find((row) => row.id === watch.id) : null;
  if (job?.localOnly) return { status: 'local-only' };
  if (job?.conflict) return { status: 'conflict', remoteTitle: remote?.title || '', remoteRequest: remote?.watch_definition?.request || '', revision: Number(remote?.media_revision) };
  if (job?.pending) return { status: job.errorCode ? 'failed' : 'pending', operation: activeWrites.get(watch.id) || null };
  // A completed local journal is not a server record (deleted/missing rows too).
  if (!remote || remote.deleted_at) return { status: loaded ? 'local-only' : 'loading' };
  return { status: 'saved', emailEnabled: user === identity ? emailEnabled : null };
};

export const keepLocalMediaChanges = async (id, reviewedRevision) => {
  const user = owner();
  const job = read(user, id);
  const remote = rows.find((row) => row.id === id);
  if (!user || !job?.conflict || remote?.deleted_at || !Number.isSafeInteger(reviewedRevision)
    || Number(remote?.media_revision) !== reviewedRevision) return;
  write(user, id, { ...job, revision: reviewedRevision, mutation: crypto.randomUUID(), conflict: false, pending: true });
  notify();
  return synchronizeMediaWatches();
};

export const synchronizeMediaWatches = async ({ automatic = false, readOnly = false } = {}) => {
  const active = session();
  if (!active?.access_token || !active.user?.id) return { ok: false, code: 'AUTH_REQUIRED' };
  const user = active.user.id;
  const token = active.access_token;
  const epoch = generation;
  const fresh = () => epoch === generation && token === session()?.access_token && user === owner();
  try {
    return await gate(user, async ({ deferredRead }) => {
      const attempt = {};
      running = attempt;
      waiting = false;
      loading = true;
      syncError = null;
      notify();
      let failure = null;
      try {
        const jobs = readOnly || deferredRead ? [] : Object.keys(localStorage).filter((name) => name.startsWith(`${PREFIX}${user}.`));
        for (const name of jobs) {
          if (!fresh()) return { ok: false, code: 'AUTH_SESSION_CHANGED' };
          const job = JSON.parse(localStorage.getItem(name) || 'null');
          // Old automatic pause jobs were marked localOnly. Quarantine them; never replay.
          if (!job?.pending || job.conflict || job.localOnly || rows.some(row => row.id === job.definition?.id && row.clientReadOnly)) continue;
          try {
            activeWrites.set(job.definition.id, job.operation === 'syncing' ? 'syncing' : 'saving');
            notify();
            const { watch } = await request(token, { method: 'POST', body: JSON.stringify(job) });
            if (!watch || !Number.isSafeInteger(Number(watch.media_revision))) throw Object.assign(new Error('Invalid sync response.'), { code: 'INVALID_PERSISTED_WATCH' });
            if (!fresh()) return { ok: false, code: 'AUTH_SESSION_CHANGED' };
            const current = read(user, job.definition.id);
            if (current?.mutation === job.mutation) {
              write(user, job.definition.id, { ...current, revision: Number(watch.media_revision), pending: false, errorCode: null });
            } else if (current && current.revision === job.revision && current.baseMutation === job.mutation) {
              write(user, job.definition.id, { ...current, revision: Number(watch.media_revision), baseMutation: null });
            }
          } catch (error) {
            if (!fresh()) return { ok: false, code: 'AUTH_SESSION_CHANGED' };
            const current = read(user, job.definition.id);
            if (error.code === 'MEDIA_CONFLICT' && current?.mutation === job.mutation) {
              write(user, job.definition.id, { ...current, conflict: true });
            }
            if (current?.mutation === job.mutation) write(user, job.definition.id, { ...read(user, job.definition.id), errorCode: error.code || 'SYNC_FAILED' });
            failure = error;
            break; // One failed write ends this attempt, never a retry storm.
          }
        }
        const readId = ++latestRead;
        try {
          const body = await request(token);
          if (!Array.isArray(body?.watches)) throw Object.assign(new Error('Invalid media Watch list.'), { code: 'INVALID_PERSISTED_WATCHES' });
          const next = body.watches.map(validateRow);
          if (fresh() && readId === latestRead) {
            rows = next;
            loaded = true;
            waiting = false;
            loadError = null;
            refreshAttempted = false;
            emailEnabled = typeof body.emailEnabled === 'boolean' ? body.emailEnabled : emailEnabled;
            writeWatchCache('media', user, rows);
            for (const row of rows) {
              const current = read(user, row.id);
              if (current?.pending && current.baseMutation && current.baseMutation === row.media_mutation_id) {
                write(user, row.id, { ...current, revision: Number(row.media_revision), baseMutation: null, conflict: false });
              }
            }
          }
        } catch (error) {
          if (error.code === 'AUTH_REFRESH_REQUIRED' && fresh() && !refreshAttempted) {
            refreshAttempted = true;
            await authSource?.refreshSession?.();
          }
          if (fresh()) loadError = error;
          failure ||= error;
        }
        if (failure) throw failure;
        return { ok: true };
      } finally {
        if (running === attempt) { running = null; activeWrites.clear(); }
        if (fresh()) { loading = false; syncError = failure; notify(); }
      }
    }, { automatic, scope: epoch, deferRead: automatic, isCurrent: fresh, onSkipped: () => {
      if (fresh()) {
        const cached = readWatchCache('media', user, validateRow);
        if (cached) { rows = cached.rows; loaded = true; }
        waiting = true;
        notify();
      }
      return { ok: false, code: 'BACKOFF' };
    } });
  } catch (error) {
    return { ok: false, code: error.code || 'SYNC_FAILED' };
  }
};

export const configureMediaWatchServerStore = async (auth) => {
  unsubscribe?.();
  authSource = auth;
  let lastToken;
  const apply = () => {
    const state = auth?.getState?.();
    if (['loading', 'confirming'].includes(state?.status)) return;
    const next = owner();
    const token = session()?.access_token;
    if (next === identity && token === lastToken) return;
    gate.cancelDeferred();
    lastToken = token;
    generation += 1;
    latestRead += 1;
    running = null; activeWrites = new Map(); loading = false;
    if (next !== identity) {
      const cached = readWatchCache('media', next, validateRow);
      rows = cached?.rows || []; loaded = Boolean(cached); waiting = false;
      loadError = null; syncError = null; loading = false;
      refreshAttempted = false;
      emailEnabled = null; identity = next; notify();
    }
    // Recover owned local definitions whose pending record was never written; never adopt unowned legacy data.
    try {
      const local = JSON.parse(safeStorage.getItem(localWatchStorageKey('watchAssistant.watches')) || '[]');
      for (const watch of local) {
        if (watch.mediaPersistence?.ownerId === next && !read(next, watch.id)) prepareMediaWatch(watch, watch);
      }
    } catch { /* unavailable storage leaves the browser copy intact */ }
    void synchronizeMediaWatches({ automatic: true });
  };
  unsubscribe = auth?.subscribe?.(apply);
  apply();
  await synchronizeMediaWatches({ automatic: true });
};
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void synchronizeMediaWatches({ automatic: true }); });
  window.addEventListener('focus', () => { void synchronizeMediaWatches({ automatic: true, readOnly: true }); });
  window.addEventListener('storage', (event) => {
    if (owner() && event.key?.startsWith(`${PREFIX}${owner()}.`)) { notify(); void synchronizeMediaWatches({ automatic: true }); }
  });
}
