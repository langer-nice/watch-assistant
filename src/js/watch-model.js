import { normalizeFeedUrl } from './watch-monitoring.js';
import { createStoryProfile } from './story-profile.js';

export const WATCH_MODEL_VERSION = 3;

const TECHNICAL_ATTENTION_REASONS = new Set([
  'monitoring-source-missing',
  'no-compatible-source',
  'source-persistently-unavailable',
]);

export const getMonitoringHealthPresentation = (watch) => {
  if (watch?.monitoringStatus?.state === 'setup-required') {
    return { statusKey: 'setupRequired', detailMessageKey: 'detail.feedUrlMissing' };
  }
  if (watch?.monitoringStatus?.state === 'unavailable') {
    return { statusKey: 'monitoringUnavailable', detailMessageKey: 'detail.monitoringUnavailable' };
  }
  return null;
};

const newestUpdateAt = (updates) => (Array.isArray(updates) ? updates : [])
  .map((item) => item?.detectedAt || item?.publishedAt)
  .filter((value) => value && !Number.isNaN(Date.parse(value)))
  .sort((first, second) => Date.parse(second) - Date.parse(first))[0] || null;

export const migrateWatchModel = (watch) => {
  if (!watch || typeof watch !== 'object') return { watch, migrated: false };
  const feedUrl = normalizeFeedUrl(watch.monitoringSource?.url || watch.feedUrl || '');
  const candidateUpdates = Array.isArray(watch.candidateUpdates)
    ? watch.candidateUpdates
    : Array.isArray(watch.monitoringUpdates) ? watch.monitoringUpdates : [];
  const fingerprintLabels = new Set((watch.storyFingerprint || [])
    .map((concept) => concept?.label?.toLocaleLowerCase()).filter(Boolean));
  const userAddedConcepts = (watch.storyProfile?.userAddedConcepts || watch.keywords || [])
    .filter((label) => typeof label === 'string' && (
      watch.monitoringConceptsManuallyEdited === true
      || !fingerprintLabels.has(label.toLocaleLowerCase())
    ));
  const storyProfile = watch.inputType === 'url'
    ? createStoryProfile({
      storyFingerprint: watch.storyFingerprint
        || (watch.keywords || []).map((label) => ({ label, type: 'supporting' })),
      profile: { ...(watch.storyProfile || {}), userAddedConcepts },
      sourcePublication: watch.storyProfile?.sourceArticle?.publication || watch.sourceName,
      sourceTitle: watch.storyProfile?.sourceArticle?.title || watch.sourceTitle || watch.title,
      sourceUrl: watch.storyProfile?.sourceArticle?.url || watch.sourceUrl,
      publishedAt: watch.storyProfile?.sourceArticle?.publishedAt || watch.sourcePublishedAt,
      extractedAt: watch.storyProfile?.extractedAt || watch.createdAt,
    })
    : watch.storyProfile || null;
  const missingSource = watch.inputType === 'url' && !feedUrl;
  const legacyTechnicalReason = [
    watch.monitoringIssueReason,
    watch.monitoringStatus?.reason,
    watch.attentionReason,
  ].find((reason) => TECHNICAL_ATTENTION_REASONS.has(reason));
  const monitoringIssueReason = missingSource
    ? 'no-compatible-source'
    : legacyTechnicalReason === 'source-persistently-unavailable'
      ? legacyTechnicalReason
      : null;
  const actionRequired = watch.actionRequired === true || (
    !legacyTechnicalReason
    && (watch.requiresAttention === true || watch.status === 'attention')
  );
  const monitoringStatus = monitoringIssueReason === 'no-compatible-source'
    ? { state: 'setup-required', reason: monitoringIssueReason }
    : monitoringIssueReason === 'source-persistently-unavailable'
      ? { state: 'unavailable', reason: monitoringIssueReason }
      : watch.monitoringStatus?.state === 'active'
        ? { state: 'active', reason: null }
        : { state: 'configured', reason: null };
  const status = watch.status === 'paused' || watch.status === 'completed'
    ? watch.status
    : actionRequired ? 'attention' : watch.status === 'attention' ? 'watching' : watch.status || 'watching';
  const migratedWatch = {
    ...watch,
    watchModelVersion: WATCH_MODEL_VERSION,
    monitoringSource: feedUrl
      ? {
        url: feedUrl,
        type: watch.monitoringSource?.type || 'feed',
        title: watch.monitoringSource?.title || null,
        discovery: watch.monitoringSource?.discovery || 'manual',
      }
      : null,
    feedUrl,
    storyProfile,
    candidateUpdates,
    monitoringUpdates: candidateUpdates,
    unreadUpdateCount: candidateUpdates.filter((item) => item?.status === 'candidate' || item?.status === 'unreviewed').length,
    latestUpdateAt: watch.latestUpdateAt || newestUpdateAt(candidateUpdates) || watch.latestChangeAt || null,
    monitoringStatus,
    monitoringIssueReason,
    actionRequired,
    userActionReason: actionRequired
      ? watch.userActionReason || (legacyTechnicalReason ? null : watch.attentionReason) || null
      : null,
    attentionReason: actionRequired && !legacyTechnicalReason ? watch.attentionReason || null : null,
    requiresAttention: actionRequired,
    status,
    lastCheckResult: watch.lastCheckResult || watch.lastCheckOutcome || null,
  };
  return {
    watch: migratedWatch,
    migrated: JSON.stringify(migratedWatch) !== JSON.stringify(watch),
  };
};
