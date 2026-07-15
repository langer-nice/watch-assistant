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

const hasMeaningfulText = (value) => (
  typeof value === 'string'
  && value.trim().length >= 3
  && /[\p{L}\p{N}]/u.test(value)
);

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

const createWatchObject = (request, whyFollowing = '') => {
  const now = new Date().toISOString();
  const category = inferCategory(request);
  return {
    id: crypto.randomUUID(),
    title: createTitle(request),
    request,
    whyFollowing: whyFollowing.trim(),
    category,
    status: 'watching',
    createdAt: now,
    lastChecked: null,
    requiresAttention: false,
    monitoringSummaryKey: inferMonitoringSummaryKey(request, category),
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
    briefingEl.hidden = !(hasCurrentSituation || hasRecommendation);
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

  const isSafeExternalUrl = (url) => {
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  };
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
  const checkedSummary = document.querySelector('#homeCheckedSummary');
  const noChangesCount = document.querySelector('#homeNoChangesCount');
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
  const quietStoredWatches = activeStoredWatches.filter((watch) => (
    !watch.requiresAttention
    && !hasMeaningfulText(getLatestChange(watch))
  ));
  if (checkedSummary) {
    checkedSummary.textContent = t('home.checkedSummary', {
      count: 42 + activeStoredWatches.length,
    });
  }
  if (noChangesCount) {
    noChangesCount.textContent = String(39 + quietStoredWatches.length);
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
  const urlShortcut = document.querySelector('#urlShortcut');
  const successState = document.querySelector('#newWatchSuccess');
  const input = form?.watchRequest;

  if (!form) {
    return;
  }

  const hasMeaningfulRequest = () => hasMeaningfulText(input?.value || '');

  const updateComposer = () => {
    const hasRequest = hasMeaningfulRequest();
    if (submitButton) {
      submitButton.disabled = !hasRequest;
    }
    if (hint && input) {
      const urlDetected = isUrl(input.value);
      hint.textContent = t(urlDetected ? 'newWatch.urlDetected' : 'newWatch.urlHelp');
      urlShortcut?.classList.toggle('is-detected', urlDetected);
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

  urlShortcut?.addEventListener('click', () => {
    input?.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
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

    const watch = createWatchObject(request, whyFollowing);
    addWatch(watch);
    sessionStorage.setItem('watchAssistant.newWatchId', watch.id);
    form.querySelectorAll('button, input, textarea').forEach((control) => {
      control.disabled = true;
    });
    form.hidden = true;
    document.querySelector('#recentWatchesSection')?.setAttribute('hidden', '');
    if (successState) {
      successState.hidden = false;
      successState.focus();
    }
    window.setTimeout(() => {
      window.location.href = `index.html?watchCreated=${encodeURIComponent(watch.id)}`;
    }, 1250);
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
