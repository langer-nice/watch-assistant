export const getFingerprintLabels = (watch) => (
  Array.isArray(watch?.storyFingerprint)
    ? watch.storyFingerprint
      .map((concept) => concept?.label)
      .filter((label) => typeof label === 'string' && label.trim())
    : []
);

const getSavedKeywords = (watch) => (
  Array.isArray(watch?.keywords)
    ? watch.keywords.filter((label) => typeof label === 'string' && label.trim())
    : []
);

export const hasManuallyEditedConcepts = (watch, { legacyGeneratedKeywords } = {}) => {
  if (watch?.monitoringConceptsManuallyEdited === true) return true;
  const fingerprintLabels = getFingerprintLabels(watch);
  const savedKeywords = getSavedKeywords(watch);
  if (
    fingerprintLabels.length === 0
    && savedKeywords.length > 0
    && Array.isArray(legacyGeneratedKeywords)
    && legacyGeneratedKeywords.length > 0
  ) {
    return JSON.stringify(savedKeywords) !== JSON.stringify(legacyGeneratedKeywords);
  }
  return fingerprintLabels.length > 0
    && JSON.stringify(fingerprintLabels) !== JSON.stringify(savedKeywords);
};

export const shouldRegenerateStoryFingerprint = (watch, currentVersion, {
  force = false,
  legacyGeneratedKeywords,
} = {}) => (
  watch?.inputType === 'url'
  && !hasManuallyEditedConcepts(watch, { legacyGeneratedKeywords })
  && (
    force
    || watch.monitoringConceptsVersion !== currentVersion
    || !Array.isArray(watch.storyFingerprint)
  )
);

export const getVisibleConceptLabels = (watch, currentVersion) => {
  const fingerprintLabels = getFingerprintLabels(watch);
  if (
    watch?.monitoringConceptsVersion === currentVersion
    && !hasManuallyEditedConcepts(watch)
    && fingerprintLabels.length
  ) {
    return fingerprintLabels;
  }
  return getSavedKeywords(watch);
};

export const createRegeneratedFingerprintChanges = (analysis, currentVersion) => {
  const keywords = Array.isArray(analysis?.storyFingerprint)
    ? analysis.storyFingerprint.map((concept) => concept?.label).filter(Boolean)
    : Array.isArray(analysis?.keywords) ? analysis.keywords.filter(Boolean) : [];
  return {
    keywords,
    selectedKeywords: keywords,
    storyFingerprint: analysis?.storyFingerprint || null,
    storyProfile: analysis?.storyProfile || null,
    monitoringConceptsVersion: currentVersion,
    monitoringConceptsManuallyEdited: false,
    conceptSourceFields: analysis?.conceptSourceFields || [],
    sourcePublishedAt: analysis?.sourcePublishedAt || null,
    analysisProvider: analysis?.analysisProvider || null,
    analysisStatus: analysis?.analysisStatus || null,
    analysisModel: analysis?.analysisModel || null,
    fallbackReasonCode: analysis?.fallbackReasonCode || null,
    analyzedAt: analysis?.analyzedAt || null,
    analysisDiagnosticId: analysis?.analysisDiagnosticId || null,
    ...(analysis?.monitoringSource ? {
      monitoringSource: analysis.monitoringSource,
      feedUrl: analysis.monitoringSource.url,
      monitoringStatus: { state: 'configured', reason: null },
      monitoringIssueReason: null,
    } : {}),
  };
};
