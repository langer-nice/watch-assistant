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
let rerun = false;
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
  const response = await fetch('/api/media-watches', {
    ...options, signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Media persistence unavailable.'), { code: body.code });
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
    if (existing?.deleted) return owned;
    if (JSON.stringify(existing?.definition) !== JSON.stringify(definition)) {
      const remote = rows.find((row) => row.id === watch.id);
      write(user, watch.id, {
        definition, revision: existing?.revision ?? Number(remote?.media_revision ?? 0),
        mutation: crypto.randomUUID(), baseMutation: existing?.pending ? existing.baseMutation || existing.mutation : null, pending: true, deleted: false,
      });
    }
    queueMicrotask(() => { void synchronizeMediaWatches(); });
  } catch {
    // An unsupported edit stays local and suspends its last valid server definition.
    const existing = read(user, watch.id);
    const remote = rows.find((row) => row.id === watch.id);
    if (!existing?.deleted && !existing?.localOnly && (existing || remote)) {
      try {
        const definition = existing?.definition || {
          id: remote.id, title: remote.title, watch_definition: remote.watch_definition,
          monitoring_source: remote.monitoring_source,
        };
        write(user, watch.id, { definition: { ...definition, monitoring_state: 'paused' },
          revision: existing?.revision ?? Number(remote.media_revision), mutation: crypto.randomUUID(),
          baseMutation: existing?.pending ? existing.baseMutation || existing.mutation : null, pending: true, deleted: false, localOnly: true });
        queueMicrotask(() => { void synchronizeMediaWatches(); });
      } catch { /* Preserve local data if browser storage is unavailable. */ }
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
    if (saved?.pending || saved?.localOnly) continue;
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
  await synchronizeMediaWatches();
};

export const synchronizeMediaWatches = async () => {
  if (running) { rerun = true; return running; }
  const active = session();
  if (!active?.access_token || !active.user?.id) return;
  const user = active.user.id;
  const token = active.access_token;
  const epoch = generation;
  const fresh = () => epoch === generation && token === session()?.access_token && user === owner();
  running = (async () => {
    try {
      const jobs = Object.keys(localStorage).filter((name) => name.startsWith(`${PREFIX}${user}.`));
      for (const name of jobs) {
        if (!fresh()) return;
        const job = JSON.parse(localStorage.getItem(name) || 'null');
        if (!job?.pending || job.conflict) continue;
        try {
          const { watch } = await request(token, { method: 'POST', body: JSON.stringify(job) });
          if (!fresh()) return;
          const current = read(user, job.definition.id);
          if (current?.mutation === job.mutation) {
            write(user, job.definition.id, { ...current, revision: watch.media_revision, pending: false });
          } else if (current && current.revision === job.revision && current.baseMutation === job.mutation) {
            // Only a confirmed predecessor can advance an edit/deletion queued during this request.
            write(user, job.definition.id, { ...current, revision: watch.media_revision, baseMutation: null });
            rerun = true;
          }
        } catch (error) {
          if (!fresh()) return;
          const current = read(user, job.definition.id);
          if (error.code === 'MEDIA_CONFLICT' && current?.mutation === job.mutation) {
            write(user, job.definition.id, { ...current, conflict: true });
          }
        }
      }
      const readId = ++latestRead;
      const body = await request(token);
      if (fresh() && readId === latestRead) {
        rows = body.watches;
        emailEnabled = body.emailEnabled === true;
        for (const row of rows) {
          const current = read(user, row.id);
          if (current?.pending && current.baseMutation && current.baseMutation === row.media_mutation_id) {
            write(user, row.id, { ...current, revision: Number(row.media_revision), baseMutation: null, conflict: false });
            rerun = true;
            continue;
          }
          // An explicit deletion can retry against a newer definition without overwriting it.
          if (current?.deleted && current.conflict) {
            write(user, row.id, { ...current, revision: Number(row.media_revision),
              mutation: crypto.randomUUID(), conflict: false, pending: !row.deleted_at });
            if (!row.deleted_at) rerun = true;
          }
        }
        notify();
      }
    } catch {
      // Keep both local data and the durable pending operation for a later online/session retry.
    }
  })();
  try { await running; } finally {
    running = null;
    if (rerun) { rerun = false; void synchronizeMediaWatches(); }
  }
};

export const configureMediaWatchServerStore = async (auth) => {
  unsubscribe?.();
  authSource = auth;
  const apply = () => {
    const state = auth?.getState?.();
    if (['loading', 'confirming'].includes(state?.status)) return;
    const next = owner();
    generation += 1;
    latestRead += 1;
    if (next !== identity) { rows = []; emailEnabled = false; identity = next; notify(); }
    // Recover owned local definitions whose pending record was never written; never adopt unowned legacy data.
    try {
      const local = JSON.parse(localStorage.getItem('watchAssistant.watches') || '[]');
      for (const watch of local) {
        if (watch.mediaPersistence?.ownerId === next && !read(next, watch.id)) prepareMediaWatch(watch, watch);
      }
    } catch { /* unavailable storage leaves the browser copy intact */ }
    void synchronizeMediaWatches();
  };
  unsubscribe = auth?.subscribe?.(apply);
  apply();
  await synchronizeMediaWatches();
};
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void synchronizeMediaWatches(); });
  window.addEventListener('focus', () => { void synchronizeMediaWatches(); });
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith(PREFIX)) { notify(); void synchronizeMediaWatches(); }
  });
}
