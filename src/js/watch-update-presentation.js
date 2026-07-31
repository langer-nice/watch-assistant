import { getLatestUpdate, getWatchUpdates } from './watch-updates.js';

export const getCurrentSituationPresentation = (watch, {
  fallback = '',
  formatTimestamp = (value) => value || '',
  sanitizeUrl = () => '',
} = {}) => {
  const update = getLatestUpdate(watch);
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
  const title = update.sourceTitle && update.sourceTitle !== summary
    ? update.sourceTitle
    : '';
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
