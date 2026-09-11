import assert from 'node:assert/strict';
import test from 'node:test';

import { processCompanyWatchEmailNotifications } from './company-watch-notifications.js';

const enabledEnv = {
  WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true', RESEND_API_KEY: 're_placeholder',
  WATCH_EMAIL_FROM: 'Watch Assistant <watch@example.test>',
  WATCH_APP_BASE_URL: 'https://watch.example', VERCEL_ENV: 'production',
};

const notification = (id, userId = `user-${id}`) => ({
  id, watch_id: `watch-${id}`, user_id: userId, channel: 'email',
  source_event_id: `event-${id}`, company_name: `Company ${id}`,
  event: { eventType: 'accounts_filed', title: 'Dépôt des comptes',
    summary: 'Texte officiel.', publishedAt: '2026-09-10T00:00:00.000Z', source: 'BODACC' },
  status: 'pending', attempt_count: 0, claim_token: null,
});

const createClient = (initial, { users = {}, locales = {} } = {}) => {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  const calls = { claims: [], failures: [], completions: [] };
  const from = (table) => {
    if (table === 'company_watch_notifications') {
      const filters = [];
      const builder = {
        select() { return builder; }, eq(key, value) { filters.push([key, value]); return builder; },
        order() { return builder; },
        range(start, end) {
          const data = [...rows.values()]
            .filter((row) => filters.every(([key, value]) => row[key] === value))
            .slice(start, end + 1).map(({ id }) => ({ id }));
          return Promise.resolve({ data, error: null });
        },
      };
      return builder;
    }
    throw new Error(`Unexpected table: ${table}`);
  };
  const rpc = async (name, params) => {
    if (name === 'get_company_watch_notification_locale') {
      return { data: locales[params.p_user_id] || 'en', error: null };
    }
    const row = rows.get(params.p_notification_id);
    if (name === 'claim_company_watch_email_notification') {
      if (!row || row.status !== 'pending' || row.attempt_count !== 0 || row.claim_token) {
        return { data: null, error: null };
      }
      row.attempt_count += 1; row.claim_token = params.p_claim_token; calls.claims.push(params);
      return { data: structuredClone(row), error: null };
    }
    if (name === 'complete_company_watch_email_notification') {
      if (row?.claim_token !== params.p_claim_token || row.status !== 'pending') {
        return { data: false, error: null };
      }
      row.status = 'sent'; row.provider_message_id = params.p_provider_message_id;
      calls.completions.push(params); return { data: true, error: null };
    }
    if (name === 'fail_company_watch_email_notification') {
      if (row?.claim_token === params.p_claim_token && row.status === 'pending') {
        row.status = 'failed'; row.last_error_code = params.p_error_code;
      }
      calls.failures.push(params); return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  };
  const auth = { admin: { getUserById: async (id) => ({
    data: { user: users[id] || { email: `${id}@example.test`, email_confirmed_at: '2026-09-01T00:00:00Z' } },
    error: null,
  }) } };
  return { client: { from, rpc, auth }, rows, calls };
};

test('a pending genuine event sends once and records the provider ID', async () => {
  const store = createClient([notification('one')], { locales: { 'user-one': 'fr' } });
  const sends = [];
  const result = await processCompanyWatchEmailNotifications({
    client: store.client, env: enabledEnv, createClaimToken: () => 'claim-one',
    sender: async (message) => { sends.push(message); return { id: 'message-one' }; },
  });
  assert.equal(result.sentCount, 1); assert.equal(sends.length, 1);
  assert.match(sends[0].subject, /Nouvel événement officiel/u);
  assert.equal(store.rows.get('one').status, 'sent');
  assert.equal(store.rows.get('one').provider_message_id, 'message-one');
});

test('overlapping processors atomically claim one event and send only once', async () => {
  const store = createClient([notification('one')]);
  const sends = [];
  const run = (token) => processCompanyWatchEmailNotifications({
    client: store.client, env: enabledEnv, createClaimToken: () => token,
    sender: async (message) => { sends.push(message); return { id: 'message-one' }; },
  });
  await Promise.all([run('claim-a'), run('claim-b')]);
  assert.equal(sends.length, 1); assert.equal(store.rows.get('one').attempt_count, 1);
  assert.equal(store.rows.get('one').status, 'sent');
});

test('a provider failure is safely recorded and does not block another recipient', async () => {
  const store = createClient([notification('bad'), notification('good')]);
  const result = await processCompanyWatchEmailNotifications({
    client: store.client, env: enabledEnv,
    createClaimToken: (() => { let index = 0; return () => `claim-${++index}`; })(),
    sender: async ({ to }) => {
      if (to.startsWith('user-bad')) {
        throw Object.assign(new Error('recipient=user-bad@example.test'), { code: 'EMAIL_PROVIDER_ERROR' });
      }
      return { id: 'message-good' };
    },
  });
  assert.equal(result.status, 'partial-success'); assert.equal(result.failedCount, 1);
  assert.equal(result.sentCount, 1); assert.equal(store.rows.get('bad').status, 'failed');
  assert.equal(store.rows.get('bad').last_error_code, 'EMAIL_PROVIDER_ERROR');
  assert.equal(store.rows.get('good').status, 'sent');
  assert.doesNotMatch(JSON.stringify(store.calls.failures), /example\.test/u);
});

test('an unverified account is never sent and is recorded with a safe code', async () => {
  const row = notification('one');
  const store = createClient([row], { users: {
    [row.user_id]: { email: 'unverified@example.test', email_confirmed_at: null },
  } });
  let sends = 0;
  await processCompanyWatchEmailNotifications({
    client: store.client, env: enabledEnv, createClaimToken: () => 'claim-one',
    sender: async () => { sends += 1; return { id: 'unexpected' }; },
  });
  assert.equal(sends, 0); assert.equal(store.rows.get('one').status, 'failed');
  assert.equal(store.rows.get('one').last_error_code, 'RECIPIENT_UNVERIFIED');
});

test('disabled or incomplete configuration performs no outbox read or send', async () => {
  let touched = false;
  const client = { from() { touched = true; throw new Error('unexpected'); } };
  const disabled = await processCompanyWatchEmailNotifications({ client, env: {} });
  const preview = await processCompanyWatchEmailNotifications({
    client, env: { ...enabledEnv, VERCEL_ENV: 'preview' },
  });
  assert.equal(disabled.status, 'disabled'); assert.equal(preview.status, 'disabled');
  assert.equal(touched, false);
});
