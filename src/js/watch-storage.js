import { mockWatches } from './data/mock-watches.js';

const STORAGE_KEY = 'watchAssistant.watches';

export function getStoredWatches() {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) {
    return [];
  }

  try {
    return JSON.parse(json) || [];
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
}

export function getWatches() {
  const stored = getStoredWatches();
  const mockIds = new Set(mockWatches.map((watch) => watch.id));
  return [...mockWatches, ...stored.filter((watch) => !mockIds.has(watch.id))];
}

export function addWatch(watch) {
  const stored = getStoredWatches();
  stored.push(watch);
  saveWatches(stored);
}

export function getWatchById(id) {
  if (!id) {
    return null;
  }

  return getWatches().find((watch) => watch.id === id) || null;
}
