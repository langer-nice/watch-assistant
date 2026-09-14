import { getCanonicalWatchClassification, isRecentlyCreatedWatch, WATCH_CLASSIFICATIONS } from './report-status.js';

// Report results stay historical, but Home's New section is a rolling 24-hour view.
// Hydrated server timestamps take precedence over a browser copy of the same UUID.
export const selectHomeReport = ({ report = null, watches = [], serverWatches = [], now = new Date() } = {}) => {
  const liveById = new Map([...watches, ...serverWatches].map(watch => [watch.id, watch]));
  const byId = new Map();
  const statusById = new Map();
  for (const entry of report?.entries || []) {
    const live = liveById.get(entry.watchId);
    const watch = {
      ...live, id: entry.watchId, title: entry.title, category: entry.category,
      reportUpdateTitle: entry.updateTitle, reportSummary: entry.summary,
      reportCheckedAt: entry.checkedAt, reportFailureCode: entry.failureCode,
    };
    let classification = entry.classification;
    if ([WATCH_CLASSIFICATIONS.NEW, WATCH_CLASSIFICATIONS.WATCHING].includes(classification)) {
      classification = live?.status !== 'completed' && isRecentlyCreatedWatch(live, now)
        ? WATCH_CLASSIFICATIONS.NEW : WATCH_CLASSIFICATIONS.WATCHING;
    }
    byId.set(watch.id, watch);
    statusById.set(watch.id, classification);
  }
  // Both server-backed types can arrive after the saved report or on a new device.
  // Local-only Watches continue to enter Home through their report, as before.
  for (const watch of serverWatches) {
    if (byId.has(watch.id)) continue;
    byId.set(watch.id, watch);
    const classification = getCanonicalWatchClassification(watch, { now });
    statusById.set(watch.id, classification === WATCH_CLASSIFICATIONS.WATCHING
      && watch.status !== 'completed' && isRecentlyCreatedWatch(watch, now)
      ? WATCH_CLASSIFICATIONS.NEW : classification);
  }
  const select = classification => [...byId.values()].filter(watch => statusById.get(watch.id) === classification);
  const attentionWatches = select(WATCH_CLASSIFICATIONS.ATTENTION);
  const newlyCreatedWatches = select(WATCH_CLASSIFICATIONS.NEW);
  const updatedWatches = select(WATCH_CLASSIFICATIONS.UPDATED);
  return {
    report, watches: [...attentionWatches, ...newlyCreatedWatches, ...updatedWatches], statusById,
    attentionWatches, newlyCreatedWatches, updatedWatches,
    quietWatches: select(WATCH_CLASSIFICATIONS.WATCHING), totalChecked: report?.counts.completed || 0,
  };
};
