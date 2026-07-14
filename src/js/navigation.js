import { getWatches, addWatch, getWatchById, resetStoredWatches } from './watch-storage.js';
import { getLanguage, t } from './i18n.js';

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

const createWatchObject = (request) => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: createTitle(request),
    request,
    category: inferCategory(request),
    status: 'watching',
    createdAt: now,
    lastChecked: null,
    requiresAttention: false,
    latestUpdateKey: 'watchData.created',
    sources: [],
    confidence: null,
    timeline: [
      {
        type: 'created',
        labelKey: 'watchData.created',
        date: now,
      },
    ],
  };
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
      const title = localizeField(watch, 'title');
      const request = localizeField(watch, 'request');
      const summary = localizeField(watch, 'summary') || request || t('common.monitoringFallback');
      return `
      <a class="watch-row" href="watch-detail.html?id=${encodeURIComponent(watch.id)}">
        <div>
          <p class="watch-row__category">${escapeHtml(t(`categories.${watch.category}`))}</p>
          <h2>${escapeHtml(title)}</h2>
          ${summary ? `<p class="watch-row__summary">${escapeHtml(summary)}</p>` : ''}
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

  const introEl = document.querySelector('#watchIntro');
  const requestEl = document.querySelector('#watchRequest');
  const statusEl = document.querySelector('#watchStatus');
  const createdEl = document.querySelector('#watchCreatedAt');
  const latestUpdateEl = document.querySelector('#watchLatestUpdate');
  const sourcesEl = document.querySelector('#watchSources');
  const timelineEl = document.querySelector('#watchTimeline');
  const confirmationEl = document.querySelector('#watchConfirmation');
  const externalActionEl = document.querySelector('#watchExternalAction');

  if (!watch) {
    titleEl.textContent = t('detail.notFoundTitle');
    if (introEl) {
      introEl.textContent = t('detail.notFoundCopy');
    }
    if (confirmationEl) {
      confirmationEl.hidden = true;
    }
    return;
  }

  const request = localizeField(watch, 'request');
  titleEl.textContent = localizeField(watch, 'title');
  if (introEl) {
    introEl.textContent = request;
  }
  if (requestEl) {
    requestEl.textContent = request;
  }
  if (statusEl) {
    statusEl.textContent = t(`statuses.${watch.status}`);
  }
  if (createdEl) {
    createdEl.textContent = formatDate(watch.createdAt);
  }
  if (latestUpdateEl) {
    latestUpdateEl.textContent = localizeField(watch, 'latestUpdate');
  }

  if (sourcesEl) {
    sourcesEl.innerHTML = watch.sources.length
      ? watch.sources.map((source) => `<li>${escapeHtml(localizeListItem(source))}</li>`).join('')
      : `<li>${escapeHtml(t('detail.noSources'))}</li>`;
  }

  if (timelineEl) {
    timelineEl.innerHTML = watch.timeline
      .map(
        (item) => {
          const label = item.type === 'created' ? t('watchData.created') : localizeListItem(item);
          return `<li>${item.date ? `${escapeHtml(formatDate(item.date))} — ` : ''}${escapeHtml(label)}</li>`;
        }
      )
      .join('');
  }

  const lastCheckedEl = document.querySelector('#watchLastChecked');
  if (lastCheckedEl) {
    lastCheckedEl.textContent = localizeField(watch, 'lastChecked') || t('common.justNow');
  }

  if (confirmationEl) {
    const isNew = (watch.latestUpdateKey === 'watchData.created' || watch.latestUpdate === 'Watch created')
      && watch.sources.length === 0
      && watch.confidence === null;
    confirmationEl.hidden = !isNew;
  }

  if (externalActionEl) {
    if (watch.externalAction && watch.externalAction.url) {
      externalActionEl.textContent = watch.externalAction.labelKey
        ? t(watch.externalAction.labelKey)
        : watch.externalAction.label || t('common.openSource');
      externalActionEl.href = watch.externalAction.url;
      externalActionEl.hidden = false;
    } else {
      externalActionEl.hidden = true;
    }
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
  const attentionCard = document.querySelector('.report-card');
  const attentionTitle = document.querySelector('#homeAttentionTitle');
  const attentionSummary = document.querySelector('#homeAttentionSummary');
  const attentionMeta = document.querySelector('#homeAttentionMeta');
  const attentionLink = document.querySelector('#homeAttentionLink');
  const statusText = document.querySelector('#homeStatusText');
  const introText = document.querySelector('#homeIntro');

  const watches = getWatches();
  const attentionWatch = watches.find((watch) => watch.requiresAttention);
  const activeCount = watches.length;
  const createdWatchId = sessionStorage.getItem('watchAssistant.newWatchId');
  if (confirmationBanner) {
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
          confirmationDismiss.addEventListener('click', () => {
            confirmationBanner.hidden = true;
            sessionStorage.removeItem('watchAssistant.newWatchId');
          });
        }
      } else {
        confirmationBanner.hidden = true;
        sessionStorage.removeItem('watchAssistant.newWatchId');
      }
    } else {
      confirmationBanner.hidden = true;
    }
  }

  if (attentionWatch && attentionCard) {
    attentionCard.hidden = false;
    if (attentionTitle) {
      attentionTitle.textContent = localizeField(attentionWatch, 'title');
    }
    if (attentionSummary) {
      attentionSummary.textContent = localizeField(attentionWatch, 'request')
        || localizeField(attentionWatch, 'summary')
        || t('common.monitoringFallback');
    }
    if (attentionMeta) {
      attentionMeta.textContent = t('home.attentionMetaDynamic', {
        lastChecked: localizeField(attentionWatch, 'lastChecked') || t('common.justNow'),
        status: t(`statuses.${attentionWatch.status}`),
      });
    }
    if (attentionLink) {
      attentionLink.href = `watch-detail.html?id=${encodeURIComponent(attentionWatch.id)}`;
    }
    if (introText) {
      introText.textContent = t('home.introAttention');
    }
    if (statusText) {
      statusText.textContent = t('home.statusWatching', { count: activeCount });
    }
  } else {
    if (attentionCard) {
      attentionCard.hidden = true;
    }
    if (introText) {
      introText.textContent = t('home.introClear');
    }
    if (statusText) {
      statusText.textContent = t('home.statusClear');
    }
  }
};

export function initForm() {
  const form = document.querySelector('#newWatchForm');
  const watchError = document.querySelector('#watchError');
  const hint = document.querySelector('#inputTypeHint');
  const input = form?.watchRequest;

  if (input && hint) {
    input.addEventListener('input', () => {
      hint.textContent = isUrl(input.value)
        ? t('newWatch.urlHint')
        : t('newWatch.hint');
    });
  }

  if (!form) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const request = input?.value.trim() || '';

    if (!request) {
      if (watchError) {
        watchError.textContent = t('newWatch.emptyError');
      }
      input?.focus();
      return;
    }

    if (watchError) {
      watchError.textContent = '';
    }

    const watch = createWatchObject(request);
    addWatch(watch);
    sessionStorage.setItem('watchAssistant.newWatchId', watch.id);
    window.location.href = `watch-detail.html?id=${encodeURIComponent(watch.id)}`;
  });
}

export const initApp = () => {
  renderHomeSummary();
  renderWatchList();
  renderWatchDetail();
  initForm();
  renderDevTools();

  // Re-render data-driven content if setLanguage() is called at runtime.
  document.addEventListener('i18n:languageChanged', () => {
    renderHomeSummary();
    renderWatchList();
    renderWatchDetail();
  });
};
