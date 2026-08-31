import { WATCH_STORAGE_CHANGED_EVENT } from './watch-storage-events.js';
import { SUPPORTED_WATCH_CATEGORIES } from './watch-category.js';

let accessToken = null;
let authStateSource = null;
let serverWatches = [];
let hydrated = false;
let hydrationError = null;
let authGeneration = 0;
let latestHydrationRequest = 0;
let authIdentity = null;
let unsubscribeAuth = null;
const TRANSIENT_AUTH_STATES = new Set(['loading', 'confirming']);

const notify = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WATCH_STORAGE_CHANGED_EVENT));
};

const getAccessToken = () => {
  const state = authStateSource?.getState?.();
  if (state?.status === 'authenticated') return state.session?.access_token || null;
  if (TRANSIENT_AUTH_STATES.has(state?.status)) return accessToken;
  return state ? null : accessToken;
};

const request = async (path, options = {}, token = getAccessToken()) => {
  if (!token) {
    const error = new Error('Authentication is required.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || 'The Company Watch request failed.');
    error.code = body?.code || 'REQUEST_FAILED';
    error.requestId = body?.requestId || response.headers.get('X-Request-Id') || null;
    error.statusCode = response.status;
    if (
      error.code === 'ACTIVE_WATCH_EXISTS'
      && typeof body?.existingWatch?.id === 'string'
      && typeof body?.existingWatch?.title === 'string'
    ) {
      error.existingWatch = {
        id: body.existingWatch.id,
        title: body.existingWatch.title,
      };
    }
    throw error;
  }
  return body;
};

const replaceWatch = (watch) => {
  serverWatches = [...serverWatches.filter(({ id }) => id !== watch.id), watch]
    .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt));
  notify();
  return watch;
};

const normalizePersistedWatch = (watch) => {
  if (
    !watch
    || typeof watch.id !== 'string'
    || watch.inputType !== 'company'
    || !SUPPORTED_WATCH_CATEGORIES.includes(watch.category)
  ) {
    const error = new Error('The persisted Company Watch response is invalid.');
    error.code = 'INVALID_PERSISTED_WATCH';
    throw error;
  }
  return {
    ...watch,
    whyFollowing: typeof watch.whyFollowing === 'string' ? watch.whyFollowing : '',
  };
};

export const acceptPersistedServerCompanyWatch = (watch) => (
  replaceWatch(normalizePersistedWatch(watch))
);

export const isCompanyWatchServerMode = () => Boolean(getAccessToken());
export const getServerCompanyWatches = () => [...serverWatches];
export const getCompanyWatchServerHydrationError = () => hydrationError;

export const hydrateServerCompanyWatches = async () => {
  const token = getAccessToken();
  if (!token) {
    serverWatches = [];
    hydrated = false;
    hydrationError = null;
    notify();
    return [];
  }
  const generation = authGeneration;
  const hydrationRequest = ++latestHydrationRequest;
  try {
    const body = await request('/api/company-watches', {}, token);
    if (
      generation !== authGeneration
      || hydrationRequest !== latestHydrationRequest
      || token !== getAccessToken()
    ) return getServerCompanyWatches();
    if (!Array.isArray(body?.watches)) {
      const error = new Error('The Company Watch list response is invalid.');
      error.code = 'INVALID_PERSISTED_WATCHES';
      throw error;
    }
    serverWatches = body.watches.map(normalizePersistedWatch);
    hydrated = true;
    hydrationError = null;
    notify();
  } catch (error) {
    if (
      generation === authGeneration
      && hydrationRequest === latestHydrationRequest
      && token === getAccessToken()
    ) {
      hydrationError = error;
      notify();
    }
    throw error;
  }
  return getServerCompanyWatches();
};

export const configureCompanyWatchServerStore = async (auth) => {
  unsubscribeAuth?.();
  unsubscribeAuth = null;
  authStateSource = auth || null;
  const applyState = async (state) => {
    if (TRANSIENT_AUTH_STATES.has(state.status)) return;
    const nextAccessToken = state.status === 'authenticated'
      ? state.session?.access_token || null : null;
    const nextIdentity = nextAccessToken
      ? state.session?.user?.id || nextAccessToken
      : null;
    const identityChanged = nextIdentity !== authIdentity;
    const tokenChanged = nextAccessToken !== accessToken;

    if (!nextAccessToken) {
      accessToken = null;
      authIdentity = null;
      authGeneration += 1;
      latestHydrationRequest += 1;
      serverWatches = [];
      hydrated = false;
      hydrationError = null;
      notify();
      return;
    }

    accessToken = nextAccessToken;
    authIdentity = nextIdentity;
    if (identityChanged) {
      authGeneration += 1;
      latestHydrationRequest += 1;
      serverWatches = [];
      hydrated = false;
      hydrationError = null;
      notify();
    }
    if (identityChanged || tokenChanged || !hydrated) {
      try {
        await hydrateServerCompanyWatches();
      } catch (error) {
        console.warn('[Company Watches] Server hydration failed.', { code: error?.code });
      }
    }
  };
  await applyState(auth?.getState?.() || { status: 'unavailable' });
  unsubscribeAuth = auth?.subscribe?.((state) => { void applyState(state); }) || null;
};

export const createServerCompanyWatch = async (watch) => {
  const body = await request('/api/company-watches', {
    method: 'POST',
    body: JSON.stringify({
      siren: watch.company?.siren,
      title: watch.title,
      request: watch.request,
      summary: watch.whyFollowing || '',
      companyName: watch.company?.name,
      category: watch.category || 'general',
    }),
  });
  return replaceWatch(body.watch);
};

export const updateServerCompanyWatch = async (id, changes) => {
  const body = await request(`/api/company-watch?id=${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(changes),
  });
  if (
    Object.hasOwn(changes, 'category')
    && body.watch?.category !== changes.category
  ) {
    const error = new Error('The saved Company Watch category did not match the request.');
    error.code = 'PERSISTED_CATEGORY_MISMATCH';
    throw error;
  }
  return acceptPersistedServerCompanyWatch(body.watch);
};

export const deleteServerCompanyWatch = async (id) => {
  await request(`/api/company-watch?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  serverWatches = serverWatches.filter((watch) => watch.id !== id);
  notify();
};

export const checkServerCompanyWatch = async (id) => {
  try {
    const body = await request(`/api/check-company-watch?id=${encodeURIComponent(id)}`, {
      method: 'POST',
    });
    replaceWatch(body.watch);
    return body;
  } catch (error) {
    try {
      const body = await request(`/api/company-watch?id=${encodeURIComponent(id)}`);
      if (body?.watch) replaceWatch(body.watch);
    } catch {
      // Keep the original check error as the user-visible failure.
    }
    throw error;
  }
};
