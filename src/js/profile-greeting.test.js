import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfileFirstName } from './profile-greeting.js';

const authenticated = (user) => ({ status: 'authenticated', session: { user } });

test('uses an explicit profile first name and can fall back to the first word of full name', () => {
  assert.equal(getProfileFirstName(authenticated({ user_metadata: {
    first_name: ' Emma ', full_name: 'Other Name',
  } })), 'Emma');
  assert.equal(getProfileFirstName(authenticated({ user_metadata: { full_name: 'David Lang' } })), 'David');
});

test('missing profile name or unauthenticated state uses a generic greeting', () => {
  assert.equal(getProfileFirstName(authenticated({ email: 'david@example.com', user_metadata: {} })), null);
  assert.equal(getProfileFirstName(authenticated({ user_metadata: { name: 'david@example.com' } })), null);
  assert.equal(getProfileFirstName({ status: 'anonymous', session: { user: { user_metadata: { first_name: 'David' } } } }), null);
  assert.equal(getProfileFirstName({ status: 'loading', session: null }), null);
});
