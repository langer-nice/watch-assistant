import { getWatchListAvailability } from './watch-load-notice.js';
import {getUnreadUpdates} from './watch-updates.js';
import { watchCreationState } from './watch-creation-state.js';
import { WATCH_CLASSIFICATIONS, isRecentlyCreatedWatch, monitoringUnavailable } from './report-status.js';
import { getWatchCreationDate } from './watch-dates.js';

// Keep report facts immutable; current Watches govern New badges and link validity.
export const selectHomeReport = ({
  report = null,
  watches = [],
  now = new Date(),
  watchListAvailability = getWatchListAvailability(),
  isDisplayableWatch = (watch) => Boolean(watch.title || watch.request),
} = {}) => {
  const snapshot = report ? structuredClone(report) : null;
  const attempts = snapshot?.attempts || [];
  const succeededIds = new Set(attempts.filter(attempt => attempt.status === 'succeeded').map(attempt => attempt.watchId));
  const currentById = new Map(watches.map(watch => [watch.id, watch]));
  const authoritative = watchListAvailability.active && !watchListAvailability.uncertain
    && !watchListAvailability.loading && !watchListAvailability.waiting && !watchListAvailability.failed;
  const byId = new Map();
  const statusById = new Map();
  for (const entry of snapshot?.entries || []) {
    const local = currentById.get(entry.watchId);
    if (authoritative && !local) continue;
    byId.set(entry.watchId, {
      id: entry.watchId, title: entry.title, category: entry.category,
      reportUpdateTitle: entry.updateTitle, reportSummary: entry.summary,
      reportCheckedAt: entry.checkedAt, reportFailureCode: entry.failureCode,
    });
    // Server snapshots carry facts, never account-local read acknowledgements.
    // Apply the existing visibility rules only to automatic reports.
    let classification=entry.classification;
    if(snapshot.origin==='automatic'&&local){
      if(entry.classification===WATCH_CLASSIFICATIONS.UPDATED){
        const unread=new Set(getUnreadUpdates(local).map(update=>update.id));
        if(entry.resultIds?.length&&entry.resultIds.every(id=>local.updates?.some(update=>update.id===id))&&!entry.resultIds.some(id=>unread.has(id)))classification=WATCH_CLASSIFICATIONS.WATCHING;
      }
    }
    if(local&&classification===WATCH_CLASSIFICATIONS.NEW&&!isRecentlyCreatedWatch(local,now))classification=WATCH_CLASSIFICATIONS.WATCHING;
    statusById.set(entry.watchId, classification);
  }
  // Keep the stored report immutable, but do not present a currently local-only
  // or pending Watch as successfully monitored. Surface it regardless of age.
  const unavailableIds = new Set();
  for (const watch of watches) {
    if (!watch?.id || ['paused','completed'].includes(watch.status) || !isDisplayableWatch(watch) || (!monitoringUnavailable(watch) && !['failed','pending'].includes(watchCreationState(watch)))) continue;
    unavailableIds.add(watch.id);
    byId.set(watch.id, watch);
    statusById.set(watch.id, WATCH_CLASSIFICATIONS.ATTENTION);
  }
  const select = classification => [...byId.values()].filter(watch => statusById.get(watch.id) === classification);
  const recentWatches = watches
    .filter(watch => watch?.id && watch.status !== 'completed'
      && isDisplayableWatch(watch) && isRecentlyCreatedWatch(watch, now))
    .sort((a, b) => getWatchCreationDate(b) - getWatchCreationDate(a));
  for (const watch of recentWatches) {
    if (!byId.has(watch.id)) byId.set(watch.id, watch);
    statusById.set(watch.id, WATCH_CLASSIFICATIONS.NEW);
  }
  const attentionWatches = select(WATCH_CLASSIFICATIONS.ATTENTION);
  const newlyCreatedWatches = select(WATCH_CLASSIFICATIONS.NEW);
  const updatedWatches = select(WATCH_CLASSIFICATIONS.UPDATED);
  return {
    report: snapshot, watches: [...attentionWatches, ...newlyCreatedWatches, ...updatedWatches], statusById,
    attentionWatches, newlyCreatedWatches, updatedWatches,
    // An unchanged Watch alone is not evidence of a completed report check.
    quietWatches: select(WATCH_CLASSIFICATIONS.WATCHING).filter(watch => succeededIds.has(watch.id)),
    totalChecked: attempts.filter(attempt => !unavailableIds.has(attempt.watchId) && ['succeeded', 'failed'].includes(attempt.status)).length,
  };
};
