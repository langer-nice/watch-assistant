import { mockWatches } from './data/mock-watches.js';
import { normalizeWatchCreationDate } from './watch-dates.js';
import { migrateWatchModel } from './watch-model.js';
import { getMeaningfulWatchUpdate, hasMeaningfulWatchUpdate } from './report-status.js';
import {
  markUpdateAsRead as markStoredUpdateAsRead,
  markUpdatesAsRead as markStoredUpdatesAsRead,
} from './watch-updates.js';
import { WATCH_STORAGE_CHANGED_EVENT } from './watch-storage-events.js';
import {
  getServerCompanyWatches,
  isCompanyWatchServerMode,
} from './company-watch-server-store.js';

const STORAGE_KEY = 'watchAssistant.watches';
const DELETED_WATCHES_STORAGE_KEY = 'watchAssistant.deletedWatchIds';
const DEMO_DATA_VERSION_KEY = 'watchAssistant.demoDataVersion';
const HTML_ENTITY_MIGRATION_KEY = 'watchAssistant.htmlEntityDecodeVersion';
const HTML_ENTITY_MIGRATION_VERSION = '1';
const REPORT_STATUS_MIGRATION_KEY = 'watchAssistant.reportStatusMigrationVersion';
const REPORT_STATUS_MIGRATION_VERSION = '2';
const creationDateWarnings = new Set();
export { WATCH_STORAGE_CHANGED_EVENT } from './watch-storage-events.js';

const notifyWatchStorageChanged = () => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new Event(WATCH_STORAGE_CHANGED_EVENT));
};

const normalizeWatchModels = (watches, { persist = false } = {}) => {
  let changed = false;
  const normalized = watches.map((watch) => {
    const result = migrateWatchModel(watch);
    changed ||= result.migrated;
    return result.watch;
  });
  if (changed && persist) saveWatches(normalized);
  return normalized;
};

const normalizeWatchCreationDates = (watches, { persist = false } = {}) => {
  let changed = false;
  const normalizedWatches = watches.map((watch) => {
    const result = normalizeWatchCreationDate(watch);
    if (!result.valid) {
      const warningId = watch.id || '(missing id)';
      if (!creationDateWarnings.has(warningId)) {
        console.warn(
          `[Watch storage] Could not recover createdAt for Watch ${warningId}; it will be shown under DATE UNKNOWN.`,
        );
        creationDateWarnings.add(warningId);
      }
      return watch;
    }
    changed ||= result.migrated;
    return result.watch;
  });

  if (changed && persist) saveWatches(normalizedWatches);
  return normalizedWatches;
};

const decodeHtmlEntities = (value) => {
  if (typeof value !== 'string' || !value.includes('&')) return value;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const migrateStoredWatchTitles = (watches) => {
  try {
    if (localStorage.getItem(HTML_ENTITY_MIGRATION_KEY) === HTML_ENTITY_MIGRATION_VERSION) {
      return watches;
    }
  } catch {
    // Continue with an in-memory migration when storage cannot be updated.
  }

  let changed = false;
  const migratedWatches = watches.map((watch) => {
    const title = decodeHtmlEntities(watch.title);
    const sourceTitle = decodeHtmlEntities(watch.sourceTitle);
    if (title === watch.title && sourceTitle === watch.sourceTitle) return watch;
    changed = true;
    return { ...watch, title, sourceTitle };
  });

  try {
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedWatches));
    }
    localStorage.setItem(HTML_ENTITY_MIGRATION_KEY, HTML_ENTITY_MIGRATION_VERSION);
  } catch {
    // The decoded in-memory data can still be rendered for this session.
  }
  return migratedWatches;
};

const migrateLegacyReportStatuses = (watches) => {
  try {
    if (localStorage.getItem(REPORT_STATUS_MIGRATION_KEY) === REPORT_STATUS_MIGRATION_VERSION) {
      return watches;
    }
  } catch {
    // Continue with an in-memory migration when storage cannot be updated.
  }

  let changed = false;
  const migrated = watches.map((watch) => {
    const hasMeaningfulUpdate = hasMeaningfulWatchUpdate(watch);
    const canRepairDisplayStatus = !['paused', 'completed', 'attention'].includes(watch.status)
      && watch.actionRequired !== true;
    const status = hasMeaningfulUpdate && canRepairDisplayStatus
      ? 'updated'
      : ['new', 'updated'].includes(watch.status) ? 'watching' : watch.status;
    const currentStatus = hasMeaningfulUpdate && canRepairDisplayStatus
      ? 'updated'
      : ['new', 'updated'].includes(watch.currentStatus) ? status || 'watching' : watch.currentStatus;
    if (status === watch.status && currentStatus === watch.currentStatus) return watch;
    changed = true;
    return { ...watch, status, currentStatus };
  });

  try {
    if (changed) saveWatches(migrated);
    localStorage.setItem(REPORT_STATUS_MIGRATION_KEY, REPORT_STATUS_MIGRATION_VERSION);
  } catch {
    // The idempotent in-memory migration remains safe for this session.
  }
  return migrated;
};

const getDeletedWatchIds = () => {
  try {
    const value = JSON.parse(localStorage.getItem(DELETED_WATCHES_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const saveDeletedWatchIds = (watchIds) => {
  localStorage.setItem(DELETED_WATCHES_STORAGE_KEY, JSON.stringify(watchIds));
};

export function getStoredWatches() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) {
      return [];
    }
    const watches = JSON.parse(json);
    return Array.isArray(watches)
      ? normalizeWatchModels(
        normalizeWatchCreationDates(
          migrateLegacyReportStatuses(migrateStoredWatchTitles(watches)),
          { persist: true },
        ),
        { persist: true },
      )
      : [];
  } catch (error) {
    console.warn('Could not read stored watches', error);
    return [];
  }
}

function saveWatches(watches) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watches));
}

export function resetStoredWatches() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DELETED_WATCHES_STORAGE_KEY);
  localStorage.removeItem(DEMO_DATA_VERSION_KEY);
  localStorage.removeItem(HTML_ENTITY_MIGRATION_KEY);
  localStorage.removeItem(REPORT_STATUS_MIGRATION_KEY);
  notifyWatchStorageChanged();
}

export function getWatches() {
  const stored = getStoredWatches();
  const deletedIds = new Set(getDeletedWatchIds());
  const demoIds = new Set(mockWatches.map((watch) => watch.id));
  const local = stored.filter((watch) => !deletedIds.has(watch.id) && !demoIds.has(watch.id));
  if (!isCompanyWatchServerMode()) return local;
  const retainedLocal = local.filter((watch) => (
    watch.inputType !== 'company' || String(watch.id).startsWith('preview-test-')
  ));
  return [...retainedLocal, ...getServerCompanyWatches()];
}

export function getDemoWatches() {
  return normalizeWatchModels(normalizeWatchCreationDates(mockWatches));
}

export function getUserCreatedWatches() {
  const demoIds = new Set(mockWatches.map((watch) => watch.id));
  const deletedIds = new Set(getDeletedWatchIds());
  const local = getStoredWatches().filter(
    (watch) => !demoIds.has(watch.id) && !deletedIds.has(watch.id),
  );
  if (!isCompanyWatchServerMode()) return local;
  return local.filter((watch) => (
    watch.inputType !== 'company' || String(watch.id).startsWith('preview-test-')
  ));
}

export function hydrateWatchStorage() {
  return {
    isHydrated: true,
    watches: getWatches(),
  };
}

export function addWatch(watch) {
  const normalizedWatch = migrateWatchModel(watch).watch;
  const stored = getStoredWatches();
  const existingIndex = stored.findIndex((item) => item.id === normalizedWatch.id);
  if (existingIndex >= 0) {
    stored[existingIndex] = normalizedWatch;
  } else {
    stored.push(normalizedWatch);
  }
  saveWatches(stored);
  saveDeletedWatchIds(getDeletedWatchIds().filter((id) => id !== normalizedWatch.id));
  notifyWatchStorageChanged();
}

export function updateWatch(id, changes) {
  const currentWatch = getWatchById(id);
  if (!currentWatch) {
    return null;
  }

  const updatedWatch = {
    ...currentWatch,
    ...changes,
    ...('status' in changes && !('currentStatus' in changes)
      ? { currentStatus: changes.status }
      : {}),
    id,
  };
  addWatch(updatedWatch);
  return updatedWatch;
}

export function markUpdateAsRead(watchId, updateId) {
  const watch = getWatchById(watchId);
  if (!watch) return null;
  return markStoredUpdateAsRead(watch, updateId, { persist: addWatch });
}

export function acknowledgeLatestWatchUpdate(watchId) {
  const watch = getWatchById(watchId);
  const latestUpdate = getMeaningfulWatchUpdate(watch)?.update;
  if (!watch || latestUpdate?.status !== 'new') return watch;
  return markStoredUpdateAsRead(watch, latestUpdate.id, { persist: addWatch });
}

export function markUpdatesAsRead(watchId, updateIds) {
  const watch = getWatchById(watchId);
  if (!watch) return null;
  return markStoredUpdatesAsRead(watch, updateIds, { persist: addWatch });
}

export function deleteWatch(id) {
  const stored = getStoredWatches().filter((watch) => watch.id !== id);
  saveWatches(stored);

  const deletedIds = new Set(getDeletedWatchIds());
  deletedIds.add(id);
  saveDeletedWatchIds([...deletedIds]);
  notifyWatchStorageChanged();
}

export function getWatchById(id) {
  if (!id) {
    return null;
  }

  return getWatches().find((watch) => watch.id === id) || null;
}
