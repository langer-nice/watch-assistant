import { getWatches, addWatch, getWatchById, resetStoredWatches } from './watch-storage.js';

const isUrl = (value) => {
  const trimmed = value.trim();
  return /^(https?:\/\/|www\.)[\w-]+(\.[\w-]+)+/.test(trimmed);
};

const formatDate = (isoString) => {
  if (!isoString) {
    return 'Unknown';
  }

  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const inferCategory = (request) => {
  const text = request.toLowerCase();

  if (/(price|deal|discount|sale|cheapest|amazon|€|\$)/.test(text)) {
    return 'price';
  }

  if (/(flight|easyjet|travel|hotel|holiday|ticket|booking)/.test(text)) {
    return 'travel';
  }

  if (/(news|story|article|investigation|bbc|cnn|report)/.test(text)) {
    return 'news';
  }

  if (/(event|registration|deadline|ticket sales|concert)/.test(text)) {
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
      return 'New watch';
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
    latestUpdate: 'Watch created',
    sources: [],
    confidence: null,
    timeline: [
      {
        type: 'created',
        label: 'Watch created',
        date: now,
      },
    ],
  };
};

const capitalize = (value) => {
  if (!value) {
    return '';
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const renderWatchList = () => {
  const list = document.querySelector('#watchList');
  if (!list) {
    return;
  }

  const watches = getWatches();

  if (watches.length === 0) {
    list.innerHTML = '<p>Everything is under control. No active watches right now.</p>';
    return;
  }

  list.innerHTML = watches
    .map((watch) => {
      const summary = watch.summary || watch.request || 'Monitoring for meaningful updates.';
      return `
      <a class="watch-row" href="watch-detail.html?id=${encodeURIComponent(watch.id)}">
        <div>
          <p class="watch-row__category">${watch.category}</p>
          <h2>${watch.title}</h2>
          ${summary ? `<p class="watch-row__summary">${summary}</p>` : ''}
        </div>
        <span class="watch-row__status">${capitalize(watch.status)}</span>
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
    titleEl.textContent = 'Watch not found';
    if (introEl) {
      introEl.textContent = 'We could not find that watch. Please return to the watch list.';
    }
    if (confirmationEl) {
      confirmationEl.hidden = true;
    }
    return;
  }

  titleEl.textContent = watch.title;
  if (introEl) {
    introEl.textContent = watch.request;
  }
  if (requestEl) {
    requestEl.textContent = watch.request;
  }
  if (statusEl) {
    statusEl.textContent = watch.status;
  }
  if (createdEl) {
    createdEl.textContent = formatDate(watch.createdAt);
  }
  if (latestUpdateEl) {
    latestUpdateEl.textContent = watch.latestUpdate;
  }

  if (sourcesEl) {
    sourcesEl.innerHTML = watch.sources.length
      ? watch.sources.map((source) => `<li>${source}</li>`).join('')
      : '<li>No sources available yet.</li>';
  }

  if (timelineEl) {
    timelineEl.innerHTML = watch.timeline
      .map(
        (item) => `<li>${formatDate(item.date)} — ${item.label}</li>`
      )
      .join('');
  }

  const lastCheckedEl = document.querySelector('#watchLastChecked');
  if (lastCheckedEl) {
    lastCheckedEl.textContent = watch.lastChecked ? watch.lastChecked : 'Just now';
  }

  if (confirmationEl) {
    const isNew = watch.latestUpdate === 'Watch created' && watch.sources.length === 0 && watch.confidence === null;
    confirmationEl.hidden = !isNew;
  }

  if (externalActionEl) {
    if (watch.externalAction && watch.externalAction.url) {
      externalActionEl.textContent = watch.externalAction.label || 'Open source';
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
    <button type="button" class="button button--secondary">Reset demo data</button>
    <p class="text-muted">Development only</p>
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
  const notAttention = watches.filter((watch) => !watch.requiresAttention).length;

  const createdWatchId = sessionStorage.getItem('watchAssistant.newWatchId');
  if (confirmationBanner) {
    if (createdWatchId) {
      const createdWatch = getWatchById(createdWatchId);
      if (createdWatch) {
        confirmationBanner.hidden = false;
        if (confirmationCopy) {
          confirmationCopy.textContent = createdWatch.title;
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
      attentionTitle.textContent = attentionWatch.title;
    }
    if (attentionSummary) {
      attentionSummary.textContent = attentionWatch.request || attentionWatch.summary || 'Monitoring for meaningful updates.';
    }
    if (attentionMeta) {
      attentionMeta.textContent = `${attentionWatch.lastChecked || 'Just now'} · ${attentionWatch.status}`;
    }
    if (attentionLink) {
      attentionLink.href = `watch-detail.html?id=${encodeURIComponent(attentionWatch.id)}`;
    }
    if (introText) {
      introText.textContent = 'Your assistant has one item that needs attention before the day starts.';
    }
    if (statusText) {
      statusText.textContent = `I’m currently watching ${activeCount} things for you.`;
    }
  } else {
    if (attentionCard) {
      attentionCard.hidden = true;
    }
    if (introText) {
      introText.textContent = 'Everything is under control.';
    }
    if (statusText) {
      statusText.textContent = 'No important changes since your last visit.';
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
        ? 'URL detected. I can watch that too.'
        : 'Paste a news article, type a request or speak naturally.';
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
        watchError.textContent = 'Tell me what you would like me to watch.';
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
};
