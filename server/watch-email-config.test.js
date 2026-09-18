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

const unicodeAddresses = [
  'teſt@davidlangdesign.com', 'test@davidlangdeſign.com',
  'teıt@davidlangdesign.com', 'test@davıdlangdesign.com',
  'K@davidlangdesign.com', 'test@davidlangdesiKn.com',
  'tеst@davidlangdesign.com', 'test@dаvidlangdesign.com', // Cyrillic e/a
  'tεst@davidlangdesign.com', 'test@davidlangdεsign.com', // Greek epsilon
  'te\u00a0st@davidlangdesign.com', 'test@davidlang\u00a0design.com',
  'te\u200bst@davidlangdesign.com', 'test@davidlang\u200bdesign.com',
  'test\u00a0@davidlangdesign.com', 'test@\u200bdavidlangdesign.com',
  '\u00a0test@davidlangdesign.com', 'test@davidlangdesign.com\u00a0',
  '\ufefftest@davidlangdesign.com', 'test＠davidlangdesign.com',
];
for (const [index, invalidAddress] of unicodeAddresses.entries()) {
  test(`Unicode address case ${index + 1} is rejected in every supported structure`, async () => {
    for (const raw of [invalidAddress, `<${invalidAddress}>`, `Watch Assistant <${invalidAddress}>`]) {
      assert.equal(normalizeWatchEmailSender(raw), null);
      const env = { WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true', MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true',
        VERCEL_ENV: 'production', RESEND_API_KEY: 'fake', WATCH_EMAIL_FROM: raw, WATCH_APP_BASE_URL: 'https://watch.example' };
      assert.equal(getCompanyWatchEmailConfig(env), null);
      assert.equal(getMediaWatchEmailConfig(env), null);
      await assert.rejects(sendWithResend({ apiKey: 'fake', from: raw }, {
        fetchImpl: async () => assert.fail('Unicode must never reach Resend'),
      }), error => {
        assert.equal(error.code, 'EMAIL_CONFIGURATION_INVALID');
        assert.doesNotMatch(error.message, /@|fake/); return true;
      });
    }
  });
}
for (const [raw, expected] of [
  ['Test@DAVIDLANGDESIGN.COM', 'Watch Assistant <Test@davidlangdesign.com>'],
  ['<Test@DavidLangDesign.com>', 'Watch Assistant <Test@davidlangdesign.com>'],
  ['Watch Assistant <Test@DAVIDLANGDESIGN.COM>', 'Watch Assistant <Test@davidlangdesign.com>'],
  ['Product Alerts <Test@DAVIDLANGDESIGN.COM>', 'Product Alerts <Test@davidlangdesign.com>'],
  ['  test@davidlangdesign.com  ', 'Watch Assistant <test@davidlangdesign.com>'],
]) {
  test(`ASCII sender behavior preserved: ${raw}`, () => {
    assert.equal(normalizeWatchEmailSender(raw), expected);
  });
}
test('strict structure still rejects multiple separators, comments, empty local parts and malformed brackets', () => {
  for (const raw of ['test@@davidlangdesign.com', '@davidlangdesign.com',
    '(comment) test@davidlangdesign.com', 'test@davidlangdesign.com (comment)',
    '<test@davidlangdesign.com', 'test@davidlangdesign.com>',
    'Watch Assistant <test@davidlangdesign.com> trailing',
    'Watch\rBcc: hidden <test@davidlangdesign.com>']) {
    assert.equal(normalizeWatchEmailSender(raw), null);
  }
});
