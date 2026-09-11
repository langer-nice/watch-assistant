import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationIdempotencyKey,
  getCompanyWatchEmailConfig,
  renderCompanyWatchEmail,
  sendWithResend,
} from './company-watch-email.js';

const event = {
  eventType: 'director_change',
  title: 'Modification · Société Exemple',
  summary: 'Nomination de Mme Exemple en qualité de présidente.',
  publishedAt: '2026-09-10T00:00:00.000Z',
  source: 'BODACC',
};

test('renders complete English and French transactional email variants', () => {
  const english = renderCompanyWatchEmail({
    locale: 'en', watchId: 'watch-1', companyName: 'Example & Co', event,
    baseUrl: 'https://watch.example/',
  });
  const french = renderCompanyWatchEmail({
    locale: 'fr', watchId: 'watch-1', companyName: 'Exemple & Cie', event,
    baseUrl: 'https://watch.example/',
  });

  assert.match(english.subject, /New official event detected/u);
  assert.match(english.html, /Director changed/u);
  assert.match(english.text, /10 September 2026/u);
  assert.match(english.text, /does not necessarily mean that the company has ceased trading/u);
  assert.match(french.subject, /Nouvel événement officiel détecté/u);
  assert.match(french.html, /Changement de dirigeant/u);
  assert.match(french.text, /10 septembre 2026/u);
  assert.match(french.text, /ne signifie pas nécessairement que l’entreprise a cessé son activité/u);
  assert.equal(french.detailUrl, 'https://watch.example/watch-detail.html?id=watch-1');
});

test('preserves raw BODACC summary text and escapes it in HTML', () => {
  const rendered = renderCompanyWatchEmail({
    locale: 'en', watchId: 'watch-1', companyName: '<Example>',
    event: { ...event, eventType: 'unknown_change', summary: '<b>Texte officiel</b>' },
    baseUrl: 'https://watch.example',
  });
  assert.match(rendered.text, /<b>Texte officiel<\/b>/u);
  assert.doesNotMatch(rendered.html, /<b>Texte officiel<\/b>/u);
  assert.match(rendered.html, /&lt;b&gt;Texte officiel&lt;\/b&gt;/u);
});

test('configuration is fail-closed when disabled, incomplete, or on Preview', () => {
  const complete = {
    WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true', RESEND_API_KEY: 're_placeholder',
    WATCH_EMAIL_FROM: 'Watch Assistant <watch@example.test>',
    WATCH_APP_BASE_URL: 'https://watch.example',
  };
  assert.equal(getCompanyWatchEmailConfig({ ...complete, WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'false' }), null);
  assert.equal(getCompanyWatchEmailConfig({ ...complete, RESEND_API_KEY: '' }), null);
  assert.equal(getCompanyWatchEmailConfig({ ...complete, WATCH_EMAIL_FROM: 'Watch\nBcc: attacker' }), null);
  assert.equal(getCompanyWatchEmailConfig(complete), null);
  assert.equal(getCompanyWatchEmailConfig({ ...complete, VERCEL_ENV: 'preview' }), null);
  assert.equal(getCompanyWatchEmailConfig({ ...complete, VERCEL_ENV: 'development' }), null);
  assert.equal(getCompanyWatchEmailConfig({ ...complete, VERCEL_ENV: 'production', NODE_ENV: 'test' }), null);
  assert.deepEqual(getCompanyWatchEmailConfig({ ...complete, VERCEL_ENV: 'production' }), {
    apiKey: 're_placeholder', from: 'Watch Assistant <watch@example.test>',
    baseUrl: 'https://watch.example/',
  });
});

test('Resend request includes text, HTML, and a deterministic idempotency key', async () => {
  const requests = [];
  const key = createNotificationIdempotencyKey({
    watchId: 'watch-1', userId: 'user-1', sourceEventId: 'event-1',
  });
  const result = await sendWithResend({
    apiKey: 're_not_real', from: 'Watch <watch@example.test>', to: 'owner@example.test',
    subject: 'Subject', html: '<p>HTML</p>', text: 'Text', idempotencyKey: key,
  }, { fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ id: 'provider-message-1' }) };
  } });

  assert.deepEqual(result, { id: 'provider-message-1' });
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  assert.equal(requests[0].options.headers['Idempotency-Key'], key);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    from: 'Watch <watch@example.test>', to: ['owner@example.test'],
    subject: 'Subject', html: '<p>HTML</p>', text: 'Text',
  });
  assert.equal(key, createNotificationIdempotencyKey({
    watchId: 'watch-1', userId: 'user-1', sourceEventId: 'event-1',
  }));
});

test('an indeterminate provider transport failure is normalized without response detail', async () => {
  await assert.rejects(sendWithResend({
    apiKey: 're_not_real', from: 'Watch <watch@example.test>', to: 'owner@example.test',
    subject: 'Subject', html: '<p>HTML</p>', text: 'Text', idempotencyKey: 'stable-key',
  }, { fetchImpl: async () => { throw new Error('socket token=secret'); } }), (error) => {
    assert.equal(error.code, 'EMAIL_DELIVERY_OUTCOME_UNKNOWN');
    assert.doesNotMatch(error.message, /socket|secret/u);
    return true;
  });
});
