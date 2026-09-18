import { safeAuthReturn } from './auth-return.js';
const hasAuthCallback = (location) => {
  const query = new URLSearchParams(location?.search || '');
  const hash = new URLSearchParams((location?.hash || '').replace(/^#/, ''));
  return query.has('code') || query.has('error') || hash.has('access_token') || hash.has('error');
};

const getCallbackError = (location) => {
  const query = new URLSearchParams(location?.search || '');
  const hash = new URLSearchParams((location?.hash || '').replace(/^#/, ''));
  return query.get('error_description') || hash.get('error_description') || query.get('error') || hash.get('error') || null;
};

export const getMagicLinkRedirectUrl = (location = window.location, returnTo, language) => {
  const url = new URL('index.html', location.href);
  url.search = '';
  url.hash = '';
  if (safeAuthReturn(returnTo)) url.searchParams.set('returnTo', returnTo);
  if (['en', 'fr'].includes(language)) url.searchParams.set('lang', language);
  return url.href;
};

export const createAuthSession = ({ client, location = window.location } = {}) => {
  let state = {
    status: client ? (hasAuthCallback(location) ? 'confirming' : 'loading') : 'unavailable',
    session: null,
    error: client ? getCallbackError(location) : null,
  };
  const listeners = new Set();
  let subscription = null;
  let revision = 0;
  let signingOut = false;
  let sending = false;

  const publish = (nextState) => {
    state = { ...state, ...nextState };
    listeners.forEach((listener) => listener(state));
    return state;
  };

  const initialize = async () => {
    if (!client) return state;
    if (state.error) return publish({ status: 'error', session: null });
    if (!subscription) {
      const change = client.auth.onAuthStateChange((_event, session) => {
        if (signingOut && session) return;
        revision += 1;
        publish({ status: session ? 'authenticated' : 'anonymous', session, error: null });
      });
      subscription = change.data?.subscription || null;
    }
    const initialRevision = revision;

    let result;
    try {
      result = await client.auth.getSession();
    } catch (error) {
      if (revision !== initialRevision) return state;
      return publish({ status: 'error', error: error.message, session: null });
    }
    if (revision !== initialRevision) return state;
    if (result.error) return publish({ status: 'error', error: result.error.message, session: null });

    publish({
      status: result.data.session ? 'authenticated' : 'anonymous',
      session: result.data.session,
      error: null,
    });
    return state;
  };

  const sendMagicLink = async (email, { returnTo, language } = {}) => {
    if (sending || state.status === 'authenticated' || signingOut) return state;
    if (!client) return publish({ status: 'unavailable' });
    sending = true;
    const requestRevision = ++revision;
    const submittedEmail = email.trim();
    publish({ status: 'sending', error: null });
    let error;
    try {
      ({ error } = await client.auth.signInWithOtp({
        email: submittedEmail,
        options: {
          emailRedirectTo: getMagicLinkRedirectUrl(location, returnTo, language),
          shouldCreateUser: true,
        },
      }));
    } catch (requestError) {
      error = requestError;
    }
    sending = false;
    if (revision !== requestRevision) return state;
    if (error) return publish({ status: 'error', error: error.message, session: null });
    return publish({ status: 'link-sent', submittedEmail, error: null, session: null });
  };

  const signOut = async () => {
    if (!client) return publish({ status: 'unavailable' });
    signingOut = true;
    revision += 1;
    publish({ status: 'signing-out', session: null, error: null });
    let error;
    try {
      ({ error } = await client.auth.signOut());
    } catch (requestError) {
      error = requestError;
    }
    signingOut = false;
    if (error) return publish({ status: 'error', session: null, error: error.message });
    return publish({ status: 'anonymous', session: null, error: null });
  };

  return {
    destroy: () => subscription?.unsubscribe(),
    getState: () => state,
    initialize,
    suspend: () => { revision += 1; return publish({ status: 'loading', session: null, error: null }); },
    sendMagicLink,
    resetEmail() {
      if (state.status !== 'link-sent') return state;
      return publish({ status: 'anonymous', submittedEmail: '', error: null, session: null });
    },
    signOut,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
};
