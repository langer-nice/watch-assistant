import {classifyReportAttempt,monitoringUnavailable,getMeaningfulWatchUpdate} from './report-status.js';
export const snapshotEntry = (watch, attempt, checkedAt) => {
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

export const storedAttemptForWatch = (watch, completedAt) => {
  const unavailable = monitoringUnavailable(watch);
  const paused = watch.status === 'paused';
  const latest = watch.lastCheckAttempt;
  const failed = latest?.status === 'failed';
  const checkedAt = latest?.attemptedAt || watch.lastChecked || completedAt;
  const meaningful = getMeaningfulWatchUpdate(watch);
  const resultIds = !failed && meaningful?.update?.id ? [meaningful.update.id] : [];
  return {
    watchId: watch.id,
    status: paused || unavailable || !latest ? 'skipped' : failed ? 'failed' : 'succeeded',
    startedAt: checkedAt,
    completedAt: checkedAt,
    outcome: unavailable ? 'persistence-unavailable' : paused ? 'paused' : failed ? 'failed' : latest?.outcome || 'no-new-items',
    code: failed ? latest.code || 'CHECK_FAILED' : null,
    baselineCheckedAt: watch.monitoringSnapshot?.checkedAt || null,
    resultIds,
  };
};

export const buildStoredReport=({watches,ownerId,id,startedAt,completedAt})=>{
 const considered=watches.filter(w=>w?.id&&w.status!=='completed');
 const attempts=considered.map(w=>storedAttemptForWatch(w,completedAt));
 return {version:2,ownerId,id,startedAt,completedAt,
 watchIdsConsidered:considered.map(w=>w.id),watchIdsChecked:attempts.filter(a=>a.status!=='skipped').map(a=>a.watchId),
 watchIdsSkipped:attempts.filter(a=>a.status==='skipped').map(a=>a.watchId),attempts,
 entries:considered.map((w,i)=>snapshotEntry(w,attempts[i],attempts[i].completedAt))};
};
