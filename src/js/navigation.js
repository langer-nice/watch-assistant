import {
  getWatches,
  getUserCreatedWatches,
  addWatch,
  updateWatch,
  deleteWatch,
  getWatchById,
  getBriefingGeneratedAt,
  setBriefingGeneratedAt,
  resetStoredWatches,
  markUpdatesAsRead,
  WATCH_STORAGE_CHANGED_EVENT,
} from './watch-storage.js';
import { getLanguage, t } from './i18n.js';
import { analyseUrl } from './url-analysis.js';
import { requiresNonArticleClarification } from './page-classification.js';
import {
  CLARIFICATION_ACTIONS,
  clarifyWatchRequest,
  CLARIFICATION_TYPES,
  getClarificationActions,
} from './request-clarification.js';
import {
  getBriefingWatchGroups,
  getHomeInboxSelection,
  getUpdatedSeparatorWatchId,
  groupWatches,
  isUserActionRequired,
} from './watch-grouping.js';
import {
  formatWatchCreationMetadata,
  formatWatchCreationTime,
  getWatchCreationDate,
  parseTimestampValue,
} from './watch-dates.js';
import {
  getHomeSortPreference,
  orderAllWatchGroups,
  setHomeSortPreference,
  sortHomeWatches,
} from './home-watch-order.js';
import {
  getHomeStatusTargetId,
  navigateToHomeWatchStatus,
} from './home-summary-navigation.js';
import {
  extractMonitoringConcepts,
  MONITORING_CONCEPTS_VERSION,
} from './monitoring-concepts.js';
import {
  createRegeneratedFingerprintChanges,
  getVisibleConceptLabels,
  shouldRegenerateStoryFingerprint,
} from './story-fingerprint-migration.js';
import {
  createLocalEditorialSummary,
  generateMonitoringSummary,
} from './monitoring-summary.js';
import {
  getReplayIntroFlow,
  hasCompletedOnboarding,
  markOnboardingCompleted,
  cancelOnboardingFirstWatch,
  completeOnboardingFirstWatch,
  consumeFirstWatchConfirmation,
  isOnboardingFirstWatch,
  ONBOARDING_COMPLETED_STORAGE_KEY,
} from './intro-flow.js';
import {
  PRODUCT_EVENTS,
  trackProductEvent,
  trackProductEventOnce,
} from './analytics.js';
import {
  activateWatchMonitoring,
  createWatchCheckController,
  getMonitoringUpdates,
  MonitoringCheckError,
  normalizeFeedUrl,
  requestCompanyCheck,
} from './watch-monitoring.js';
import {
  requestMonitoringSource,
  resolveUrlMonitoringSource,
  SourceDiscoveryError,
} from './watch-source-discovery.js';
import {
  createBodaccMonitoringSource,
  extractCompanyNameFromRequest,
} from './company-watch-request.js';
import {
  COMPANY_EDIT_PLAN_OUTCOMES,
  createExistingCompanyEditAnalysis,
  getCompanyEditPlanOutcome,
  getPreservedCompanyEditChanges,
  isSameCompanyEditAnalysis,
} from './company-watch-edit.js';
import {
  COMPANY_PLAN_ROUTES,
  getCompanyPlanRoute,
  getMediaStoryPlanRoute,
  MEDIA_STORY_PLAN_ROUTES,
  requestWatchPlan,
} from './watch-planner.js';
import { getCompanyWatchTitle } from './company-watch-title.js';
import { getCompanyReviewSummary } from './company-watch-review.js';
import { getCompanyBodaccUrl } from './company-watch-source.js';
import {
  deriveCompanyStatus,
  getCompanyStatusPresentation,
  isTerminalCompanyStatus,
} from './company-watch-status.js';
import {
  getAdministrativeStatusPresentation,
  normalizeAdministrativeStatus,
  shouldShowCompanyMonitoringStatus,
} from './company-administrative-status.js';
import { waitForVisiblePaint } from './browser-paint.js';
import { getMonitoringFailureMessageKey } from './watch-monitoring-errors.js';
import {
  createStoryProfile,
  getStoryProfileIdentifiers,
  synchronizeStoryProfile,
} from './story-profile.js';
import { isDistinctMonitoringScope } from './story-review.js';
import { renderWatchCardLink } from './watch-card-link.js';
import {
  CURRENT_UPDATE_FRAGMENT,
  getCreatedWatchDetailHref,
  getWatchDetailHref,
  getWatchIdFromLocation,
} from './watch-routes.js';
import {
  getCategoryPendingSituationKey,
  inferWatchCategory,
  normalizeWatchCategory,
} from './watch-category.js';
import {
  getLatestUpdate,
  getWatchUpdates,
} from './watch-updates.js';
import { getWatchTimelineEvents } from './watch-timeline.js';
import {
  getBodaccBusinessEventLabel,
  getCurrentSituationPresentation,
  getLatestCheckUpdates,
} from './watch-update-presentation.js';

let homeCreatedWatchId = null;
let homeFirstWatchConfirmation = false;
let homeFirstWatchConfirmationChecked = false;
let homeCreatedWatchFeedbackTimer = null;
let detailConfirmationAutoTimer = null;
let detailConfirmationHideTimer = null;
let detailCheckInProgress = false;
let detailCheckErrorWatchId = null;
let detailRevealedUpdateRoute = null;
const detailDeferredReadUpdateIds = new Set();
const getDeferredReadKey = (watchId, updateId) => `${watchId}\u0000${updateId}`;
let firstMonitoringTimer = null;
let firstMonitoringTransitionTimer = null;
let editSheetCloseTimer = null;
let editSheetBackgroundScrollY = 0;

const FIRST_MONITORING_DELAY = 3200;
const watchCheckController = createWatchCheckController({
  getWatch: getWatchById,
  saveWatch: updateWatch,
});

const dismissDetailConfirmation = (confirmationEl) => {
  window.clearTimeout(detailConfirmationAutoTimer);
  window.clearTimeout(detailConfirmationHideTimer);
  detailConfirmationAutoTimer = null;
  confirmationEl.classList.remove('is-visible');
  confirmationEl.classList.add('is-leaving');

  detailConfirmationHideTimer = window.setTimeout(() => {
    confirmationEl.hidden = true;
    confirmationEl.classList.remove('is-leaving');
    delete confirmationEl.dataset.active;
    detailConfirmationHideTimer = null;
  }, 280);
};

const showDetailConfirmation = (confirmationEl) => {
  const dismissButton = confirmationEl.querySelector('#watchConfirmationDismiss');
  window.clearTimeout(detailConfirmationAutoTimer);
  window.clearTimeout(detailConfirmationHideTimer);
  confirmationEl.hidden = false;
  confirmationEl.dataset.active = 'true';
  confirmationEl.classList.remove('is-visible', 'is-leaving');
  if (dismissButton) {
    dismissButton.onclick = () => dismissDetailConfirmation(confirmationEl);
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (!confirmationEl.hidden && !confirmationEl.classList.contains('is-leaving')) {
        confirmationEl.classList.add('is-visible');
      }
    });
  });

  detailConfirmationAutoTimer = window.setTimeout(() => {
    dismissDetailConfirmation(confirmationEl);
  }, 4500);
};

const showWatchUpdatedConfirmation = () => {
  const confirmationEl = document.querySelector('#watchConfirmation');
  const titleEl = document.querySelector('#watchConfirmationTitle');
  const copyEl = document.querySelector('#watchConfirmationCopy');
  if (!confirmationEl) return;

  if (titleEl) {
    titleEl.dataset.i18n = 'detail.updatedTitle';
    titleEl.textContent = t('detail.updatedTitle');
  }
  if (copyEl) {
    copyEl.dataset.i18n = 'detail.updatedCopy';
    copyEl.textContent = t('detail.updatedCopy');
  }
  showDetailConfirmation(confirmationEl);
};

const scrollWindowImmediately = (top) => {
  const previousBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, top);
  document.documentElement.style.scrollBehavior = previousBehavior;
};

const closeWatchEditSheet = ({ updated = false } = {}) => {
  const sheet = document.querySelector('#watchEditSheet');
  const frame = document.querySelector('#watchEditFrame');
  if (!sheet?.open || sheet.classList.contains('is-closing')) return;

  sheet.classList.add('is-closing');
  window.clearTimeout(editSheetCloseTimer);
  editSheetCloseTimer = window.setTimeout(() => {
    sheet.close();
    sheet.classList.remove('is-closing', 'is-ready');
    sheet.style.removeProperty('--watch-edit-viewport-height');
    sheet.style.removeProperty('--watch-edit-viewport-top');
    if (frame) frame.removeAttribute('src');
    document.body.classList.remove('is-watch-edit-open');
    document.body.style.removeProperty('--watch-edit-background-top');
    if (updated) {
      renderWatchDetail();
      scrollWindowImmediately(0);
      showWatchUpdatedConfirmation();
    } else {
      scrollWindowImmediately(editSheetBackgroundScrollY);
    }
    editSheetCloseTimer = null;
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
};

const initializeWatchEditSheet = () => {
  const sheet = document.querySelector('#watchEditSheet');
  const frame = document.querySelector('#watchEditFrame');
  const cancelButton = document.querySelector('#watchEditCancel');
  const saveButton = document.querySelector('#watchEditSave');
  if (!sheet || !frame || sheet.dataset.initialized === 'true') return;
  sheet.dataset.initialized = 'true';

  let viewportFrame = null;
  const updateSheetViewport = () => {
    if (viewportFrame !== null) window.cancelAnimationFrame(viewportFrame);
    viewportFrame = window.requestAnimationFrame(() => {
      if (!sheet.open) {
        viewportFrame = null;
        return;
      }
      const viewport = window.visualViewport;
      sheet.style.setProperty(
        '--watch-edit-viewport-height',
        `${Math.round(viewport?.height || window.innerHeight)}px`,
      );
      sheet.style.setProperty(
        '--watch-edit-viewport-top',
        `${Math.round(viewport?.offsetTop || 0)}px`,
      );
      viewportFrame = null;
    });
  };
  sheet.updateVisualViewport = updateSheetViewport;

  sheet.addEventListener('cancel', (event) => {
    event.preventDefault();
    frame.contentWindow?.postMessage({ type: 'watch-editor-request-close' }, window.location.origin);
  });

  cancelButton?.addEventListener('click', () => {
    frame.contentWindow?.postMessage({ type: 'watch-editor-request-close' }, window.location.origin);
  });

  saveButton?.addEventListener('click', () => {
    if (saveButton.disabled) return;
    frame.contentWindow?.postMessage({ type: 'watch-editor-request-save' }, window.location.origin);
  });

  frame.addEventListener('load', () => {
    if (frame.hasAttribute('src')) {
      if (saveButton) saveButton.disabled = true;
      sheet.classList.add('is-ready');
    }
  });

  window.visualViewport?.addEventListener('resize', updateSheetViewport);
  window.visualViewport?.addEventListener('scroll', updateSheetViewport);
  window.addEventListener('resize', updateSheetViewport);

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    const currentWatchId = new URLSearchParams(window.location.search).get('id');
    if (event.data?.watchId !== currentWatchId) return;

    if (event.data.type === 'watch-editor-close') {
      closeWatchEditSheet();
    }
    if (event.data.type === 'watch-editor-saved') {
      closeWatchEditSheet({ updated: true });
    }
    if (event.data.type === 'watch-editor-state' && saveButton) {
      saveButton.disabled = !event.data.canSave;
    }
  });
};

const openWatchEditSheet = (watchId) => {
  const sheet = document.querySelector('#watchEditSheet');
  const frame = document.querySelector('#watchEditFrame');
  if (!sheet || !frame) return;
  if (sheet.open) return;

  initializeWatchEditSheet();
  const saveButton = document.querySelector('#watchEditSave');
  if (saveButton) saveButton.disabled = true;
  editSheetBackgroundScrollY = window.scrollY;
  document.body.style.setProperty('--watch-edit-background-top', `${-editSheetBackgroundScrollY}px`);
  document.body.classList.add('is-watch-edit-open');
  frame.src = `new-watch.html?edit=${encodeURIComponent(watchId)}&presentation=modal`;
  sheet.classList.remove('is-closing', 'is-ready');
  sheet.showModal();
  sheet.updateVisualViewport?.();
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const localizeField = (watch, field) => {
  const key = watch[`${field}Key`];
  if (key) {
    return t(key);
  }

  // Keep watches created before i18n was introduced compatible with the new UI.
  if (field === 'latestUpdate' && watch[field] === 'Watch created') {
    return t('watchData.created');
  }

  return watch[field];
};

const localizeListItem = (item) => {
  if (typeof item !== 'object' || !item) {
    return item;
  }

  return item.labelKey ? t(item.labelKey) : item.label;
};

const isUrl = (value) => {
  const trimmed = value.trim();
  return /^(https?:\/\/|www\.)[\w-]+(\.[\w-]+)+/.test(trimmed);
};

const getSafeExternalUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) {
    return '';
  }

  try {
    const value = url.trim();
    const parsedUrl = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return ['http:', 'https:'].includes(parsedUrl.protocol) ? parsedUrl.href : '';
  } catch {
    return '';
  }
};

const hasMeaningfulText = (value) => (
  typeof value === 'string'
  && value.trim().length >= 3
  && /[\p{L}\p{N}]/u.test(value)
);

const getSourceText = (value) => {
  if (!hasMeaningfulText(value)) {
    return '';
  }

  const trimmedValue = value.trim();
  const normalizedValue = trimmedValue.toLocaleLowerCase();
  return ['undefined', 'null', 'unknown source', 'source inconnue'].includes(normalizedValue)
    ? ''
    : trimmedValue;
};

const isDistinctMeaningfulText = (value, comparison = '') => (
  hasMeaningfulText(value)
  && value.trim().toLocaleLowerCase() !== comparison.trim().toLocaleLowerCase()
);

const getWatchDisplayTitle = (watch) => getCompanyWatchTitle(watch, {
  storedTitle: localizeField(watch, 'title'),
  formatFallback: (siren) => t('newWatch.companyReviewTitleValue', { siren }),
});

const normalizeComparableText = (value = '') => String(value)
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const getLatestChange = (watch) => {
  const latestChange = localizeField(watch, 'latestChange');
  if (hasMeaningfulText(latestChange)) {
    return latestChange;
  }

  // Older stored watches used latestUpdate for either a change or a timestamp.
  const legacyUpdate = localizeField(watch, 'latestUpdate');
  const normalizedUpdate = normalizeComparableText(legacyUpdate);
  const isTimestampOnly = /^(just now|a moment ago|il y a|à l instant|\d+ (min|mins|minute|minutes|hr|hrs|hour|hours|day|days) ago)/.test(normalizedUpdate);
  return hasMeaningfulText(legacyUpdate)
    && normalizedUpdate !== normalizeComparableText(t('watchData.created'))
    && !isTimestampOnly
    ? legacyUpdate
    : '';
};

const getHomeUpdateText = (watch) => {
  const latestUpdate = getLatestUpdate(watch);
  return getBodaccBusinessEventLabel(latestUpdate, t)
    || latestUpdate?.sourceTitle
    || latestUpdate?.summary
    || getLatestChange(watch)
    || (latestUpdate ? t('detail.untitledItem') : '');
};

const getMonitoringSummary = (watch, title) => {
  const request = localizeField(watch, 'request');
  const excludedValues = new Set(
    [title, request, getLatestChange(watch), t('watchData.created'), 'undefined', 'null']
      .filter(hasMeaningfulText)
      .map(normalizeComparableText),
  );
  const monitoringSummary = localizeField(watch, 'monitoringSummary');
  if (
    hasMeaningfulText(monitoringSummary)
    && !excludedValues.has(normalizeComparableText(monitoringSummary))
  ) {
    return monitoringSummary;
  }

  const requestText = hasMeaningfulText(request) ? request : '';
  const fallback = createLocalEditorialSummary(requestText);
  return (
    normalizeComparableText(fallback) !== normalizeComparableText(title) ? fallback : ''
  );
};

const formatDate = (isoString) => {
  if (!isoString) {
    return t('common.unknown');
  }

  const date = new Date(isoString);
  return date.toLocaleDateString(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatLastChecked = (watch) => {
  const value = localizeField(watch, 'lastChecked');
  if (!value || watch.lastCheckedKey) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  if (Date.now() - date.getTime() < 60_000) {
    return t('common.justNow');
  }

  return new Intl.DateTimeFormat(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatMonitoringTimestamp = (value) => {
  if (!value || Number.isNaN(Date.parse(value))) return value || '';
  return new Intl.DateTimeFormat(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const hasReleaseIntent = (request) => (
  /(release date|released|comes out|coming out|publication date|date de sortie|date de parution|sortie|parution|publi[ée])/
    .test(request.toLowerCase())
);

const inferCurrentSituationKey = (request, category) => {
  const text = request.toLowerCase();

  if (hasReleaseIntent(text)) {
    return 'watchData.pendingSituations.release';
  }

  return getCategoryPendingSituationKey(category);
};

const createTitle = (request) => {
  const value = request.trim();

  if (isUrl(value)) {
    try {
      const url = value.startsWith('http') ? value : `https://${value}`;
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return t('common.newWatch');
    }
  }

  const text = value
    .split(/\n+|[.!?]+(?:\s|$)/)[0]
    .trim()
    .replace(/^(?:please\s+)?(?:tell|notify|alert)\s+me\s+(?:know\s+)?(?:when\s+)?/i, '')
    .replace(/^(?:please\s+)?let\s+me\s+know\s+(?:when\s+)?/i, '')
    .replace(/^keep\s+me\s+updated\s+(?:about|on)\s+/i, '')
    .replace(/^find\s+me\s+/i, '')
    .replace(/\b(?:drops?|falls?)\s+below\s+€\s*([\d,.]+)/i, 'below $1€')
    .replace(/\b(?:drops?|falls?)\s+below\s+£\s*([\d,.]+)/i, 'below £$1')
    .replace(/\b(?:drops?|falls?)\s+below\s+\$\s*([\d,.]+)/i, 'below $$$1')
    .trim();
  const normalizedTitle = text
    ? `${text.charAt(0).toLocaleUpperCase()}${text.slice(1)}`
    : t('common.newWatch');
  return normalizedTitle.length > 60
    ? `${normalizedTitle.slice(0, 57)}...`
    : normalizedTitle;
};

const extractStructuredCriteria = (request) => {
  const value = request.trim();
  const stopWords = new Set([
    'above', 'after', 'announces', 'announced', 'before', 'below', 'cost', 'costs',
    'drop', 'drops', 'fall', 'falls', 'from', 'is', 'on', 'over', 'under', 'when',
  ]);
  const extractPlacesAfter = (markers) => {
    const matches = [];
    const pattern = new RegExp(`\\b(?:${markers.join('|')})\\s+([^,.;!?]+)`, 'giu');
    for (const match of value.matchAll(pattern)) {
      const words = match[1].trim().split(/\s+/).slice(0, 3);
      const placeWords = [];
      for (const word of words) {
        const normalizedWord = word.replace(/[^\p{L}'’-]/gu, '').toLocaleLowerCase();
        if (!normalizedWord || stopWords.has(normalizedWord)) break;
        placeWords.push(word.replace(/[^\p{L}'’-]/gu, ''));
      }
      const place = placeWords.join(' ').trim();
      if (place && !matches.some((item) => normalizeComparableText(item) === normalizeComparableText(place))) {
        matches.push(place);
      }
    }
    return matches;
  };

  const destinations = extractPlacesAfter(['to', 'vers']);
  const locations = [...destinations];
  extractPlacesAfter(['in', 'near', 'à']).forEach((location) => {
    if (!locations.some((item) => normalizeComparableText(item) === normalizeComparableText(location))) {
      locations.push(location);
    }
  });

  const prices = value.match(
    /(?:€|£|\$)\s*[\d,.]+|[\d,.]+\s*(?:€|£|\$|EUR|GBP|USD)(?=\s|[,.;!?]|$)/giu,
  ) || [];
  const thresholds = prices.map((price) => {
    const currencyMatch = price.match(/€|£|\$|EUR|GBP|USD/i)?.[0] || '';
    const numericValue = Number.parseFloat(price.replace(/[^\d,.]/g, '').replace(',', '.'));
    const pricePosition = value.indexOf(price);
    const context = value.slice(Math.max(0, pricePosition - 24), pricePosition).toLocaleLowerCase();
    const operator = /(below|under|moins de)/.test(context)
      ? 'below'
      : /(above|over|plus de)/.test(context) ? 'above' : 'target';
    return {
      operator,
      value: Number.isNaN(numericValue) ? null : numericValue,
      currency: ({ '€': 'EUR', '£': 'GBP', '$': 'USD' })[currencyMatch] || currencyMatch.toUpperCase(),
      label: price,
    };
  });
  const dates = value.match(
    /\b(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|january|february|march|april|may|june|july|august|september|october|november|december|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|christmas|noël)\b/giu,
  ) || [];
  const properNames = value.match(/\b[A-ZÀ-ÖØ-Þ][\p{L}'’-]*(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]*)*/gu) || [];
  const excludedEntities = new Set(['tell', 'notify', 'alert', 'please', ...destinations, ...locations]
    .map(normalizeComparableText));
  const monitoredEntity = properNames.find(
    (name) => !excludedEntities.has(normalizeComparableText(name)),
  ) || null;
  const monitoredEvent = /(?:drop|fall|below|under|price|prix|moins de)/i.test(value)
    ? 'price_change'
    : /(?:release|available|availability|opens?|sortie|disponible|ouvre)/i.test(value)
      ? 'availability'
      : /(?:announce|announcement|annonce)/i.test(value)
        ? 'announcement'
        : /(?:change|update|development|changement|actualité)/i.test(value)
          ? 'update'
          : null;

  return {
    locations,
    destinations,
    dates,
    prices,
    thresholds,
    monitoredEntity,
    monitoredEvent,
  };
};

const deriveWatchData = (request, urlAnalysis = null, options = {}) => {
  const companyMonitoringSource = urlAnalysis?.inputType === 'company'
    ? createBodaccMonitoringSource(urlAnalysis?.company?.siren)
    : null;
  const isCompanyRequest = Boolean(companyMonitoringSource);
  const company = isCompanyRequest
    ? {
      siren: companyMonitoringSource.siren,
      name: urlAnalysis?.company?.name || null,
      administrativeStatus: normalizeAdministrativeStatus(
        urlAnalysis?.company?.administrativeStatus,
      ),
      status: deriveCompanyStatus(
        urlAnalysis?.baseline?.items,
        urlAnalysis?.company?.status,
      ),
    }
    : null;
  const isUrlRequest = !isCompanyRequest && (Boolean(urlAnalysis) || isUrl(request));
  const isStory = !isUrlRequest || urlAnalysis?.isStory !== false;
  const sourceName = isCompanyRequest
    ? companyMonitoringSource.title
    : getSourceText(urlAnalysis?.sourceName || urlAnalysis?.source);
  const sourceTitle = isCompanyRequest
    ? null
    : getSourceText(urlAnalysis?.sourceTitle || urlAnalysis?.title);
  const sourceUrl = isCompanyRequest
    ? ''
    : typeof urlAnalysis?.sourceUrl === 'string'
      ? urlAnalysis.sourceUrl.trim()
      : isUrlRequest ? request.trim() : '';
  const inferredCategory = inferWatchCategory([
    request,
    urlAnalysis?.title,
    urlAnalysis?.source,
    urlAnalysis?.storyProfile?.storySummary,
  ].filter(Boolean).join(' '));
  const category = normalizeWatchCategory(options.category, inferredCategory);
  const keywords = isUrlRequest && !isStory
    ? []
    : Array.isArray(options.keywords)
      ? options.keywords
      : extractMonitoringConcepts([request, urlAnalysis?.title].filter(Boolean).join(' '));
  const selectedKeywords = isUrlRequest && !isStory
    ? []
    : Array.isArray(options.selectedKeywords)
      ? options.selectedKeywords
      : keywords;
  const structuredCriteria = extractStructuredCriteria(request);
  const storyFingerprint = isStory
    ? Object.hasOwn(options, 'storyFingerprint')
      ? options.storyFingerprint
      : urlAnalysis?.storyFingerprint
    : [];
  const sourceStoryProfile = urlAnalysis?.storyProfile || options.storyProfile || null;
  const storyProfile = isUrlRequest && !isStory
    ? null
    : isUrlRequest
    ? options.monitoringConceptsManuallyEdited === true && Array.isArray(storyFingerprint)
      ? synchronizeStoryProfile(
        sourceStoryProfile,
        storyFingerprint,
        storyFingerprint
          .filter((concept) => !(urlAnalysis?.storyFingerprint || []).some((original) => (
            normalizeComparableText(original?.label) === normalizeComparableText(concept?.label)
          )))
          .map(({ label }) => label),
      )
      : sourceStoryProfile
    : createStoryProfile({
      storyFingerprint,
      profile: { storySummary: options.monitoringSummary || request },
      sourceTitle: request,
    });
  const monitoringUrl = normalizeFeedUrl(
    options.feedUrl || options.monitoringSource?.url || urlAnalysis?.monitoringSource?.url || '',
  );
  const automaticMonitoringSource = options.monitoringSource || urlAnalysis?.monitoringSource;
  const monitoringSource = companyMonitoringSource || (monitoringUrl
    ? {
      url: monitoringUrl,
      type: automaticMonitoringSource?.type || 'feed',
      title: automaticMonitoringSource?.title || null,
      discovery: options.feedUrl ? 'manual' : automaticMonitoringSource?.discovery || 'manual',
    }
    : null);
  return {
    title: isCompanyRequest
      ? getCompanyWatchTitle({ inputType: 'company', company }, {
        storedTitle: urlAnalysis?.title,
        formatFallback: (siren) => t('newWatch.companyReviewTitleValue', { siren }),
      })
      : urlAnalysis?.title || createTitle(request),
    inputType: isCompanyRequest ? 'company' : isUrlRequest ? 'url' : 'text',
    ...(isUrlRequest ? {
      pageType: urlAnalysis?.pageType || null,
      isStory,
    } : {}),
    ...(isCompanyRequest ? { company } : {}),
    sourceName: sourceName || null,
    sourceTitle: sourceTitle || null,
    sourceUrl: sourceUrl || null,
    feedUrl: monitoringUrl,
    monitoringSource,
    category,
    categorySource: options.categorySource || 'inferred',
    keywords,
    selectedKeywords,
    monitoringConceptsVersion: MONITORING_CONCEPTS_VERSION,
    monitoringConceptsManuallyEdited: Boolean(options.monitoringConceptsManuallyEdited),
    storyFingerprint: Array.isArray(storyFingerprint)
      ? storyFingerprint
      : null,
    storyProfile,
    contentAccessLimited: urlAnalysis?.contentAccessLimited === true,
    sourcePublishedAt: urlAnalysis?.sourcePublishedAt || null,
    conceptSourceFields: Array.isArray(urlAnalysis?.conceptSourceFields)
      ? urlAnalysis.conceptSourceFields
      : null,
    analysisProvider: urlAnalysis?.analysisProvider || options.analysisProvider || null,
    analysisStatus: urlAnalysis?.analysisStatus || options.analysisStatus || null,
    analysisModel: urlAnalysis?.analysisModel || options.analysisModel || null,
    fallbackReasonCode: urlAnalysis?.fallbackReasonCode || options.fallbackReasonCode || null,
    analyzedAt: urlAnalysis?.analyzedAt || options.analyzedAt || null,
    analysisDiagnosticId: urlAnalysis?.analysisDiagnosticId
      || options.analysisDiagnosticId
      || null,
    structuredCriteria,
    ...structuredCriteria,
    monitoringSummary: urlAnalysis?.monitoringScope
      || urlAnalysis?.summary
      || options.monitoringSummary
      || null,
    monitoringSummaryKey: null,
    currentSituationKey: inferCurrentSituationKey(request, category),
  };
};

const createWatchObject = (request, whyFollowing = '', urlAnalysis = null, options = {}) => {
  const now = new Date().toISOString();
  const derivedData = deriveWatchData(request, urlAnalysis, options);
  const missingMonitoringSource = !derivedData.monitoringSource;
  return {
    id: crypto.randomUUID(),
    request,
    whyFollowing: whyFollowing.trim(),
    ...derivedData,
    status: 'watching',
    currentStatus: 'watching',
    monitoringStatus: {
      state: missingMonitoringSource ? 'setup-required' : 'configured',
      reason: missingMonitoringSource ? 'no-compatible-source' : null,
    },
    monitoringIssueReason: missingMonitoringSource ? 'no-compatible-source' : null,
    actionRequired: false,
    attentionReason: null,
    monitoringState: 'preparing',
    firstCheckCompletesAt: new Date(Date.now() + FIRST_MONITORING_DELAY).toISOString(),
    createdAt: now,
    lastChecked: null,
    lastUpdated: null,
    updates: [],
    requiresAttention: false,
    latestChange: null,
    latestChangeAt: null,
    timeline: [
      {
        type: 'created',
        labelKey: 'watchData.created',
        date: now,
      },
    ],
  };
};

const getHomeReport = () => {
  const isDisplayableWatch = (watch) => (
    hasMeaningfulText(getWatchDisplayTitle(watch))
  );
  const watches = getWatches().filter((watch) => (
    watch.status !== 'completed' && isDisplayableWatch(watch)
  ));
  const briefing = getHomeInboxSelection(watches, {
    getMeaningfulUpdate: getHomeUpdateText,
    isDisplayableWatch,
  });
  const attentionWatches = briefing.attentionWatches;
  const updatedWatches = briefing.updatedWatches;
  const quietWatches = briefing.quietWatches;

  return {
    watches: briefing.watches,
    statusById: briefing.statusById,
    attentionWatches,
    updatedWatches,
    newlyCreatedWatches: briefing.newlyCreatedWatches,
    quietWatches,
    totalChecked: briefing.totalChecked,
  };
};

const formatHomeWatchTimestamp = (value) => {
  const date = parseTimestampValue(value);
  if (!date || date.getTime() <= 0) return '';
  return new Intl.DateTimeFormat(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const getHomeWatchTimestampText = (watch, latestUpdate) => {
  const latestUpdateTimestamp = formatHomeWatchTimestamp(latestUpdate?.timestamp);
  if (latestUpdateTimestamp) return latestUpdateTimestamp;
  const latestChangeAt = localizeField(watch, 'latestChangeAt');
  if (watch.latestChangeAtKey) return latestChangeAt;
  const formattedChange = formatHomeWatchTimestamp(latestChangeAt);
  if (formattedChange) return formattedChange;
  const lastChecked = localizeField(watch, 'lastChecked');
  return watch.lastCheckedKey ? lastChecked : formatHomeWatchTimestamp(lastChecked);
};

const getSummaryCardStatus = (status) => {
  if (status === 'attention') {
    return { label: t('statuses.attention'), modifier: 'attention' };
  }
  if (status === 'updated') {
    return { label: t('statuses.updated'), modifier: 'updated' };
  }
  if (status === 'new') {
    return { label: t('home.newBadge'), modifier: 'stable' };
  }
  return null;
};

const renderSummaryWatchCard = ({
  watch,
  title: titleOverride = '',
  status = null,
  supportingText = '',
  timestamp = '',
  revealLatestUpdate = false,
  articleId = '',
  dataAttribute = '',
} = {}) => {
  const title = hasMeaningfulText(titleOverride) ? titleOverride : getWatchDisplayTitle(watch);
  if (!hasMeaningfulText(title)) return '';
  const category = watch.category ? t(`categories.${watch.category}`) : t('categories.general');
  const categoryModifier = watch.category || 'general';
  const statusPresentation = getSummaryCardStatus(status);
  const link = renderWatchCardLink({
    watchId: watch.id,
    className: 'briefing-item__link',
    revealLatestUpdate,
    content: `
      <div class="briefing-item__header">
        <div class="briefing-item__metadata">
          <span class="category-label category-label--${escapeHtml(categoryModifier)}">${escapeHtml(category)}</span>
          ${hasMeaningfulText(timestamp)
    ? `<span class="briefing-item__time">${escapeHtml(timestamp)}</span>`
    : ''}
        </div>
        ${statusPresentation ? `
          <div class="briefing-item__statuses">
            <span class="status-label status-label--${statusPresentation.modifier}">${escapeHtml(statusPresentation.label)}</span>
          </div>
        ` : ''}
      </div>
      <h2>${escapeHtml(title)}</h2>
      ${hasMeaningfulText(supportingText) ? `<p>${escapeHtml(supportingText)}</p>` : ''}
    `,
  });
  if (!link) return '';
  return `<article class="briefing-item"${articleId ? ` id="${escapeHtml(articleId)}"` : ''}${dataAttribute}>${link}</article>`;
};

const renderHomeWatchCards = (watches, statusById) => {
  const renderedStatusTargets = new Set();
  return watches.map((watch) => {
    const title = getWatchDisplayTitle(watch);
    const latestUpdate = getLatestUpdate(watch);
    const latestChange = getHomeUpdateText(watch);
    if (!hasMeaningfulText(title)) return '';

    const homeStatus = statusById.get(watch.id);
    if (!homeStatus) return '';
    const latestChangeAt = homeStatus === 'new'
      ? formatHomeWatchTimestamp(watch.createdAt)
      : getHomeWatchTimestampText(watch, latestUpdate);
    const supportingText = latestUpdate
      ? getBodaccBusinessEventLabel(latestUpdate, t)
        || latestUpdate.sourceTitle
        || latestUpdate.summary
        || t('detail.untitledItem')
      : latestChange || getMonitoringSummary(watch, title) || t('common.monitoringFallback');

    const statusTargetId = getHomeStatusTargetId(homeStatus);
    const isFirstStatusWatch = statusTargetId && !renderedStatusTargets.has(homeStatus);
    const articleId = isFirstStatusWatch ? statusTargetId : '';
    const card = renderSummaryWatchCard({
      watch,
      status: homeStatus,
      supportingText,
      timestamp: latestChangeAt,
      revealLatestUpdate: homeStatus === 'updated',
      articleId,
      dataAttribute: ` data-home-watch-status="${escapeHtml(homeStatus)}"`,
    });
    if (card && isFirstStatusWatch) renderedStatusTargets.add(homeStatus);
    return card;
  }).join('');
};

const renderHomeBriefing = () => {
  const list = document.querySelector('#homeBriefingList');
  if (!list) return;

  const { watches, statusById } = getHomeReport();
  list.innerHTML = renderHomeWatchCards(watches, statusById);
};

const initHomeWatchControls = () => {
  const allWatchesSortControl = document.querySelector('#allWatchesSort');
  const statusOverview = document.querySelector('.briefing-summary__statuses');
  if (allWatchesSortControl && !allWatchesSortControl.dataset.homeSortBound) {
    allWatchesSortControl.dataset.homeSortBound = 'true';
    allWatchesSortControl.addEventListener('change', () => {
      setHomeSortPreference(allWatchesSortControl.value);
      renderWatchList();
    });
  }
  if (statusOverview && !statusOverview.dataset.homeNavigationBound) {
    statusOverview.dataset.homeNavigationBound = 'true';
    statusOverview.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-home-status-target]');
      if (!trigger || trigger.disabled) return;
      navigateToHomeWatchStatus(document, trigger.dataset.homeStatusTarget);
    });
  }
};

const renderWatchList = () => {
  const list = document.querySelector('#watchList');
  const sortControl = document.querySelector('#allWatchesSort');
  const sortRow = document.querySelector('#allWatchesSortRow');
  if (!list) {
    return;
  }

  const watches = getWatches();

  if (watches.length === 0) {
    if (sortRow) sortRow.hidden = true;
    list.innerHTML = `<p>${escapeHtml(t('watches.empty'))}</p>`;
    return;
  }

  const groups = groupWatches(watches, {
    getMeaningfulUpdate: getHomeUpdateText,
    isDisplayableWatch: (watch) => hasMeaningfulText(getWatchDisplayTitle(watch)),
    language: getLanguage(),
  });
  const canonicalGroups = getBriefingWatchGroups(watches, {
    getMeaningfulUpdate: getHomeUpdateText,
    isDisplayableWatch: (watch) => hasMeaningfulText(getWatchDisplayTitle(watch)),
  });
  const homeSelection = getHomeInboxSelection(watches, {
    getMeaningfulUpdate: getHomeUpdateText,
    isDisplayableWatch: (watch) => hasMeaningfulText(getWatchDisplayTitle(watch)),
  });
  const attentionIds = new Set(canonicalGroups.attentionWatches.map(({ id }) => id));
  const updatedIds = new Set(canonicalGroups.updatedWatches.map(({ id }) => id));
  const newIds = new Set(homeSelection.newlyCreatedWatches.map(({ id }) => id));
  const statusById = new Map([
    ...canonicalGroups.attentionWatches.map((watch) => [watch.id, 'attention']),
    ...canonicalGroups.updatedWatches.map((watch) => [watch.id, 'updated']),
    ...homeSelection.newlyCreatedWatches.map((watch) => [watch.id, 'new']),
  ]);
  const mode = getHomeSortPreference();
  const orderedWatches = sortHomeWatches(watches, {
    mode,
    getStatus: (watch) => statusById.get(watch.id) || 'unchanged',
  });
  const orderedGroups = orderAllWatchGroups(groups, {
    attentionWatches: canonicalGroups.attentionWatches,
    updatedWatches: canonicalGroups.updatedWatches,
    orderedWatches,
    mode,
  });
  const orderedSeparatorAfterWatchId = getUpdatedSeparatorWatchId(
    orderedGroups,
    canonicalGroups.updatedWatches,
  );
  if (sortControl) sortControl.value = mode;
  if (sortRow) sortRow.hidden = false;

  const renderWatchCards = (group) => group.watches
    .map((watch) => {
      const storedTitle = getWatchDisplayTitle(watch);
      const title = hasMeaningfulText(storedTitle) ? storedTitle.trim() : t('common.newWatch');
      const isPaused = watch.status === 'paused';
      const status = attentionIds.has(watch.id)
        ? 'attention'
        : updatedIds.has(watch.id)
          ? 'updated'
          : newIds.has(watch.id)
            ? 'new'
            : null;
      const showCreationMetadata = group.type === 'last7Days';
      const creationMetadata = showCreationMetadata
        ? formatWatchCreationMetadata(getWatchCreationDate(watch), {
          groupType: group.type,
          language: getLanguage(),
        })
        : '';
      const latestUpdate = getLatestUpdate(watch);
      const cardTimestamp = creationMetadata || (status
        ? getHomeWatchTimestampText(watch, latestUpdate)
        : '');
      const subtitle = isPaused
        ? t('watches.monitoringPaused')
        : updatedIds.has(watch.id)
          ? getHomeUpdateText(watch)
          : getMonitoringSummary(watch, title);
      const card = renderSummaryWatchCard({
        watch,
        title,
        status,
        supportingText: subtitle,
        timestamp: cardTimestamp,
        revealLatestUpdate: updatedIds.has(watch.id),
      });
      if (!card) return '';
      return watch.id === orderedSeparatorAfterWatchId
        ? `${card}<div class="watch-list__update-separator" aria-hidden="true"></div>`
        : card;
    })
    .join('');

  list.innerHTML = orderedGroups
    .map((group, index) => {
      if (['actionRequired', 'updated'].includes(group.type)) {
        return renderWatchCards(group);
      }
      const headingLabel = (group.label || t(`watches.${group.type}`))
        .toLocaleUpperCase(getLanguage());
      const renderDatedGroup = (watchesInGroup, headingId, headingTime = '') => `
        <section class="watch-list__group" aria-labelledby="${headingId}">
          <h2 class="section-heading${headingTime ? ' section-heading--with-time' : ''}" id="${headingId}">
            <span>${escapeHtml(headingLabel)}</span>
            ${headingTime ? `<span class="section-heading__time">${escapeHtml(headingTime)}</span>` : ''}
          </h2>
          <div class="watch-list">${renderWatchCards({ ...group, watches: watchesInGroup })}</div>
        </section>
      `;

      if (group.type === 'today') {
        return group.watches
          .map((watch, watchIndex) => renderDatedGroup(
            [watch],
            `watch-list-group-${index}-${watchIndex}`,
            formatWatchCreationTime(getWatchCreationDate(watch), {
              language: getLanguage(),
            }),
          ))
          .join('');
      }

      return renderDatedGroup(group.watches, `watch-list-group-${index}`);
    })
    .join('');
};

const renderWatchDetail = () => {
  const titleEl = document.querySelector('#watchTitle');
  if (!titleEl) {
    return;
  }

  const watchId = getWatchIdFromLocation(window.location);
  let watch = getWatchById(watchId);
  if (
    watch?.monitoringState === 'preparing'
    && Date.parse(watch.firstCheckCompletesAt) <= Date.now()
  ) {
    watch = updateWatch(watch.id, {
      monitoringState: 'monitoring',
      firstCheckCompletedAt: new Date().toISOString(),
      firstCheckCompletesAt: null,
    });
  }
  const isPreparing = watch?.monitoringState === 'preparing';
  const detailPageEl = document.querySelector('.page--detail');
  detailPageEl?.classList.toggle('is-paused', watch?.status === 'paused');

  const categoryEl = document.querySelector('#watchCategory');
  const pausedStateEl = document.querySelector('#watchPausedState');
  const pausedResumeEl = document.querySelector('#watchPausedResume');
  const notFoundEl = document.querySelector('#watchNotFound');
  const briefingEl = document.querySelector('#watchBriefing');
  const factsEl = document.querySelector('#watchFacts');
  const primaryEl = document.querySelector('#watchPrimary');
  const currentSituationEl = document.querySelector('#watchCurrentSituation');
  const currentSituationContainerEl = document.querySelector('#current-situation');
  const companyAdministrativeStatusEl = document.querySelector('#watchCompanyAdministrativeStatus');
  const companyAdministrativeStatusBadgeEl = document.querySelector('#watchCompanyAdministrativeStatusBadge');
  const companyAdministrativeStatusDescriptionEl = document.querySelector('#watchCompanyAdministrativeStatusDescription');
  const companyStatusEl = document.querySelector('#watchCompanyStatus');
  const companyStatusBadgeEl = document.querySelector('#watchCompanyStatusBadge');
  const companyStatusDescriptionEl = document.querySelector('#watchCompanyStatusDescription');
  const companyStatusFollowUpEl = document.querySelector('#watchCompanyStatusFollowUp');
  const currentUpdateTitleEl = document.querySelector('#watchCurrentUpdateTitle');
  const currentUpdateMetadataEl = document.querySelector('#watchCurrentUpdateMetadata');
  const currentUpdateLinkEl = document.querySelector('#watchCurrentUpdateLink');
  const monitoringControlsEl = document.querySelector('#watchMonitoringControls');
  const recommendationEl = document.querySelector('#watchRecommendation');
  const originalSourceEl = document.querySelector('#watchOriginalSource');
  const sourceNameEl = document.querySelector('#watchSourceName');
  const sourceTitleEl = document.querySelector('#watchSourceTitle');
  const sourceLinkEl = document.querySelector('#watchSourceLink');
  const sourceLinkLabelEl = sourceLinkEl?.querySelector('[data-source-link-label]');
  const storySummaryEl = document.querySelector('#watchStorySummary');
  const storySummaryCopyEl = document.querySelector('#watchStorySummaryCopy');
  const monitoringScopeEl = document.querySelector('#watchMonitoringScope');
  const monitoringScopeCopyEl = document.querySelector('#watchMonitoringScopeCopy');
  const storyConceptsEl = document.querySelector('#watchStoryConcepts');
  const storyConceptsListEl = document.querySelector('#watchStoryConceptsList');
  const storyConceptsEmptyEl = document.querySelector('#watchStoryConceptsEmpty');
  const storyConceptsEditEl = document.querySelector('#watchStoryConceptsEdit');
  const whyTodayEl = document.querySelector('#watchWhyToday');
  const whyTodayCopyEl = document.querySelector('#watchWhyTodayCopy');
  const latestChangeEl = document.querySelector('#watchLatestChange');
  const latestChangeAtEl = document.querySelector('#watchLatestChangeAt');
  const lastCheckedEl = document.querySelector('#watchLastChecked');
  const confidenceEl = document.querySelector('#watchConfidence');
  const sourcesEl = document.querySelector('#watchSources');
  const metadataEl = document.querySelector('#watchMetadata');
  const whyFollowingEl = document.querySelector('#watchWhyFollowing');
  const whyFollowingCopyEl = document.querySelector('#watchWhyFollowingCopy');
  const timelineSectionEl = document.querySelector('#watchTimelineSection');
  const timelineEl = document.querySelector('#watchTimeline');
  const actionsSectionEl = document.querySelector('#watchActionsSection');
  const externalActionsEl = document.querySelector('#watchExternalActions');
  const confirmationEl = document.querySelector('#watchConfirmation');
  const confirmationTitleEl = document.querySelector('#watchConfirmationTitle');
  const confirmationCopyEl = document.querySelector('#watchConfirmationCopy');
  const editActionEl = document.querySelector('#watchEditAction');
  const clarityWarningEl = document.querySelector('#watchClarityWarning');
  const clarityWarningEditEl = document.querySelector('#watchClarityWarningEdit');
  const preparingEl = document.querySelector('#watchPreparing');
  const managementEl = document.querySelector('#watchManagement');
  const checkNowEl = document.querySelector('#watchCheckNow');
  const checkNowLabelEl = document.querySelector('#watchCheckNowLabel');
  const checkSpinnerEl = document.querySelector('.watch-fact-check__spinner');
  const checkFeedbackEl = document.querySelector('#watchCheckFeedback');
  const checkReviewEl = document.querySelector('#watchCheckReview');
  const monitoringUpdatesEl = document.querySelector('#watchMonitoringUpdates');
  const monitoringUpdatesListEl = document.querySelector('#watchMonitoringUpdatesList');
  const pauseResumeEl = document.querySelector('#watchPauseResume');
  const pauseResumeLabelEl = document.querySelector('#watchPauseResumeLabel');
  const pauseIconEl = document.querySelector('#watchPauseIcon');
  const resumeIconEl = document.querySelector('#watchResumeIcon');
  const deleteEl = document.querySelector('#watchDelete');
  const deleteDialogEl = document.querySelector('#watchDeleteDialog');
  const deleteCancelEl = document.querySelector('#watchDeleteCancel');
  const deleteConfirmEl = document.querySelector('#watchDeleteConfirm');

  const hideDetailContent = () => {
    [
      briefingEl,
      factsEl,
      whyTodayEl,
      whyFollowingEl,
      timelineSectionEl,
      actionsSectionEl,
      confirmationEl,
      clarityWarningEl,
      preparingEl,
      monitoringUpdatesEl,
      managementEl,
    ]
      .forEach((element) => {
        if (element) {
          element.hidden = true;
        }
      });
  };

  if (!watch) {
    titleEl.textContent = t('detail.notFoundTitle');
    if (categoryEl) {
      categoryEl.hidden = true;
    }
    if (pausedStateEl) {
      pausedStateEl.hidden = true;
    }
    if (editActionEl) {
      editActionEl.hidden = true;
    }
    if (notFoundEl) {
      notFoundEl.textContent = t('detail.notFoundCopy');
      notFoundEl.hidden = false;
    }
    hideDetailContent();
    return;
  }

  trackProductEventOnce(
    PRODUCT_EVENTS.WATCH_DETAIL_VIEWED,
    { watch_state: watch.monitoringState || 'unknown' },
    'watch-detail-viewed',
  );

  const request = localizeField(watch, 'request');
  titleEl.textContent = getWatchDisplayTitle(watch) || t('detail.title');
  const editWatchHref = `new-watch.html?edit=${encodeURIComponent(watch.id)}`;
  const openExistingWatchEditor = (event) => {
    event.preventDefault();
    openWatchEditSheet(watch.id);
  };
  if (editActionEl) {
    editActionEl.hidden = false;
    editActionEl.href = editWatchHref;
    editActionEl.onclick = openExistingWatchEditor;
  }
  if (clarityWarningEl) {
    clarityWarningEl.hidden = watch.createdAsWrittenAfterClarityWarning !== true;
  }
  if (clarityWarningEditEl) {
    clarityWarningEditEl.href = editWatchHref;
    clarityWarningEditEl.onclick = openExistingWatchEditor;
  }
  if (notFoundEl) {
    notFoundEl.hidden = true;
  }

  if (categoryEl) {
    const category = watch.category && t(`categories.${watch.category}`);
    categoryEl.textContent = category || '';
    categoryEl.hidden = !category;
    categoryEl.className = `category-pill${watch.category === 'travel' ? ' category-pill--travel' : ''}`;
  }

  if (pausedStateEl) {
    pausedStateEl.hidden = watch.status !== 'paused';
  }

  const setOptionalField = (field, element, value) => {
    const container = document.querySelector(`[data-detail-field="${field}"]`);
    const hasValue = value !== undefined && value !== null && value !== '';
    if (element) {
      element.textContent = hasValue ? value : '';
    }
    if (container) {
      container.hidden = !hasValue;
    }
    return hasValue;
  };
  const revealUpdateTarget = (target) => {
    if (!target || target.hidden) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  };

  const administrativeStatusPresentation = watch.inputType === 'company'
    ? getAdministrativeStatusPresentation(watch.company?.administrativeStatus, t)
    : null;
  const hasCompanyAdministrativeStatus = Boolean(administrativeStatusPresentation?.known);
  if (companyAdministrativeStatusEl) {
    companyAdministrativeStatusEl.hidden = !hasCompanyAdministrativeStatus;
  }
  if (companyAdministrativeStatusBadgeEl) {
    companyAdministrativeStatusBadgeEl.textContent = hasCompanyAdministrativeStatus
      ? administrativeStatusPresentation.label
      : '';
    companyAdministrativeStatusBadgeEl.className = hasCompanyAdministrativeStatus
      ? `status-label status-label--${administrativeStatusPresentation.tone}`
      : 'status-label';
  }
  if (companyAdministrativeStatusDescriptionEl) {
    companyAdministrativeStatusDescriptionEl.textContent = hasCompanyAdministrativeStatus
      ? t(`administrativeStatus.detailDescriptions.${administrativeStatusPresentation.status}`)
        || administrativeStatusPresentation.description
      : '';
  }

  const companyStatusPresentation = watch.inputType === 'company'
    ? getCompanyStatusPresentation(watch.company?.status, t)
    : null;
  const showCompanyMonitoringStatus = Boolean(
    companyStatusPresentation
    && shouldShowCompanyMonitoringStatus(
      watch.company?.administrativeStatus,
      watch.company?.status,
    ),
  );
  if (companyStatusEl) companyStatusEl.hidden = !showCompanyMonitoringStatus;
  if (companyStatusBadgeEl) {
    companyStatusBadgeEl.textContent = showCompanyMonitoringStatus
      ? companyStatusPresentation.label
      : '';
    companyStatusBadgeEl.className = showCompanyMonitoringStatus
      ? `status-label status-label--${companyStatusPresentation.tone}`
      : 'status-label';
  }
  if (companyStatusDescriptionEl) {
    companyStatusDescriptionEl.textContent = showCompanyMonitoringStatus
      ? companyStatusPresentation.description
      : '';
  }
  if (companyStatusFollowUpEl) {
    companyStatusFollowUpEl.textContent = showCompanyMonitoringStatus
      ? companyStatusPresentation.followUp
      : '';
    companyStatusFollowUpEl.hidden = !showCompanyMonitoringStatus
      || !companyStatusPresentation.followUp;
  }

  const storedCurrentSituation = localizeField(watch, 'currentSituation');
  const pendingSituation = isDistinctMeaningfulText(storedCurrentSituation, request || '')
    ? storedCurrentSituation
    : t(inferCurrentSituationKey(request || '', watch.category));
  const currentUpdate = getCurrentSituationPresentation(watch, {
    fallback: pendingSituation,
    formatTimestamp: formatMonitoringTimestamp,
    sanitizeUrl: getSafeExternalUrl,
    translateBusinessEvent: t,
  });
  const latestMeaningfulUpdate = currentUpdate.update;
  const currentSituation = currentUpdate.summary;
  const hasCurrentSituation = setOptionalField(
    'currentSituation',
    currentSituationEl,
    currentSituation,
  );
  if (currentUpdateTitleEl) {
    currentUpdateTitleEl.textContent = currentUpdate.title;
    currentUpdateTitleEl.hidden = !currentUpdate.title;
  }
  if (currentUpdateMetadataEl) {
    currentUpdateMetadataEl.textContent = currentUpdate.metadata;
    currentUpdateMetadataEl.hidden = !currentUpdate.metadata;
  }
  if (currentUpdateLinkEl) {
    if (currentUpdate.articleUrl) {
      currentUpdateLinkEl.href = currentUpdate.articleUrl;
      currentUpdateLinkEl.setAttribute('aria-label', t('detail.openArticle'));
    } else {
      currentUpdateLinkEl.removeAttribute('href');
      currentUpdateLinkEl.removeAttribute('aria-label');
    }
    currentUpdateLinkEl.hidden = !currentUpdate.articleUrl;
  }
  const hasRecommendation = setOptionalField(
    'recommendation',
    recommendationEl,
    localizeField(watch, 'recommendation'),
  );
  if (primaryEl) {
    primaryEl.hidden = !(
      hasCompanyAdministrativeStatus
      || showCompanyMonitoringStatus
      || hasCurrentSituation
      || hasRecommendation
    );
  }

  const storySummary = watch.storyProfile?.storySummary || '';
  if (storySummaryCopyEl) storySummaryCopyEl.textContent = storySummary;
  if (storySummaryEl) storySummaryEl.hidden = !storySummary;
  const monitoringScope = watch.inputType === 'url'
    && watch.isStory !== false
    && isDistinctMonitoringScope(watch.monitoringSummary, storySummary, watch.title)
    ? watch.monitoringSummary
    : '';
  if (monitoringScopeCopyEl) monitoringScopeCopyEl.textContent = monitoringScope;
  if (monitoringScopeEl) monitoringScopeEl.hidden = !monitoringScope;
  const storyIdentifiers = getStoryProfileIdentifiers(watch.storyProfile);
  if (storyConceptsListEl) {
    storyConceptsListEl.innerHTML = storyIdentifiers.map(({ label, type }) => {
      return `
        <div class="story-concepts__item">
          <dl class="story-concepts__text">
            <dt><span>${escapeHtml(t(`newWatch.conceptTypes.${type}`))}</span></dt>
            <dd class="story-concepts__label">${escapeHtml(label)}</dd>
          </dl>
          <button
            class="story-concepts__action"
            type="button"
            data-story-concept-edit
            aria-label="${escapeHtml(t('detail.editStoryConcept', { concept: label }))}"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 11.8-.4 1.6 1.6-.4 7.9-7.9-1.2-1.2L3 11.8Z"/><path d="m9.8 5 1.2 1.2"/></svg>
          </button>
        </div>
      `;
    }).join('');
    storyConceptsListEl.querySelectorAll('[data-story-concept-edit]').forEach((control) => {
      control.addEventListener('click', openExistingWatchEditor);
    });
  }
  if (storyConceptsListEl) storyConceptsListEl.hidden = storyIdentifiers.length === 0;
  if (storyConceptsEmptyEl) storyConceptsEmptyEl.hidden = storyIdentifiers.length > 0;
  if (storyConceptsEditEl) {
    storyConceptsEditEl.href = editWatchHref;
    storyConceptsEditEl.onclick = openExistingWatchEditor;
  }
  if (storyConceptsEl) {
    storyConceptsEl.hidden = watch.inputType !== 'url' || watch.isStory === false;
  }

  const companySiren = watch.inputType === 'company'
    && typeof watch.company?.siren === 'string'
    && /^\d{9}$/.test(watch.company.siren)
    ? watch.company.siren
    : null;
  const storedSourceName = localizeField(watch, 'sourceName');
  const storedSourceTitle = localizeField(watch, 'sourceTitle');
  const sourceName = companySiren
    ? watch.monitoringSource?.title || 'BODACC'
    : getSourceText(storedSourceName);
  const sourceTitle = companySiren
    ? t('detail.companySiren', { siren: companySiren })
    : getSourceText(storedSourceTitle);
  const storedSourceUrl = typeof watch.sourceUrl === 'string' ? watch.sourceUrl.trim() : '';
  const safeSourceUrl = getSafeExternalUrl(storedSourceUrl);
  const companySourceUrl = companySiren ? getCompanyBodaccUrl(watch) : null;
  const sourceLinkUrl = companySourceUrl || safeSourceUrl;
  const sourceLinkLabelKey = companySiren
    ? 'detail.viewOfficialBodaccPublications'
    : 'detail.openOriginalArticle';
  const hasOriginalSource = companySiren
    ? Boolean(sourceName && sourceTitle)
    : watch.inputType === 'url' && Boolean(sourceName || sourceTitle || safeSourceUrl);
  const hasSourceLink = hasOriginalSource && Boolean(sourceLinkUrl);
  if (sourceNameEl) {
    sourceNameEl.textContent = hasOriginalSource ? sourceName : '';
    sourceNameEl.hidden = !hasOriginalSource || !sourceName;
  }
  if (sourceTitleEl) {
    sourceTitleEl.textContent = hasOriginalSource ? sourceTitle : '';
    sourceTitleEl.hidden = !hasOriginalSource || !sourceTitle;
  }
  if (sourceLinkEl) {
    if (hasSourceLink) {
      sourceLinkEl.href = sourceLinkUrl;
      sourceLinkEl.setAttribute('aria-label', t(sourceLinkLabelKey));
    } else {
      sourceLinkEl.removeAttribute('href');
    }
    sourceLinkEl.hidden = !hasSourceLink;
  }
  if (sourceLinkLabelEl) {
    sourceLinkLabelEl.dataset.i18n = sourceLinkLabelKey;
    sourceLinkLabelEl.textContent = t(sourceLinkLabelKey);
  }
  if (originalSourceEl) {
    originalSourceEl.hidden = !hasOriginalSource;
  }

  const whyToday = localizeField(watch, 'whyToday');
  const hasWhyToday = hasMeaningfulText(whyToday);
  if (whyTodayCopyEl) {
    whyTodayCopyEl.textContent = hasWhyToday ? whyToday : '';
  }
  if (whyTodayEl) {
    whyTodayEl.hidden = !hasWhyToday;
  }

  const latestChange = getLatestChange(watch);
  const latestChangeAt = localizeField(watch, 'latestChangeAt');
  const hasLatestChange = hasMeaningfulText(latestChange);
  if (latestChangeEl) {
    latestChangeEl.textContent = hasLatestChange ? latestChange : '';
  }
  if (latestChangeAtEl) {
    latestChangeAtEl.textContent = hasMeaningfulText(latestChangeAt)
      ? formatMonitoringTimestamp(latestChangeAt)
      : '';
  }
  const latestChangeContainer = document.querySelector('[data-detail-field="latestChange"]');
  if (latestChangeContainer) {
    latestChangeContainer.hidden = !hasLatestChange;
  }
  const lastSuccessfulCheckTimestamp = Date.parse(watch.lastChecked);
  const lastAttemptTimestamp = Date.parse(watch.lastCheckAttempt?.attemptedAt);
  const persistedAttemptFailed = watch.lastCheckAttempt?.status === 'failed'
    && !Number.isNaN(lastAttemptTimestamp)
    && (
      Number.isNaN(lastSuccessfulCheckTimestamp)
      || lastAttemptTimestamp >= lastSuccessfulCheckTimestamp
    );
  const lastAttemptFailed = detailCheckErrorWatchId === watch.id || persistedAttemptFailed;
  const lastChecked = formatLastChecked(watch) || (
    detailCheckInProgress
      ? t('detail.checking')
      : lastAttemptFailed ? t('detail.checkFailedStatus') : t('detail.notCheckedYet')
  );
  const hasLastChecked = setOptionalField('lastChecked', lastCheckedEl, lastChecked);
  if (monitoringControlsEl) {
    monitoringControlsEl.hidden = isPreparing || !hasLastChecked;
  }

  let confidence = localizeField(watch, 'confidence');
  if (confidence && ['high', 'medium', 'low'].includes(confidence)) {
    confidence = t(`confidence.${confidence}`);
  }
  const hasConfidence = setOptionalField('confidence', confidenceEl, confidence);

  const sources = Array.isArray(watch.sources)
    ? watch.sources.map(localizeListItem).filter(Boolean)
    : [];
  const sourcesContainer = document.querySelector('[data-detail-field="sources"]');
  if (sourcesEl) {
    sourcesEl.innerHTML = sources
      .map((source) => `<li>${escapeHtml(source)}</li>`)
      .join('');
  }
  if (sourcesContainer) {
    sourcesContainer.hidden = sources.length === 0;
  }

  const hasMetadata = sources.length > 0 || hasConfidence || hasLatestChange;
  if (metadataEl) {
    metadataEl.hidden = !hasMetadata;
  }
  if (factsEl) {
    factsEl.hidden = isPreparing || !hasMetadata;
  }
  if (briefingEl) {
    briefingEl.hidden = !(
      hasCurrentSituation
      || hasRecommendation
      || hasOriginalSource
      || storySummary
      || monitoringScope
      || storyIdentifiers.length
      || (hasLastChecked && !isPreparing)
    );
  }

  const whyFollowing = localizeField(watch, 'whyFollowing');
  const hasWhyFollowing = hasMeaningfulText(whyFollowing)
    && whyFollowing.trim() !== request?.trim();
  if (whyFollowingCopyEl) {
    whyFollowingCopyEl.textContent = hasWhyFollowing ? whyFollowing : '';
  }
  if (whyFollowingEl) {
    whyFollowingEl.hidden = !hasWhyFollowing;
  }

  const timeline = getWatchTimelineEvents(watch)
    .map((item) => {
      const label = item.type === 'created'
        ? t('watchData.created')
        : item.type === 'update'
          ? getBodaccBusinessEventLabel(item.source, t)
            || item.source.sourceTitle
            || item.source.summary
            || t('detail.updateDetected')
          : localizeListItem(item.source);
      if (!label) {
        return null;
      }
      const date = item.dateKey
        ? t(item.dateKey)
        : item.timestamp ? formatDate(item.timestamp) : '';
      return {
        date,
        label,
        articleUrl: item.type === 'update'
          ? getSafeExternalUrl(item.source.sourceUrl)
          : null,
      };
    })
    .filter(Boolean)
    .map((item, index, items) => ({
      ...item,
      isLatest: index === items.length - 1,
    }));
  if (timelineEl) {
    timelineEl.innerHTML = timeline
      .map((item) => `
        <li class="timeline__item${item.isLatest ? ' timeline__item--latest' : ''}">
          <span class="timeline__marker" aria-hidden="true"></span>
          <div>
            ${item.date ? `<p class="timeline__date">${escapeHtml(item.date)}</p>` : ''}
            <p class="timeline__event">${escapeHtml(item.label)}</p>
            ${item.articleUrl ? `
              <a class="timeline__article-link" href="${escapeHtml(item.articleUrl)}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(t('detail.openArticle'))} <span aria-hidden="true">↗</span>
              </a>
            ` : ''}
          </div>
        </li>
      `)
      .join('');
  }
  if (timelineSectionEl) {
    timelineSectionEl.hidden = timeline.length === 0;
  }

  const externalActions = Array.isArray(watch.externalActions)
    ? watch.externalActions
    : watch.externalAction ? [watch.externalAction] : [];
  const renderedActions = externalActions
    .map((action) => ({
      label: action.labelKey ? t(action.labelKey) : action.label || t('common.openSource'),
      url: getSafeExternalUrl(action.url),
    }))
    .filter((action) => action.label && action.url);
  if (externalActionsEl) {
    externalActionsEl.innerHTML = renderedActions
      .map((action) => `
        <a class="external-action" href="${escapeHtml(action.url)}" target="_blank" rel="noopener noreferrer">
          <span>${escapeHtml(action.label)}</span>
          <span class="external-action__icon" aria-hidden="true">↗</span>
        </a>
      `)
      .join('');
  }
  if (actionsSectionEl) {
    actionsSectionEl.hidden = renderedActions.length === 0;
  }

  const monitoringUpdates = getWatchUpdates(watch).reverse();
  const displayedUnreadUpdateIds = monitoringUpdates
    .filter(({ status: updateStatus }) => updateStatus === 'new')
    .map(({ id }) => id);
  if (monitoringUpdatesListEl) {
    monitoringUpdatesListEl.innerHTML = monitoringUpdates
      .map((item, index) => {
        const itemUrl = getSafeExternalUrl(item.sourceUrl);
        const legacyChange = index === 0 ? getLatestChange(watch) : '';
        const title = item.sourceTitle || item.summary || legacyChange || t('detail.untitledItem');
        const timestamp = formatMonitoringTimestamp(item.timestamp);
        const metadata = [
          item.sourceDomain,
          timestamp,
        ].filter(Boolean).join(' · ');
        const summary = item.summary && item.summary !== title ? item.summary : '';
        return `
          <li class="monitoring-update">
            ${itemUrl
    ? `<a href="${escapeHtml(itemUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)} <span aria-hidden="true">↗</span></a>`
    : `<p class="monitoring-update__title">${escapeHtml(title)}</p>`}
            ${metadata ? `<p class="monitoring-update__metadata">${escapeHtml(metadata)}</p>` : ''}
            ${summary ? `<p class="monitoring-update__description">${escapeHtml(summary)}</p>` : ''}
          </li>
        `;
      })
      .join('');
  }
  if (monitoringUpdatesEl) {
    monitoringUpdatesEl.hidden = monitoringUpdates.length === 0;
  }
  if (
    monitoringUpdatesEl
    && monitoringUpdatesListEl
    && !monitoringUpdatesEl.hidden
    && displayedUnreadUpdateIds.length
    && !detailCheckInProgress
  ) {
    const readableUpdateIds = displayedUnreadUpdateIds.filter(
      (updateId) => !detailDeferredReadUpdateIds.has(getDeferredReadKey(watch.id, updateId)),
    );
    if (readableUpdateIds.length) {
      queueMicrotask(() => markUpdatesAsRead(watch.id, readableUpdateIds));
    }
    displayedUnreadUpdateIds.forEach((updateId) => (
      detailDeferredReadUpdateIds.delete(getDeferredReadKey(watch.id, updateId))
    ));
  }

  if (preparingEl) {
    preparingEl.hidden = !isPreparing;
    preparingEl.classList.remove('is-leaving');
  }
  if (isPreparing) {
    scheduleFirstMonitoringPass(watch, preparingEl);
  } else {
    window.clearTimeout(firstMonitoringTimer);
    firstMonitoringTimer = null;
  }

  if (managementEl) {
    managementEl.hidden = false;
  }
  if (checkNowEl) {
    checkNowEl.hidden = isPreparing;
    checkNowEl.disabled = detailCheckInProgress || isPreparing;
    checkNowEl.setAttribute('aria-busy', String(detailCheckInProgress));
    checkNowEl.onclick = async () => {
      if (detailCheckInProgress || watchCheckController.isChecking(watch.id)) return;

      detailCheckInProgress = true;
      detailCheckErrorWatchId = null;
      checkNowEl.disabled = true;
      checkNowEl.setAttribute('aria-busy', 'true');
      if (checkNowLabelEl) checkNowLabelEl.textContent = t('detail.checking');
      if (checkSpinnerEl) checkSpinnerEl.hidden = false;
      if (!watch.lastChecked && lastCheckedEl) {
        lastCheckedEl.textContent = t('detail.checking');
      }
      if (checkFeedbackEl) {
        checkFeedbackEl.textContent = t('detail.checkingForUpdates');
        checkFeedbackEl.dataset.state = 'info';
        checkFeedbackEl.hidden = false;
      }
      try {
        await waitForVisiblePaint();
        if (import.meta.env.DEV) {
          console.info('[Watch monitoring] Check requested', { watchId: watch.id });
        }
        const result = await watchCheckController.check(watch.id);
        result.matchedItems.forEach(({ id }) => (
          detailDeferredReadUpdateIds.add(getDeferredReadKey(watch.id, id))
        ));
        detailCheckErrorWatchId = null;
        setBriefingGeneratedAt(result.changes.lastChecked);
      } catch (error) {
        detailCheckErrorWatchId = watch.id;
        if (import.meta.env.DEV) {
          console.warn('[Watch monitoring] Check failed', {
            watchId: watch.id,
            code: error instanceof MonitoringCheckError ? error.code : 'CHECK_FAILED',
          });
        }
      } finally {
        detailCheckInProgress = false;
        renderWatchDetail();
      }
    };
  }
  if (checkNowLabelEl) {
    checkNowLabelEl.textContent = t(detailCheckInProgress ? 'detail.checking' : 'detail.checkNow');
  }
  if (checkSpinnerEl) {
    checkSpinnerEl.hidden = !detailCheckInProgress;
  }
  if (checkReviewEl) {
    checkReviewEl.hidden = true;
    checkReviewEl.removeAttribute('aria-label');
    checkReviewEl.onclick = null;
  }
  if (checkFeedbackEl && !detailCheckInProgress) {
    const outcome = watch.lastCheckOutcome?.type;
    const outcomeKey = outcome === 'baseline'
      ? 'detail.noNewUpdates'
      : outcome === 'no-new-items'
        ? 'detail.noNewUpdates'
        : outcome === 'no-matching-items'
          ? 'detail.noMatchingUpdates'
          : ['matching-items', 'new-items'].includes(outcome) ? 'detail.newItemsFound' : null;
    const hasFeedUrl = Boolean(normalizeFeedUrl(watch.feedUrl));
    if (lastAttemptFailed) {
      const reasonMessage = t(getMonitoringFailureMessageKey(watch.lastCheckAttempt?.code));
      checkFeedbackEl.textContent = `${t('detail.checkFailedStatus')} — ${reasonMessage}`;
      checkFeedbackEl.dataset.state = 'error';
      checkFeedbackEl.hidden = false;
    } else if (outcomeKey) {
      const reviewableUpdates = getLatestCheckUpdates(watch);
      const count = reviewableUpdates.length;
      const hasReviewableUpdates = ['matching-items', 'new-items'].includes(outcome) && count > 0;
      const localizedOutcomeKey = hasReviewableUpdates
        ? `${outcomeKey}.${count === 1 ? 'one' : 'other'}`
        : ['matching-items', 'new-items'].includes(outcome) ? 'detail.noMatchingUpdates' : outcomeKey;
      checkFeedbackEl.textContent = t(localizedOutcomeKey, { count });
      checkFeedbackEl.dataset.state = hasReviewableUpdates
        ? 'new'
        : 'success';
      checkFeedbackEl.hidden = false;
      if (hasReviewableUpdates && checkReviewEl) {
        const reviewTarget = count === 1 ? currentSituationContainerEl : monitoringUpdatesEl;
        const labelKey = count === 1 ? 'detail.reviewUpdate' : 'detail.reviewUpdates';
        checkReviewEl.href = count === 1 ? '#current-situation' : '#watchMonitoringUpdates';
        checkReviewEl.textContent = t(labelKey);
        checkReviewEl.setAttribute('aria-label', t(labelKey));
        checkReviewEl.hidden = false;
        checkReviewEl.onclick = (event) => {
          event.preventDefault();
          window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}${window.location.search}${checkReviewEl.getAttribute('href')}`,
          );
          revealUpdateTarget(reviewTarget);
        };
      }
    } else if (!hasFeedUrl) {
      checkFeedbackEl.textContent = '';
      checkFeedbackEl.hidden = true;
      delete checkFeedbackEl.dataset.state;
    } else if (watch.monitoringStatus?.state === 'unavailable') {
      checkFeedbackEl.textContent = t('detail.monitoringUnavailable');
      checkFeedbackEl.dataset.state = 'info';
      checkFeedbackEl.hidden = false;
    } else {
      checkFeedbackEl.hidden = true;
      delete checkFeedbackEl.dataset.state;
    }
  }

  const shouldRevealCurrentUpdate = window.location.hash === `#${CURRENT_UPDATE_FRAGMENT}`
    && Boolean(latestMeaningfulUpdate);
  const revealRouteKey = shouldRevealCurrentUpdate
    ? `${watch.id}\u0000${latestMeaningfulUpdate.id}\u0000${window.location.href}`
    : null;
  if (revealRouteKey && detailRevealedUpdateRoute !== revealRouteKey) {
    detailRevealedUpdateRoute = revealRouteKey;
    window.requestAnimationFrame(() => revealUpdateTarget(currentSituationContainerEl));
  }

  const isPaused = watch.status === 'paused';
  const resumeWatch = () => {
    updateWatch(watch.id, {
      status: watch.statusBeforePause || 'watching',
      statusBeforePause: null,
    });
    renderWatchDetail();
  };
  if (pausedResumeEl) {
    pausedResumeEl.onclick = resumeWatch;
  }
  if (pauseResumeEl) {
    pauseResumeEl.hidden = false;
    if (pauseResumeLabelEl) {
      pauseResumeLabelEl.textContent = t(isPaused ? 'detail.resumeWatch' : 'detail.pauseWatch');
    }
    if (pauseIconEl) pauseIconEl.hidden = isPaused;
    if (resumeIconEl) resumeIconEl.hidden = !isPaused;
    pauseResumeEl.className = 'button button--secondary watch-management__pause';
    pauseResumeEl.onclick = isPaused
      ? resumeWatch
      : () => {
        updateWatch(watch.id, {
          status: 'paused',
          statusBeforePause: watch.status,
        });
        renderWatchDetail();
      };
  }

  if (deleteEl && deleteDialogEl) {
    deleteEl.onclick = () => {
      deleteDialogEl.showModal();
      window.requestAnimationFrame(() => deleteCancelEl?.focus());
    };
  }
  if (deleteConfirmEl) {
    deleteConfirmEl.onclick = (event) => {
      event.preventDefault();
      deleteWatch(watch.id);
      deleteDialogEl?.close();
      window.location.href = 'watches.html';
    };
  }

  if (confirmationEl) {
    const detailUrl = new URL(window.location.href);
    const createdWatchId = detailUrl.searchParams.get('watchCreated');
    const updatedWatchId = detailUrl.searchParams.get('watchUpdated');
    const confirmationType = updatedWatchId === watch.id
      ? 'updated'
      : createdWatchId === watch.id ? 'created' : null;

    if (createdWatchId || updatedWatchId) {
      detailUrl.searchParams.delete('watchCreated');
      detailUrl.searchParams.delete('watchUpdated');
      window.history.replaceState(
        null,
        '',
        `${detailUrl.pathname}${detailUrl.search}${detailUrl.hash}`,
      );
    }

    if (confirmationType) {
      const titleKey = confirmationType === 'updated'
        ? 'detail.updatedTitle'
        : 'detail.createdTitle';
      const copyKey = confirmationType === 'updated'
        ? 'detail.updatedCopy'
        : 'detail.createdCopy';
      if (confirmationTitleEl) {
        confirmationTitleEl.dataset.i18n = titleKey;
        confirmationTitleEl.textContent = t(titleKey);
      }
      if (confirmationCopyEl) {
        confirmationCopyEl.dataset.i18n = copyKey;
        confirmationCopyEl.textContent = t(copyKey);
      }
      showDetailConfirmation(confirmationEl);
    } else if (confirmationEl.dataset.active !== 'true') {
      confirmationEl.hidden = true;
    }
  }
};

function scheduleFirstMonitoringPass(watch, preparingEl) {
  window.clearTimeout(firstMonitoringTimer);
  const completesAt = Date.parse(watch.firstCheckCompletesAt);
  const remaining = Number.isNaN(completesAt)
    ? FIRST_MONITORING_DELAY
    : Math.max(0, completesAt - Date.now());

  firstMonitoringTimer = window.setTimeout(() => {
    const currentWatch = getWatchById(watch.id);
    if (currentWatch?.monitoringState !== 'preparing') {
      return;
    }

    preparingEl?.classList.add('is-leaving');
    window.clearTimeout(firstMonitoringTransitionTimer);
    firstMonitoringTransitionTimer = window.setTimeout(() => {
      const checkedAt = new Date().toISOString();
      updateWatch(watch.id, {
        monitoringState: 'monitoring',
        firstCheckCompletedAt: checkedAt,
        firstCheckCompletesAt: null,
      });
      renderWatchDetail();

      const refreshedMonitoringControlsEl = document.querySelector('#watchMonitoringControls');
      if (refreshedMonitoringControlsEl && !refreshedMonitoringControlsEl.hidden) {
        refreshedMonitoringControlsEl.classList.add('is-revealing');
        window.setTimeout(() => refreshedMonitoringControlsEl.classList.remove('is-revealing'), 420);
      }
      firstMonitoringTransitionTimer = null;
    }, 240);
  }, remaining);
}

const renderDevTools = () => {
  if (!import.meta.env.DEV) {
    return;
  }

  window.watchAssistantResetDemo = () => {
    resetStoredWatches();
    localStorage.removeItem(ONBOARDING_COMPLETED_STORAGE_KEY);
    sessionStorage.clear();
    window.location.reload();
  };

  console.info('Dev: reset demo data with window.watchAssistantResetDemo()');

  const shell = document.querySelector('.app-shell');
  if (!shell) {
    return;
  }

  const control = document.createElement('div');
  control.className = 'dev-reset-control';
  control.innerHTML = `
    <button type="button" class="button button--secondary">${t('dev.reset')}</button>
    <p class="text-muted">${t('dev.only')}</p>
  `;

  const button = control.querySelector('button');
  button?.addEventListener('click', window.watchAssistantResetDemo);

  shell.append(control);
};

const renderHomeSummary = () => {
  const confirmationBanner = document.querySelector('#homeConfirmation');
  const confirmationBadge = document.querySelector('#homeConfirmationBadge');
  const confirmationCopy = document.querySelector('#homeConfirmationCopy');
  const confirmationLink = document.querySelector('#homeConfirmationLink');
  const confirmationDismiss = document.querySelector('#homeConfirmationDismiss');
  const confirmationTitle = document.querySelector('#homeConfirmationTitle');
  const confirmationBody = document.querySelector('#homeConfirmationBody');
  const briefingReport = document.querySelector('#homeBriefingReport');
  const briefingFeed = document.querySelector('#homeBriefingFeed');
  const emptyState = document.querySelector('#homeEmptyState');
  const caughtUpState = document.querySelector('#homeCaughtUpState');
  const allQuiet = document.querySelector('#homeAllQuiet');
  const everythingChecked = document.querySelector('#homeEverythingChecked');
  const briefingDate = document.querySelector('#homeBriefingDate');
  const greeting = document.querySelector('#homeSummaryLabel');
  const checkedSummary = document.querySelector('#homeCheckedSummary');
  const attentionCount = document.querySelector('#homeAttentionCount');
  const attentionLabel = document.querySelector('#homeAttentionLabel');
  const updatedCount = document.querySelector('#homeUpdatedCount');
  const updatedLabel = document.querySelector('#homeUpdatedLabel');
  const newSummary = document.querySelector('#homeNewSummary');
  const newCount = document.querySelector('#homeNewCount');
  const newLabel = document.querySelector('#homeNewLabel');

  if (!confirmationBanner && !briefingDate) {
    return;
  }

  const homeReport = getHomeReport();
  const hasUserCreatedWatches = getUserCreatedWatches().length > 0;
  const hasHomeItems = homeReport.watches.length > 0;
  const hasQuietItems = homeReport.quietWatches.length > 0;
  if (briefingReport) briefingReport.hidden = !hasUserCreatedWatches || !hasHomeItems;
  if (briefingFeed) {
    briefingFeed.hidden = !hasUserCreatedWatches || (!hasHomeItems && !hasQuietItems);
  }
  if (emptyState) emptyState.hidden = hasUserCreatedWatches;
  if (caughtUpState) {
    caughtUpState.hidden = !hasUserCreatedWatches || hasHomeItems || hasQuietItems;
  }
  if (allQuiet) allQuiet.hidden = !hasUserCreatedWatches || !hasQuietItems;

  if (!homeFirstWatchConfirmationChecked) {
    const firstWatchId = consumeFirstWatchConfirmation();
    homeFirstWatchConfirmationChecked = true;
    if (firstWatchId) {
      homeCreatedWatchId = firstWatchId;
      homeFirstWatchConfirmation = true;
    }
  }

  if (briefingDate) {
    const locale = getLanguage() === 'fr' ? 'fr-FR' : 'en-GB';
    const storedTimestamp = getBriefingGeneratedAt();
    const generatedAt = storedTimestamp ? new Date(storedTimestamp) : null;
    const dateParts = generatedAt
      ? new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).formatToParts(generatedAt)
      : [];
    const getDatePart = (type) => dateParts.find((part) => part.type === type)?.value || '';
    const date = generatedAt
      ? `${getDatePart('weekday')} ${getDatePart('day')} ${getDatePart('month')}`
      : '';
    const time = generatedAt
      ? new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(generatedAt)
      : '';
    const timestampText = generatedAt
      ? `${date} · ${time}`
      : t('home.briefingTimeUnavailable');

    if (storedTimestamp) {
      briefingDate.dateTime = storedTimestamp;
    } else {
      briefingDate.removeAttribute('datetime');
    }
    briefingDate.innerHTML = `
      <span class="briefing-summary__timestamp-label">${escapeHtml(t('home.updatedAt'))}</span>
      <span class="briefing-summary__timestamp-value">${escapeHtml(timestampText)}</span>
    `;
  }

  const {
    attentionWatches,
    updatedWatches,
    newlyCreatedWatches,
    quietWatches,
    totalChecked,
  } = homeReport;
  const pluralKey = (key, count) => `${key}.${count === 1 ? 'one' : 'other'}`;
  const currentHour = new Date().getHours();
  const greetingKey = currentHour < 12
    ? 'home.greetings.morning'
    : currentHour < 18 ? 'home.greetings.afternoon' : 'home.greetings.evening';

  if (greeting) {
    greeting.textContent = t(greetingKey);
  }
  if (checkedSummary) {
    checkedSummary.textContent = t(pluralKey('home.checkedAway', totalChecked), {
      count: totalChecked,
    });
  }
  if (attentionCount) {
    attentionCount.textContent = String(attentionWatches.length);
  }
  if (attentionLabel) {
    attentionLabel.textContent = t(pluralKey('home.attentionLabel', attentionWatches.length));
  }
  if (updatedCount) {
    updatedCount.textContent = String(updatedWatches.length);
  }
  if (updatedLabel) {
    updatedLabel.textContent = t(pluralKey('home.updatedLabel', updatedWatches.length));
  }
  if (newSummary) newSummary.hidden = newlyCreatedWatches.length === 0;
  if (newCount) newCount.textContent = String(newlyCreatedWatches.length);
  if (newLabel) {
    newLabel.textContent = t(pluralKey('home.newLabel', newlyCreatedWatches.length));
  }
  if (everythingChecked) {
    everythingChecked.textContent = t(pluralKey('home.everythingChecked', quietWatches.length), {
      count: quietWatches.length,
    });
  }
  [
    ['attention', attentionWatches.length, attentionLabel],
    ['updated', updatedWatches.length, updatedLabel],
    ['new', newlyCreatedWatches.length, newLabel],
  ].forEach(([status, count, labelElement]) => {
    const trigger = document.querySelector(`[data-home-status-target="${status}"]`);
    if (!trigger) return;
    trigger.disabled = count === 0;
    trigger.setAttribute('aria-label', t('home.statusNavigationLabel', {
      count,
      status: labelElement?.textContent || '',
    }));
  });

  const homeUrl = new URL(window.location.href);
  const createdWatchIdFromUrl = homeUrl.searchParams.get('watchCreated');
  const shouldRevealCreatedWatch = Boolean(createdWatchIdFromUrl);
  if (createdWatchIdFromUrl) {
    homeCreatedWatchId = createdWatchIdFromUrl;
    homeUrl.searchParams.delete('watchCreated');
    window.history.replaceState(null, '', `${homeUrl.pathname}${homeUrl.search}${homeUrl.hash}`);
    sessionStorage.removeItem('watchAssistant.newWatchId');
  }
  if (confirmationBanner) {
    const createdWatchId = homeCreatedWatchId;
    if (createdWatchId) {
      const createdWatch = getWatchById(createdWatchId);
      if (createdWatch) {
        confirmationBanner.hidden = false;
        if (confirmationTitle) {
          confirmationTitle.textContent = t(homeFirstWatchConfirmation
            ? 'home.firstConfirmationTitle'
            : 'home.confirmationTitle');
        }
        if (confirmationBody) {
          confirmationBody.textContent = t(homeFirstWatchConfirmation
            ? 'home.firstConfirmationCopy'
            : 'home.confirmationCopy');
        }
        if (confirmationCopy && homeFirstWatchConfirmation) {
          confirmationCopy.hidden = true;
        } else if (confirmationCopy) {
          confirmationCopy.hidden = false;
          confirmationCopy.textContent = localizeField(createdWatch, 'title');
        }
        if (confirmationLink) {
          confirmationLink.href = `watch-detail.html?id=${encodeURIComponent(createdWatch.id)}`;
          confirmationLink.textContent = t(homeFirstWatchConfirmation
            ? 'home.viewMyWatch'
            : 'home.viewWatch');
        }
        if (confirmationDismiss) {
          confirmationDismiss.onclick = () => {
            window.clearTimeout(homeCreatedWatchFeedbackTimer);
            homeCreatedWatchFeedbackTimer = null;
            confirmationBanner.classList.remove('is-newly-created');
            if (confirmationBadge) {
              confirmationBadge.hidden = true;
            }
            confirmationBanner.hidden = true;
            homeCreatedWatchId = null;
            homeFirstWatchConfirmation = false;
          };
        }
        if (shouldRevealCreatedWatch) {
          window.clearTimeout(homeCreatedWatchFeedbackTimer);
          confirmationBanner.classList.add('is-newly-created');
          if (confirmationBadge) {
            confirmationBadge.hidden = false;
          }

          window.requestAnimationFrame(() => {
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const bannerRect = confirmationBanner.getBoundingClientRect();
            const isOutsideViewport = bannerRect.top < 0 || bannerRect.bottom > window.innerHeight;
            if (isOutsideViewport) {
              confirmationBanner.scrollIntoView({
                behavior: reducedMotion ? 'auto' : 'smooth',
                block: 'center',
              });
            }
          });

          homeCreatedWatchFeedbackTimer = window.setTimeout(() => {
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (confirmationBadge && !reducedMotion) {
              confirmationBadge.addEventListener('transitionend', (event) => {
                if (event.propertyName === 'opacity') {
                  confirmationBadge.hidden = true;
                }
              }, { once: true });
            }
            confirmationBanner.classList.remove('is-newly-created');
            if (confirmationBadge && reducedMotion) {
              confirmationBadge.hidden = true;
            }
            homeCreatedWatchFeedbackTimer = null;
          }, 4000);
        }
      } else {
        confirmationBanner.hidden = true;
        homeCreatedWatchId = null;
      }
    } else {
      confirmationBanner.hidden = true;
    }
  }
};

/**
 * Prototype hook for a completed global watch check.
 * Run refreshBriefing() in the browser console to persist a new briefing time.
 */
export const refreshBriefing = () => {
  const generatedAt = setBriefingGeneratedAt();
  renderHomeSummary();
  renderHomeBriefing();
  return generatedAt;
};

export function initForm() {
  const form = document.querySelector('#newWatchForm');
  const watchError = document.querySelector('#watchError');
  const hint = document.querySelector('#inputTypeHint');
  const submitButton = document.querySelector('#newWatchSubmit');
  const submitLabel = document.querySelector('#newWatchSubmitLabel');
  const analysisSection = document.querySelector('#urlAnalysis');
  const processingState = document.querySelector('#urlAnalysisProcessing');
  const processingMessage = document.querySelector('#urlAnalysisMessage');
  const analysisCancel = document.querySelector('#urlAnalysisCancel');
  const review = document.querySelector('#urlReview');
  const reviewSuccess = document.querySelector('#urlReviewSuccess');
  const reviewFailure = document.querySelector('#urlReviewFailure');
  const reviewHeading = document.querySelector('#urlReviewHeading');
  const reviewTitleLabel = document.querySelector('#urlReviewTitleLabel');
  const reviewSummaryLabel = document.querySelector('#urlReviewSummaryLabel');
  const reviewSourceLabel = document.querySelector('.url-review__source > span');
  const reviewTitle = document.querySelector('#urlReviewTitle');
  const reviewSummary = document.querySelector('#urlReviewSummary');
  const reviewSummaryError = document.querySelector('#urlReviewSummaryError');
  const reviewMonitoringScopeField = document.querySelector('#urlReviewMonitoringScopeField');
  const reviewMonitoringScope = document.querySelector('#urlReviewMonitoringScope');
  const reviewSource = document.querySelector('#urlReviewSource');
  const companyReviewAdministrativeStatus = document.querySelector('#companyReviewAdministrativeStatus');
  const companyReviewAdministrativeStatusBadge = document.querySelector('#companyReviewAdministrativeStatusBadge');
  const companyReviewAdministrativeStatusDescription = document.querySelector('#companyReviewAdministrativeStatusDescription');
  const companyReviewStatus = document.querySelector('#companyReviewStatus');
  const companyReviewStatusBadge = document.querySelector('#companyReviewStatusBadge');
  const companyReviewStatusDescription = document.querySelector('#companyReviewStatusDescription');
  const companyReviewStatusFollowUp = document.querySelector('#companyReviewStatusFollowUp');
  const companyReviewWarning = document.querySelector('#companyReviewWarning');
  const companyReviewWarningTitle = document.querySelector('#companyReviewWarningTitle');
  const companyReviewWarningCopy = document.querySelector('#companyReviewWarningCopy');
  const reviewCreate = document.querySelector('#urlReviewCreate');
  const reviewEdit = document.querySelector('#urlReviewEdit');
  const reviewCancel = document.querySelector('#urlReviewCancel');
  const clarification = document.querySelector('#requestClarification');
  const clarificationOriginal = document.querySelector('#clarificationOriginal');
  const clarificationMessage = document.querySelector('#clarificationMessage');
  const clarificationWarning = document.querySelector('#clarificationWarning');
  const clarificationSuggestion = document.querySelector('#clarificationSuggestion');
  const clarificationSuggestionField = document.querySelector('#clarificationSuggestionField');
  const clarificationActions = document.querySelector('#clarificationActions');
  const input = form?.watchRequest;
  const composer = input?.closest('.watch-composer');
  const watchClear = form?.querySelector('[data-watch-clear]');
  const noteToggle = form?.querySelector('[data-note-toggle]');
  const noteClose = form?.querySelector('[data-note-close]');
  const noteRegion = document.querySelector('#watchReason');
  const noteInput = form?.whyFollowing;
  const headingEl = document.querySelector('#newWatchHeading');
  const backEl = document.querySelector('#newWatchBack');
  const backLabelEl = backEl?.querySelector('[data-top-navigation-label]');
  const watchOptionsEl = document.querySelector('#watchOptions');
  const keywordChipsEl = document.querySelector('#watchKeywordChips');
  const keywordHelperEl = document.querySelector('.watch-keywords__helper');
  const keywordInputEl = document.querySelector('#watchKeywordInput');
  const keywordAddEl = document.querySelector('#watchKeywordAdd');
  const categoryInputEl = document.querySelector('#watchCategoryInput');
  const advancedSettingsEl = document.querySelector('#watchAdvancedSettings');
  const advancedToggleEl = document.querySelector('#watchAdvancedToggle');
  const advancedPanelEl = document.querySelector('#watchAdvancedPanel');
  const feedUrlInputEl = document.querySelector('#watchFeedUrlInput');
  const discardDialog = document.querySelector('#editDiscardDialog');
  const keepEditingButton = document.querySelector('#editKeepEditing');
  const discardChangesButton = document.querySelector('#editDiscardChanges');
  const formParams = new URLSearchParams(window.location.search);
  const editWatchId = formParams.get('edit');
  let editingWatch = editWatchId ? getWatchById(editWatchId) : null;
  const isEditMode = Boolean(editingWatch);
  const isModalEditMode = isEditMode
    && formParams.get('presentation') === 'modal'
    && window.parent !== window;
  let pendingRequest = '';
  let pendingWhyFollowing = '';
  let pendingAnalysis = null;
  let analysisInProgress = false;
  let planningInProgress = false;
  let clarificationInProgress = false;
  let urlAnalysisProgressKey = null;
  let urlAnalysisController = null;
  let urlAnalysisRequestId = 0;
  let creationInProgress = false;
  let pendingClarificationWhyFollowing = '';
  let pendingClarificationOriginal = '';
  let pendingClarificationSuggestion = '';
  let pendingClarificationType = CLARIFICATION_TYPES.CLEAR;
  let pendingClarificationHasSuggestion = false;
  let pendingNonArticleAnalysis = null;
  const resizeFrames = new WeakMap();
  let noteCollapseTimer = null;
  let keywordRegenerationTimer = null;
  let keywordItems = [];
  let editingConceptIndex = null;
  let keywordsManuallyEdited = false;
  let reviewEnhancementInProgress = false;
  let conceptRegenerationInProgress = false;
  let categorySource = editingWatch?.categorySource || 'inferred';
  let keywordSourceRequest = '';
  let initialEditState = null;
  let pendingNavigationUrl = '';
  let editNavigationAllowed = false;
  let refreshEditSaveState = () => {};
  let activeVoiceTooltip = null;
  let voiceTooltipDismissTimer = null;
  let voiceTooltipHideTimer = null;

  if (!form) {
    return;
  }

  if (editWatchId && !editingWatch) {
    window.location.replace('watches.html');
    return;
  }

  if (!isEditMode) {
    trackProductEventOnce(PRODUCT_EVENTS.CREATE_WATCH_PAGE_VIEWED);
  }

  if (isModalEditMode) {
    document.documentElement.classList.add('is-edit-modal-root');
    document.body.classList.add('is-edit-modal');

    let viewportFrame = null;
    const updateEditViewport = () => {
      if (viewportFrame !== null) window.cancelAnimationFrame(viewportFrame);
      viewportFrame = window.requestAnimationFrame(() => {
        if (editNavigationAllowed) {
          document.documentElement.style.removeProperty('--edit-visual-viewport-height');
          viewportFrame = null;
          return;
        }
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        document.documentElement.style.setProperty(
          '--edit-visual-viewport-height',
          `${Math.round(viewportHeight)}px`,
        );
        const activeField = document.activeElement;
        if (activeField?.matches('input, textarea, select')) {
          activeField.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        viewportFrame = null;
      });
    };

    updateEditViewport();
    window.visualViewport?.addEventListener('resize', updateEditViewport);
    window.addEventListener('resize', updateEditViewport);
  }

  const hasMeaningfulRequest = () => hasMeaningfulText(input?.value || '');

  const setAdvancedSettingsExpanded = (expanded) => {
    if (!advancedToggleEl || !advancedPanelEl) return;
    advancedToggleEl.setAttribute('aria-expanded', String(expanded));
    advancedPanelEl.hidden = !expanded;
  };

  const validateFeedUrl = ({ focus = false } = {}) => {
    if (!feedUrlInputEl) return true;
    const value = feedUrlInputEl.value.trim();
    const valid = !value || Boolean(normalizeFeedUrl(value));
    feedUrlInputEl.setCustomValidity(valid ? '' : t('newWatch.feedUrlError'));
    if (!valid && focus) {
      setAdvancedSettingsExpanded(true);
      feedUrlInputEl.reportValidity();
    }
    return valid;
  };

  const getKeywordValues = () => ({
    keywords: pendingAnalysis?.isStory === false ? [] : keywordItems.map((item) => item.label),
    selectedKeywords: pendingAnalysis?.isStory === false ? [] : keywordItems.map((item) => item.label),
    storyFingerprint: pendingAnalysis?.isStory === false ? [] : keywordItems.map((item) => ({
      label: item.label,
      type: item.type || 'manual',
    })),
  });

  const renderKeywords = () => {
    if (!keywordChipsEl) return;
    keywordChipsEl.innerHTML = keywordItems
      .map((item, index) => {
        const labelControl = editingConceptIndex === index
          ? `<input
              class="watch-keyword__edit"
              type="text"
              value="${escapeHtml(item.label)}"
              data-concept-edit="${index}"
              aria-label="${escapeHtml(t('newWatch.renameConcept', { concept: item.label }))}"
              style="width: ${Math.max(5, Math.min(28, [...item.label].length + 1))}ch"
            />`
          : `<button
              class="watch-keyword__toggle"
              type="button"
              data-concept-rename="${index}"
              aria-label="${escapeHtml(t('newWatch.renameConcept', { concept: item.label }))}"
            >${escapeHtml(item.label)}</button>`;
        return `
        <span class="watch-keyword is-selected">
          ${labelControl}
          <span class="watch-keyword__type">${escapeHtml(t(`newWatch.conceptTypes.${item.type || 'manual'}`))}</span>
          <button
            class="watch-keyword__remove"
            type="button"
            data-keyword-remove="${index}"
            aria-label="${escapeHtml(t('newWatch.removeConcept', { concept: item.label }))}"
          >×</button>
        </span>
      `;
      })
      .join('');
    refreshEditSaveState();
  };

  const beginConceptRename = (index) => {
    if (!keywordItems[index]) return;
    editingConceptIndex = index;
    renderKeywords();
    window.requestAnimationFrame(() => {
      const editor = keywordChipsEl?.querySelector(`[data-concept-edit="${index}"]`);
      editor?.focus();
      editor?.select();
    });
  };

  const finishConceptRename = (index, value, { cancel = false } = {}) => {
    if (editingConceptIndex !== index) return;
    const label = value.trim();
    if (!cancel && label) {
      keywordsManuallyEdited = true;
      const duplicateIndex = keywordItems.findIndex((item, itemIndex) => (
        itemIndex !== index && item.label.toLocaleLowerCase() === label.toLocaleLowerCase()
      ));
      if (duplicateIndex >= 0) {
        keywordItems.splice(index, 1);
      } else {
        keywordItems[index].label = label;
        keywordItems[index].selected = true;
      }
    }
    editingConceptIndex = null;
    renderKeywords();
  };

  const replaceSuggestedKeywords = (request) => {
    keywordItems = extractMonitoringConcepts(request).map((label) => ({
      label,
      selected: true,
      type: 'manual',
    }));
    keywordSourceRequest = request;
    renderKeywords();
  };

  const addKeyword = () => {
    const label = keywordInputEl?.value.trim();
    if (!label) return;
    keywordsManuallyEdited = true;
    const existing = keywordItems.find(
      (item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
    );
    if (existing) {
      existing.selected = true;
    } else {
      keywordItems.push({ label, selected: true, type: 'manual', origin: 'user' });
    }
    keywordInputEl.value = '';
    renderKeywords();
    keywordInputEl.focus();
  };

  const scheduleKeywordRegeneration = () => {
    window.clearTimeout(keywordRegenerationTimer);
    keywordRegenerationTimer = window.setTimeout(() => {
      const request = input?.value.trim() || '';
      const requestChanged = normalizeComparableText(keywordSourceRequest)
        !== normalizeComparableText(request);
      if (requestChanged && categorySource === 'inferred' && categoryInputEl) {
        categoryInputEl.value = inferWatchCategory(request);
      }
      if (hasMeaningfulText(request) && requestChanged && !keywordsManuallyEdited) {
        replaceSuggestedKeywords(request);
      }
      refreshEditSaveState();
    }, 350);
  };

  const synchronizeInferredFields = (request) => {
    window.clearTimeout(keywordRegenerationTimer);
    const requestChanged = normalizeComparableText(keywordSourceRequest)
      !== normalizeComparableText(request);
    if (requestChanged && categorySource === 'inferred' && categoryInputEl) {
      categoryInputEl.value = inferWatchCategory(request);
    }
    if (requestChanged && !keywordsManuallyEdited) {
      replaceSuggestedKeywords(request);
    }
    refreshEditSaveState();
  };

  const updateNoteCloseLabel = () => {
    if (noteClose) {
      noteClose.setAttribute(
        'aria-label',
        t(noteInput?.value ? 'newWatch.clearNote' : 'newWatch.closeNote'),
      );
    }
  };

  const resizeTextarea = (textarea, { immediate = false, maxLines = 7 } = {}) => {
    if (!textarea) return;

    const pendingFrame = resizeFrames.get(textarea);
    if (pendingFrame !== undefined) window.cancelAnimationFrame(pendingFrame);
    const previousHeight = textarea.getBoundingClientRect().height;
    textarea.style.height = 'auto';
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight)
      || Number.parseFloat(styles.fontSize) * 1.55;
    const verticalPadding = Number.parseFloat(styles.paddingTop)
      + Number.parseFloat(styles.paddingBottom);
    const borderAdjustment = styles.boxSizing === 'border-box'
      ? Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth)
      : 0;
    const cssMinHeight = Number.parseFloat(styles.minHeight) || 0;
    const cssMaxHeight = Number.parseFloat(styles.maxHeight);
    const maxHeight = Number.isFinite(cssMaxHeight)
      ? cssMaxHeight
      : (lineHeight * maxLines) + verticalPadding + borderAdjustment;
    const contentHeight = textarea.scrollHeight;
    const requiredHeight = contentHeight + borderAdjustment;
    const nextHeight = Math.max(cssMinHeight, Math.min(requiredHeight, maxHeight));
    textarea.style.overflowY = requiredHeight > maxHeight + 1 ? 'auto' : 'hidden';

    if (immediate) {
      textarea.style.height = `${nextHeight}px`;
      resizeFrames.delete(textarea);
      return;
    }

    textarea.style.height = `${Math.max(previousHeight, cssMinHeight)}px`;
    const nextFrame = window.requestAnimationFrame(() => {
      textarea.style.height = `${nextHeight}px`;
      resizeFrames.delete(textarea);
    });
    resizeFrames.set(textarea, nextFrame);
  };

  const resizeInput = (options) => resizeTextarea(input, options);
  const resizeNote = (options) => resizeTextarea(noteInput, { maxLines: 12, ...options });
  const resizeReviewSummary = (options) => resizeTextarea(
    reviewSummary,
    { maxLines: 12, ...options },
  );

  const setSubmitLabel = (key = isEditMode ? 'newWatch.saveChanges' : 'newWatch.submit') => {
    if (submitLabel) {
      submitLabel.textContent = t(key);
    }
  };

  const setCreationControlsDisabled = (disabled) => {
    if (input) {
      input.disabled = disabled;
    }
    if (form.whyFollowing) {
      form.whyFollowing.disabled = disabled;
    }
    if (noteToggle) {
      noteToggle.disabled = disabled;
    }
    if (noteClose) {
      noteClose.disabled = disabled;
    }
    if (watchClear) {
      watchClear.disabled = disabled;
    }
    if (keywordInputEl) {
      keywordInputEl.disabled = disabled;
    }
    if (keywordAddEl) {
      keywordAddEl.disabled = disabled;
    }
    if (categoryInputEl) {
      categoryInputEl.disabled = disabled;
    }
    if (advancedToggleEl) {
      advancedToggleEl.disabled = disabled;
    }
    if (feedUrlInputEl) {
      feedUrlInputEl.disabled = disabled;
    }
    keywordChipsEl?.querySelectorAll('button').forEach((button) => {
      button.disabled = disabled;
    });
    if (submitButton) {
      submitButton.disabled = disabled || !hasMeaningfulRequest();
    }
    refreshEditSaveState();
  };

  const completeWatchCreation = async (watch) => {
    addWatch(watch);
    try {
      await activateWatchMonitoring(watch.id, {
        checkController: watchCheckController,
        saveWatch: updateWatch,
      });
    } catch (error) {
      deleteWatch(watch.id);
      throw error;
    }
    trackProductEvent(PRODUCT_EVENTS.WATCH_CREATED, {
      input_type: ['url', 'company'].includes(watch.inputType) ? watch.inputType : 'text',
    });
    sessionStorage.removeItem('watchAssistant.newWatchId');
    if (isOnboardingFirstWatch()) {
      completeOnboardingFirstWatch(watch.id);
      window.location.href = 'index.html';
      return;
    }
    markOnboardingCompleted();
    window.location.href = getCreatedWatchDetailHref(watch.id);
  };

  const finishModalTransition = (messageType) => {
    const viewport = window.visualViewport;
    const focusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    let settled = false;
    let fallbackTimer = null;

    const notifyParent = () => {
      if (settled) return;
      settled = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      viewport?.removeEventListener('resize', handleViewportResize);
      document.documentElement.style.removeProperty('--edit-visual-viewport-height');
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.parent.postMessage({
            type: messageType,
            watchId: editingWatch.id,
          }, window.location.origin);
        });
      });
    };

    const handleViewportResize = () => {
      window.requestAnimationFrame(notifyParent);
    };

    viewport?.addEventListener('resize', handleViewportResize, { once: true });
    focusedElement?.blur();
    // Safari occasionally omits the final visualViewport resize event after a programmatic blur.
    fallbackTimer = window.setTimeout(notifyParent, viewport ? 360 : 0);
  };

  const completeWatchUpdate = async (
    request,
    whyFollowing,
    urlAnalysis = null,
    {
      createdAsWrittenAfterClarityWarning,
      useRequestAsTitle = false,
    } = {},
  ) => {
    if (!validateFeedUrl({ focus: true })) {
      creationInProgress = false;
      setCreationControlsDisabled(false);
      return;
    }
    const keywordValues = getKeywordValues();
    const originalRequest = localizeField(editingWatch, 'request') || '';
    const requestChanged = request.trim() !== originalRequest.trim();
    const category = categoryInputEl?.value || editingWatch.category;
    const categoryChanged = category !== editingWatch.category;
    const originalKeywords = Array.isArray(editingWatch.keywords)
      ? editingWatch.keywords
      : extractMonitoringConcepts(originalRequest);
    const originalSelectedKeywords = Array.isArray(editingWatch.selectedKeywords)
      ? editingWatch.selectedKeywords
      : originalKeywords;
    const keywordsChanged = JSON.stringify(keywordValues.keywords) !== JSON.stringify(originalKeywords)
      || JSON.stringify(keywordValues.selectedKeywords) !== JSON.stringify(originalSelectedKeywords);
    const sameCompanyEdit = isSameCompanyEditAnalysis(editingWatch, urlAnalysis);
    const monitoringCriteriaChanged = !sameCompanyEdit
      && (requestChanged || categoryChanged || keywordsChanged);
    const feedInputUrl = normalizeFeedUrl(feedUrlInputEl?.value || '');
    const previousFeedUrl = normalizeFeedUrl(editingWatch.feedUrl || '');
    const manualFeedChanged = feedInputUrl !== previousFeedUrl;
    const discoveredFeedUrl = normalizeFeedUrl(urlAnalysis?.monitoringSource?.url || '');
    const feedUrl = manualFeedChanged
      ? feedInputUrl
      : discoveredFeedUrl || previousFeedUrl;
    const feedUrlChanged = !sameCompanyEdit && feedUrl !== previousFeedUrl;
    const monitoringSummary = requestChanged && !urlAnalysis
      ? await generateMonitoringSummary(request)
      : null;
    const derivedData = deriveWatchData(request, urlAnalysis, {
      category,
      categorySource,
      monitoringSummary,
      storyFingerprint: keywordsManuallyEdited
        ? keywordValues.storyFingerprint
        : urlAnalysis?.storyFingerprint,
      monitoringConceptsManuallyEdited: keywordsManuallyEdited
        || editingWatch.monitoringConceptsManuallyEdited === true,
      analysisProvider: editingWatch.analysisProvider,
      analysisStatus: editingWatch.analysisStatus,
      analysisModel: editingWatch.analysisModel,
      fallbackReasonCode: editingWatch.fallbackReasonCode,
      analyzedAt: editingWatch.analyzedAt,
      analysisDiagnosticId: editingWatch.analysisDiagnosticId,
      ...keywordValues,
    });
    const changes = {
      request,
      requestKey: null,
      whyFollowing: whyFollowing.trim(),
      whyFollowingKey: null,
      category,
      categorySource,
      ...keywordValues,
      monitoringConceptsVersion: MONITORING_CONCEPTS_VERSION,
      inputType: derivedData.inputType,
      feedUrl,
      sourceUrl: derivedData.sourceUrl,
      sourceName: derivedData.sourceName,
      sourceNameKey: null,
      sourceTitle: derivedData.sourceTitle,
      sourceTitleKey: null,
      storyFingerprint: derivedData.storyFingerprint,
      storyProfile: keywordsManuallyEdited
        ? synchronizeStoryProfile(
          editingWatch.storyProfile || derivedData.storyProfile,
          derivedData.storyFingerprint,
          keywordValues.keywords.filter((label) => !(
            editingWatch.storyFingerprint || []
          ).some((concept) => normalizeComparableText(concept.label) === normalizeComparableText(label))),
        )
        : derivedData.storyProfile,
      contentAccessLimited: derivedData.contentAccessLimited,
      conceptSourceFields: derivedData.conceptSourceFields,
      monitoringConceptsManuallyEdited: derivedData.monitoringConceptsManuallyEdited,
      sourcePublishedAt: derivedData.sourcePublishedAt,
      analysisProvider: derivedData.analysisProvider,
      analysisStatus: derivedData.analysisStatus,
      analysisModel: derivedData.analysisModel,
      fallbackReasonCode: derivedData.fallbackReasonCode,
      analyzedAt: derivedData.analyzedAt,
      analysisDiagnosticId: derivedData.analysisDiagnosticId,
      monitoringSource: feedUrl
        ? {
          url: feedUrl,
          type: urlAnalysis?.monitoringSource?.type || editingWatch.monitoringSource?.type || 'feed',
          title: urlAnalysis?.monitoringSource?.title || editingWatch.monitoringSource?.title || null,
          discovery: manualFeedChanged
            ? 'manual'
            : urlAnalysis?.monitoringSource?.discovery || editingWatch.monitoringSource?.discovery || 'manual',
        }
        : null,
      ...getPreservedCompanyEditChanges(editingWatch, urlAnalysis),
    };
    if (derivedData.isStory === false) changes.storyProfile = null;

    if (typeof createdAsWrittenAfterClarityWarning === 'boolean') {
      changes.createdAsWrittenAfterClarityWarning = createdAsWrittenAfterClarityWarning;
    }

    if (requestChanged) {
      changes.title = useRequestAsTitle ? request : derivedData.title;
      changes.titleKey = null;
    }

    if (monitoringCriteriaChanged) {
      const actionRequired = isUserActionRequired(editingWatch);
      Object.assign(changes, {
        monitoringSummary: derivedData.monitoringSummary,
        monitoringSummaryKey: derivedData.monitoringSummaryKey,
        structuredCriteria: derivedData.structuredCriteria,
        locations: derivedData.locations,
        destinations: derivedData.destinations,
        dates: derivedData.dates,
        prices: derivedData.prices,
        thresholds: derivedData.thresholds,
        monitoredEntity: derivedData.monitoredEntity,
        monitoredEvent: derivedData.monitoredEvent,
        currentSituation: null,
        currentSituationKey: derivedData.currentSituationKey,
        recommendation: null,
        recommendationKey: null,
        whyToday: null,
        whyTodayKey: null,
        latestChange: null,
        latestChangeKey: null,
        latestChangeAt: null,
        latestChangeAtKey: null,
        latestUpdate: null,
        latestUpdateKey: null,
        lastChecked: null,
        lastCheckedKey: null,
        confidence: null,
        sources: [],
        externalActions: [],
        externalAction: null,
        actionRequired,
        userActionReason: actionRequired
          ? editingWatch.userActionReason || editingWatch.attentionReason || null
          : null,
        attentionReason: actionRequired ? editingWatch.attentionReason || null : null,
        requiresAttention: actionRequired,
        status: editingWatch.status === 'paused'
          ? 'paused'
          : actionRequired ? 'attention' : 'watching',
        statusBeforePause: editingWatch.status === 'paused'
          ? actionRequired ? 'attention' : 'watching'
          : null,
        monitoringState: 'preparing',
        firstCheckCompletedAt: null,
        firstCheckCompletesAt: new Date(Date.now() + FIRST_MONITORING_DELAY).toISOString(),
      });
    }

    if (feedUrlChanged) {
      const missingMonitoringSource = derivedData.inputType === 'url' && !feedUrl;
      const actionRequired = isUserActionRequired(editingWatch);
      Object.assign(changes, {
        monitoringSnapshot: null,
        seenMonitoringItemIds: [],
        monitoringUpdates: [],
        monitoringReviewStatus: null,
        lastCheckOutcome: null,
        lastChecked: null,
        lastCheckedKey: null,
        monitoringStatus: {
          state: missingMonitoringSource ? 'setup-required' : 'configured',
          reason: missingMonitoringSource ? 'no-compatible-source' : null,
        },
        monitoringIssueReason: missingMonitoringSource ? 'no-compatible-source' : null,
        actionRequired,
        userActionReason: actionRequired
          ? editingWatch.userActionReason || editingWatch.attentionReason || null
          : null,
        attentionReason: actionRequired ? editingWatch.attentionReason || null : null,
        requiresAttention: actionRequired,
        status: actionRequired
          ? 'attention'
          : editingWatch.status === 'attention' ? 'watching' : editingWatch.status,
      });
    }

    updateWatch(editingWatch.id, changes);
    editNavigationAllowed = true;
    if (isModalEditMode) {
      finishModalTransition('watch-editor-saved');
      return;
    }
    window.location.href = `watch-detail.html?id=${encodeURIComponent(editingWatch.id)}&watchUpdated=${encodeURIComponent(editingWatch.id)}`;
  };

  const getCreateOptions = () => {
    const keywordValues = getKeywordValues();
    return {
      category: categoryInputEl?.value || undefined,
      categorySource,
      storyFingerprint: keywordsManuallyEdited
        ? keywordValues.storyFingerprint
        : pendingAnalysis?.storyFingerprint,
      monitoringConceptsManuallyEdited: keywordsManuallyEdited,
      feedUrl: normalizeFeedUrl(feedUrlInputEl?.value || ''),
      ...keywordValues,
    };
  };

  const savePlainTextWatch = async (
    request,
    whyFollowing,
    {
      preserveOriginalWording = false,
      useRequestAsTitle = false,
      createdAsWrittenAfterClarityWarning,
    } = {},
  ) => {
    const selectedRequest = preserveOriginalWording ? request : request.trim();
    if (!selectedRequest.trim() || creationInProgress) return;

    creationInProgress = true;
    if (input) input.value = selectedRequest;
    synchronizeInferredFields(selectedRequest);
    setCreationControlsDisabled(true);
    if (isEditMode) {
      await completeWatchUpdate(selectedRequest, whyFollowing, null, {
        createdAsWrittenAfterClarityWarning,
        useRequestAsTitle,
      });
      return;
    }
    const createOptions = getCreateOptions();
    if (!createOptions.feedUrl) {
      try {
        createOptions.monitoringSource = await requestMonitoringSource(selectedRequest, {
          language: getLanguage(),
        });
      } catch {
        creationInProgress = false;
        setCreationControlsDisabled(false);
        setSubmitLabel();
        if (watchError) watchError.textContent = t('newWatch.monitoringSourceUnsupported');
        input?.focus();
        return;
      }
    }
    const monitoringSummary = await generateMonitoringSummary(selectedRequest);
    const watch = createWatchObject(
      selectedRequest,
      whyFollowing,
      null,
      { ...createOptions, monitoringSummary },
    );
    if (useRequestAsTitle) watch.title = selectedRequest;
    if (createdAsWrittenAfterClarityWarning === true) {
      watch.createdAsWrittenAfterClarityWarning = true;
    }
    try {
      await completeWatchCreation(watch);
    } catch (error) {
      creationInProgress = false;
      setCreationControlsDisabled(false);
      setSubmitLabel();
      if (watchError) {
        const code = error instanceof MonitoringCheckError ? error.code : 'CHECK_FAILED';
        watchError.textContent = t(getMonitoringFailureMessageKey(code));
      }
      input?.focus();
    }
  };

  const renderClarificationActions = () => {
    if (!clarificationActions) return;
    clarificationActions.replaceChildren();

    const actions = getClarificationActions({
      type: pendingClarificationType,
      hasSuggestion: pendingClarificationHasSuggestion,
      suggestedRequest: pendingClarificationSuggestion,
    });
    const actionConfig = {
      [CLARIFICATION_ACTIONS.KEEP_ORIGINAL]: {
        label: 'newWatch.clarificationKeep',
        modifier: 'secondary',
      },
      [CLARIFICATION_ACTIONS.USE_SUGGESTION]: {
        label: 'newWatch.clarificationUse',
        modifier: 'primary',
      },
      [CLARIFICATION_ACTIONS.EDIT_REQUEST]: {
        label: 'newWatch.clarificationEditRequest',
        modifier: pendingClarificationType === CLARIFICATION_TYPES.CLARIFICATION_REQUIRED
          ? 'primary'
          : 'secondary',
      },
      [CLARIFICATION_ACTIONS.CREATE_AS_WRITTEN]: {
        label: pendingNonArticleAnalysis
          ? 'newWatch.nonArticleClarificationCreate'
          : 'newWatch.clarificationCreateAsWritten',
        modifier: 'secondary',
      },
    };

    actions.forEach((action) => {
      const config = actionConfig[action];
      const button = document.createElement('button');
      button.className = `button button--${config.modifier}`;
      button.type = 'button';
      button.dataset.clarificationAction = action;
      button.textContent = t(config.label);
      clarificationActions.append(button);
    });
  };

  const showClarification = (
    original,
    result,
    whyFollowing,
    { nonArticleAnalysis = null } = {},
  ) => {
    const hasSuggestion = result.type === CLARIFICATION_TYPES.SUGGESTION
      && result.hasSuggestion === true
      && Boolean(result.suggestedRequest?.trim());
    const canCreateAsWritten = getClarificationActions({
      type: result.type,
      hasSuggestion,
      suggestedRequest: hasSuggestion ? result.suggestedRequest : '',
    }).includes(CLARIFICATION_ACTIONS.CREATE_AS_WRITTEN);
    pendingClarificationWhyFollowing = whyFollowing;
    pendingClarificationOriginal = original;
    pendingClarificationSuggestion = hasSuggestion ? result.suggestedRequest : '';
    pendingClarificationType = result.type;
    pendingClarificationHasSuggestion = hasSuggestion;
    pendingNonArticleAnalysis = nonArticleAnalysis;
    pendingAnalysis = nonArticleAnalysis;
    if (nonArticleAnalysis) {
      if (analysisSection) analysisSection.hidden = true;
      if (processingState) processingState.hidden = true;
    }
    if (clarificationOriginal) clarificationOriginal.textContent = original;
    if (clarificationSuggestion) {
      clarificationSuggestion.textContent = pendingClarificationSuggestion;
    }
    if (clarificationMessage) {
      clarificationMessage.textContent = result.clarificationMessage || '';
      clarificationMessage.hidden = hasSuggestion;
    }
    if (clarificationWarning) {
      clarificationWarning.hidden = result.type !== CLARIFICATION_TYPES.CLARIFICATION_REQUIRED
        || hasSuggestion
        || !canCreateAsWritten;
    }
    if (clarificationSuggestionField) clarificationSuggestionField.hidden = !hasSuggestion;
    renderClarificationActions();
    clarificationInProgress = false;
    setCreationControlsDisabled(false);
    setSubmitLabel();
    clarification?.classList.toggle('request-clarification--suggestion', hasSuggestion);
    clarification?.classList.toggle('request-clarification--needs-input', !hasSuggestion);
    form.classList.add('is-clarifying');
    refreshEditSaveState();
    if (clarification) {
      clarification.hidden = false;
      clarification.focus();
    }
  };

  const setReviewEditing = (editing) => {
    const isCompanyReview = pendingAnalysis?.inputType === 'company';
    const isNonStoryPage = pendingAnalysis?.isStory === false;
    const effectiveEditing = isCompanyReview || isNonStoryPage ? false : editing;
    review?.classList.toggle('is-editing', effectiveEditing);
    if (reviewTitle) {
      reviewTitle.readOnly = !effectiveEditing;
    }
    if (reviewSummary) {
      reviewSummary.readOnly = !effectiveEditing;
    }
    if (reviewEdit) {
      reviewEdit.textContent = t(
        isCompanyReview
          ? 'newWatch.companyReviewEdit'
          : effectiveEditing ? 'newWatch.urlReviewDone' : 'newWatch.urlReviewEdit',
      );
    }
    if (watchOptionsEl) watchOptionsEl.hidden = isNonStoryPage;
    resizeReviewSummary({ immediate: true });
    if (effectiveEditing) {
      reviewTitle?.focus();
    }
  };

  const setReviewTranslation = (element, key) => {
    if (!element) return;
    element.dataset.i18n = key;
    element.textContent = t(key);
  };

  const renderCompanyReviewStatus = (analysis) => {
    const isCompanyReview = analysis?.inputType === 'company';
    const administrativePresentation = getAdministrativeStatusPresentation(
      analysis?.company?.administrativeStatus,
      t,
    );
    const showAdministrativeStatus = isCompanyReview && administrativePresentation.known;
    if (companyReviewAdministrativeStatus) {
      companyReviewAdministrativeStatus.hidden = !showAdministrativeStatus;
    }
    if (companyReviewAdministrativeStatusBadge) {
      companyReviewAdministrativeStatusBadge.textContent = showAdministrativeStatus
        ? administrativePresentation.label
        : '';
      companyReviewAdministrativeStatusBadge.className = showAdministrativeStatus
        ? `status-label status-label--${administrativePresentation.tone}`
        : 'status-label';
    }
    if (companyReviewAdministrativeStatusDescription) {
      companyReviewAdministrativeStatusDescription.textContent = showAdministrativeStatus
        ? administrativePresentation.description
        : '';
    }
    if (!isCompanyReview) {
      if (companyReviewStatus) companyReviewStatus.hidden = true;
      if (companyReviewWarning) companyReviewWarning.hidden = true;
      return;
    }
    const presentation = getCompanyStatusPresentation(analysis.company?.status, t);
    const hasMeaningfulMonitoringStatus = presentation.status !== 'unknown';
    if (companyReviewStatus) {
      companyReviewStatus.hidden = !hasMeaningfulMonitoringStatus;
    }
    const terminal = isTerminalCompanyStatus(presentation.status);
    if (companyReviewStatusBadge) {
      companyReviewStatusBadge.textContent = hasMeaningfulMonitoringStatus
        ? presentation.label
        : '';
      companyReviewStatusBadge.className = hasMeaningfulMonitoringStatus
        ? `status-label status-label--${presentation.tone}`
        : 'status-label';
    }
    if (companyReviewStatusDescription) {
      companyReviewStatusDescription.textContent = hasMeaningfulMonitoringStatus
        ? presentation.description
        : '';
    }
    if (companyReviewStatusFollowUp) {
      companyReviewStatusFollowUp.textContent = terminal ? '' : presentation.followUp;
      companyReviewStatusFollowUp.hidden = terminal || !presentation.followUp;
    }
    if (companyReviewWarning) companyReviewWarning.hidden = !terminal;
    if (companyReviewWarningTitle) {
      companyReviewWarningTitle.textContent = terminal ? presentation.warningTitle : '';
    }
    if (companyReviewWarningCopy) {
      companyReviewWarningCopy.textContent = terminal ? presentation.followUp : '';
    }
  };

  const renderReviewPresentation = (analysis) => {
    const isCompanyReview = analysis?.inputType === 'company';
    const isNonStoryPage = analysis?.isStory === false;
    const failed = analysis?.status !== 'success';
    setReviewTranslation(
      reviewHeading,
      isCompanyReview
        ? 'newWatch.companyReviewFound'
        : isNonStoryPage ? 'newWatch.webpageReviewFound' : 'newWatch.urlReviewFound',
    );
    setReviewTranslation(
      reviewTitleLabel,
      isCompanyReview ? 'newWatch.companyReviewTitle' : 'newWatch.urlReviewTitle',
    );
    setReviewTranslation(
      reviewSummaryLabel,
      isCompanyReview
        ? 'newWatch.companyReviewWatchingForRequired'
        : isNonStoryPage
          ? 'newWatch.webpageReviewClassification'
          : 'newWatch.urlReviewOverviewRequired',
    );
    setReviewTranslation(
      reviewSourceLabel,
      isCompanyReview ? 'newWatch.companyReviewSource' : 'newWatch.urlReviewSource',
    );
    renderCompanyReviewStatus(analysis);
    if (reviewMonitoringScopeField) {
      reviewMonitoringScopeField.hidden = failed || isCompanyReview || isNonStoryPage;
    }
    if (reviewMonitoringScope) {
      reviewMonitoringScope.textContent = failed || isCompanyReview || isNonStoryPage
        ? ''
        : analysis?.monitoringScope || '';
    }
    if (!isCompanyReview) return;
    const siren = analysis.company.siren;
    if (reviewTitle) reviewTitle.value = getWatchDisplayTitle(analysis);
    if (reviewSummary) reviewSummary.value = getCompanyReviewSummary(siren, t);
    if (reviewSource) reviewSource.textContent = 'BODACC';
  };

  const validateReviewSummary = ({ focus = false } = {}) => {
    const valid = Boolean(reviewSummary?.value.trim());
    if (reviewSummary) {
      reviewSummary.setAttribute('aria-invalid', String(!valid));
    }
    if (reviewSummaryError) {
      reviewSummaryError.hidden = valid;
    }
    if (reviewCreate) {
      reviewCreate.disabled = creationInProgress || !valid;
    }
    if (!valid && focus) reviewSummary?.focus();
    return valid;
  };

  const showReview = (analysis) => {
    const failed = analysis?.status !== 'success';
    if (!reviewEnhancementInProgress) {
      trackProductEvent(
        failed ? PRODUCT_EVENTS.URL_ANALYSIS_FAILED : PRODUCT_EVENTS.URL_ANALYSIS_SUCCEEDED,
      );
      trackProductEvent(PRODUCT_EVENTS.WATCH_REVIEW_DISPLAYED, {
        analysis_result: failed ? 'failure' : 'success',
      });
    }
    pendingAnalysis = analysis;
    if (analysis?.isStory === false && hint) {
      hint.textContent = '';
      hint.hidden = true;
    }
    renderReviewPresentation(analysis);
    form.classList.add('is-reviewing');
    if (analysisSection) {
      analysisSection.hidden = false;
    }
    if (processingState) {
      processingState.hidden = true;
    }
    if (review) {
      review.hidden = false;
    }
    if (reviewSuccess) {
      reviewSuccess.hidden = failed;
    }
    if (reviewFailure) {
      reviewFailure.hidden = !failed;
    }
    if (reviewTitle) {
      reviewTitle.disabled = false;
      reviewTitle.value = analysis?.title || '';
    }
    if (reviewSummary) {
      reviewSummary.disabled = false;
      reviewSummary.value = analysis?.summary || '';
      if (analysis?.inputType === 'company') {
        reviewSummary.value = getCompanyReviewSummary(analysis.company.siren, t);
      }
    }
    if (reviewSource) {
      reviewSource.textContent = analysis?.source || t('newWatch.urlReviewUnknownSource');
      if (analysis?.inputType === 'company') reviewSource.textContent = 'BODACC';
    }
    if (!failed && Array.isArray(analysis?.keywords)) {
      keywordItems = (analysis.storyFingerprint || analysis.keywords.map((label) => ({
        label,
        type: 'manual',
      }))).map((concept) => ({
        label: concept.label,
        type: concept.type || 'manual',
        selected: true,
      }));
      keywordSourceRequest = pendingRequest;
      keywordsManuallyEdited = false;
      renderKeywords();
      if (categorySource === 'inferred' && categoryInputEl) {
        categoryInputEl.value = inferWatchCategory([
          analysis.title,
          analysis.sourceTitle,
          ...analysis.keywords,
        ].filter(Boolean).join(' '));
      }
    }
    if (reviewEdit) {
      reviewEdit.hidden = failed || analysis?.isStory === false;
    }
    if (reviewCancel) reviewCancel.hidden = false;
    setReviewEditing(failed);
    validateReviewSummary();
    if (!failed && !reviewEnhancementInProgress) review?.focus();
  };

  const startCompanyReview = async (request, whyFollowing, siren, companyName = null) => {
    const monitoringSource = createBodaccMonitoringSource(siren);
    if (!monitoringSource) return false;
    const requestId = urlAnalysisRequestId + 1;
    urlAnalysisRequestId = requestId;
    analysisInProgress = true;
    pendingRequest = request;
    pendingWhyFollowing = whyFollowing;
    pendingAnalysis = null;
    form.classList.add('is-analysing');
    setCreationControlsDisabled(true);
    setSubmitLabel('newWatch.companyStatusChecking');
    if (analysisSection) analysisSection.hidden = false;
    if (processingState) processingState.hidden = false;
    if (processingMessage) processingMessage.textContent = t('newWatch.companyStatusChecking');
    if (review) review.hidden = true;

    try {
      const baseline = await requestCompanyCheck(monitoringSource.siren);
      if (requestId !== urlAnalysisRequestId) return true;
      const company = {
        siren: monitoringSource.siren,
        name: baseline.company?.officialName || companyName,
        administrativeStatus: normalizeAdministrativeStatus(
          baseline.company?.administrativeStatus,
        ),
        status: deriveCompanyStatus(baseline.items),
      };
      const title = getCompanyWatchTitle({ inputType: 'company', company }, {
        formatFallback: (value) => t('newWatch.companyReviewTitleValue', { siren: value }),
      });
      showReview({
        status: 'success',
        inputType: 'company',
        company,
        monitoringSource,
        baseline,
        title,
        summary: t('newWatch.companyReviewSummary', { siren: monitoringSource.siren }),
        source: 'BODACC',
        keywords: [],
        storyFingerprint: [],
      });
    } catch (error) {
      if (requestId !== urlAnalysisRequestId) return true;
      resetUrlFlow({ clearInput: false });
      if (watchError) {
        const code = error instanceof MonitoringCheckError ? error.code : 'CHECK_FAILED';
        watchError.textContent = t(getMonitoringFailureMessageKey(code));
      }
    } finally {
      if (requestId === urlAnalysisRequestId) {
        analysisInProgress = false;
        form.classList.remove('is-analysing');
        setCreationControlsDisabled(false);
        setSubmitLabel();
      }
    }
    return true;
  };

  const startUrlAnalysis = async (request, whyFollowing) => {
    urlAnalysisController?.abort();
    const requestId = urlAnalysisRequestId + 1;
    const controller = new AbortController();
    urlAnalysisRequestId = requestId;
    urlAnalysisController = controller;
    analysisInProgress = true;
    pendingRequest = request;
    pendingWhyFollowing = whyFollowing;
    pendingAnalysis = null;
    trackProductEvent(PRODUCT_EVENTS.URL_ANALYSIS_STARTED);
    form.classList.add('is-analysing');
    setCreationControlsDisabled(true);
    if (watchClear) watchClear.disabled = false;
    setSubmitLabel('newWatch.urlProcessingButton');
    if (processingState) {
      processingState.hidden = false;
    }
    if (review) {
      review.hidden = true;
    }

    const showProgress = () => {
      urlAnalysisProgressKey = 'newWatch.urlProcessingButton';
      if (processingMessage) {
        processingMessage.textContent = t(urlAnalysisProgressKey);
      }
    };
    showProgress();

    let enhancement = null;
    try {
      // Yield once so the browser paints the disabled button and processing state.
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const analysis = await analyseUrl(request, {
        onProgress: showProgress,
        signal: controller.signal,
        progressive: true,
      });
      enhancement = analysis.enhancement || null;
      if (enhancement) {
        void enhancement.finally(() => {
          if (urlAnalysisController === controller) urlAnalysisController = null;
        });
      }
      if (requestId !== urlAnalysisRequestId || controller.signal.aborted) return;
      const resolvedAnalysis = await resolveUrlMonitoringSource(analysis, {
        language: getLanguage(),
        signal: controller.signal,
      });
      if (requestId !== urlAnalysisRequestId || controller.signal.aborted) return;
      if (requiresNonArticleClarification(resolvedAnalysis.pageType)) {
        showClarification(request, {
          type: CLARIFICATION_TYPES.CLARIFICATION_REQUIRED,
          needsClarification: true,
          hasSuggestion: false,
          suggestedRequest: '',
          clarificationMessage: t('newWatch.nonArticleClarificationMessage'),
        }, whyFollowing, { nonArticleAnalysis: resolvedAnalysis });
        return;
      }
      showReview(resolvedAnalysis);
      if (enhancement) {
        void enhancement.then((enhancedAnalysis) => {
          if (
            !enhancedAnalysis
            || requestId !== urlAnalysisRequestId
            || controller.signal.aborted
            || pendingAnalysis !== resolvedAnalysis
            || creationInProgress
            || review?.classList.contains('is-editing')
            || keywordsManuallyEdited
          ) {
            return;
          }
          reviewEnhancementInProgress = true;
          try {
            showReview({
              ...enhancedAnalysis,
              monitoringSource: resolvedAnalysis.monitoringSource,
            });
          } finally {
            reviewEnhancementInProgress = false;
          }
        });
      }
    } catch (error) {
      if (requestId !== urlAnalysisRequestId || controller.signal.aborted) return;
      if (error instanceof SourceDiscoveryError) {
        resetUrlFlow({ clearInput: false });
        if (watchError) watchError.textContent = t('newWatch.monitoringSourceUnsupported');
        input?.focus();
        return;
      }
      console.error('URL analysis failed:', error);
      showReview({
        status: 'failure',
        title: error.partialAnalysis?.sourceTitle || '',
        source: error.partialAnalysis?.source || t('newWatch.urlReviewUnknownSource'),
        sourceTitle: error.partialAnalysis?.sourceTitle || '',
        sourceUrl: error.partialAnalysis?.sourceUrl || request,
      });
    } finally {
      if (requestId !== urlAnalysisRequestId) return;
      analysisInProgress = false;
      urlAnalysisProgressKey = null;
      if (!enhancement && urlAnalysisController === controller) urlAnalysisController = null;
      form.classList.remove('is-analysing');
      setSubmitLabel();
    }
  };

  const resetUrlFlow = ({ clearInput = false, trackCancellation = false } = {}) => {
    const hadActiveCreation = analysisInProgress || pendingRequest || pendingAnalysis;
    if (trackCancellation && hadActiveCreation) {
      trackProductEvent(PRODUCT_EVENTS.WATCH_CREATION_CANCELLED, {
        stage: pendingAnalysis ? 'review' : 'analysis',
      });
    }
    urlAnalysisRequestId += 1;
    urlAnalysisController?.abort();
    urlAnalysisController = null;
    analysisInProgress = false;
    urlAnalysisProgressKey = null;
    pendingRequest = '';
    pendingWhyFollowing = '';
    pendingAnalysis = null;
    pendingNonArticleAnalysis = null;
    creationInProgress = false;
    form.classList.remove('is-analysing', 'is-reviewing');
    if (analysisSection) analysisSection.hidden = true;
    if (processingState) processingState.hidden = true;
    if (processingMessage) processingMessage.textContent = '';
    if (review) {
      review.hidden = true;
    }
    setReviewEditing(false);
    if (reviewSuccess) reviewSuccess.hidden = false;
    if (reviewFailure) reviewFailure.hidden = true;
    if (reviewTitle) {
      reviewTitle.value = '';
      reviewTitle.disabled = true;
    }
    if (reviewSummary) {
      reviewSummary.value = '';
      reviewSummary.disabled = true;
      reviewSummary.setAttribute('aria-invalid', 'false');
    }
    if (reviewSummaryError) reviewSummaryError.hidden = true;
    if (reviewMonitoringScopeField) reviewMonitoringScopeField.hidden = true;
    if (reviewMonitoringScope) reviewMonitoringScope.textContent = '';
    if (reviewSource) reviewSource.textContent = '';
    if (companyReviewAdministrativeStatus) companyReviewAdministrativeStatus.hidden = true;
    if (companyReviewStatus) companyReviewStatus.hidden = true;
    if (companyReviewWarning) companyReviewWarning.hidden = true;
    if (watchError) watchError.textContent = '';
    if (hint) {
      hint.textContent = '';
      hint.hidden = true;
    }
    [reviewCreate, reviewEdit, reviewCancel].forEach((control) => {
      if (control) control.disabled = false;
    });
    keywordItems = [];
    keywordSourceRequest = '';
    keywordsManuallyEdited = false;
    editingConceptIndex = null;
    categorySource = 'inferred';
    if (keywordInputEl) keywordInputEl.value = '';
    renderKeywords();
    if (categoryInputEl) categoryInputEl.value = 'general';
    if (clearInput && input) {
      input.value = '';
      if (noteInput) noteInput.value = '';
      if (noteRegion) {
        noteRegion.hidden = true;
        noteRegion.classList.remove('is-visible');
      }
      if (noteToggle) {
        noteToggle.hidden = false;
        noteToggle.setAttribute('aria-expanded', 'false');
      }
      if (watchOptionsEl && !isEditMode) watchOptionsEl.hidden = true;
      updateNoteCloseLabel();
      resizeNote();
    }
    setCreationControlsDisabled(false);
    setSubmitLabel();
    updateComposer();
    resizeInput();
    input?.focus();
  };

  const updateComposer = () => {
    const hasRequest = hasMeaningfulRequest();
    const hasInputValue = Boolean(input?.value);
    composer?.classList.toggle('has-value', hasInputValue);
    if (watchClear) watchClear.hidden = !hasInputValue;
    if (submitButton) {
      submitButton.disabled = !hasRequest;
    }
    if (hint && input) {
      const urlDetected = isUrl(input.value);
      hint.textContent = urlDetected ? t('newWatch.urlDetected') : '';
      hint.hidden = !urlDetected;
    }
    if (watchError && hasRequest) {
      watchError.textContent = '';
    }
  };

  const initializeFormMode = () => {
    if (isEditMode) {
      const originalRequest = localizeField(editingWatch, 'request') || '';
      const originalUrl = editingWatch.inputType === 'url' ? editingWatch.sourceUrl : '';
      const inputValue = originalUrl || originalRequest;
      const conceptSource = [
        originalRequest,
        localizeField(editingWatch, 'sourceTitle'),
        localizeField(editingWatch, 'title'),
      ].filter(Boolean).join(' ');
      const visibleConcepts = getVisibleConceptLabels(
        editingWatch,
        MONITORING_CONCEPTS_VERSION,
      );
      const existingKeywords = editingWatch.isStory === false
        ? []
        : visibleConcepts.length
          ? visibleConcepts
          : extractMonitoringConcepts(conceptSource);
      if (headingEl) {
        headingEl.dataset.i18n = 'newWatch.editHeading';
        headingEl.textContent = t('newWatch.editHeading');
      }
      if (backEl) {
        backEl.href = `watch-detail.html?id=${encodeURIComponent(editingWatch.id)}`;
        if (backLabelEl) {
          backLabelEl.dataset.i18n = 'newWatch.editBack';
          backLabelEl.textContent = t('newWatch.editBack');
        }
      }
      if (submitLabel) {
        submitLabel.dataset.i18n = 'newWatch.saveChanges';
      }
      if (reviewCreate) {
        reviewCreate.dataset.i18n = 'newWatch.urlReviewSave';
        reviewCreate.textContent = t('newWatch.urlReviewSave');
      }
      if (watchOptionsEl) {
        watchOptionsEl.hidden = editingWatch.isStory === false;
      }
      if (input) {
        input.value = inputValue;
      }
      if (noteInput) {
        noteInput.value = localizeField(editingWatch, 'whyFollowing') || '';
        if (noteInput.value && noteRegion && noteToggle) {
          noteRegion.hidden = false;
          noteRegion.classList.add('is-visible');
          noteToggle.hidden = true;
          noteToggle.setAttribute('aria-expanded', 'true');
        }
      }
      keywordItems = existingKeywords.map((label) => {
        const typedConcept = (editingWatch.storyProfile?.concepts || editingWatch.storyFingerprint || [])
          .find((concept) => normalizeComparableText(concept.label) === normalizeComparableText(label));
        return {
          label,
          type: typedConcept?.type || 'manual',
          selected: true,
        };
      });
      keywordSourceRequest = inputValue;
      if (categoryInputEl) {
        categoryInputEl.value = editingWatch.category || inferWatchCategory(inputValue);
      }
      if (feedUrlInputEl) feedUrlInputEl.value = editingWatch.feedUrl || '';
      if (advancedSettingsEl) advancedSettingsEl.hidden = false;
      const hasStoredCustomFeed = Boolean(normalizeFeedUrl(editingWatch.feedUrl || ''))
        && editingWatch.monitoringSource?.discovery === 'manual';
      setAdvancedSettingsExpanded(hasStoredCustomFeed);
      pendingAnalysis = editingWatch.inputType === 'url'
        ? {
          status: 'success',
          pageType: editingWatch.pageType || null,
          isStory: editingWatch.isStory !== false,
          title: editingWatch.sourceTitle || editingWatch.title,
          summary: editingWatch.storyProfile?.storySummary || editingWatch.monitoringSummary || '',
          monitoringScope: editingWatch.monitoringSummary || '',
          source: editingWatch.sourceName || '',
          sourceName: editingWatch.sourceName || '',
          sourceTitle: editingWatch.sourceTitle || '',
          sourceUrl: editingWatch.sourceUrl || inputValue,
          storyFingerprint: editingWatch.storyFingerprint || null,
          storyProfile: editingWatch.storyProfile || null,
          keywords: existingKeywords,
          conceptSourceFields: editingWatch.conceptSourceFields || null,
          contentAccessLimited: editingWatch.contentAccessLimited === true,
          sourcePublishedAt: editingWatch.sourcePublishedAt || null,
          monitoringSource: editingWatch.monitoringSource || null,
        }
        : null;
    } else {
      if (backEl && formParams.get('from') === 'watches') {
        backEl.href = 'watches.html';
        if (backLabelEl) {
          backLabelEl.dataset.i18n = 'newWatch.allWatchesBack';
          backLabelEl.textContent = t('newWatch.allWatchesBack');
        }
      }
      if (watchOptionsEl) {
        watchOptionsEl.hidden = true;
      }
      keywordSourceRequest = input?.value || '';
      keywordItems = extractMonitoringConcepts(keywordSourceRequest)
        .map((label) => ({ label, selected: true, type: 'manual' }));
      if (categoryInputEl) {
        categoryInputEl.value = inferWatchCategory(keywordSourceRequest);
      }
    }

    renderKeywords();
    updateNoteCloseLabel();
    setSubmitLabel();
  };

  const setConceptRegenerationLoading = (loading) => {
    conceptRegenerationInProgress = loading;
    keywordChipsEl?.setAttribute('aria-busy', String(loading));
    if (keywordHelperEl) {
      keywordHelperEl.textContent = t(
        loading ? 'newWatch.conceptsRegenerating' : 'newWatch.conceptsHelper',
      );
    }
    if (keywordInputEl) keywordInputEl.disabled = loading;
    if (keywordAddEl) keywordAddEl.disabled = loading;
    refreshEditSaveState();
  };

  const regenerateLegacyUrlConcepts = async () => {
    if (!isEditMode || editingWatch.inputType !== 'url') return;
    const forceRegeneration = import.meta.env.DEV
      && formParams.get('forceConceptRegeneration') === '1';
    if (!shouldRegenerateStoryFingerprint(
      editingWatch,
      MONITORING_CONCEPTS_VERSION,
      {
        force: forceRegeneration,
        legacyGeneratedKeywords: extractMonitoringConcepts(
          editingWatch.sourceTitle || editingWatch.title || '',
          8,
        ),
      },
    )) return;

    const sourceUrl = editingWatch.sourceUrl || editingWatch.request;
    if (!isUrl(sourceUrl)) return;
    if (import.meta.env.DEV) {
      console.info(
        `[Story Fingerprint] ${forceRegeneration ? 'Forced' : 'Legacy'} regeneration for Watch ${editingWatch.id}`,
      );
    }
    setConceptRegenerationLoading(true);
    try {
      const analysis = await analyseUrl(sourceUrl);
      const changes = createRegeneratedFingerprintChanges(
        analysis,
        MONITORING_CONCEPTS_VERSION,
      );
      const regeneratedKeywords = changes.keywords;
      if (!regeneratedKeywords?.length) throw new Error('No strong concepts were returned.');

      editingWatch = updateWatch(editingWatch.id, changes);
      keywordItems = regeneratedKeywords.map((label) => ({ label, selected: true }));
      keywordSourceRequest = sourceUrl;
      pendingAnalysis = { ...pendingAnalysis, ...analysis };
      renderKeywords();
      initialEditState = JSON.stringify(getEditState());
    } catch (error) {
      console.warn('[Story Fingerprint] Existing Watch regeneration failed.', error);
    } finally {
      setConceptRegenerationLoading(false);
    }
  };

  const getEditState = () => ({
    request: input?.value || '',
    sourceUrl: isUrl(input?.value || '') ? (input?.value || '') : '',
    note: noteInput?.value || '',
    category: categoryInputEl?.value || '',
    feedUrl: feedUrlInputEl?.value || '',
    keywords: keywordItems.map(({ label, selected }) => ({ label, selected })),
  });

  const hasUnsavedEditChanges = () => (
    isEditMode
    && initialEditState !== null
    && JSON.stringify(getEditState()) !== initialEditState
  );

  refreshEditSaveState = () => {
    const canSave = !creationInProgress
      && !analysisInProgress
      && !conceptRegenerationInProgress
      && !form.classList.contains('is-reviewing')
      && !form.classList.contains('is-clarifying')
      && hasMeaningfulRequest()
      && hasUnsavedEditChanges();
    if (isModalEditMode) {
      window.parent.postMessage({
        type: 'watch-editor-state',
        watchId: editingWatch.id,
        canSave,
      }, window.location.origin);
    }
  };

  const returnToWatchDetails = (destination = backEl?.href) => {
    editNavigationAllowed = true;
    if (isModalEditMode) {
      finishModalTransition('watch-editor-close');
      return;
    }
    window.location.href = destination
      || `watch-detail.html?id=${encodeURIComponent(editingWatch.id)}`;
  };

  const requestDiscardConfirmation = (destination = backEl?.href) => {
    pendingNavigationUrl = destination
      || `watch-detail.html?id=${encodeURIComponent(editingWatch.id)}`;
    if (discardDialog?.showModal) {
      if (!discardDialog.open) discardDialog.showModal();
      window.requestAnimationFrame(() => keepEditingButton?.focus());
      return;
    }

    if (window.confirm(`${t('newWatch.discardTitle')}\n\n${t('newWatch.discardCopy')}`)) {
      returnToWatchDetails(pendingNavigationUrl);
    }
  };

  const handleEditNavigation = (destination) => {
    if (!hasUnsavedEditChanges()) {
      returnToWatchDetails(destination);
      return;
    }
    requestDiscardConfirmation(destination);
  };

  input?.addEventListener('input', (event) => {
    if (
      !isEditMode
      && event.inputType !== 'insertFromPaste'
      && hasMeaningfulRequest()
    ) {
      trackProductEventOnce(PRODUCT_EVENTS.TEXT_ENTERED);
    }
    updateComposer();
    resizeInput();
    scheduleKeywordRegeneration();
  });
  input?.addEventListener('paste', (event) => {
    const pastedValue = event.clipboardData?.getData('text')?.trim() || '';
    if (!isEditMode && isUrl(pastedValue)) {
      trackProductEventOnce(PRODUCT_EVENTS.URL_PASTED);
    }
  });
  input?.addEventListener('keydown', (event) => {
    if (
      event.key === 'Enter'
      && (event.metaKey || event.ctrlKey)
      && hasMeaningfulRequest()
      && (!isModalEditMode || hasUnsavedEditChanges())
    ) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  watchClear?.addEventListener('click', () => {
    if (!input) return;
    resetUrlFlow({ clearInput: true });
  });

  keywordChipsEl?.addEventListener('click', (event) => {
    const rename = event.target.closest('[data-concept-rename]');
    const remove = event.target.closest('[data-keyword-remove]');
    if (rename) {
      beginConceptRename(Number(rename.dataset.conceptRename));
    }
    if (remove) {
      keywordsManuallyEdited = true;
      keywordItems.splice(Number(remove.dataset.keywordRemove), 1);
      renderKeywords();
    }
  });

  keywordChipsEl?.addEventListener('keydown', (event) => {
    const editor = event.target.closest('[data-concept-edit]');
    if (!editor || !['Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    finishConceptRename(
      Number(editor.dataset.conceptEdit),
      editor.value,
      { cancel: event.key === 'Escape' },
    );
  });

  keywordChipsEl?.addEventListener('focusout', (event) => {
    const editor = event.target.closest('[data-concept-edit]');
    if (!editor) return;
    finishConceptRename(Number(editor.dataset.conceptEdit), editor.value);
  });

  keywordAddEl?.addEventListener('click', addKeyword);
  keywordInputEl?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addKeyword();
    }
  });

  categoryInputEl?.addEventListener('change', () => {
    categorySource = 'manual';
  });
  advancedToggleEl?.addEventListener('click', () => {
    setAdvancedSettingsExpanded(advancedToggleEl.getAttribute('aria-expanded') !== 'true');
  });
  feedUrlInputEl?.addEventListener('input', () => {
    validateFeedUrl();
    refreshEditSaveState();
  });

  noteToggle?.addEventListener('click', () => {
    if (!noteRegion) return;

    noteRegion.hidden = false;
    noteToggle.hidden = true;
    noteToggle.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => {
      noteRegion.classList.add('is-visible');
      updateNoteCloseLabel();
      resizeNote({ immediate: true });
      noteInput?.focus();
      window.requestAnimationFrame(() => {
        noteInput?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });
  });

  noteInput?.addEventListener('input', () => {
    updateNoteCloseLabel();
    resizeNote();
  });

  noteClose?.addEventListener('click', () => {
    if (!noteRegion || !noteToggle) return;

    if (noteInput?.value) {
      noteInput.value = '';
      updateNoteCloseLabel();
      resizeNote();
      noteInput.focus();
      return;
    }

    noteRegion.classList.remove('is-visible');
    window.clearTimeout(noteCollapseTimer);
    noteCollapseTimer = window.setTimeout(() => {
      noteRegion.hidden = true;
      noteToggle.hidden = false;
      noteToggle.setAttribute('aria-expanded', 'false');
      noteToggle.focus();
      noteCollapseTimer = null;
    }, 200);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (isModalEditMode && !hasUnsavedEditChanges()) {
      return;
    }

    if (
      analysisInProgress
      || planningInProgress
      || clarificationInProgress
      || creationInProgress
      || form.classList.contains('is-reviewing')
      || form.classList.contains('is-clarifying')
    ) {
      return;
    }

    const originalRequest = input?.value || '';
    const request = originalRequest.trim();
    const whyFollowing = form.whyFollowing?.value || '';

    if (!hasMeaningfulRequest()) {
      if (watchError) {
        watchError.textContent = t(request ? 'newWatch.meaningfulError' : 'newWatch.emptyError');
      }
      input?.focus();
      return;
    }

    if (watchError) {
      watchError.textContent = '';
    }

    synchronizeInferredFields(request);

    let watchPlan = null;
    planningInProgress = true;
    try {
      watchPlan = await requestWatchPlan(request);
    } catch {
      // Unmigrated routes remain available; migrated route validators fail closed below.
    } finally {
      planningInProgress = false;
    }

    const companyPlanRoute = getCompanyPlanRoute(request, watchPlan);
    if (companyPlanRoute === COMPANY_PLAN_ROUTES.REVIEW) {
      const companyEditOutcome = getCompanyEditPlanOutcome(editingWatch, watchPlan);
      if (companyEditOutcome === COMPANY_EDIT_PLAN_OUTCOMES.DIFFERENT_COMPANY) {
        if (watchError) watchError.textContent = t('newWatch.companyEditDifferentSiren');
        input?.focus();
        return;
      }
      if (companyEditOutcome === COMPANY_EDIT_PLAN_OUTCOMES.SAME_COMPANY) {
        creationInProgress = true;
        setCreationControlsDisabled(true);
        await completeWatchUpdate(
          request,
          whyFollowing,
          createExistingCompanyEditAnalysis(editingWatch),
        );
        return;
      }
      await startCompanyReview(
        request,
        whyFollowing,
        watchPlan.identifier,
        extractCompanyNameFromRequest(request, watchPlan.identifier),
      );
      return;
    }

    if (companyPlanRoute === COMPANY_PLAN_ROUTES.GUIDANCE) {
      if (watchError) watchError.textContent = t('newWatch.companySirenGuidance');
      input?.focus();
      return;
    }

    const continueExistingUrlWatchFlow = async () => {
      const originalUrl = editingWatch?.sourceUrl || editingWatch?.request || '';
      if (
        isEditMode
        && normalizeComparableText(request) === normalizeComparableText(originalUrl)
      ) {
        creationInProgress = true;
        setCreationControlsDisabled(true);
        await completeWatchUpdate(request, whyFollowing, pendingAnalysis);
        return;
      }
      await startUrlAnalysis(request, whyFollowing);
    };

    const mediaStoryPlanRoute = getMediaStoryPlanRoute(request, watchPlan);
    if (mediaStoryPlanRoute === MEDIA_STORY_PLAN_ROUTES.REVIEW) {
      await continueExistingUrlWatchFlow();
      return;
    }
    if (mediaStoryPlanRoute === MEDIA_STORY_PLAN_ROUTES.GUIDANCE) {
      if (watchError) watchError.textContent = t('newWatch.mediaStoryPlanningUnavailable');
      input?.focus();
      return;
    }

    if (isUrl(request)) {
      await continueExistingUrlWatchFlow();
      return;
    }

    const storedRequest = isEditMode
      ? (localizeField(editingWatch, 'request') || '')
      : '';
    if (isEditMode && originalRequest === storedRequest) {
      creationInProgress = true;
      setCreationControlsDisabled(true);
      await completeWatchUpdate(originalRequest, whyFollowing);
      return;
    }

    clarificationInProgress = true;
    setCreationControlsDisabled(true);
    setSubmitLabel('newWatch.clarificationChecking');
    const result = await clarifyWatchRequest(request, { language: getLanguage() });
    if (result.needsClarification) {
      showClarification(originalRequest, result, whyFollowing);
      return;
    }

    clarificationInProgress = false;
    await savePlainTextWatch(isEditMode ? originalRequest : request, whyFollowing, {
      preserveOriginalWording: isEditMode,
      createdAsWrittenAfterClarityWarning: false,
    });
  });

  clarificationActions?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-clarification-action]');
    if (!button || !clarificationActions.contains(button)) return;
    const action = button.dataset.clarificationAction;

    if (action === CLARIFICATION_ACTIONS.KEEP_ORIGINAL) {
      if (
        pendingClarificationType !== CLARIFICATION_TYPES.SUGGESTION
        || !pendingClarificationHasSuggestion
      ) return;
      await savePlainTextWatch(
        pendingClarificationOriginal,
        pendingClarificationWhyFollowing,
        {
          preserveOriginalWording: true,
          createdAsWrittenAfterClarityWarning: false,
        },
      );
      return;
    }

    if (action === CLARIFICATION_ACTIONS.USE_SUGGESTION) {
      const displayedSuggestion = clarificationSuggestion?.textContent || '';
      if (
        pendingClarificationType !== CLARIFICATION_TYPES.SUGGESTION
        || !pendingClarificationHasSuggestion
        || !pendingClarificationSuggestion.trim()
        || clarificationSuggestionField?.hidden !== false
        || !displayedSuggestion.trim()
        || displayedSuggestion !== pendingClarificationSuggestion
      ) return;
      await savePlainTextWatch(
        displayedSuggestion,
        pendingClarificationWhyFollowing,
        {
          preserveOriginalWording: true,
          createdAsWrittenAfterClarityWarning: false,
        },
      );
      return;
    }

    if (action === CLARIFICATION_ACTIONS.CREATE_AS_WRITTEN) {
      if (
        pendingClarificationType !== CLARIFICATION_TYPES.CLARIFICATION_REQUIRED
        || pendingClarificationHasSuggestion
        || !pendingClarificationOriginal.trim()
      ) return;
      if (pendingNonArticleAnalysis) {
        const analysis = pendingNonArticleAnalysis;
        creationInProgress = true;
        setCreationControlsDisabled(true);
        const createOptions = getCreateOptions();
        createOptions.monitoringSource = analysis.monitoringSource;
        try {
          if (isEditMode) {
            await completeWatchUpdate(
              pendingClarificationOriginal,
              pendingClarificationWhyFollowing,
              analysis,
            );
          } else {
            await completeWatchCreation(createWatchObject(
              pendingClarificationOriginal,
              pendingClarificationWhyFollowing,
              analysis,
              createOptions,
            ));
          }
        } catch (error) {
          creationInProgress = false;
          setCreationControlsDisabled(false);
          if (watchError) {
            const code = error instanceof MonitoringCheckError ? error.code : 'CHECK_FAILED';
            watchError.textContent = t(getMonitoringFailureMessageKey(code));
          }
          input?.focus();
        }
        return;
      }
      await savePlainTextWatch(
        pendingClarificationOriginal,
        pendingClarificationWhyFollowing,
        {
          preserveOriginalWording: true,
          useRequestAsTitle: true,
          createdAsWrittenAfterClarityWarning: true,
        },
      );
      return;
    }

    if (action !== CLARIFICATION_ACTIONS.EDIT_REQUEST) return;
    pendingNonArticleAnalysis = null;
    pendingAnalysis = null;
    form.classList.remove('is-clarifying');
    if (clarification) clarification.hidden = true;
    if (input) {
      input.value = pendingClarificationOriginal;
      updateComposer();
      resizeInput({ immediate: true });
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    refreshEditSaveState();
  });

  const restoreCompanyRequestForEditing = () => {
    resetUrlFlow({ clearInput: false });
    updateComposer();
    resizeInput({ immediate: true });
    input?.focus();
  };

  reviewEdit?.addEventListener('click', () => {
    if (pendingAnalysis?.inputType === 'company') return restoreCompanyRequestForEditing();
    setReviewEditing(!review?.classList.contains('is-editing'));
  });

  reviewSummary?.addEventListener('input', () => {
    validateReviewSummary();
    resizeReviewSummary();
  });

  reviewCreate?.addEventListener('click', async () => {
    if (
      creationInProgress
      || pendingAnalysis?.status !== 'success'
      || !pendingRequest
    ) {
      return;
    }

    if (!validateReviewSummary({ focus: true }) || !reviewTitle?.reportValidity()) {
      return;
    }

    const analysis = {
      ...pendingAnalysis,
      status: 'success',
      title: reviewTitle.value.trim(),
      summary: pendingAnalysis.inputType === 'company'
        ? pendingAnalysis.summary
        : reviewSummary.value.trim(),
      storyProfile: pendingAnalysis.inputType === 'company'
        ? pendingAnalysis.storyProfile
        : pendingAnalysis.isStory === false
          ? null
          : {
            ...pendingAnalysis.storyProfile,
            storySummary: reviewSummary.value.trim(),
          },
      source: getSourceText(pendingAnalysis?.sourceName || pendingAnalysis?.source) || null,
      sourceUrl: pendingAnalysis?.sourceUrl || pendingRequest,
    };
    const createOptions = getCreateOptions();
    if (analysis.inputType === 'company') {
      createOptions.feedUrl = null;
      createOptions.monitoringSource = analysis.monitoringSource;
    }
    if (!isEditMode && !createOptions.feedUrl && !analysis.monitoringSource) {
      resetUrlFlow({ clearInput: false });
      if (watchError) watchError.textContent = t('newWatch.monitoringSourceUnsupported');
      input?.focus();
      return;
    }
    creationInProgress = true;
    [reviewCreate, reviewEdit, reviewCancel].forEach((control) => {
      if (control) control.disabled = true;
    });
    if (isEditMode) {
      await completeWatchUpdate(pendingRequest, pendingWhyFollowing, analysis);
    } else {
      try {
        await completeWatchCreation(createWatchObject(
          pendingRequest,
          pendingWhyFollowing,
          analysis,
          createOptions,
        ));
      } catch (error) {
        resetUrlFlow({ clearInput: false });
        if (watchError) {
          const code = error instanceof MonitoringCheckError ? error.code : 'CHECK_FAILED';
          watchError.textContent = t(getMonitoringFailureMessageKey(code));
        }
        input?.focus();
      }
    }
  });

  reviewCancel?.addEventListener('click', () => {
    resetUrlFlow({
      clearInput: pendingAnalysis?.status === 'success',
      trackCancellation: true,
    });
  });

  analysisCancel?.addEventListener('click', () => {
    resetUrlFlow({ clearInput: false, trackCancellation: true });
  });

  const showVoiceInputTooltip = (microphone) => {
    window.clearTimeout(voiceTooltipDismissTimer);
    window.clearTimeout(voiceTooltipHideTimer);

    if (activeVoiceTooltip && activeVoiceTooltip.parentElement !== microphone) {
      activeVoiceTooltip.hidden = true;
      activeVoiceTooltip.classList.remove('is-visible', 'is-leaving', 'is-below');
    }

    let tooltip = microphone.querySelector('.microphone-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('span');
      tooltip.className = 'microphone-tooltip';
      tooltip.setAttribute('role', 'status');
      tooltip.setAttribute('aria-live', 'polite');
      microphone.append(tooltip);
    }

    activeVoiceTooltip = tooltip;
    tooltip.textContent = t('newWatch.voiceUnavailable');
    tooltip.hidden = false;
    tooltip.classList.remove('is-visible', 'is-leaving', 'is-below');
    const availableSpaceAbove = microphone.getBoundingClientRect().top;
    tooltip.classList.toggle(
      'is-below',
      availableSpaceAbove < tooltip.offsetHeight + 12,
    );

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!tooltip.hidden) tooltip.classList.add('is-visible');
      });
    });

    voiceTooltipDismissTimer = window.setTimeout(() => {
      tooltip.classList.remove('is-visible');
      tooltip.classList.add('is-leaving');
      voiceTooltipHideTimer = window.setTimeout(() => {
        tooltip.hidden = true;
        tooltip.classList.remove('is-leaving', 'is-below');
        if (activeVoiceTooltip === tooltip) activeVoiceTooltip = null;
        voiceTooltipHideTimer = null;
      }, 180);
      voiceTooltipDismissTimer = null;
    }, 2500);
  };

  form.querySelectorAll('.watch-composer__microphone, .watch-reason__microphone')
    .forEach((microphone) => {
      microphone.addEventListener('click', () => {
        if (!isEditMode) trackProductEvent(PRODUCT_EVENTS.MICROPHONE_CLICKED);
        showVoiceInputTooltip(microphone);
      });
    });

  if (!isEditMode) {
    backEl?.addEventListener('click', () => {
      if (hasMeaningfulRequest()) {
        trackProductEventOnce(
          PRODUCT_EVENTS.WATCH_CREATION_CANCELLED,
          { stage: 'composer' },
          'composer-cancelled',
        );
      }
    });
  }

  if (isEditMode) {
    discardDialog?.addEventListener('cancel', () => {
      pendingNavigationUrl = '';
    });

    keepEditingButton?.addEventListener('click', () => {
      pendingNavigationUrl = '';
    });

    discardChangesButton?.addEventListener('click', (event) => {
      event.preventDefault();
      discardDialog?.close('discard');
      returnToWatchDetails(pendingNavigationUrl);
    });

    window.addEventListener('beforeunload', (event) => {
      if (editNavigationAllowed || !hasUnsavedEditChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    });

    window.addEventListener('message', (event) => {
      if (
        !isModalEditMode
        || event.origin !== window.location.origin
        || event.source !== window.parent
      ) return;
      if (event.data?.type === 'watch-editor-request-close') {
        handleEditNavigation(backEl?.href);
      }
      if (event.data?.type === 'watch-editor-request-save' && hasUnsavedEditChanges()) {
        form.requestSubmit();
      }
    });

    form.addEventListener('input', refreshEditSaveState);
    form.addEventListener('change', refreshEditSaveState);
    form.addEventListener('click', () => {
      window.requestAnimationFrame(refreshEditSaveState);
    });

    if (!isModalEditMode) {
      backEl?.addEventListener('click', (event) => {
        event.preventDefault();
        handleEditNavigation(backEl.href);
      });

      document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link || link === backEl || link.target === '_blank') return;
        event.preventDefault();
        handleEditNavigation(link.href);
      });

      window.history.pushState({ watchAssistantEditGuard: true }, '', window.location.href);
      window.addEventListener('popstate', () => {
        if (editNavigationAllowed) return;
        window.history.pushState({ watchAssistantEditGuard: true }, '', window.location.href);
        handleEditNavigation(backEl?.href);
      });
    }
  }

  document.addEventListener('i18n:languageChanged', () => {
    updateNoteCloseLabel();
    resizeInput({ immediate: true });
    resizeNote({ immediate: true });
    if (analysisInProgress) {
      setSubmitLabel('newWatch.urlProcessingButton');
      if (processingMessage && urlAnalysisProgressKey) {
        processingMessage.textContent = t(urlAnalysisProgressKey);
      }
    }
    if (review?.classList.contains('is-editing') && reviewEdit && !reviewEdit.hidden) {
      reviewEdit.textContent = t('newWatch.urlReviewDone');
    }
    if (pendingAnalysis?.inputType === 'company') {
      renderReviewPresentation(pendingAnalysis);
      setReviewEditing(false);
    }
    renderKeywords();
    if (!clarification?.hidden) renderClarificationActions();
    setSubmitLabel(
      analysisInProgress
        ? 'newWatch.urlProcessingButton'
        : clarificationInProgress ? 'newWatch.clarificationChecking' : undefined,
    );
  });

  initializeFormMode();
  updateComposer();
  resizeInput({ immediate: true });
  resizeNote({ immediate: true });
  document.fonts?.ready.then(() => {
    resizeInput({ immediate: true });
    resizeNote({ immediate: true });
  });
  if (isEditMode) {
    initialEditState = JSON.stringify(getEditState());
    refreshEditSaveState();
    void regenerateLegacyUrlConcepts();
  }
}

const resolveInitialHomeRoute = () => {
  if (!document.querySelector('.page--home')) return null;

  const homeUrl = new URL(window.location.href);
  if (homeUrl.searchParams.has('entry')) {
    homeUrl.searchParams.delete('entry');
    window.history.replaceState(
      window.history.state,
      '',
      `${homeUrl.pathname}${homeUrl.search}${homeUrl.hash}`,
    );
  }
  if (!hasCompletedOnboarding()) return getReplayIntroFlow();
  cancelOnboardingFirstWatch();
  return null;
};

export const initApp = () => {
  const initialRoute = resolveInitialHomeRoute();
  if (initialRoute) {
    window.location.replace(initialRoute);
    return;
  }

  if (document.querySelector('.page--home')) {
    trackProductEventOnce(PRODUCT_EVENTS.MORNING_REPORT_VIEWED);
  }

  renderHomeSummary();
  renderHomeBriefing();
  initHomeWatchControls();
  renderWatchList();
  renderWatchDetail();
  initForm();
  renderDevTools();

  // Exposed for prototype testing; normal page loads never update the timestamp.
  window.refreshBriefing = refreshBriefing;

  window.addEventListener('storage', () => {
    renderHomeSummary();
    renderHomeBriefing();
    renderWatchList();
    renderWatchDetail();
  });

  window.addEventListener(WATCH_STORAGE_CHANGED_EVENT, () => {
    renderHomeSummary();
    renderHomeBriefing();
    renderWatchList();
    renderWatchDetail();
  });

  // Re-render data-driven content if setLanguage() is called at runtime.
  document.addEventListener('i18n:languageChanged', () => {
    renderHomeSummary();
    renderHomeBriefing();
    renderWatchList();
    renderWatchDetail();
  });
};
