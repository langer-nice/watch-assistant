import { HOME_NEW_WATCH_WINDOW_MS, isUserActionRequired } from './watch-grouping.js';

export const WATCH_CLASSIFICATIONS = Object.freeze({
  ATTENTION: 'attention',
  NEW: 'new',
  UPDATED: 'updated',
  WATCHING: 'watching',
});

const PLACEHOLDER_TEXT = new Set([
  '', 'undefined', 'null', 'watch created', 'created', 'untitled item',
  'nouvelle veille', 'veille créée', 'élément sans titre',
]);

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');
const comparableText = (value) => normalizeText(value).toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isTimestampOnly = (value) => (
  /^(just now|a moment ago|il y a|à l instant|\d+ (min|mins|minute|minutes|hr|hrs|hour|hours|day|days) ago)/
    .test(comparableText(value))
  || (!Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}/.test(value))
);

export const isMeaningfulUpdateText = (value) => {
  const text = normalizeText(value);
  return text.length > 2 && !PLACEHOLDER_TEXT.has(comparableText(text)) && !isTimestampOnly(text);
};

export const getMeaningfulWatchUpdate = (watch) => {
  const updates = Array.isArray(watch?.updates) ? watch.updates : [];
  const latest = [...updates].reverse().find((update) => (
    isMeaningfulUpdateText(update?.sourceTitle) || isMeaningfulUpdateText(update?.summary)
  ));
  if (latest) {
    return {
      update: latest,
      headline: isMeaningfulUpdateText(latest.sourceTitle) ? latest.sourceTitle.trim() : '',
      summary: isMeaningfulUpdateText(latest.summary) ? latest.summary.trim() : '',
    };
  }

  for (const value of [watch?.latestChange, watch?.latestUpdate]) {
    if (isMeaningfulUpdateText(value)) {
      return { update: null, headline: normalizeText(value), summary: '' };
    }
  }
  return null;
};

export const hasMeaningfulWatchUpdate = (watch) => Boolean(getMeaningfulWatchUpdate(watch));

const getUpdateTimestamp = (update) => Date.parse(
  update?.timestamp || update?.detectedAt || update?.publishedAt,
);

const isUpdateFromLatestSuccessfulCheck = (watch, meaningful) => {
  const attempt = watch?.lastCheckAttempt;
  if (attempt?.status !== 'succeeded') return false;
  if (!['matching-items', 'new-items'].includes(attempt.outcome)) return false;

  const updateId = meaningful?.update?.id;
  const candidateIds = watch?.lastCheckResult?.candidateItemIds
    || watch?.lastCheckOutcome?.candidateItemIds;
  if (updateId && Array.isArray(candidateIds)) return candidateIds.includes(updateId);

  const attemptedAt = Date.parse(attempt.attemptedAt);
  const updatedAt = getUpdateTimestamp(meaningful?.update);
  return Number.isFinite(attemptedAt) && Number.isFinite(updatedAt) && updatedAt >= attemptedAt;
};

export const isRecentlyCreatedWatch = (watch, now = new Date()) => {
  const createdAt = Date.parse(watch?.createdAt);
  const nowAt = now instanceof Date ? now.getTime() : Date.parse(now);
  const age = nowAt - createdAt;
  return createdAt > 0 && Number.isFinite(nowAt) && age >= 0 && age < HOME_NEW_WATCH_WINDOW_MS;
};

export const getLatestReportEntryForWatch = (reports, watchId) => (
  (Array.isArray(reports) ? reports : [])
    .filter((report) => report?.completedAt && Array.isArray(report.entries))
    .sort((first, second) => Date.parse(second.completedAt) - Date.parse(first.completedAt))
    .flatMap((report) => report.entries.map((entry) => ({ ...entry, reportId: report.id })))
    .find((entry) => entry.watchId === watchId) || null
);

export const getUserFacingWatchClassification = (watch, { now = new Date() } = {}) => {
  if (!watch || typeof watch !== 'object' || watch.status === 'completed') {
    return WATCH_CLASSIFICATIONS.WATCHING;
  }
  if (watch.lastCheckAttempt?.status === 'failed' || isUserActionRequired(watch)) {
    return WATCH_CLASSIFICATIONS.ATTENTION;
  }
  const meaningful = getMeaningfulWatchUpdate(watch);
  // Watches written before check attempts were introduced retain their legacy
  // Updated presentation. Modern Watches are Updated only by their latest check.
  if (meaningful && (
    !watch.lastCheckAttempt || isUpdateFromLatestSuccessfulCheck(watch, meaningful)
  )) return WATCH_CLASSIFICATIONS.UPDATED;
  if (isRecentlyCreatedWatch(watch, now)) return WATCH_CLASSIFICATIONS.NEW;
  return WATCH_CLASSIFICATIONS.WATCHING;
};

export const classifyReportAttempt = ({ watch, now } = {}) => (
  getUserFacingWatchClassification(watch, { now })
);

export const getCanonicalWatchClassification = (watch, { now = new Date() } = {}) => (
  getUserFacingWatchClassification(watch, { now })
);

export const getCanonicalStatusMap = (watches, reports, options = {}) => new Map(
  (Array.isArray(watches) ? watches : []).map((watch) => [
    watch.id,
    getCanonicalWatchClassification(watch, { ...options, reports }),
  ]),
);
