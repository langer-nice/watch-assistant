const hasAuthCallback = (location) => {
  const query = new URLSearchParams(location?.search || '');
  const hash = new URLSearchParams((location?.hash || '').replace(/^#/, ''));
  return query.has('code') || query.has('error') || hash.has('access_token') || hash.has('error');
};

const getCallbackError = (location) => {
  const query = new URLSearchParams(location?.search || '');
  const hash = new URLSearchParams((location?.hash || '').replace(/^#/, ''));
  return query.get('error_description') || hash.get('error_description') || null;
};

export const getMagicLinkRedirectUrl = (location = window.location) => (
  new URL('index.html', location.href).href.split(/[?#]/)[0]
);

export const createAuthSession = ({ client, location = window.location } = {}) => {
  let state = {
    status: client ? (hasAuthCallback(location) ? 'confirming' : 'loading') : 'unavailable',
    session: null,
    error: client ? getCallbackError(location) : null,
  };
  const listeners = new Set();
  let subscription = null;

  const publish = (nextState) => {
    state = { ...state, ...nextState };
    listeners.forEach((listener) => listener(state));
    return state;
  };

  const initialize = async () => {
    if (!client) return state;
    if (state.error) return publish({ status: 'error', session: null });

    let result;
    try {
      result = await client.auth.getSession();
    } catch (error) {
      return publish({ status: 'error', error: error.message, session: null });
    }
    if (result.error) return publish({ status: 'error', error: result.error.message, session: null });

    publish({
      status: result.data.session ? 'authenticated' : 'anonymous',
      session: result.data.session,
      error: null,
    });
    const authChange = client.auth.onAuthStateChange((_event, session) => {
      publish({ status: session ? 'authenticated' : 'anonymous', session, error: null });
    });
    subscription = authChange.data?.subscription || null;
    return state;
  };

  const sendMagicLink = async (email) => {
    if (!client) return publish({ status: 'unavailable' });
    publish({ status: 'sending', error: null });
    let error;
    try {
      ({ error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: getMagicLinkRedirectUrl(location),
          shouldCreateUser: true,
        },
      }));
    } catch (requestError) {
      error = requestError;
    }
    if (error) return publish({ status: 'error', error: error.message, session: null });
    return publish({ status: 'link-sent', error: null, session: null });
  };

  const signOut = async () => {
    if (!client) return publish({ status: 'unavailable' });
    publish({ status: 'signing-out', error: null });
    let error;
    try {
      ({ error } = await client.auth.signOut());
    } catch (requestError) {
      error = requestError;
    }
    if (error) return publish({ status: 'error', error: error.message });
    return publish({ status: 'anonymous', session: null, error: null });
  };

  return {
    destroy: () => subscription?.unsubscribe(),
    getState: () => state,
    initialize,
    sendMagicLink,
    signOut,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
};
