import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthSession, getMagicLinkRedirectUrl } from './auth-session.js';

const createClient = ({ session = null, getSessionError = null, magicLinkError = null } = {}) => {
  const calls = [];
  let authCallback = null;
  return {
    calls,
    emit: (event, nextSession) => authCallback?.(event, nextSession),
    auth: {
      getSession: async () => ({ data: { session }, error: getSessionError }),
      onAuthStateChange: (callback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signInWithOtp: async (payload) => {
        calls.push(['magic-link', payload]);
        return { error: magicLinkError };
      },
      signOut: async () => {
        calls.push(['sign-out']);
        return { error: null };
      },
    },
  };
};

const location = new URL('https://watch.example/watches.html?from=nav');

test('represents a non-connected session', async () => {
  const auth = createAuthSession({ client: createClient(), location });
  await auth.initialize();
  assert.deepEqual(auth.getState(), { status: 'anonymous', session: null, error: null });
});

test('represents a connected session and follows auth changes', async () => {
  const session = { user: { id: 'user-a', email: 'a@example.test' } };
  const client = createClient({ session });
  const auth = createAuthSession({ client, location });
  await auth.initialize();
  assert.equal(auth.getState().status, 'authenticated');
  assert.equal(auth.getState().session.user.id, 'user-a');

  client.emit('SIGNED_OUT', null);
  assert.equal(auth.getState().status, 'anonymous');
});

test('sends a magic link to the stable index callback URL', async () => {
  const client = createClient();
  const auth = createAuthSession({ client, location });
  await auth.sendMagicLink(' person@example.test ');

  assert.equal(auth.getState().status, 'link-sent');
  assert.deepEqual(client.calls[0], ['magic-link', {
    email: 'person@example.test',
    options: {
      emailRedirectTo: 'https://watch.example/index.html',
      shouldCreateUser: true,
    },
  }]);
  assert.equal(getMagicLinkRedirectUrl(location), 'https://watch.example/index.html');
});

test('exposes the sending state until the magic-link request completes', async () => {
  let resolveRequest;
  const client = createClient();
  client.auth.signInWithOtp = () => new Promise((resolve) => { resolveRequest = resolve; });
  const auth = createAuthSession({ client, location });

  const request = auth.sendMagicLink('person@example.test');
  assert.equal(auth.getState().status, 'sending');
  resolveRequest({ error: null });
  await request;
  assert.equal(auth.getState().status, 'link-sent');
});

test('surfaces a comprehensible magic-link error state', async () => {
  const client = createClient({ magicLinkError: { message: 'Email rate limit exceeded' } });
  const auth = createAuthSession({ client, location });
  await auth.sendMagicLink('person@example.test');
  assert.deepEqual(auth.getState(), {
    status: 'error', session: null, error: 'Email rate limit exceeded',
  });
});

test('starts in confirmation and exposes callback errors', async () => {
  const confirming = createAuthSession({
    client: createClient(),
    location: new URL('https://watch.example/index.html?code=confirmation-code'),
  });
  assert.equal(confirming.getState().status, 'confirming');

  const failed = createAuthSession({
    client: createClient(),
    location: new URL('https://watch.example/index.html?error=access_denied&error_description=Expired+link'),
  });
  await failed.initialize();
  assert.equal(failed.getState().status, 'error');
  assert.equal(failed.getState().error, 'Expired link');
});

test('signs out and clears the active session', async () => {
  const client = createClient({ session: { user: { id: 'user-a' } } });
  const auth = createAuthSession({ client, location });
  await auth.initialize();
  await auth.signOut();
  assert.equal(auth.getState().status, 'anonymous');
  assert.deepEqual(client.calls.at(-1), ['sign-out']);
});
