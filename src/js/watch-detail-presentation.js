import {
  getCanonicalWatchClassification,
  getMeaningfulWatchUpdate,
  WATCH_CLASSIFICATIONS,
} from './report-status.js';

export const getWatchDetailPresentationSnapshot = (watch, { reports = [] } = {}) => {
  const classification = getCanonicalWatchClassification(watch, { reports });
  const update = classification === WATCH_CLASSIFICATIONS.UPDATED
    ? getMeaningfulWatchUpdate(watch)?.update
    : null;

  return Object.freeze({
    classification,
    updateId: update?.status === 'new' ? update.id : null,
  });
};
