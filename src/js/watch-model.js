import { normalizeFeedUrl } from './watch-monitoring.js';
import { createStoryProfile } from './story-profile.js';
import {
  normalizeAutomaticStoryFingerprint,
  normalizeStoryFingerprint,
} from './monitoring-concepts.js';
import {
  getCategoryPendingSituationKey,
  inferWatchCategory,
  normalizeWatchCategory,
} from './watch-category.js';
import {
  getLatestUpdate,
  getUnreadUpdates,
  migrateLegacyWatchUpdates,
} from './watch-updates.js';

export const WATCH_MODEL_VERSION = 10;

const TECHNICAL_ATTENTION_REASONS = new Set([
  'monitoring-source-missing',
  'no-compatible-source',
  'source-persistently-unavailable',
]);

const normalizeBodaccMonitoringSource = (source) => (
  source?.type === 'bodacc'
  && source?.provider === 'dila'
  && source?.discovery === 'official-company'
  && typeof source?.siren === 'string'
  && /^\d{9}$/.test(source.siren)
    ? {
      type: 'bodacc',
      provider: 'dila',
      siren: source.siren,
      title: typeof source.title === 'string' ? source.title : 'BODACC',
      discovery: 'official-company',
    }
    : null
);

export const getMonitoringHealthPresentation = (watch) => {
  if (watch?.monitoringStatus?.state === 'setup-required') {
    return { statusKey: 'setupRequired' };
  }
  if (watch?.monitoringStatus?.state === 'unavailable') {
    return { statusKey: 'monitoringUnavailable', detailMessageKey: 'detail.monitoringUnavailable' };
  }
  return null;
};

export const getAnalysisProvenanceMessageKey = (watch) => {
  if (watch?.analysisProvider === 'openai' && watch?.analysisStatus === 'success') {
    return 'detail.analysisProvenanceAi';
  }
  if (watch?.analysisProvider === 'deterministic' && watch?.analysisStatus === 'fallback') {
    return 'detail.analysisProvenanceFallback';
  }
  return null;
};

const newestUpdateAt = (updates) => (Array.isArray(updates) ? updates : [])
  .map((item) => item?.detectedAt || item?.publishedAt)
  .filter((value) => value && !Number.isNaN(Date.parse(value)))
  .sort((first, second) => Date.parse(second) - Date.parse(first))[0] || null;

const normalizeLastCheckAttempt = (attempt) => {
  if (
    !attempt
    || !['succeeded', 'failed'].includes(attempt.status)
    || typeof attempt.attemptedAt !== 'string'
    || Number.isNaN(Date.parse(attempt.attemptedAt))
  ) return null;
  return {
    status: attempt.status,
    attemptedAt: new Date(attempt.attemptedAt).toISOString(),
    ...(attempt.status === 'succeeded' && typeof attempt.outcome === 'string'
      ? { outcome: attempt.outcome }
      : {}),
    ...(attempt.status === 'failed' && typeof attempt.code === 'string'
      ? { code: attempt.code }
      : {}),
  };
};

export const migrateWatchModel = (watch) => {
  if (!watch || typeof watch !== 'object') return { watch, migrated: false };
  const feedUrl = normalizeFeedUrl(watch.monitoringSource?.url || watch.feedUrl || '');
  const bodaccMonitoringSource = normalizeBodaccMonitoringSource(watch.monitoringSource);
  const candidateUpdates = Array.isArray(watch.candidateUpdates)
    ? watch.candidateUpdates
    : Array.isArray(watch.monitoringUpdates) ? watch.monitoringUpdates : [];
  const hasDifferingSelectedKeywords = Array.isArray(watch.selectedKeywords)
    && Array.isArray(watch.keywords)
    && JSON.stringify(watch.selectedKeywords) !== JSON.stringify(watch.keywords);
  const selectionWasManuallyEdited = watch.monitoringConceptsManuallyEdited === true
    || hasDifferingSelectedKeywords;
  const storedFingerprint = Array.isArray(watch.storyFingerprint)
    ? watch.storyFingerprint
    : Array.isArray(watch.storyProfile?.concepts) ? watch.storyProfile.concepts : [];
  const hasExplicitManualSelection = selectionWasManuallyEdited
    && Array.isArray(watch.selectedKeywords);
  const explicitlySelectedLabels = new Set((hasExplicitManualSelection
    ? watch.selectedKeywords
    : []).map((label) => String(label || '').trim().toLocaleLowerCase()).filter(Boolean));
  const originalFingerprint = hasExplicitManualSelection
    ? storedFingerprint.filter((concept) => explicitlySelectedLabels.has(
      String(concept?.label || '').trim().toLocaleLowerCase(),
    ))
    : storedFingerprint;
  const fingerprintLabels = new Set(originalFingerprint
    .map((concept) => concept?.label?.toLocaleLowerCase()).filter(Boolean));
  const userAddedConcepts = (hasExplicitManualSelection
    ? watch.selectedKeywords
    : watch.storyProfile?.userAddedConcepts || watch.keywords || [])
    .filter((label) => typeof label === 'string' && (
      selectionWasManuallyEdited
      || !fingerprintLabels.has(label.toLocaleLowerCase())
    ));
  const explicitlyManualLabels = new Set((watch.storyProfile?.userAddedConcepts || [])
    .map((label) => String(label).trim().toLocaleLowerCase()).filter(Boolean));
  const protectsManualSelection = selectionWasManuallyEdited
    || explicitlyManualLabels.size > 0;
  const legacyFacts = originalFingerprint.filter((concept) => (
    ['fact', 'supporting'].includes(concept?.type) && typeof concept?.label === 'string'
  ));
  const migratedFingerprintInput = originalFingerprint.flatMap((concept) => {
    if (!['fact', 'supporting'].includes(concept?.type)) return concept;
    const label = String(concept.label || '').trim();
    const isProtectedManual = selectionWasManuallyEdited
      || explicitlyManualLabels.has(label.toLocaleLowerCase());
    return isProtectedManual && label ? [{ label, type: 'manual' }] : [];
  });
  if (Array.isArray(watch.keywords)) {
    const retainedLabels = new Set(migratedFingerprintInput
      .map((concept) => String(concept?.label || '').trim().toLocaleLowerCase())
      .filter(Boolean));
    (hasExplicitManualSelection ? watch.selectedKeywords : watch.keywords).forEach((label) => {
      const key = String(label || '').trim().toLocaleLowerCase();
      if (
        key
        && !retainedLabels.has(key)
        && (originalFingerprint.length === 0 || selectionWasManuallyEdited)
      ) {
        migratedFingerprintInput.push({ label, type: 'manual' });
        retainedLabels.add(key);
      }
    });
  }
  const migratedFingerprint = protectsManualSelection
    ? normalizeStoryFingerprint(migratedFingerprintInput, 8)
    : normalizeAutomaticStoryFingerprint(migratedFingerprintInput, 5);
  const migratedFingerprintKeys = new Set(migratedFingerprint.map((concept) => (
    `${concept.type}\u0000${String(concept.label).trim().toLocaleLowerCase()}`
  )));
  const rejectedAutomaticLabels = protectsManualSelection ? [] : migratedFingerprintInput
    .filter((concept) => !migratedFingerprintKeys.has(
      `${concept?.type}\u0000${String(concept?.label || '').trim().toLocaleLowerCase()}`,
    ))
    .map(({ label }) => String(label || '').trim())
    .filter(Boolean);
  const contextualLegacyFacts = [...legacyFacts
    .map(({ label }) => String(label || '').trim())
    .filter((label) => label && !(
      selectionWasManuallyEdited
      || explicitlyManualLabels.has(label.toLocaleLowerCase())
    )), ...rejectedAutomaticLabels];
  const storyProfile = watch.inputType === 'url'
    ? createStoryProfile({
      storyFingerprint: migratedFingerprint,
      profile: {
        ...(watch.storyProfile || {}),
        distinctiveFacts: [
          ...(watch.storyProfile?.distinctiveFacts || []),
          ...contextualLegacyFacts,
        ],
        userAddedConcepts,
      },
      sourcePublication: watch.storyProfile?.sourceArticle?.publication || watch.sourceName,
      sourceTitle: watch.storyProfile?.sourceArticle?.title || watch.sourceTitle || watch.title,
      sourceUrl: watch.storyProfile?.sourceArticle?.url || watch.sourceUrl,
      publishedAt: watch.storyProfile?.sourceArticle?.publishedAt || watch.sourcePublishedAt,
      extractedAt: watch.storyProfile?.extractedAt || watch.createdAt,
    })
    : watch.storyProfile || null;
  const migratedLabels = storyProfile?.concepts?.map(({ label }) => label) || [];
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
  const updates = migrateLegacyWatchUpdates(watch, candidateUpdates);
  const latestUpdate = getLatestUpdate({ updates });
  // Older models did not record provenance, so preserve their stored category conservatively.
  const categorySource = watch.categorySource === 'manual' || (
    watch.categorySource !== 'inferred' && watch.category
  ) ? 'manual' : 'inferred';
  const inferredCategory = inferWatchCategory([
    watch.request,
    watch.sourceTitle,
    watch.title,
    watch.storyProfile?.storySummary,
    watch.monitoredEvent,
  ].filter(Boolean).join(' '));
  const category = categorySource === 'manual'
    ? normalizeWatchCategory(watch.category, inferredCategory)
    : inferredCategory;
  const generatedPendingSituationKeys = new Set([
    'watchData.pendingSituations.price',
    'watchData.pendingSituations.travel',
    'watchData.pendingSituations.news',
    'watchData.pendingSituations.event',
    'watchData.pendingSituations.general',
  ]);
  const currentSituationKey = generatedPendingSituationKeys.has(watch.currentSituationKey)
    ? getCategoryPendingSituationKey(category)
    : watch.currentSituationKey;
  const migratedWatch = {
    ...watch,
    watchModelVersion: WATCH_MODEL_VERSION,
    category,
    categorySource,
    currentSituationKey,
    monitoringConceptsManuallyEdited: selectionWasManuallyEdited,
    analysisProvider: ['openai', 'deterministic'].includes(watch.analysisProvider)
      ? watch.analysisProvider
      : null,
    analysisStatus: ['success', 'fallback', 'failed'].includes(watch.analysisStatus)
      ? watch.analysisStatus
      : null,
    analysisModel: typeof watch.analysisModel === 'string' ? watch.analysisModel : null,
    fallbackReasonCode: typeof watch.fallbackReasonCode === 'string'
      ? watch.fallbackReasonCode
      : null,
    analyzedAt: typeof watch.analyzedAt === 'string' ? watch.analyzedAt : null,
    analysisDiagnosticId: typeof watch.analysisDiagnosticId === 'string'
      ? watch.analysisDiagnosticId
      : null,
    monitoringSource: bodaccMonitoringSource || (feedUrl
      ? {
        url: feedUrl,
        type: watch.monitoringSource?.type || 'feed',
        title: watch.monitoringSource?.title || null,
        discovery: watch.monitoringSource?.discovery || 'manual',
      }
      : null),
    feedUrl,
    storyProfile,
    ...(watch.inputType === 'url' ? {
      storyFingerprint: storyProfile?.concepts || [],
      keywords: migratedLabels,
      selectedKeywords: migratedLabels,
    } : {}),
    candidateUpdates,
    monitoringUpdates: candidateUpdates,
    unreadUpdateCount: getUnreadUpdates({ updates }).length,
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
    currentStatus: watch.currentStatus || status,
    lastChecked: watch.lastChecked ?? null,
    lastUpdated: latestUpdate?.timestamp || watch.lastUpdated || null,
    updates,
    lastCheckResult: watch.lastCheckResult || watch.lastCheckOutcome || null,
    lastCheckAttempt: normalizeLastCheckAttempt(watch.lastCheckAttempt),
  };
  return {
    watch: migratedWatch,
    migrated: JSON.stringify(migratedWatch) !== JSON.stringify(watch),
  };
};
