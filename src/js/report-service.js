import {
  classifyReportAttempt,
  getMeaningfulWatchUpdate,
} from './report-status.js';
import { getReports, saveReport } from './report-storage.js';
import { MonitoringCheckError, normalizeFeedUrl } from './watch-monitoring.js';

let activeGeneration = null;

const iso = (clock) => clock().toISOString();
const makeId = () => (globalThis.crypto?.randomUUID?.()
  || `report-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const hasCompatibleSource = (watch) => (
  watch?.monitoringSource?.type === 'bodacc'
  || Boolean(normalizeFeedUrl(watch?.monitoringSource?.url || watch?.feedUrl || ''))
);

const addReportProvenance = (watch, resultIds, { reportId, completedAt }) => ({
  updates: (Array.isArray(watch?.updates) ? watch.updates : []).map((update) => (
    resultIds.includes(update.id)
      ? {
        ...update,
        monitoringProvenance: {
          reportId,
          watchId: watch.id,
          resultId: update.id,
          detectedAt: update.timestamp,
          reportedAt: completedAt,
        },
      }
      : update
  )),
});

const snapshotEntry = (watch, attempt, checkedAt) => {
  const classification = classifyReportAttempt({ watch, now: new Date(checkedAt) });
  const meaningfulUpdate = classification === 'updated' ? getMeaningfulWatchUpdate(watch) : null;
  return {
    watchId: watch.id,
    classification,
    title: watch.title || watch.request || '',
    category: watch.category || 'general',
    updateTitle: meaningfulUpdate?.headline || '',
    summary: meaningfulUpdate?.summary || '',
    checkedAt,
    attemptStatus: attempt.status,
    outcome: attempt.outcome,
    failureCode: attempt.code,
    resultIds: attempt.resultIds,
  };
};

const storedAttemptForWatch = (watch, completedAt) => {
  const paused = watch.status === 'paused';
  const latest = watch.lastCheckAttempt;
  const failed = latest?.status === 'failed';
  const checkedAt = latest?.attemptedAt || watch.lastChecked || completedAt;
  const meaningful = getMeaningfulWatchUpdate(watch);
  const resultIds = !failed && meaningful?.update?.id ? [meaningful.update.id] : [];
  return {
    watchId: watch.id,
    status: paused ? 'skipped' : failed ? 'failed' : 'succeeded',
    startedAt: checkedAt,
    completedAt: checkedAt,
    outcome: paused ? 'paused' : failed ? 'failed' : latest?.outcome || 'no-new-items',
    code: failed ? latest.code || 'CHECK_FAILED' : null,
    baselineCheckedAt: watch.monitoringSnapshot?.checkedAt || null,
    resultIds,
  };
};

// Check Now changes the live Watch outside report generation. Replacing the
// latest snapshot under the same ID keeps Home current without creating report
// history or rerunning unrelated network checks.
export const refreshLatestReport = ({ watches, now = () => new Date(), save = saveReport } = {}) => {
  const latest = getReports()[0];
  if (!latest) return null;
  const completedAt = now().toISOString();
  const considered = (Array.isArray(watches) ? watches : [])
    .filter((watch) => watch?.id && watch.status !== 'completed');
  const attempts = considered.map((watch) => storedAttemptForWatch(watch, completedAt));
  return save({
    ...latest,
    completedAt,
    watchIdsConsidered: considered.map(({ id }) => id),
    watchIdsChecked: considered.filter((watch) => watch.status !== 'paused').map(({ id }) => id),
    watchIdsSkipped: considered.filter((watch) => watch.status === 'paused').map(({ id }) => id),
    attempts,
    entries: considered.map((watch, index) => snapshotEntry(
      watch,
      attempts[index],
      attempts[index].completedAt,
    )),
  });
};

export const isReportGenerationInProgress = () => Boolean(activeGeneration);

export const generateReport = ({
  watches,
  checkController,
  getWatch,
  saveWatch,
  save = saveReport,
  loadReports = getReports,
  clock = () => new Date(),
  idFactory = makeId,
} = {}) => {
  if (activeGeneration) return activeGeneration;
  if (!checkController?.check || typeof getWatch !== 'function' || typeof saveWatch !== 'function') {
    return Promise.reject(new TypeError('Report generation requires the shared Watch check service'));
  }

  activeGeneration = (async () => {
    const previousReports = loadReports();
    const existingIds = new Set(previousReports.map(({ id }) => id));
    let reportId = idFactory();
    for (let attempt = 0; existingIds.has(reportId) && attempt < 5; attempt += 1) {
      reportId = idFactory();
    }
    if (existingIds.has(reportId)) throw new Error('Could not allocate a unique report ID');
    const startedAt = iso(clock);
    const considered = (Array.isArray(watches) ? watches : [])
      .filter((watch) => watch?.id && watch.status !== 'completed');
    const eligible = considered.filter((watch) => watch.status !== 'paused');
    const attempts = [];
    const entries = [];
    const watchIdsChecked = [];
    const watchIdsSkipped = [];

    for (const originalWatch of eligible) {
      const attemptStartedAt = iso(clock);
      if (!hasCompatibleSource(originalWatch)) {
        const completedAt = iso(clock);
        const attempt = {
          watchId: originalWatch.id,
          status: 'skipped',
          startedAt: attemptStartedAt,
          completedAt,
          outcome: 'missing-source',
          code: 'MISSING_FEED_URL',
          baselineCheckedAt: originalWatch.monitoringSnapshot?.checkedAt || null,
          resultIds: [],
        };
        attempts.push(attempt);
        watchIdsSkipped.push(originalWatch.id);
        entries.push(snapshotEntry(getWatch(originalWatch.id) || originalWatch, attempt, completedAt));
        continue;
      }

      watchIdsChecked.push(originalWatch.id);
      try {
        const result = await checkController.check(originalWatch.id);
        const completedAt = iso(clock);
        const resultIds = [...new Set((result.matchedItems || []).map(({ id }) => id).filter(Boolean))];
        const attempt = {
          watchId: originalWatch.id,
          status: 'succeeded',
          startedAt: attemptStartedAt,
          completedAt,
          outcome: result.outcome,
          code: null,
          baselineCheckedAt: originalWatch.monitoringSnapshot?.checkedAt || null,
          resultIds,
        };
        attempts.push(attempt);
        let currentWatch = getWatch(originalWatch.id) || result.watch || originalWatch;
        if (resultIds.length) {
          currentWatch = saveWatch(originalWatch.id, addReportProvenance(currentWatch, resultIds, {
            reportId,
            completedAt,
          })) || currentWatch;
        }
        entries.push(snapshotEntry(currentWatch, attempt, completedAt));
      } catch (error) {
        const completedAt = iso(clock);
        const code = error instanceof MonitoringCheckError ? error.code : 'CHECK_FAILED';
        const attempt = {
          watchId: originalWatch.id,
          status: 'failed',
          startedAt: attemptStartedAt,
          completedAt,
          outcome: 'failed',
          code,
          baselineCheckedAt: originalWatch.monitoringSnapshot?.checkedAt || null,
          resultIds: [],
        };
        attempts.push(attempt);
        entries.push(snapshotEntry(getWatch(originalWatch.id) || originalWatch, attempt, completedAt));
      }
    }

    return save({
      version: 1,
      id: reportId,
      startedAt,
      completedAt: iso(clock),
      watchIdsConsidered: considered.map(({ id }) => id),
      watchIdsChecked,
      watchIdsSkipped,
      attempts,
      entries,
    });
  })().finally(() => {
    activeGeneration = null;
  });

  return activeGeneration;
};
