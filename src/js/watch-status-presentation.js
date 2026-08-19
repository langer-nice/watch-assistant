import { WATCH_CLASSIFICATIONS } from './report-status.js';

export const getWatchStatusPresentation = (classification, translate) => {
  if (classification === WATCH_CLASSIFICATIONS.ATTENTION) {
    return { label: translate('statuses.attention'), modifier: 'attention' };
  }
  if (classification === WATCH_CLASSIFICATIONS.UPDATED) {
    return { label: translate('statuses.updated'), modifier: 'updated' };
  }
  if (classification === WATCH_CLASSIFICATIONS.NEW) {
    return { label: translate('home.newBadge'), modifier: 'stable' };
  }
  if (classification === WATCH_CLASSIFICATIONS.WATCHING) {
    return { label: translate('statuses.watching'), modifier: 'watching' };
  }
  return null;
};
