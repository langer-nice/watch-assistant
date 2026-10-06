import { WATCH_CLASSIFICATIONS, isRecentlyCreatedWatch, monitoringUnavailable } from './report-status.js';
import { getWatchCreationDate } from './watch-dates.js';

// Home preserves the saved report and can additionally show Watches created
// since then. Live hydration must not add completed checks to that report.
export const selectHomeReport = ({
  report = null,
  watches = [],
  now = new Date(),
  isDisplayableWatch = (watch) => Boolean(watch.title || watch.request),
} = {}) => {
  const snapshot = report ? structuredClone(report) : null;
  const attempts = snapshot?.attempts || [];
  const succeededIds = new Set(attempts.filter(attempt => attempt.status === 'succeeded').map(attempt => attempt.watchId));
  const byId = new Map();
  const statusById = new Map();
  for (const entry of snapshot?.entries || []) {
    byId.set(entry.watchId, {
      id: entry.watchId, title: entry.title, category: entry.category,
      reportUpdateTitle: entry.updateTitle, reportSummary: entry.summary,
      reportCheckedAt: entry.checkedAt, reportFailureCode: entry.failureCode,
    });
    statusById.set(entry.watchId, entry.classification);
  }
  // Keep the stored report immutable, but do not present a currently local-only
  // or pending Watch as successfully monitored. Surface it regardless of age.
  const unavailableIds = new Set();
  for (const watch of watches) {
    if (!watch?.id || ['paused','completed'].includes(watch.status) || !isDisplayableWatch(watch) || !monitoringUnavailable(watch)) continue;
    unavailableIds.add(watch.id);
    byId.set(watch.id, watch);
    statusById.set(watch.id, WATCH_CLASSIFICATIONS.ATTENTION);
  }
  const select = classification => [...byId.values()].filter(watch => statusById.get(watch.id) === classification);
  const attentionWatches = select(WATCH_CLASSIFICATIONS.ATTENTION);
  const reportCompletedAt = Date.parse(snapshot?.completedAt);
  const newlyCreatedSinceReport = (Array.isArray(watches) ? watches : [])
    .filter((watch) => {
      if (!watch?.id || byId.has(watch.id) || watch.status === 'completed'
        || !isDisplayableWatch(watch) || !isRecentlyCreatedWatch(watch, now)) return false;
      // Report entries stay fixed. Only an actual creation after that report
      // can be displayed alongside it without changing its checked counts.
      return !snapshot || (Number.isFinite(reportCompletedAt)
        && getWatchCreationDate(watch).getTime() > reportCompletedAt);
    })
    .sort((a, b) => getWatchCreationDate(b) - getWatchCreationDate(a));
  const newlyCreatedWatches = [...select(WATCH_CLASSIFICATIONS.NEW), ...newlyCreatedSinceReport];
  for (const watch of newlyCreatedSinceReport) {
    statusById.set(watch.id, WATCH_CLASSIFICATIONS.NEW);
  }
  const updatedWatches = select(WATCH_CLASSIFICATIONS.UPDATED);
  return {
    report: snapshot, watches: [...attentionWatches, ...newlyCreatedWatches, ...updatedWatches], statusById,
    attentionWatches, newlyCreatedWatches, updatedWatches,
    // An unchanged Watch alone is not evidence of a completed report check.
    quietWatches: select(WATCH_CLASSIFICATIONS.WATCHING).filter(watch => succeededIds.has(watch.id)),
    totalChecked: attempts.filter(attempt => !unavailableIds.has(attempt.watchId) && ['succeeded', 'failed'].includes(attempt.status)).length,
  };
};
