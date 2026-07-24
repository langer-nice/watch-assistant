import { mockWatches } from './data/mock-watches.js';
import { normalizeWatchCreationDate } from './watch-dates.js';

const STORAGE_KEY = 'watchAssistant.watches';
const DELETED_WATCHES_STORAGE_KEY = 'watchAssistant.deletedWatchIds';
const BRIEFING_GENERATED_AT_KEY = 'watchAssistant.briefingGeneratedAt';
const DEMO_DATA_VERSION_KEY = 'watchAssistant.demoDataVersion';
const DEMO_DATA_VERSION = 'home-report-v1';
const HTML_ENTITY_MIGRATION_KEY = 'watchAssistant.htmlEntityDecodeVersion';
const HTML_ENTITY_MIGRATION_VERSION = '1';
const creationDateWarnings = new Set();

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

export function getBriefingGeneratedAt() {
  try {
    const value = localStorage.getItem(BRIEFING_GENERATED_AT_KEY);
    return value && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function setBriefingGeneratedAt(date = new Date()) {
  const timestamp = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError('briefingGeneratedAt must be a valid date');
  }

  const value = timestamp.toISOString();
  localStorage.setItem(BRIEFING_GENERATED_AT_KEY, value);
  return value;
}

export function getStoredWatches() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) {
      return [];
    }
    const watches = JSON.parse(json);
    return Array.isArray(watches)
      ? normalizeWatchCreationDates(migrateStoredWatchTitles(watches), { persist: true })
      : [];
  } catch (error) {
    console.warn('Could not read stored watches', error);
    return [];
  }
}

function saveWatches(watches) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watches));
}

const ensureCurrentDemoData = () => {
  try {
    if (localStorage.getItem(DEMO_DATA_VERSION_KEY) === DEMO_DATA_VERSION) return;

    const demoIds = new Set(mockWatches.map((watch) => watch.id));
    const customWatches = getStoredWatches().filter((watch) => !demoIds.has(watch.id));
    const customDeletedIds = getDeletedWatchIds().filter((id) => !demoIds.has(id));
    saveWatches(customWatches);
    saveDeletedWatchIds(customDeletedIds);
    localStorage.setItem(DEMO_DATA_VERSION_KEY, DEMO_DATA_VERSION);
  } catch {
    // Canonical in-memory demo data remains available when storage is unavailable.
  }
};

export function resetStoredWatches() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DELETED_WATCHES_STORAGE_KEY);
  localStorage.removeItem(DEMO_DATA_VERSION_KEY);
  localStorage.removeItem(HTML_ENTITY_MIGRATION_KEY);
}

export function getWatches() {
  ensureCurrentDemoData();
  const stored = getStoredWatches();
  const deletedIds = new Set(getDeletedWatchIds());
  const mockIds = new Set(mockWatches.map((watch) => watch.id));
  const storedById = new Map(stored.map((watch) => [watch.id, watch]));
  const seededWatches = mockWatches
    .filter((watch) => !deletedIds.has(watch.id))
    .map((watch) => storedById.get(watch.id) || watch);
  const customWatches = stored.filter(
    (watch) => !mockIds.has(watch.id) && !deletedIds.has(watch.id),
  );
  return normalizeWatchCreationDates([...seededWatches, ...customWatches]);
}

export function getDemoWatches() {
  const demoIds = new Set(mockWatches.map((watch) => watch.id));
  return getWatches().filter((watch) => demoIds.has(watch.id));
}

export function getUserCreatedWatches() {
  const demoIds = new Set(mockWatches.map((watch) => watch.id));
  const deletedIds = new Set(getDeletedWatchIds());
  return getStoredWatches().filter(
    (watch) => !demoIds.has(watch.id) && !deletedIds.has(watch.id),
  );
}

export function hydrateWatchStorage() {
  return {
    isHydrated: true,
    watches: getWatches(),
  };
}

export function addWatch(watch) {
  const stored = getStoredWatches();
  const existingIndex = stored.findIndex((item) => item.id === watch.id);
  if (existingIndex >= 0) {
    stored[existingIndex] = watch;
  } else {
    stored.push(watch);
  }
  saveWatches(stored);
  saveDeletedWatchIds(getDeletedWatchIds().filter((id) => id !== watch.id));
}

export function updateWatch(id, changes) {
  const currentWatch = getWatchById(id);
  if (!currentWatch) {
    return null;
  }

  const updatedWatch = { ...currentWatch, ...changes, id };
  addWatch(updatedWatch);
  return updatedWatch;
}

export function deleteWatch(id) {
  const stored = getStoredWatches().filter((watch) => watch.id !== id);
  saveWatches(stored);

  const deletedIds = new Set(getDeletedWatchIds());
  deletedIds.add(id);
  saveDeletedWatchIds([...deletedIds]);
}

export function getWatchById(id) {
  if (!id) {
    return null;
  }

  return getWatches().find((watch) => watch.id === id) || null;
}
