export const REPORTS_STORAGE_KEY = 'watchAssistant.reports.v1';
export const REPORT_STORAGE_VERSION = 1;
export const REPORTS_CHANGED_EVENT = 'watchassistant:reportschanged';

const isValidDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const cleanIds = (value) => [...new Set((Array.isArray(value) ? value : [])
  .filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];

const normalizeAttempt = (attempt) => {
  if (!attempt || typeof attempt !== 'object' || typeof attempt.watchId !== 'string') return null;
  if (!['succeeded', 'failed', 'skipped'].includes(attempt.status)) return null;
  if (!isValidDate(attempt.startedAt) || !isValidDate(attempt.completedAt)) return null;
  return {
    watchId: attempt.watchId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    outcome: typeof attempt.outcome === 'string' ? attempt.outcome : null,
    code: typeof attempt.code === 'string' ? attempt.code : null,
    baselineCheckedAt: isValidDate(attempt.baselineCheckedAt) ? attempt.baselineCheckedAt : null,
    resultIds: cleanIds(attempt.resultIds),
  };
};

const normalizeEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || typeof entry.watchId !== 'string') return null;
  if (!['attention', 'new', 'updated', 'watching'].includes(entry.classification)) return null;
  return {
    watchId: entry.watchId,
    classification: entry.classification,
    title: typeof entry.title === 'string' ? entry.title : '',
    category: typeof entry.category === 'string' ? entry.category : 'general',
    updateTitle: typeof entry.updateTitle === 'string' ? entry.updateTitle : '',
    summary: typeof entry.summary === 'string' ? entry.summary : '',
    checkedAt: isValidDate(entry.checkedAt) ? entry.checkedAt : null,
    attemptStatus: ['succeeded', 'failed', 'skipped'].includes(entry.attemptStatus)
      ? entry.attemptStatus
      : 'failed',
    outcome: typeof entry.outcome === 'string' ? entry.outcome : null,
    failureCode: typeof entry.failureCode === 'string' ? entry.failureCode : null,
    resultIds: cleanIds(entry.resultIds),
  };
};

const deriveCounts = (attempts, entries) => ({
  considered: 0,
  completed: attempts.filter(({ status }) => status !== 'skipped').length,
  succeeded: attempts.filter(({ status }) => status === 'succeeded').length,
  failed: attempts.filter(({ status }) => status === 'failed').length,
  skipped: attempts.filter(({ status }) => status === 'skipped').length,
  attention: entries.filter(({ classification }) => classification === 'attention').length,
  new: entries.filter(({ classification }) => classification === 'new').length,
  updated: entries.filter(({ classification }) => classification === 'updated').length,
  watching: entries.filter(({ classification }) => classification === 'watching').length,
});

export const normalizeReport = (report) => {
  if (!report || typeof report !== 'object' || typeof report.id !== 'string') return null;
  if (!isValidDate(report.startedAt) || !isValidDate(report.completedAt)) return null;
  const attempts = (Array.isArray(report.attempts) ? report.attempts : [])
    .map(normalizeAttempt).filter(Boolean);
  const entries = (Array.isArray(report.entries) ? report.entries : [])
    .map(normalizeEntry).filter(Boolean);
  const watchIdsConsidered = cleanIds(report.watchIdsConsidered);
  const counts = deriveCounts(attempts, entries);
  counts.considered = watchIdsConsidered.length;
  return {
    version: REPORT_STORAGE_VERSION,
    id: report.id,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    watchIdsConsidered,
    watchIdsChecked: cleanIds(report.watchIdsChecked),
    watchIdsSkipped: cleanIds(report.watchIdsSkipped),
    attempts,
    entries,
    counts,
  };
};

const notifyReportsChanged = () => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(REPORTS_CHANGED_EVENT));
  }
};

export const getReports = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(REPORTS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeReport).filter(Boolean)
      .sort((first, second) => Date.parse(second.completedAt) - Date.parse(first.completedAt));
  } catch {
    return [];
  }
};

export const getReportById = (reportId) => getReports().find(({ id }) => id === reportId) || null;
export const getLatestReport = () => getReports()[0] || null;

export const saveReport = (report) => {
  const normalized = normalizeReport(report);
  if (!normalized) throw new TypeError('A complete valid report is required');
  const reports = getReports().filter(({ id }) => id !== normalized.id);
  reports.push(normalized);
  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
  notifyReportsChanged();
  return normalized;
};

export const resetStoredReports = () => {
  localStorage.removeItem(REPORTS_STORAGE_KEY);
  notifyReportsChanged();
};
