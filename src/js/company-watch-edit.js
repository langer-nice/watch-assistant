import { createBodaccMonitoringSource } from './company-watch-request.js';

export const COMPANY_EDIT_PLAN_OUTCOMES = Object.freeze({
  NOT_COMPANY: 'not-company',
  SAME_COMPANY: 'same-company',
  DIFFERENT_COMPANY: 'different-company',
});

export const getCompanyEditPlanOutcome = (watch, plan) => {
  if (watch?.inputType !== 'company') return COMPANY_EDIT_PLAN_OUTCOMES.NOT_COMPANY;
  return plan?.identifier === watch.company?.siren
    ? COMPANY_EDIT_PLAN_OUTCOMES.SAME_COMPANY
    : COMPANY_EDIT_PLAN_OUTCOMES.DIFFERENT_COMPANY;
};

const getCompanyEditMonitoringSource = (watch, canonicalSource) => (
  watch?.monitoringSource?.type === canonicalSource.type
  && watch.monitoringSource.provider === canonicalSource.provider
  && watch.monitoringSource.siren === canonicalSource.siren
  && watch.monitoringSource.discovery === canonicalSource.discovery
    ? { ...watch.monitoringSource }
    : canonicalSource
);

export const createExistingCompanyEditAnalysis = (watch) => {
  const siren = watch?.company?.siren;
  const canonicalSource = createBodaccMonitoringSource(siren);
  if (!canonicalSource) return null;

  return {
    status: 'success',
    inputType: 'company',
    company: { ...watch.company, siren: canonicalSource.siren },
    monitoringSource: getCompanyEditMonitoringSource(watch, canonicalSource),
    title: watch.title,
    summary: watch.monitoringSummary || '',
    source: 'BODACC',
    keywords: Array.isArray(watch.keywords) ? [...watch.keywords] : [],
    storyFingerprint: Array.isArray(watch.storyFingerprint)
      ? watch.storyFingerprint.map((concept) => ({ ...concept }))
      : [],
  };
};

export const isSameCompanyEditAnalysis = (watch, analysis) => (
  watch?.inputType === 'company'
  && analysis?.inputType === 'company'
  && analysis.company?.siren === watch.company?.siren
);

export const getPreservedCompanyEditChanges = (watch, analysis) => (
  isSameCompanyEditAnalysis(watch, analysis)
    ? {
      company: { ...watch.company },
      monitoringSource: { ...analysis.monitoringSource },
      feedUrl: watch.feedUrl || '',
    }
    : {}
);
