import assert from 'node:assert/strict';
import test from 'node:test';
import { processMediaWatchEmailNotifications } from './media-watch-notifications.js';
import { processCompanyWatchEmailNotifications } from './company-watch-notifications.js';

// Entirely synthetic rows and provider: no production credentials or network.
for (const [kind, processNotifications] of [
  ['media', processMediaWatchEmailNotifications], ['company', processCompanyWatchEmailNotifications],
]) {
  test(`${kind}: valid subdomain enables only pending delivery, never selects or mutates 185 historical failures`, async () => {
    const failed = Array.from({ length: 185 }, (_, index) => ({
      id: `historical-${index}`, status: 'failed', channel: 'email', attempt_count: index % 3,
      last_error_code: ['EMAIL_PROVIDER_ERROR', 'EMAIL_PROVIDER_RETRYABLE', 'EMAIL_DELIVERY_OUTCOME_UNKNOWN', 'WATCH_CHANGED'][index % 4],
      claim_token: index % 2 ? 'old-claim' : null,
      claimed_at: index % 2 ? '2026-09-15T00:00:00Z' : null,
      submission_started_at: index % 2 ? '2026-09-15T00:00:01Z' : null,
    }));
    const historicalSnapshot = structuredClone(failed);
    const pending = {
      id: 'new-pending', status: 'pending', channel: 'email', user_id: 'user', watch_id: 'watch',
      source_article_id: 'article', watch_title: 'Synthetic Watch',
      article: { title: 'New article', url: 'https://news.example/article', source: 'Synthetic' },
      company_name: 'Synthetic company', source_event_id: 'event',
      event: { eventType: 'accounts_filed', title: 'New event', source: 'BODACC' },
    };
    const sent = { ...pending, id: 'already-sent', status: 'sent' };
    const rows = [...failed, sent, pending];
    const selected = []; const calls = []; const messages = [];
    const client = {
      from(table) {
        assert.equal(table, `${kind}_watch_notifications`);
        const predicates = [];
        const query = {
          select(fields) { assert.equal(fields, 'id'); return query; },
          eq(key, value) { predicates.push(row => row[key] === value); return query; },
          or(expression) {
            assert.match(expression, /^claim_token\.is\.null,claimed_at\.lt\./);
            const cutoff = expression.split('claimed_at.lt.')[1];
            predicates.push(row => !row.claim_token || row.claimed_at < cutoff);
            return query;
          },
          order() { return query; },
          async range(start, end) {
            const data = rows.filter(row => predicates.every(predicate => predicate(row)))
              .slice(start, end + 1).map(({ id }) => ({ id }));
            selected.push(...data.map(row => row.id));
            return { data, error: null };
          },
        };
        return query;
      },
      auth: { admin: { getUserById: async () => ({ data: { user: {
        email: 'synthetic@example.test', email_confirmed_at: '2026-09-01T00:00:00Z',
      } }, error: null }) } },
      async rpc(name, params) {
        calls.push({ name, params });
        if (name === `get_${kind}_watch_notification_locale`) return { data: 'en', error: null };
        assert.equal(params.p_notification_id, pending.id, 'historical rows must never reach a mutation RPC');
        if (name === `claim_${kind}_watch_email_notification`) return { data: pending, error: null };
        if (name === `begin_${kind}_watch_email_submission`) return { data: true, error: null };
        if (name === `complete_${kind}_watch_email_notification`) {
          pending.status = 'sent'; return { data: true, error: null };
        }
        assert.fail(`Unexpected RPC: ${name}`);
      },
    };
    const env = {
      VERCEL_ENV: 'production', NODE_ENV: 'production', RESEND_API_KEY: 'fake',
      WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true', MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true',
      WATCH_EMAIL_FROM: 'Watch Assistant <alerts@watch.davidlangdesign.com>',
      WATCH_APP_BASE_URL: 'https://watch.example',
    };
    const run = () => processNotifications({ client, env, sender: async message => {
      messages.push(message); return { id: 'synthetic-provider-id' };
    } });
    assert.equal((await run()).sentCount, 1);
    assert.equal((await run()).sentCount, 0);
    assert.deepEqual(selected, ['new-pending']);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].from, env.WATCH_EMAIL_FROM);
    assert.equal(calls.filter(call => call.name.startsWith('claim_')).length, 1);
    assert.deepEqual(failed, historicalSnapshot, 'every historical field remains unchanged');
    assert.equal(sent.status, 'sent');
  });
}
