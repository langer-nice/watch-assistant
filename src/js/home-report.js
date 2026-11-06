import { getWatchListAvailability } from './watch-load-notice.js';
import { getUnreadUpdates, getWatchUpdates } from './watch-updates.js';
import { watchCreationState } from './watch-creation-state.js';
import { WATCH_CLASSIFICATIONS, isMeaningfulUpdateText, isRecentlyCreatedWatch, monitoringUnavailable } from './report-status.js';
import { getWatchCreationDate } from './watch-dates.js';

// A report timestamp and a detection timestamp use the same local calendar
// as the visible Home date. Comparing calendar days also handles DST.
const dailyScope = (reports, now, timeZone) => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' });
  const today = date.format(now);
  const isToday = value => {
    const at = Date.parse(value);
    return Number.isFinite(at) && at <= now.getTime() && date.format(at) === today;
  };
  const currentReports = reports.filter(report => isToday(report.completedAt))
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  return {
    currentReports,
    report: currentReports.find(report => report.origin === 'automatic') ?? currentReports[0] ?? null,
    isToday,
  };
};

const collectDailyUpdates = (scope, watches) => {
  const updates = new Map();
  const offer = card => {
    if (!scope.isToday(card.reportCheckedAt)) return;
    const current = updates.get(card.id);
    if (!current || Date.parse(card.reportCheckedAt) >= Date.parse(current.reportCheckedAt)) {
      updates.set(card.id, card);
    }
  };
  for (const report of scope.currentReports) {
    for (const entry of report.entries || []) {
      if (entry.classification !== 'updated' || entry.attemptStatus !== 'succeeded'
        || !entry.resultIds?.length || !['matching-items', 'new-items', 'matched'].includes(entry.outcome)) continue;
      offer({
        id: entry.watchId, title: entry.title, category: entry.category,
        reportUpdateTitle: entry.updateTitle, reportSummary: entry.summary, reportCheckedAt: entry.checkedAt,
      });
    }
  }
  for (const watch of watches) {
    const latest = getWatchUpdates(watch).findLast(update => (
      !update.id.startsWith('legacy-') && scope.isToday(update.timestamp)
      && (isMeaningfulUpdateText(update.sourceTitle) || isMeaningfulUpdateText(update.summary))
    ));
    if (latest) offer({
      ...watch, reportUpdateTitle: latest.sourceTitle,
      reportSummary: latest.summary, reportCheckedAt: latest.timestamp,
    });
  }
  return updates;
};

// Keep report facts immutable; current Watches govern New badges and link validity.
export const selectHomeReport = ({
  report = null,
  reports,
  watches = [],
  now = new Date(),
  timeZone,
  watchListAvailability = getWatchListAvailability(),
  isDisplayableWatch = (watch) => Boolean(watch.title || watch.request),
} = {}) => {
  const daily = Array.isArray(reports) ? dailyScope(reports, now, timeZone) : null;
  const selected = daily ? daily.report : report;
  const snapshot = selected ? structuredClone(selected) : null;
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
    if (!daily && snapshot.origin==='automatic'&&local){
      if(entry.classification===WATCH_CLASSIFICATIONS.UPDATED){
        const unread=new Set(getUnreadUpdates(local).map(update=>update.id));
        if(entry.resultIds?.length&&entry.resultIds.every(id=>local.updates?.some(update=>update.id===id))&&!entry.resultIds.some(id=>unread.has(id)))classification=WATCH_CLASSIFICATIONS.WATCHING;
      }
    }
    if (daily && classification === WATCH_CLASSIFICATIONS.UPDATED) classification = WATCH_CLASSIFICATIONS.WATCHING;
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
  if (daily) {
    const updates = collectDailyUpdates(daily, watches.filter(isDisplayableWatch));
    for (const [id, card] of updates) {
      if (authoritative && !currentById.has(id)) continue;
      if (currentById.get(id)?.status === 'completed') continue;
      byId.set(id, card);
      statusById.set(id, WATCH_CLASSIFICATIONS.UPDATED);
    }
  }
  const select = classification => [...byId.values()].filter(watch => statusById.get(watch.id) === classification);
  const recentWatches = watches
    .filter(watch => watch?.id && watch.status !== 'completed'
      && isDisplayableWatch(watch) && isRecentlyCreatedWatch(watch, now))
    .sort((a, b) => getWatchCreationDate(b) - getWatchCreationDate(a));
  for (const watch of recentWatches) {
    if (daily && [WATCH_CLASSIFICATIONS.ATTENTION, WATCH_CLASSIFICATIONS.UPDATED].includes(statusById.get(watch.id))) continue;
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
    totalChecked: daily ? succeededIds.size
      : attempts.filter(attempt => !unavailableIds.has(attempt.watchId) && ['succeeded', 'failed'].includes(attempt.status)).length,
  };
};
