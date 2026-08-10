import { getLatestDevelopmentUpdate } from './watch-developments.js';
import { getWatchUpdates } from './watch-updates.js';

const BODACC_BUSINESS_EVENT_TYPES = new Set([
  'capital_increase',
  'capital_reduction',
  'director_change',
  'registered_office_change',
  'accounts_filed',
  'company_created',
  'company_dissolved',
  'judicial_proceedings',
  'judicial_liquidation',
  'receivership',
  'business_sale',
  'company_struck_off',
]);

export const getBodaccBusinessEventTranslationKey = (update) => {
  const monitoringResult = update?.rawMonitoringResult;
  const eventType = monitoringResult?.eventType || update?.eventType;
  const source = monitoringResult?.source || update?.sourceName || update?.source;
  return source === 'BODACC' && BODACC_BUSINESS_EVENT_TYPES.has(eventType)
    ? `detail.businessEvents.${eventType}`
    : null;
};

export const getBodaccBusinessEventLabel = (update, translate = () => '') => {
  const key = getBodaccBusinessEventTranslationKey(update);
  return key ? translate(key) : '';
};

export const getCurrentSituationPresentation = (watch, {
  fallback = '',
  formatTimestamp = (value) => value || '',
  sanitizeUrl = () => '',
  translateBusinessEvent = () => '',
} = {}) => {
  const update = getLatestDevelopmentUpdate(watch);
  if (!update) {
    return {
      update: null,
      title: '',
      summary: fallback,
      metadata: '',
      articleUrl: '',
    };
  }

  const summary = update.summary || update.sourceTitle || fallback;
  const businessEventLabel = getBodaccBusinessEventLabel(update, translateBusinessEvent);
  const title = businessEventLabel || (update.sourceTitle && update.sourceTitle !== summary
    ? update.sourceTitle
    : '');
  const metadata = [
    update.sourceName || update.sourceDomain,
    formatTimestamp(update.timestamp),
  ].filter(Boolean).join(' · ');

  return {
    update,
    title,
    summary,
    metadata,
    articleUrl: sanitizeUrl(update.sourceUrl) || '',
  };
};

export const getLatestCheckUpdates = (watch) => {
  const candidateIds = watch?.lastCheckResult?.candidateItemIds
    || watch?.lastCheckOutcome?.candidateItemIds
    || watch?.lastCheckOutcome?.newItemIds;
  const ids = new Set(Array.isArray(candidateIds) ? candidateIds : []);
  return getWatchUpdates(watch).filter(({ id }) => ids.has(id));
};
