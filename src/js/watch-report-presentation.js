import { getLatestUpdate } from './watch-updates.js';

// Presentation only: a saved event is never evidence of a new check or report.
export const getReadOnlyCardPresentation = (watch, translate, language = 'en') => {
  if (watch?.monitoringAvailability !== 'incompatible') return null;
  const update = getLatestUpdate(watch);
  const dates = [];
  const addDate = (key, value, source = false) => {
    if (!value || !Number.isFinite(Date.parse(value))) return;
    const date = new Date(value);
    dates.push({ label: translate(`watchCard.${key}`), value: date.toISOString(),
      text: new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', source
        ? { dateStyle: 'long', timeZone: 'UTC' }
        : { dateStyle: 'medium', timeStyle: 'short' }).format(date) });
  };
  if (update) {
    addDate('detectedAt', update.detectedAt || update.timestamp);
    addDate('sourceDate', update.publishedAt, true);
  }
  return {
    explanation: translate('watchCard.readOnly'),
    result: update ? {
      // Currency event IDs represent saved threshold matches, not a fresh evaluation.
      label: translate(update.id?.startsWith('currency:') ? 'watchCard.savedThreshold' : 'watchCard.savedResult'),
      summary: update.sourceTitle || update.summary || '',
      dates,
    } : null,
  };
};

export const getHomeReportHeader = ({ hasReport, uncertain, totalChecked }, translate) => ({
  hideTimestamp: !hasReport && !uncertain,
  hideSummary: uncertain,
  summary: !hasReport ? translate('home.noReport')
    : translate(`home.checkedAway.${totalChecked === 1 ? 'one' : 'other'}`, { count: totalChecked }),
});
