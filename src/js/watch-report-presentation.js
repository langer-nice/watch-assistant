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

// Readiness describes the existing guard; it never starts or retries a request.
export const renderReportReadiness = ({ button, message, availability, generating, hasWatches }, translate) => {
  const loading = availability.uncertain && !availability.failed;
  const labelKey = generating ? 'home.generatingReport' : loading ? 'home.reportPreparing' : 'home.generateReport';
  button.disabled = availability.uncertain || generating || !hasWatches;
  button.toggleAttribute('aria-busy', generating || loading);
  for (const attribute of ['aria-label', 'title']) {
    button.setAttribute(attribute, translate(labelKey));
    button.setAttribute(`data-i18n-${attribute}`, labelKey);
  }
  if (message) {
    message.hidden = generating || !availability.uncertain;
    const key = availability.failed ? 'home.reportPreparationFailed' : 'home.reportPreparing';
    message.dataset.i18n = key;
    message.textContent = translate(key);
  }
};
