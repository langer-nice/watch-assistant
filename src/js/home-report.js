import { WATCH_CLASSIFICATIONS } from './report-status.js';

// Home describes one saved report, not the current Watch inventory. In
// particular, hydration and elapsed time must not add checks to that report.
export const selectHomeReport = ({ report = null } = {}) => {
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
  const select = classification => [...byId.values()].filter(watch => statusById.get(watch.id) === classification);
  const attentionWatches = select(WATCH_CLASSIFICATIONS.ATTENTION);
  const newlyCreatedWatches = select(WATCH_CLASSIFICATIONS.NEW);
  const updatedWatches = select(WATCH_CLASSIFICATIONS.UPDATED);
  return {
    report: snapshot, watches: [...attentionWatches, ...newlyCreatedWatches, ...updatedWatches], statusById,
    attentionWatches, newlyCreatedWatches, updatedWatches,
    // An unchanged Watch alone is not evidence of a completed report check.
    quietWatches: select(WATCH_CLASSIFICATIONS.WATCHING).filter(watch => succeededIds.has(watch.id)),
    totalChecked: attempts.filter(attempt => ['succeeded', 'failed'].includes(attempt.status)).length,
  };
};
