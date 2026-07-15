import {
  getWatches,
  getStoredWatches,
  addWatch,
  getWatchById,
  getBriefingGeneratedAt,
  setBriefingGeneratedAt,
  resetStoredWatches,
} from './watch-storage.js';
import { getLanguage, t } from './i18n.js';
import { analyseUrl } from './url-analysis.js';

let homeCreatedWatchId = null;

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

const inferCategory = (request) => {
  const text = request.toLowerCase();

  if (/(price|prix|deal|discount|remise|sale|promo|cheapest|moins cher|amazon|€|\$)/.test(text)) {
    return 'price';
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

const createWatchObject = (request, whyFollowing = '', urlAnalysis = null) => {
  const now = new Date().toISOString();
  const isUrlRequest = Boolean(urlAnalysis);
  const sourceName = getSourceText(urlAnalysis?.sourceName || urlAnalysis?.source);
  const sourceTitle = getSourceText(urlAnalysis?.sourceTitle || urlAnalysis?.title);
  const sourceUrl = typeof urlAnalysis?.sourceUrl === 'string'
    ? urlAnalysis.sourceUrl.trim()
    : '';
  const category = inferCategory([
    request,
    urlAnalysis?.title,
    urlAnalysis?.source,
  ].filter(Boolean).join(' '));
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
    status: 'watching',
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
      const subtitle = getMonitoringSummary(watch, title);
      return `
      <a class="watch-row" href="watch-detail.html?id=${encodeURIComponent(watch.id)}">
        <div>
          <p class="watch-row__category">${escapeHtml(t(`categories.${watch.category}`))}</p>
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="watch-row__summary">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <span class="watch-row__status">${escapeHtml(t(`statuses.${watch.status}`))}</span>
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
  const watch = getWatchById(watchId);

  const categoryEl = document.querySelector('#watchCategory');
  const statusEl = document.querySelector('#watchStatus');
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

  const hideDetailContent = () => {
    [briefingEl, factsEl, whyTodayEl, whyFollowingEl, timelineSectionEl, actionsSectionEl, confirmationEl]
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
    if (notFoundEl) {
      notFoundEl.textContent = t('detail.notFoundCopy');
      notFoundEl.hidden = false;
    }
    hideDetailContent();
    return;
  }

  const request = localizeField(watch, 'request');
  titleEl.textContent = localizeField(watch, 'title') || t('detail.title');
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
      : watch.status === 'stable' ? 'success' : 'update';
    statusEl.textContent = status || '';
    statusEl.hidden = !status;
    statusEl.className = `status-badge status-badge--with-dot status-badge--${statusModifier}`;
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
  const hasSourceLink = Boolean(safeSourceUrl);
  const hasOriginalSource = Boolean(
    watch.inputType === 'url'
    || storedSourceUrl
    || sourceName
    || sourceTitle,
  );
  if (sourceNameEl) {
    sourceNameEl.textContent = sourceName;
    sourceNameEl.hidden = !sourceName;
  }
  if (sourceTitleEl) {
    sourceTitleEl.textContent = sourceTitle;
    sourceTitleEl.hidden = !sourceTitle;
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
  const lastChecked = localizeField(watch, 'lastChecked');
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
    factsEl.hidden = !hasMetadata;
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
      url: action.url,
    }))
    .filter((action) => action.label && isSafeExternalUrl(action.url));
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

  if (confirmationEl) {
    const isNew = !hasLatestChange
      && sources.length === 0
      && watch.confidence == null;
    confirmationEl.hidden = !isNew;
  }
};

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
    everythingChecked.textContent = t('home.everythingChecked', {
      count: 7 + quietStoredWatches.length,
    });
  }

  const homeUrl = new URL(window.location.href);
  const createdWatchIdFromUrl = homeUrl.searchParams.get('watchCreated');
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
            confirmationBanner.hidden = true;
            homeCreatedWatchId = null;
          };
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

  const recentWatches = getStoredWatches().slice().reverse().slice(0, 3);
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
  const successState = document.querySelector('#newWatchSuccess');
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
  let pendingRequest = '';
  let pendingWhyFollowing = '';
  let pendingAnalysis = null;
  let analysisInProgress = false;
  let creationInProgress = false;

  if (!form) {
    return;
  }

  const hasMeaningfulRequest = () => hasMeaningfulText(input?.value || '');

  const setSubmitLabel = (key = 'newWatch.submit') => {
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
    form.querySelectorAll('[data-watch-example]').forEach((button) => {
      button.disabled = disabled;
    });
    if (submitButton) {
      submitButton.disabled = disabled || !hasMeaningfulRequest();
    }
  };

  const completeWatchCreation = (watch) => {
    addWatch(watch);
    sessionStorage.setItem('watchAssistant.newWatchId', watch.id);
    form.hidden = true;
    document.querySelector('#recentWatchesSection')?.setAttribute('hidden', '');
    if (successState) {
      successState.hidden = false;
      successState.focus();
    }
    window.setTimeout(() => {
      window.location.href = `index.html?watchCreated=${encodeURIComponent(watch.id)}`;
    }, 1250);
  };

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

  input?.addEventListener('input', updateComposer);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && hasMeaningfulRequest()) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.querySelectorAll('[data-watch-example]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!input) {
        return;
      }
      input.value = button.textContent.trim();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

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

    if (isUrl(request)) {
      await startUrlAnalysis(request, whyFollowing);
      return;
    }

    creationInProgress = true;
    setCreationControlsDisabled(true);
    completeWatchCreation(createWatchObject(request, whyFollowing));
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
    completeWatchCreation(createWatchObject(
      pendingRequest,
      pendingWhyFollowing,
      analysis,
    ));
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

  document.addEventListener('i18n:languageChanged', () => {
    if (analysisInProgress) {
      setSubmitLabel('newWatch.urlProcessingButton');
    }
    if (review?.classList.contains('is-editing') && reviewEdit && !reviewEdit.hidden) {
      reviewEdit.textContent = t('newWatch.urlReviewDone');
    }
  });

  updateComposer();
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
