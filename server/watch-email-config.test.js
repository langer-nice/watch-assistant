import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWatchEmailSender, safeEmailCode } from './watch-email-config.js';
import { getCompanyWatchEmailConfig, sendWithResend } from './company-watch-email.js';
import { getMediaWatchEmailConfig } from './media-watch-email.js';

const address = 'notifications@davidlangdesign.com';
for (const raw of [address, `<${address}>`, `Watch Assistant <${address}>`]) {
  test(`canonical sender from ${raw}`, async () => {
    const expected = `Watch Assistant <${address}>`;
    assert.equal(normalizeWatchEmailSender(raw), expected);
    const env = { WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true', MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true',
      VERCEL_ENV: 'production', RESEND_API_KEY: 'fake', WATCH_EMAIL_FROM: raw, WATCH_APP_BASE_URL: 'https://watch.example' };
    assert.equal(getCompanyWatchEmailConfig(env).from, expected);
    assert.deepEqual(getCompanyWatchEmailConfig(env), getMediaWatchEmailConfig(env));
    let calls = 0;
    await sendWithResend({ apiKey: 'fake', from: raw }, { fetchImpl: async (_, request) => {
      calls++; assert.equal(JSON.parse(request.body).from, expected);
      return { ok: true, json: async () => ({ id: 'accepted' }) };
    } });
    assert.equal(calls, 1);
  });
}
for (const raw of [undefined, '', 'invalid', '<invalid>', 'a@example.com', 'a..b@davidlangdesign.com',
  'Watch <a@davidlangdesign.com> extra', '<<a@davidlangdesign.com>>',
  'a@davidlangdesign.com\n', 'Watch\r\nBcc: private@example.test <a@davidlangdesign.com>',
  'a@davidlangdesign.com\0', 'a@davidlangdesign.com, b@davidlangdesign.com']) {
  test(`invalid sender is rejected (${JSON.stringify(raw)})`, async () => {
    assert.equal(normalizeWatchEmailSender(raw), null);
    await assert.rejects(sendWithResend({ apiKey: 'fake', from: raw }, {
      fetchImpl: async () => assert.fail('provider must not be called'),
    }), { code: 'EMAIL_CONFIGURATION_INVALID' });
  });
}
for (const [status, code] of [[422, 'EMAIL_PROVIDER_REJECTED_422'], [403, 'EMAIL_PROVIDER_REJECTED'],
  [429, 'EMAIL_RATE_LIMITED'], [503, 'EMAIL_PROVIDER_RETRYABLE'], [408, 'EMAIL_PROVIDER_RETRYABLE']]) {
  test(`provider HTTP ${status} has a safe classification`, async () => {
    await assert.rejects(sendWithResend({ apiKey: 'fake', from: address }, { fetchImpl: async () => ({
      ok: false, status, json: async () => ({ message: 'private@example.test secret' }),
    }) }), error => { assert.equal(error.code, code); assert.doesNotMatch(error.message, /private|secret/); return true; });
  });
}
test('unknown error codes cannot leak secrets or recipients', () => {
  assert.equal(safeEmailCode({ code: 'private@example.test API_SECRET' }), 'EMAIL_DELIVERY_FAILED');
});
test('malformed success response is an unknown outcome', async () => {
  await assert.rejects(sendWithResend({ apiKey: 'fake', from: address }, { fetchImpl: async () => ({
    ok: true, json: async () => ({ id: '' }),
  }) }), { code: 'EMAIL_DELIVERY_OUTCOME_UNKNOWN' });
});
