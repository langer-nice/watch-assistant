import {
  getWatches,
  getStoredWatches,
  addWatch,
  updateWatch,
  deleteWatch,
  getWatchById,
  getBriefingGeneratedAt,
  setBriefingGeneratedAt,
  resetStoredWatches,
} from './watch-storage.js';
import { getLanguage, t } from './i18n.js';
import { analyseUrl } from './url-analysis.js';

let homeCreatedWatchId = null;
let homeCreatedWatchFeedbackTimer = null;
let detailConfirmationAutoTimer = null;
let detailConfirmationHideTimer = null;
let detailCheckFeedbackTimer = null;
let detailCheckInProgress = false;
let firstMonitoringTimer = null;
let firstMonitoringTransitionTimer = null;
let editSheetCloseTimer = null;

const FIRST_MONITORING_DELAY = 3200;

const checkWatchForUpdates = async (watch) => {
  // Integration boundary for a monitoring service; the local prototype returns no change.
  const result = typeof window.watchAssistantCheckWatch === 'function'
    ? await window.watchAssistantCheckWatch(watch)
    : await new Promise((resolve) => {
      window.setTimeout(() => resolve({ changed: false, changes: {} }), 1200);
    });

  return {
    changed: Boolean(result?.changed),
    changes: {
      ...(result?.changes || {}),
      lastChecked: new Date().toISOString(),
      lastCheckedKey: null,
    },
  };
};

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

const closeWatchEditSheet = ({ updated = false } = {}) => {
  const sheet = document.querySelector('#watchEditSheet');
  const frame = document.querySelector('#watchEditFrame');
  if (!sheet?.open || sheet.classList.contains('is-closing')) return;

  sheet.classList.add('is-closing');
  window.clearTimeout(editSheetCloseTimer);
  editSheetCloseTimer = window.setTimeout(() => {
    sheet.close();
    sheet.classList.remove('is-closing', 'is-ready');
    if (frame) frame.removeAttribute('src');
    if (updated) {
      renderWatchDetail();
      showWatchUpdatedConfirmation();
    }
    editSheetCloseTimer = null;
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
};

const initializeWatchEditSheet = () => {
  const sheet = document.querySelector('#watchEditSheet');
  const frame = document.querySelector('#watchEditFrame');
  if (!sheet || !frame || sheet.dataset.initialized === 'true') return;
  sheet.dataset.initialized = 'true';

  sheet.addEventListener('cancel', (event) => {
    event.preventDefault();
    frame.contentWindow?.postMessage({ type: 'watch-editor-request-close' }, window.location.origin);
  });

  frame.addEventListener('load', () => {
    if (frame.hasAttribute('src')) sheet.classList.add('is-ready');
  });

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
  });
};

const openWatchEditSheet = (watchId) => {
  const sheet = document.querySelector('#watchEditSheet');
  const frame = document.querySelector('#watchEditFrame');
  if (!sheet || !frame) return;
  if (sheet.open) return;

  initializeWatchEditSheet();
  frame.src = `new-watch.html?edit=${encodeURIComponent(watchId)}&presentation=modal`;
  sheet.classList.remove('is-closing', 'is-ready');
  sheet.showModal();
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
  const fallback = t(inferMonitoringSummaryKey(requestText, watch.category));
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

const inferCategory = (request) => {
  const text = request.toLowerCase();

  if (/(apartment|appartement|property|immobilier|listing|annonce immobilière)/.test(text)) {
    return 'property';
  }

  if (/(price|prix|deal|discount|remise|sale|promo|cheapest|moins cher|amazon|€|\$)/.test(text)) {
    return 'price';
  }

  if (/(netflix|series|série|season|saison|film|trailer|bande-annonce)/.test(text)) {
    return 'entertainment';
  }

  if (/(flight|vol|easyjet|travel|voyage|hotel|hôtel|holiday|vacances|ticket|billet|booking|réservation)/.test(text)) {
    return 'travel';
  }

  if (/(news|actualité|story|sujet|article|investigation|enquête|bbc|cnn|report|rapport)/.test(text)) {
    return 'news';
  }

  if (/(event|événement|registration|inscription|deadline|échéance|ticket sales|billetterie|concert)/.test(text)) {
    return 'events';
  }

  return 'general';
};

const KEYWORD_STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'avec', 'dans', 'elle', 'from', 'have', 'je',
  'know', 'let', 'like', 'mais', 'me', 'notify', 'pour', 'quand', 'that', 'the',
  'this', 'une', 'watch', 'when', 'will', 'with', 'your', 'vous', 'www', 'https',
]);

const extractKeywords = (value, limit = 6) => {
  const words = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu) || [];
  const uniqueWords = [];
  words.forEach((word) => {
    if (!KEYWORD_STOP_WORDS.has(word) && !uniqueWords.includes(word)) {
      uniqueWords.push(word);
    }
  });
  return uniqueWords.slice(0, limit);
};

const hasSignificantRequestChange = (previousValue, nextValue) => {
  const previous = normalizeComparableText(previousValue);
  const next = normalizeComparableText(nextValue);
  if (previous === next) {
    return false;
  }
  if (!previous || !next) {
    return true;
  }

  const previousWords = new Set(previous.split(' '));
  const nextWords = new Set(next.split(' '));
  const sharedWords = [...previousWords].filter((word) => nextWords.has(word)).length;
  const totalWords = new Set([...previousWords, ...nextWords]).size;
  const similarity = totalWords ? sharedWords / totalWords : 0;
  const lengthDifference = Math.abs(previous.length - next.length) / previous.length;
  return similarity < 0.6 || lengthDifference > 0.25;
};

const hasReleaseIntent = (request) => (
  /(release date|released|comes out|coming out|publication date|date de sortie|date de parution|sortie|parution|publi[ée])/
    .test(request.toLowerCase())
);

const inferMonitoringSummaryKey = (request, category) => {
  if (hasReleaseIntent(request)) {
    return 'watchData.monitoringSummaries.release';
  }

  const keysByCategory = {
    price: 'watchData.monitoringSummaries.price',
    travel: 'watchData.monitoringSummaries.travel',
    news: 'watchData.monitoringSummaries.news',
    events: 'watchData.monitoringSummaries.event',
  };

  return keysByCategory[category] || 'watchData.monitoringSummaries.general';
};

const inferCurrentSituationKey = (request, category) => {
  const text = request.toLowerCase();

  if (hasReleaseIntent(text)) {
    return 'watchData.pendingSituations.release';
  }

  const keysByCategory = {
    price: 'watchData.pendingSituations.price',
    travel: 'watchData.pendingSituations.travel',
    news: 'watchData.pendingSituations.news',
    events: 'watchData.pendingSituations.event',
  };

  return keysByCategory[category] || 'watchData.pendingSituations.general';
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

  const text = value.split(/[\n\.]+/)[0].trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

const createWatchObject = (request, whyFollowing = '', urlAnalysis = null, options = {}) => {
  const now = new Date().toISOString();
  const isUrlRequest = Boolean(urlAnalysis);
  const sourceName = getSourceText(urlAnalysis?.sourceName || urlAnalysis?.source);
  const sourceTitle = getSourceText(urlAnalysis?.sourceTitle || urlAnalysis?.title);
  const sourceUrl = typeof urlAnalysis?.sourceUrl === 'string'
    ? urlAnalysis.sourceUrl.trim()
    : '';
  const inferredCategory = inferCategory([
    request,
    urlAnalysis?.title,
    urlAnalysis?.source,
  ].filter(Boolean).join(' '));
  const category = options.category || inferredCategory;
  const keywords = Array.isArray(options.keywords)
    ? options.keywords
    : extractKeywords([request, urlAnalysis?.title].filter(Boolean).join(' '));
  const selectedKeywords = Array.isArray(options.selectedKeywords)
    ? options.selectedKeywords
    : keywords;
  return {
    id: crypto.randomUUID(),
    title: urlAnalysis?.title || createTitle(request),
    request,
    inputType: isUrlRequest ? 'url' : 'text',
    sourceName: sourceName || null,
    sourceTitle: sourceTitle || null,
    sourceUrl: sourceUrl || null,
    whyFollowing: whyFollowing.trim(),
    category,
    categorySource: options.categorySource || 'inferred',
    keywords,
    selectedKeywords,
    status: 'watching',
    monitoringState: 'preparing',
    firstCheckCompletesAt: new Date(Date.now() + FIRST_MONITORING_DELAY).toISOString(),
    createdAt: now,
    lastChecked: null,
    requiresAttention: false,
    monitoringSummary: urlAnalysis?.summary || null,
    monitoringSummaryKey: isUrlRequest
      ? null
      : inferMonitoringSummaryKey(request, category),
    currentSituationKey: inferCurrentSituationKey(request, category),
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

const renderHomeBriefing = () => {
  const list = document.querySelector('#homeBriefingList');
  if (!list) {
    return;
  }

  const briefingWatches = getWatches().filter((watch) => (
    watch.status !== 'completed' && hasMeaningfulText(getLatestChange(watch))
  ));

  list.innerHTML = briefingWatches
    .map((watch) => {
      const title = localizeField(watch, 'title');
      const latestChange = getLatestChange(watch);
      if (!hasMeaningfulText(title) || !hasMeaningfulText(latestChange)) {
        return '';
      }

      const needsAttention = watch.requiresAttention || watch.status === 'attention';
      const statusModifier = needsAttention ? 'action' : 'update';
      const status = t(needsAttention ? 'home.actNow' : 'home.updated');
      const category = watch.category ? t(`categories.${watch.category}`) : t('categories.general');
      const categoryModifier = watch.category || 'general';

      return `
        <article class="briefing-item">
          <a class="briefing-item__link" href="watch-detail.html?id=${encodeURIComponent(watch.id)}">
            <div class="briefing-item__labels">
              <span class="category-label category-label--${escapeHtml(categoryModifier)}">${escapeHtml(category)}</span>
              <span class="status-badge status-badge--${statusModifier}">${escapeHtml(status)}</span>
            </div>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(latestChange)}</p>
          </a>
        </article>
      `;
    })
    .join('');
};

const renderWatchList = () => {
  const list = document.querySelector('#watchList');
  if (!list) {
    return;
  }

  const watches = getWatches();

  if (watches.length === 0) {
    list.innerHTML = `<p>${escapeHtml(t('watches.empty'))}</p>`;
    return;
  }

  list.innerHTML = watches
    .map((watch) => {
      const storedTitle = localizeField(watch, 'title');
      const title = hasMeaningfulText(storedTitle) ? storedTitle.trim() : t('common.newWatch');
      const isPaused = watch.status === 'paused';
      const subtitle = isPaused
        ? t('watches.monitoringPaused')
        : getMonitoringSummary(watch, title);
      return `
      <a class="watch-row${isPaused ? ' watch-row--paused' : ''}" href="watch-detail.html?id=${encodeURIComponent(watch.id)}">
        <div>
          <p class="watch-row__category">${escapeHtml(t(`categories.${watch.category}`))}</p>
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="watch-row__summary">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <span class="watch-row__status${isPaused ? ' status-badge status-badge--paused' : ''}">${escapeHtml(t(`statuses.${watch.status}`))}</span>
      </a>
    `;
    })
    .join('');
};

const renderWatchDetail = () => {
  const titleEl = document.querySelector('#watchTitle');
  if (!titleEl) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const watchId = params.get('id');
  let watch = getWatchById(watchId);
  if (
    watch?.monitoringState === 'preparing'
    && Date.parse(watch.firstCheckCompletesAt) <= Date.now()
  ) {
    watch = updateWatch(watch.id, {
      monitoringState: 'monitoring',
      firstCheckCompletedAt: new Date().toISOString(),
      firstCheckCompletesAt: null,
      lastChecked: new Date().toISOString(),
      lastCheckedKey: null,
    });
  }
  const isPreparing = watch?.monitoringState === 'preparing';
  const detailPageEl = document.querySelector('.page--detail');
  detailPageEl?.classList.toggle('is-paused', watch?.status === 'paused');

  const categoryEl = document.querySelector('#watchCategory');
  const statusEl = document.querySelector('#watchStatus');
  const pausedStateEl = document.querySelector('#watchPausedState');
  const pausedResumeEl = document.querySelector('#watchPausedResume');
  const notFoundEl = document.querySelector('#watchNotFound');
  const briefingEl = document.querySelector('#watchBriefing');
  const factsEl = document.querySelector('#watchFacts');
  const primaryEl = document.querySelector('#watchPrimary');
  const currentSituationEl = document.querySelector('#watchCurrentSituation');
  const recommendationEl = document.querySelector('#watchRecommendation');
  const originalSourceEl = document.querySelector('#watchOriginalSource');
  const sourceNameEl = document.querySelector('#watchSourceName');
  const sourceTitleEl = document.querySelector('#watchSourceTitle');
  const sourceLinkEl = document.querySelector('#watchSourceLink');
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
  const preparingEl = document.querySelector('#watchPreparing');
  const managementEl = document.querySelector('#watchManagement');
  const checkNowEl = document.querySelector('#watchCheckNow');
  const checkNowLabelEl = document.querySelector('#watchCheckNowLabel');
  const checkSpinnerEl = document.querySelector('.watch-fact-check__spinner');
  const checkFeedbackEl = document.querySelector('#watchCheckFeedback');
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
      preparingEl,
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
    if (statusEl) {
      statusEl.hidden = true;
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

  const request = localizeField(watch, 'request');
  titleEl.textContent = localizeField(watch, 'title') || t('detail.title');
  if (editActionEl) {
    editActionEl.hidden = false;
    editActionEl.href = `new-watch.html?edit=${encodeURIComponent(watch.id)}`;
    editActionEl.onclick = (event) => {
      event.preventDefault();
      openWatchEditSheet(watch.id);
    };
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

  if (statusEl) {
    const status = watch.status && t(`statuses.${watch.status}`);
    const statusModifier = watch.status === 'attention'
      ? 'action'
      : watch.status === 'stable'
        ? 'success'
        : watch.status === 'paused' ? 'paused' : 'update';
    statusEl.textContent = status || '';
    statusEl.hidden = !status || watch.status === 'paused';
    statusEl.className = `status-badge status-badge--with-dot status-badge--${statusModifier}`;
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

  const storedCurrentSituation = localizeField(watch, 'currentSituation');
  const currentSituation = isDistinctMeaningfulText(storedCurrentSituation, request || '')
    ? storedCurrentSituation
    : t(inferCurrentSituationKey(request || '', watch.category));
  const hasCurrentSituation = setOptionalField(
    'currentSituation',
    currentSituationEl,
    currentSituation,
  );
  const hasRecommendation = setOptionalField(
    'recommendation',
    recommendationEl,
    localizeField(watch, 'recommendation'),
  );
  if (primaryEl) {
    primaryEl.hidden = !(hasCurrentSituation || hasRecommendation);
  }

  const storedSourceName = localizeField(watch, 'sourceName');
  const storedSourceTitle = localizeField(watch, 'sourceTitle');
  const sourceName = getSourceText(storedSourceName);
  const sourceTitle = getSourceText(storedSourceTitle);
  const storedSourceUrl = typeof watch.sourceUrl === 'string' ? watch.sourceUrl.trim() : '';
  const safeSourceUrl = getSafeExternalUrl(storedSourceUrl);
  const hasOriginalSource = watch.inputType === 'url'
    && Boolean(sourceName || sourceTitle || safeSourceUrl);
  const hasSourceLink = hasOriginalSource && Boolean(safeSourceUrl);
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
      sourceLinkEl.href = safeSourceUrl;
      sourceLinkEl.setAttribute('aria-label', t('detail.openOriginalArticle'));
    } else {
      sourceLinkEl.removeAttribute('href');
    }
    sourceLinkEl.hidden = !hasSourceLink;
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
    latestChangeAtEl.textContent = hasMeaningfulText(latestChangeAt) ? latestChangeAt : '';
  }
  const latestChangeContainer = document.querySelector('[data-detail-field="latestChange"]');
  if (latestChangeContainer) {
    latestChangeContainer.hidden = !hasLatestChange;
  }
  const lastChecked = formatLastChecked(watch);
  const hasLastChecked = setOptionalField('lastChecked', lastCheckedEl, lastChecked);

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

  const hasMetadata = sources.length > 0 || hasConfidence || hasLatestChange || hasLastChecked;
  if (metadataEl) {
    metadataEl.hidden = !hasMetadata;
  }
  if (factsEl) {
    factsEl.hidden = isPreparing || !hasMetadata;
  }
  if (briefingEl) {
    briefingEl.hidden = !(hasCurrentSituation || hasRecommendation || hasOriginalSource);
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

  const timeline = Array.isArray(watch.timeline)
    ? watch.timeline
      .map((item, index, items) => {
        const label = item?.type === 'created'
          ? t('watchData.created')
          : localizeListItem(item);
        if (!label) {
          return null;
        }
        const date = item?.dateKey
          ? t(item.dateKey)
          : item?.date ? formatDate(item.date) : '';
        return {
          date,
          label,
          isLatest: item?.state === 'latest' || index === items.length - 1,
        };
      })
      .filter(Boolean)
    : [];
  if (timelineEl) {
    timelineEl.innerHTML = timeline
      .map((item) => `
        <li class="timeline__item${item.isLatest ? ' timeline__item--latest' : ''}">
          <span class="timeline__marker" aria-hidden="true"></span>
          <div>
            ${item.date ? `<p class="timeline__date">${escapeHtml(item.date)}</p>` : ''}
            <p class="timeline__event">${escapeHtml(item.label)}</p>
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
    checkNowEl.onclick = async () => {
      if (detailCheckInProgress) {
        return;
      }

      detailCheckInProgress = true;
      window.clearTimeout(detailCheckFeedbackTimer);
      checkNowEl.disabled = true;
      if (checkNowLabelEl) checkNowLabelEl.textContent = t('detail.checking');
      if (checkSpinnerEl) checkSpinnerEl.hidden = false;
      if (checkFeedbackEl) checkFeedbackEl.hidden = true;

      const result = await checkWatchForUpdates(watch);
      updateWatch(watch.id, result.changes);
      detailCheckInProgress = false;
      renderWatchDetail();

      if (!result.changed) {
        const refreshedFeedbackEl = document.querySelector('#watchCheckFeedback');
        if (refreshedFeedbackEl) {
          refreshedFeedbackEl.textContent = t('detail.noChangesFound');
          refreshedFeedbackEl.hidden = false;
          detailCheckFeedbackTimer = window.setTimeout(() => {
            refreshedFeedbackEl.hidden = true;
          }, 3000);
        }
      }
    };
  }
  if (checkNowLabelEl) {
    checkNowLabelEl.textContent = t(detailCheckInProgress ? 'detail.checking' : 'detail.checkNow');
  }
  if (checkSpinnerEl) {
    checkSpinnerEl.hidden = !detailCheckInProgress;
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
        lastChecked: checkedAt,
        lastCheckedKey: null,
      });
      renderWatchDetail();

      const refreshedFactsEl = document.querySelector('#watchFacts');
      if (refreshedFactsEl && !refreshedFactsEl.hidden) {
        refreshedFactsEl.classList.add('is-revealing');
        window.setTimeout(() => refreshedFactsEl.classList.remove('is-revealing'), 420);
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
  const briefingDate = document.querySelector('#homeBriefingDate');
  const greeting = document.querySelector('#homeSummaryLabel');
  const checkedSummary = document.querySelector('#homeCheckedSummary');
  const attentionCount = document.querySelector('#homeAttentionCount');
  const attentionLabel = document.querySelector('#homeAttentionLabel');
  const updatedCount = document.querySelector('#homeUpdatedCount');
  const updatedLabel = document.querySelector('#homeUpdatedLabel');
  const noChangesCount = document.querySelector('#homeNoChangesCount');
  const unchangedLabel = document.querySelector('#homeUnchangedLabel');
  const everythingChecked = document.querySelector('#homeEverythingChecked');

  if (!confirmationBanner && !briefingDate) {
    return;
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

  const storedWatches = getStoredWatches();
  const activeStoredWatches = storedWatches.filter((watch) => watch.status !== 'completed');
  const activeWatches = getWatches().filter((watch) => watch.status !== 'completed');
  const attentionWatches = activeWatches.filter((watch) => (
    watch.requiresAttention || watch.status === 'attention'
  ));
  const updatedWatches = activeWatches.filter((watch) => (
    !watch.requiresAttention
    && watch.status !== 'attention'
    && hasMeaningfulText(getLatestChange(watch))
  ));
  const quietStoredWatches = activeStoredWatches.filter((watch) => (
    !watch.requiresAttention
    && !hasMeaningfulText(getLatestChange(watch))
  ));
  const demoQuietWatchCount = 39;
  const totalChecked = demoQuietWatchCount + activeWatches.length;
  const unchangedCount = totalChecked - attentionWatches.length - updatedWatches.length;
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
  if (noChangesCount) {
    noChangesCount.textContent = String(unchangedCount);
  }
  if (unchangedLabel) {
    unchangedLabel.textContent = t(pluralKey('home.unchangedLabel', unchangedCount));
  }
  if (everythingChecked) {
    const completedCheckCount = 7 + quietStoredWatches.length;
    everythingChecked.textContent = t(pluralKey('home.everythingChecked', completedCheckCount), {
      count: completedCheckCount,
    });
  }

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
        if (confirmationCopy) {
          confirmationCopy.textContent = localizeField(createdWatch, 'title');
        }
        if (confirmationLink) {
          confirmationLink.href = `watch-detail.html?id=${encodeURIComponent(createdWatch.id)}`;
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

const renderRecentWatches = () => {
  const section = document.querySelector('#recentWatchesSection');
  const list = document.querySelector('#recentWatchesList');
  if (!section || !list) {
    return;
  }
  if (new URLSearchParams(window.location.search).has('edit')) {
    section.hidden = true;
    return;
  }

  const recentWatches = getWatches().slice().reverse().slice(0, 3);
  section.hidden = recentWatches.length === 0;
  list.innerHTML = recentWatches
    .map((watch) => {
      const title = localizeField(watch, 'title') || localizeField(watch, 'request');
      if (!title) {
        return '';
      }
      const category = watch.category ? t(`categories.${watch.category}`) : '';
      const isCompleted = watch.status === 'completed';
      const metadata = [category, isCompleted ? t('statuses.completed') : '']
        .filter(Boolean)
        .join(' · ');
      return `
        <a class="recent-watch${isCompleted ? ' recent-watch--completed' : ''}" href="watch-detail.html?id=${encodeURIComponent(watch.id)}">
          <span class="recent-watch__dot recent-watch__dot--${escapeHtml(watch.status || 'watching')}" aria-hidden="true"></span>
          <span>
            <strong>${escapeHtml(title)}</strong>
            ${metadata ? `<span class="recent-watch__metadata">${escapeHtml(metadata)}</span>` : ''}
          </span>
        </a>
      `;
    })
    .join('');
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
  const review = document.querySelector('#urlReview');
  const reviewSuccess = document.querySelector('#urlReviewSuccess');
  const reviewFailure = document.querySelector('#urlReviewFailure');
  const reviewTitle = document.querySelector('#urlReviewTitle');
  const reviewSummary = document.querySelector('#urlReviewSummary');
  const reviewSource = document.querySelector('#urlReviewSource');
  const reviewCreate = document.querySelector('#urlReviewCreate');
  const reviewEdit = document.querySelector('#urlReviewEdit');
  const reviewCancel = document.querySelector('#urlReviewCancel');
  const input = form?.watchRequest;
  const composer = input?.closest('.watch-composer');
  const watchClear = form?.querySelector('[data-watch-clear]');
  const noteToggle = form?.querySelector('[data-note-toggle]');
  const noteClose = form?.querySelector('[data-note-close]');
  const noteRegion = document.querySelector('#watchReason');
  const noteInput = form?.whyFollowing;
  const headingEl = document.querySelector('#newWatchHeading');
  const backEl = document.querySelector('#newWatchBack');
  const recentSectionEl = document.querySelector('#recentWatchesSection');
  const keywordChipsEl = document.querySelector('#watchKeywordChips');
  const keywordInputEl = document.querySelector('#watchKeywordInput');
  const keywordAddEl = document.querySelector('#watchKeywordAdd');
  const categoryInputEl = document.querySelector('#watchCategoryInput');
  const discardDialog = document.querySelector('#editDiscardDialog');
  const keepEditingButton = document.querySelector('#editKeepEditing');
  const discardChangesButton = document.querySelector('#editDiscardChanges');
  const editModeHeader = document.querySelector('#editModeHeader');
  const editModalCancel = document.querySelector('#editModalCancel');
  const editModalSave = document.querySelector('#editModalSave');
  const formParams = new URLSearchParams(window.location.search);
  const editWatchId = formParams.get('edit');
  const editingWatch = editWatchId ? getWatchById(editWatchId) : null;
  const isEditMode = Boolean(editingWatch);
  const isModalEditMode = isEditMode
    && formParams.get('presentation') === 'modal'
    && window.parent !== window;
  let pendingRequest = '';
  let pendingWhyFollowing = '';
  let pendingAnalysis = null;
  let analysisInProgress = false;
  let creationInProgress = false;
  let resizeFrame = null;
  let noteCollapseTimer = null;
  let keywordRegenerationTimer = null;
  let keywordItems = [];
  let categorySource = editingWatch?.categorySource || 'inferred';
  let keywordSourceRequest = '';
  let initialEditState = null;
  let pendingNavigationUrl = '';
  let editNavigationAllowed = false;
  let refreshEditSaveState = () => {};

  if (!form) {
    return;
  }

  if (editWatchId && !editingWatch) {
    window.location.replace('watches.html');
    return;
  }

  if (isModalEditMode) {
    document.body.classList.add('is-edit-modal');
    if (editModeHeader) editModeHeader.hidden = false;
  }

  const hasMeaningfulRequest = () => hasMeaningfulText(input?.value || '');

  const getKeywordValues = () => ({
    keywords: keywordItems.map((item) => item.label),
    selectedKeywords: keywordItems.filter((item) => item.selected).map((item) => item.label),
  });

  const renderKeywords = () => {
    if (!keywordChipsEl) return;
    keywordChipsEl.innerHTML = keywordItems
      .map((item, index) => `
        <span class="watch-keyword${item.selected ? ' is-selected' : ''}">
          <button
            class="watch-keyword__toggle"
            type="button"
            data-keyword-toggle="${index}"
            aria-pressed="${item.selected}"
          >${escapeHtml(item.label)}</button>
          <button
            class="watch-keyword__remove"
            type="button"
            data-keyword-remove="${index}"
            aria-label="${escapeHtml(t('newWatch.removeKeyword', { keyword: item.label }))}"
          >×</button>
        </span>
      `)
      .join('');
    refreshEditSaveState();
  };

  const replaceSuggestedKeywords = (request) => {
    keywordItems = extractKeywords(request).map((label) => ({ label, selected: true }));
    keywordSourceRequest = request;
    renderKeywords();
  };

  const addKeyword = () => {
    const label = keywordInputEl?.value.trim();
    if (!label) return;
    const existing = keywordItems.find(
      (item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
    );
    if (existing) {
      existing.selected = true;
    } else {
      keywordItems.push({ label, selected: true });
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
        categoryInputEl.value = inferCategory(request);
      }
      if (hasMeaningfulText(request) && hasSignificantRequestChange(keywordSourceRequest, request)) {
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
      categoryInputEl.value = inferCategory(request);
    }
    if (hasSignificantRequestChange(keywordSourceRequest, request)) {
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

  const resizeInput = ({ immediate = false } = {}) => {
    if (!input) return;

    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    const previousHeight = input.getBoundingClientRect().height;
    input.style.height = 'auto';
    const styles = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(styles.lineHeight)
      || Number.parseFloat(styles.fontSize) * 1.55;
    const verticalPadding = Number.parseFloat(styles.paddingTop)
      + Number.parseFloat(styles.paddingBottom);
    const maxHeight = (lineHeight * 7) + verticalPadding;
    const contentHeight = input.scrollHeight;
    const nextHeight = Math.min(contentHeight, maxHeight);
    input.style.overflowY = contentHeight > maxHeight + 1 ? 'auto' : 'hidden';

    if (immediate) {
      input.style.height = `${nextHeight}px`;
      resizeFrame = null;
      return;
    }

    input.style.height = `${previousHeight}px`;
    resizeFrame = window.requestAnimationFrame(() => {
      input.style.height = `${nextHeight}px`;
      resizeFrame = null;
    });
  };

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
    keywordChipsEl?.querySelectorAll('button').forEach((button) => {
      button.disabled = disabled;
    });
    if (submitButton) {
      submitButton.disabled = disabled || !hasMeaningfulRequest();
    }
    if (editModalSave) {
      editModalSave.disabled = disabled || !hasMeaningfulRequest() || !hasUnsavedEditChanges();
    }
  };

  const completeWatchCreation = (watch) => {
    addWatch(watch);
    sessionStorage.removeItem('watchAssistant.newWatchId');
    window.location.href = `watch-detail.html?id=${encodeURIComponent(watch.id)}&watchCreated=${encodeURIComponent(watch.id)}`;
  };

  const completeWatchUpdate = (request, whyFollowing, urlAnalysis = null) => {
    const keywordValues = getKeywordValues();
    const requestIsUrl = Boolean(urlAnalysis) || isUrl(request);
    const changes = {
      request,
      requestKey: null,
      whyFollowing: whyFollowing.trim(),
      whyFollowingKey: null,
      category: categoryInputEl?.value || editingWatch.category,
      categorySource,
      ...keywordValues,
      inputType: requestIsUrl ? 'url' : 'text',
      sourceUrl: requestIsUrl
        ? (urlAnalysis?.sourceUrl || request).trim()
        : null,
    };

    if (urlAnalysis) {
      changes.sourceName = getSourceText(urlAnalysis.sourceName || urlAnalysis.source) || null;
      changes.sourceNameKey = null;
      changes.sourceTitle = getSourceText(urlAnalysis.sourceTitle || urlAnalysis.title) || null;
      changes.sourceTitleKey = null;
    }

    updateWatch(editingWatch.id, changes);
    editNavigationAllowed = true;
    if (isModalEditMode) {
      window.parent.postMessage({
        type: 'watch-editor-saved',
        watchId: editingWatch.id,
      }, window.location.origin);
      return;
    }
    window.location.href = `watch-detail.html?id=${encodeURIComponent(editingWatch.id)}&watchUpdated=${encodeURIComponent(editingWatch.id)}`;
  };

  const getCreateOptions = () => ({
    category: categoryInputEl?.value || undefined,
    categorySource,
    ...getKeywordValues(),
  });

  const setReviewEditing = (editing) => {
    review?.classList.toggle('is-editing', editing);
    if (reviewTitle) {
      reviewTitle.readOnly = !editing;
    }
    if (reviewSummary) {
      reviewSummary.readOnly = !editing;
    }
    if (reviewEdit) {
      reviewEdit.textContent = t(editing ? 'newWatch.urlReviewDone' : 'newWatch.urlReviewEdit');
    }
    if (editing) {
      reviewTitle?.focus();
    }
  };

  const showReview = (analysis) => {
    const failed = analysis?.status !== 'success';
    pendingAnalysis = analysis;
    form.classList.add('is-reviewing');
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
    }
    if (reviewSource) {
      reviewSource.textContent = analysis?.source || t('newWatch.urlReviewUnknownSource');
    }
    if (reviewEdit) {
      reviewEdit.hidden = failed;
    }
    if (reviewCancel) {
      reviewCancel.hidden = !failed;
    }
    setReviewEditing(failed);
    if (!failed) review?.focus();
  };

  const startUrlAnalysis = async (request, whyFollowing) => {
    analysisInProgress = true;
    pendingRequest = request;
    pendingWhyFollowing = whyFollowing;
    form.classList.add('is-analysing');
    setCreationControlsDisabled(true);
    setSubmitLabel('newWatch.urlProcessingButton');
    if (analysisSection) {
      analysisSection.hidden = false;
    }
    if (processingState) {
      processingState.hidden = false;
    }
    if (review) {
      review.hidden = true;
    }

    const messageKeys = [
      'newWatch.urlProcessingAnalyzing',
      'newWatch.urlProcessingReading',
      'newWatch.urlProcessingPreparing',
    ];
    let messageIndex = 0;
    if (processingMessage) {
      processingMessage.textContent = t(messageKeys[messageIndex]);
    }
    const messageTimer = window.setInterval(() => {
      messageIndex = Math.min(messageIndex + 1, messageKeys.length - 1);
      if (processingMessage) {
        processingMessage.textContent = t(messageKeys[messageIndex]);
      }
    }, 450);

    try {
      // Yield once so the browser paints the disabled button and processing state.
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const analysis = await analyseUrl(request);
      showReview(analysis);
    } catch (error) {
      console.error('URL analysis failed:', error);
      showReview({
        status: 'failure',
        source: t('newWatch.urlReviewUnknownSource'),
        sourceUrl: request,
      });
    } finally {
      window.clearInterval(messageTimer);
      analysisInProgress = false;
      form.classList.remove('is-analysing');
      setSubmitLabel();
    }
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
      const existingKeywords = Array.isArray(editingWatch.keywords)
        ? editingWatch.keywords.filter((keyword) => typeof keyword === 'string' && keyword.trim())
        : extractKeywords(inputValue);
      const selectedKeywords = new Set(
        Array.isArray(editingWatch.selectedKeywords)
          ? editingWatch.selectedKeywords
          : existingKeywords,
      );

      if (headingEl) {
        headingEl.dataset.i18n = 'newWatch.editHeading';
        headingEl.textContent = t('newWatch.editHeading');
      }
      if (backEl) {
        backEl.href = `watch-detail.html?id=${encodeURIComponent(editingWatch.id)}`;
        backEl.dataset.i18n = 'newWatch.editBack';
        backEl.textContent = t('newWatch.editBack');
      }
      if (submitLabel) {
        submitLabel.dataset.i18n = 'newWatch.saveChanges';
      }
      if (reviewCreate) {
        reviewCreate.dataset.i18n = 'newWatch.urlReviewSave';
        reviewCreate.textContent = t('newWatch.urlReviewSave');
      }
      if (recentSectionEl) {
        recentSectionEl.hidden = true;
        recentSectionEl.dataset.editMode = 'true';
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
      keywordItems = existingKeywords.map((label) => ({
        label,
        selected: selectedKeywords.has(label),
      }));
      keywordSourceRequest = inputValue;
      if (categoryInputEl) {
        categoryInputEl.value = editingWatch.category || inferCategory(inputValue);
      }
      pendingAnalysis = editingWatch.inputType === 'url'
        ? {
          status: 'success',
          title: editingWatch.sourceTitle || editingWatch.title,
          summary: editingWatch.monitoringSummary || '',
          source: editingWatch.sourceName || '',
          sourceName: editingWatch.sourceName || '',
          sourceTitle: editingWatch.sourceTitle || '',
          sourceUrl: editingWatch.sourceUrl || inputValue,
        }
        : null;
    } else {
      keywordSourceRequest = input?.value || '';
      keywordItems = extractKeywords(keywordSourceRequest)
        .map((label) => ({ label, selected: true }));
      if (categoryInputEl) {
        categoryInputEl.value = inferCategory(keywordSourceRequest);
      }
    }

    renderKeywords();
    updateNoteCloseLabel();
    setSubmitLabel();
  };

  const getEditState = () => ({
    request: input?.value || '',
    sourceUrl: isUrl(input?.value || '') ? (input?.value || '') : '',
    note: noteInput?.value || '',
    category: categoryInputEl?.value || '',
    keywords: keywordItems.map(({ label, selected }) => ({ label, selected })),
  });

  const hasUnsavedEditChanges = () => (
    isEditMode
    && initialEditState !== null
    && JSON.stringify(getEditState()) !== initialEditState
  );

  refreshEditSaveState = () => {
    if (editModalSave) {
      editModalSave.disabled = creationInProgress
        || analysisInProgress
        || !hasMeaningfulRequest()
        || !hasUnsavedEditChanges();
    }
  };

  const returnToWatchDetails = (destination = backEl?.href) => {
    editNavigationAllowed = true;
    if (isModalEditMode) {
      window.parent.postMessage({
        type: 'watch-editor-close',
        watchId: editingWatch.id,
      }, window.location.origin);
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

  input?.addEventListener('input', () => {
    updateComposer();
    resizeInput();
    scheduleKeywordRegeneration();
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

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });

  keywordChipsEl?.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-keyword-toggle]');
    const remove = event.target.closest('[data-keyword-remove]');
    if (toggle) {
      const item = keywordItems[Number(toggle.dataset.keywordToggle)];
      if (item) item.selected = !item.selected;
      renderKeywords();
    }
    if (remove) {
      keywordItems.splice(Number(remove.dataset.keywordRemove), 1);
      renderKeywords();
    }
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

  noteToggle?.addEventListener('click', () => {
    if (!noteRegion) return;

    noteRegion.hidden = false;
    noteToggle.hidden = true;
    noteToggle.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => {
      noteRegion.classList.add('is-visible');
      updateNoteCloseLabel();
      noteInput?.focus();
    });
  });

  noteInput?.addEventListener('input', updateNoteCloseLabel);

  noteClose?.addEventListener('click', () => {
    if (!noteRegion || !noteToggle) return;

    if (noteInput?.value) {
      noteInput.value = '';
      updateNoteCloseLabel();
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

    if (analysisInProgress || creationInProgress || form.classList.contains('is-reviewing')) {
      return;
    }

    const request = input?.value.trim() || '';
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

    if (isUrl(request)) {
      const originalUrl = editingWatch?.sourceUrl || editingWatch?.request || '';
      if (
        isEditMode
        && normalizeComparableText(request) === normalizeComparableText(originalUrl)
      ) {
        creationInProgress = true;
        setCreationControlsDisabled(true);
        completeWatchUpdate(request, whyFollowing, pendingAnalysis);
        return;
      }
      await startUrlAnalysis(request, whyFollowing);
      return;
    }

    creationInProgress = true;
    setCreationControlsDisabled(true);
    if (isEditMode) {
      completeWatchUpdate(request, whyFollowing);
    } else {
      completeWatchCreation(createWatchObject(
        request,
        whyFollowing,
        null,
        getCreateOptions(),
      ));
    }
  });

  reviewEdit?.addEventListener('click', () => {
    setReviewEditing(!review?.classList.contains('is-editing'));
  });

  reviewCreate?.addEventListener('click', () => {
    if (creationInProgress) {
      return;
    }

    if (!reviewTitle?.reportValidity() || !reviewSummary?.reportValidity()) {
      return;
    }

    creationInProgress = true;
    [reviewCreate, reviewEdit, reviewCancel].forEach((control) => {
      if (control) control.disabled = true;
    });
    const analysis = {
      ...pendingAnalysis,
      status: 'success',
      title: reviewTitle.value.trim(),
      summary: reviewSummary.value.trim(),
      source: getSourceText(pendingAnalysis?.sourceName || pendingAnalysis?.source) || null,
      sourceUrl: pendingAnalysis?.sourceUrl || pendingRequest,
    };
    if (isEditMode) {
      completeWatchUpdate(pendingRequest, pendingWhyFollowing, analysis);
    } else {
      completeWatchCreation(createWatchObject(
        pendingRequest,
        pendingWhyFollowing,
        analysis,
        getCreateOptions(),
      ));
    }
  });

  reviewCancel?.addEventListener('click', () => {
    pendingRequest = '';
    pendingWhyFollowing = '';
    pendingAnalysis = null;
    analysisInProgress = false;
    form.classList.remove('is-reviewing');
    if (analysisSection) {
      analysisSection.hidden = true;
    }
    if (review) {
      review.hidden = true;
    }
    if (reviewTitle) {
      reviewTitle.disabled = true;
    }
    if (reviewSummary) {
      reviewSummary.disabled = true;
    }
    setCreationControlsDisabled(false);
    setSubmitLabel();
    updateComposer();
    input?.focus();
  });

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

    editModalCancel?.addEventListener('click', () => {
      handleEditNavigation(backEl?.href);
    });

    window.addEventListener('message', (event) => {
      if (
        !isModalEditMode
        || event.origin !== window.location.origin
        || event.source !== window.parent
        || event.data?.type !== 'watch-editor-request-close'
      ) return;
      handleEditNavigation(backEl?.href);
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
    if (analysisInProgress) {
      setSubmitLabel('newWatch.urlProcessingButton');
    }
    if (review?.classList.contains('is-editing') && reviewEdit && !reviewEdit.hidden) {
      reviewEdit.textContent = t('newWatch.urlReviewDone');
    }
    renderKeywords();
    setSubmitLabel(analysisInProgress ? 'newWatch.urlProcessingButton' : undefined);
  });

  initializeFormMode();
  updateComposer();
  resizeInput({ immediate: true });
  document.fonts?.ready.then(() => resizeInput({ immediate: true }));
  if (isEditMode) {
    initialEditState = JSON.stringify(getEditState());
    refreshEditSaveState();
  }
}

export const initApp = () => {
  renderHomeSummary();
  renderHomeBriefing();
  renderWatchList();
  renderWatchDetail();
  renderRecentWatches();
  initForm();
  renderDevTools();

  // Exposed for prototype testing; normal page loads never update the timestamp.
  window.refreshBriefing = refreshBriefing;

  window.addEventListener('pageshow', renderRecentWatches);

  // Re-render data-driven content if setLanguage() is called at runtime.
  document.addEventListener('i18n:languageChanged', () => {
    renderHomeSummary();
    renderHomeBriefing();
    renderWatchList();
    renderWatchDetail();
    renderRecentWatches();
  });
};
