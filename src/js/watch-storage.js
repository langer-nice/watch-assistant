import { mockWatches } from './data/mock-watches.js';

const STORAGE_KEY = 'watchAssistant.watches';
const DELETED_WATCHES_STORAGE_KEY = 'watchAssistant.deletedWatchIds';
const BRIEFING_GENERATED_AT_KEY = 'watchAssistant.briefingGeneratedAt';
const DEMO_DATA_VERSION_KEY = 'watchAssistant.demoDataVersion';
const DEMO_DATA_VERSION = 'home-report-v1';

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
    return Array.isArray(watches) ? watches : [];
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
  return [...seededWatches, ...customWatches];
}

export function getDemoWatches() {
  const demoIds = new Set(mockWatches.map((watch) => watch.id));
  return getWatches().filter((watch) => demoIds.has(watch.id));
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
