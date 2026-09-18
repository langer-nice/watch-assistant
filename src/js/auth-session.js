import { isValidOwnerId } from './account-storage.js';
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

// A failed connection or gateway timeout can hide an accepted email. Only clear
// the local cooldown for an explicit rejection, never for rate limiting.
const emailSendWasRejected = (error) => {
  if (error.status === 429 || /rate_limit/.test(error.code || '')) return false;
  if (error.status >= 400 && error.status < 500 && error.status !== 408) return true;
  // supabase-js wraps GoTrue's SMTP failures as AuthRetryableFetchError (500),
  // preserving the message but discarding its unexpected_failure code.
  return error.status === 500
    && /^Error sending (confirmation|magic link|otp) email$/i.test(error.message || '');
};

export const getMagicLinkRedirectUrl = (location = window.location, returnTo, language) => {
  const url = new URL('index.html', location.href);
  url.search = '';
  url.hash = '';
  if (safeAuthReturn(returnTo)) url.searchParams.set('returnTo', returnTo);
  if (['en', 'fr'].includes(language)) url.searchParams.set('lang', language);
  return url.href;
};

export const createAuthSession = ({ client, location = window.location, mode = 'magic-link', resendSeconds = 60, now = Date.now } = {}) => {
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
  let verification = null;
  let retryAt = 0;
  const cooldownMs = Math.max(60, Number(resendSeconds) || 60) * 1000;
  const sameEmail = (a, b) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

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
        // The SDK publishes SIGNED_IN before verifyOtp resolves. Only that matching
        // verification may authorize draft transfer; other auth events invalidate it.
        if (verification && _event === 'SIGNED_IN' && sameEmail(session?.user?.email, verification.email)) return;
        revision += 1;
        publish({ status: session ? 'authenticated' : 'anonymous', session, error: null, verifiedRequest: null, authEvent: _event });
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
    if (sending || verification || state.status === 'authenticated' || signingOut) return state;
    if (mode === 'otp' && now() < retryAt) return state;
    if (!client) return publish({ status: 'unavailable' });
    sending = true;
    const requestRevision = ++revision;
    const submittedEmail = email.trim();
    if (mode === 'otp') retryAt = now() + cooldownMs;
    publish({ status: 'sending', error: null });
    let error;
    try {
      ({ error } = await client.auth.signInWithOtp({
        email: submittedEmail,
        options: {
          ...(mode === 'otp' ? {} : { emailRedirectTo: getMagicLinkRedirectUrl(location, returnTo, language) }),
          shouldCreateUser: true,
        },
      }));
    } catch (requestError) {
      error = requestError;
    }
    sending = false;
    if (mode === 'otp' && error && emailSendWasRejected(error)) retryAt = 0;
    if (revision !== requestRevision) return state;
    if (error) return publish({ status: 'error', error: error.message, session: null });
    return publish({ status: mode === 'otp' ? 'code-sent' : 'link-sent', submittedEmail, error: null, session: null });
  };

  const verifyCode = async (value) => {
    if (mode !== 'otp' || verification || state.status !== 'code-sent') return state;
    const token = String(value).trim();
    if (!/^[0-9]{6}$/.test(token)) return publish({ error: 'malformed_code' });
    const attempt = { revision: ++revision, email: state.submittedEmail };
    verification = attempt;
    publish({ status: 'verifying', error: null });
    let result;
    try {
      result = await client.auth.verifyOtp({ email: attempt.email, token, type: 'email' });
    } catch {
      result = { error: { code: 'network_failure' } };
    }
    verification = null;
    if (attempt.revision !== revision) {
      // A cancelled verification can still establish an SDK session. Remove only
      // that late session, never an independently established newer account.
      if (result.data?.session) {
        const current = await client.auth.getSession().catch(() => ({ data: {} }));
        if (current.data?.session?.access_token === result.data.session.access_token) {
          await client.auth.signOut({ scope: 'local' }).catch(() => {});
        }
      }
      return state;
    }
    if (result.error) return publish({ status: 'code-sent', error: result.error.code || result.error.message || 'invalid_code' });
    const session = result.data?.session;
    if (!isValidOwnerId(session?.user?.id) || !session.access_token || !sameEmail(session.user.email, attempt.email)) {
      return publish({ status: 'error', session: null, error: 'unresolved_auth' });
    }
    return publish({ status: 'authenticated', session, error: null, verifiedRequest: attempt.revision });
  };

  const cancelChallenge = () => {
    revision += 1;
    return publish({ status: 'anonymous', session: null, error: null, submittedEmail: '', verifiedRequest: null });
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
    sendMagicLink, verifyCode, cancelChallenge, mode,
    cooldownRemaining: () => Math.max(0, Math.ceil((retryAt - now()) / 1000)),
    resetEmail() {
      if (!['link-sent', 'code-sent'].includes(state.status)) return state;
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
