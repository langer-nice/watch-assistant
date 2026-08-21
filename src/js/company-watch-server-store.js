import { WATCH_STORAGE_CHANGED_EVENT } from './watch-storage-events.js';

let accessToken = null;
let serverWatches = [];
let hydrated = false;
let hydrationError = null;

const notify = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WATCH_STORAGE_CHANGED_EVENT));
};

const request = async (path, options = {}) => {
  if (!accessToken) throw new Error('AUTH_REQUIRED');
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || 'The Company Watch request failed.');
    error.code = body?.code || 'REQUEST_FAILED';
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

export const isCompanyWatchServerMode = () => Boolean(accessToken);
export const getServerCompanyWatches = () => [...serverWatches];
export const getCompanyWatchServerHydrationError = () => hydrationError;

export const hydrateServerCompanyWatches = async () => {
  if (!accessToken) {
    serverWatches = [];
    hydrated = false;
    notify();
    return [];
  }
  const body = await request('/api/company-watches');
  serverWatches = body.watches || [];
  hydrated = true;
  hydrationError = null;
  notify();
  return getServerCompanyWatches();
};

export const configureCompanyWatchServerStore = async (auth) => {
  const applyState = async (state) => {
    accessToken = state.session?.access_token || null;
    if (state.status === 'authenticated') {
      try {
        await hydrateServerCompanyWatches();
      } catch (error) {
        serverWatches = [];
        hydrated = false;
        hydrationError = error;
        notify();
        console.warn('[Company Watches] Server hydration failed.', { code: error?.code });
      }
    } else if (!['loading', 'confirming'].includes(state.status)) {
      serverWatches = [];
      hydrated = false;
      hydrationError = null;
      notify();
    }
  };
  await applyState(auth?.getState?.() || { status: 'unavailable' });
  auth?.subscribe?.((state) => { void applyState(state); });
};

export const createServerCompanyWatch = async (watch) => {
  const body = await request('/api/company-watches', {
    method: 'POST',
    body: JSON.stringify({
      siren: watch.company?.siren,
      title: watch.title,
      request: watch.request,
      summary: watch.whyFollowing || watch.monitoringSummary,
      companyName: watch.company?.name,
    }),
  });
  return replaceWatch(body.watch);
};

export const updateServerCompanyWatch = async (id, changes) => {
  const body = await request(`/api/company-watch?id=${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(changes),
  });
  return replaceWatch(body.watch);
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
