import { createWatchRequestGate, readWatchCache, writeWatchCache, watchRequest } from './watch-server-resilience.js';
import { localWatchStorageKey, safeStorage } from './account-storage.js';
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
let emailEnabled = false;
let running = null;
let loadError = null;
let syncError = null;
let loaded = false;
let confirmed = false;
let loading = false;
const gate = createWatchRequestGate('media');
const validateRow = (row) => {
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' || !row.watch_definition || !row.monitoring_source?.url || !['monitoring', 'paused'].includes(row.monitoring_state)) {
    throw Object.assign(new Error('Invalid media Watch list.'), { code: 'INVALID_PERSISTED_WATCHES' });
  }
  mediaWatchDefinition({ ...row.watch_definition, id: row.id, title: row.title,
    isStory: row.watch_definition.inputType === 'url', monitoringSource: row.monitoring_source,
    status: row.monitoring_state === 'paused' ? 'paused' : 'watching' });
  return row;
};
export const getMediaWatchLoadState = () => ({
  status: !owner() ? 'idle' : loading ? 'loading' : loadError ? (loaded ? 'stale' : 'unavailable') : confirmed ? 'ready' : loaded ? 'stale' : 'loading',
  hasSnapshot: loaded, error: loadError, syncing: Boolean(running), syncError,
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

// Called before local creation/update is committed. Never adopt an existing unowned Watch.
export const prepareMediaWatch = (watch, previous) => {
  if (!isMediaWatch(watch) && !previous?.mediaPersistence?.ownerId) return watch;
  const user = owner();
  const ownership = previous?.mediaPersistence?.ownerId || watch.mediaPersistence?.ownerId;
  if (!user || (previous && ownership !== user) || (ownership && ownership !== user)) return watch;
  const owned = { ...watch, mediaPersistence: { ownerId: user } };
  try {
    const definition = mediaWatchDefinition(owned);
    const existing = read(user, watch.id);
    const confirmedRow = rows.find(row => row.id === watch.id);
    if (previous && previous.status === watch.status && confirmedRow && !existing?.pending) {
      definition.monitoring_state = confirmedRow.monitoring_state;
    }
    if (existing?.deleted) return owned;
    if (JSON.stringify(existing?.definition) !== JSON.stringify(definition)) {
      const remote = rows.find((row) => row.id === watch.id);
      write(user, watch.id, {
        definition, revision: existing?.revision ?? Number(remote?.media_revision ?? 0),
        mutation: crypto.randomUUID(), baseMutation: existing?.pending ? existing.baseMutation || existing.mutation : null, pending: true, deleted: false,
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

export const getMediaServerWatches = () => (owner() && owner() === identity ? rows : []).filter((row) => !row.deleted_at).map((row) => ({
  id: row.id, title: row.title, ...row.watch_definition,
  ...(row.watch_definition.inputType === 'url' ? { isStory: true } : {}),
  monitoringSource: row.monitoring_source, feedUrl: row.monitoring_source.url,
  status: row.monitoring_state === 'paused' ? 'paused' : row.current_status,
  createdAt: row.created_at,
  lastChecked: row.last_checked_at || null,
  updates: row.last_change_item_id ? [{ id: row.last_change_item_id, timestamp: row.media_last_change_detected_at,
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
      if (Date.parse(localWatch?.lastChecked) > (Date.parse(remote.lastChecked) || 0)) {
        hydrated.lastChecked = localWatch.lastChecked;
      }
      for (const update of remote.updates) hydrated = addUpdateToWatch(hydrated, update);
      merged.set(row.id, hydrated);
    }
  }
  return [...merged.values()];
};

export const getMediaPersistenceState = (watch) => {
  if (!isMediaWatch(watch) && !watch?.mediaPersistence?.ownerId) return null;
  const user = owner();
  if (!user || watch.mediaPersistence?.ownerId !== user) return { status: 'local-only' };
  const job = read(user, watch.id);
  const remote = rows.find((row) => row.id === watch.id);
  if (job?.localOnly) return { status: 'local-only' };
  if (job?.conflict) return { status: 'conflict', remoteTitle: remote?.title || '', remoteRequest: remote?.watch_definition?.request || '', revision: Number(remote?.media_revision) };
  if (job?.pending) return { status: 'pending' };
  if (job?.localOnly || (!job && !remote)) return { status: 'local-only' };
  return { status: 'saved', emailEnabled };
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
    return await gate(user, async () => {
      const attempt = {};
      running = attempt;
      loading = true;
      syncError = null;
      notify();
      let failure = null;
      try {
        const jobs = readOnly ? [] : Object.keys(localStorage).filter((name) => name.startsWith(`${PREFIX}${user}.`));
        for (const name of jobs) {
          if (!fresh()) return { ok: false, code: 'AUTH_SESSION_CHANGED' };
          const job = JSON.parse(localStorage.getItem(name) || 'null');
          // Old automatic pause jobs were marked localOnly. Quarantine them; never replay.
          if (!job?.pending || job.conflict || job.localOnly) continue;
          try {
            const { watch } = await request(token, { method: 'POST', body: JSON.stringify(job) });
            if (!watch || !Number.isSafeInteger(Number(watch.media_revision))) throw Object.assign(new Error('Invalid sync response.'), { code: 'INVALID_PERSISTED_WATCH' });
            if (!fresh()) return { ok: false, code: 'AUTH_SESSION_CHANGED' };
            const current = read(user, job.definition.id);
            if (current?.mutation === job.mutation) {
              write(user, job.definition.id, { ...current, revision: Number(watch.media_revision), pending: false });
            } else if (current && current.revision === job.revision && current.baseMutation === job.mutation) {
              write(user, job.definition.id, { ...current, revision: Number(watch.media_revision), baseMutation: null });
            }
          } catch (error) {
            if (!fresh()) return { ok: false, code: 'AUTH_SESSION_CHANGED' };
            const current = read(user, job.definition.id);
            if (error.code === 'MEDIA_CONFLICT' && current?.mutation === job.mutation) {
              write(user, job.definition.id, { ...current, conflict: true });
            }
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
            confirmed = true;
            loadError = null;
            emailEnabled = body.emailEnabled === true;
            writeWatchCache('media', user, rows);
            for (const row of rows) {
              const current = read(user, row.id);
              if (current?.pending && current.baseMutation && current.baseMutation === row.media_mutation_id) {
                write(user, row.id, { ...current, revision: Number(row.media_revision), baseMutation: null, conflict: false });
              }
            }
          }
        } catch (error) {
          if (fresh()) loadError = error;
          failure ||= error;
        }
        if (failure) throw failure;
        return { ok: true };
      } finally {
        if (running === attempt) running = null;
        if (fresh()) { loading = false; syncError = failure; notify(); }
      }
    }, { automatic, scope: epoch, onSkipped: () => {
      if (fresh()) {
        const cached = readWatchCache('media', user, validateRow);
        if (cached) { rows = cached.rows; loaded = true; }
        if (!confirmed) loadError = Object.assign(new Error('Waiting before retry.'), { code: 'BACKOFF' });
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
    lastToken = token;
    generation += 1;
    latestRead += 1;
    if (next !== identity) {
      const cached = readWatchCache('media', next, validateRow);
      rows = cached?.rows || []; loaded = Boolean(cached); confirmed = false;
      loadError = null; syncError = null; loading = false;
      emailEnabled = false; identity = next; notify();
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
  window.addEventListener('focus', () => { void synchronizeMediaWatches({ automatic: true }); });
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith(PREFIX)) { notify(); void synchronizeMediaWatches({ automatic: true }); }
  });
}
