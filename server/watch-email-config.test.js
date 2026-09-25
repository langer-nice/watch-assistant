import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWatchEmailSender, parseAsciiEmailAddress, WATCH_EMAIL_ALLOWED_DOMAINS, safeEmailCode } from './watch-email-config.js';
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


test('address syntax is independent of the exact, immutable sender authorization policy', () => {
  assert.deepEqual(WATCH_EMAIL_ALLOWED_DOMAINS, ['davidlangdesign.com', 'watch.davidlangdesign.com']);
  assert.ok(Object.isFrozen(WATCH_EMAIL_ALLOWED_DOMAINS));
  assert.deepEqual(parseAsciiEmailAddress('Local.Part+tag@EXAMPLE.COM'), { localPart: 'Local.Part+tag', domain: 'example.com' });
  assert.equal(normalizeWatchEmailSender('Local.Part+tag@EXAMPLE.COM'), null);
  assert.deepEqual(parseAsciiEmailAddress('Local@WATCH.DavidLangDesign.COM'), { localPart: 'Local', domain: 'watch.davidlangdesign.com' });
});

for (const domain of WATCH_EMAIL_ALLOWED_DOMAINS) {
  test(`authorized domain ${domain} is preserved through both config readers and transport`, async () => {
    for (const raw of [`Local+tag@${domain}`, `<Local+tag@${domain.toUpperCase()}>`, `Product Alerts <Local+tag@${domain}>`]) {
      const expected = `${raw.startsWith('Product') ? 'Product Alerts' : 'Watch Assistant'} <Local+tag@${domain}>`;
      const env = { WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true', MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true',
        VERCEL_ENV: 'production', NODE_ENV: 'production', RESEND_API_KEY: 'fake',
        WATCH_EMAIL_FROM: raw, WATCH_APP_BASE_URL: 'https://watch.example' };
      assert.equal(normalizeWatchEmailSender(raw), expected);
      assert.equal(normalizeWatchEmailSender(expected), expected, 'normalization is idempotent');
      for (const getConfig of [getCompanyWatchEmailConfig, getMediaWatchEmailConfig]) {
        const config = getConfig(env);
        assert.equal(config.from, expected);
        let calls = 0;
        await sendWithResend(config, { fetchImpl: async (_, request) => {
          calls++;
          assert.equal(JSON.parse(request.body).from, expected);
          return { ok: true, json: async () => ({ id: 'mock-accepted' }) };
        } });
        assert.equal(calls, 1);
      }
    }
  });
}

const rejectedAddresses = [
  'a@watch.davidlangdesign.com.evil.example', 'a@davidlangdesign.com.evil.example',
  'a@other.davidlangdesign.com', 'a@other.watch.davidlangdesign.com',
  'a@watch.davidlangdesign.com.', 'a@watch..davidlangdesign.com',
  'a@-watch.davidlangdesign.com', 'a@watch-.davidlangdesign.com', 'a@watch_.davidlangdesign.com',
  'a@@watch.davidlangdesign.com', 'a@b@watch.davidlangdesign.com', '@watch.davidlangdesign.com', 'a@',
  'a b@watch.davidlangdesign.com', 'a@ watch.davidlangdesign.com', 'a @watch.davidlangdesign.com',
  '.a@watch.davidlangdesign.com', 'a.@watch.davidlangdesign.com', 'a..b@watch.davidlangdesign.com',
  ...unicodeAddresses.map(value => value.replace('@', '@watch.')),
  `${'a'.repeat(65)}@watch.davidlangdesign.com`,
];
for (const [index, address] of rejectedAddresses.entries()) {
  test(`sender policy rejects unsafe or unauthorized address ${index + 1}`, async () => {
    for (const raw of [address, `<${address}>`, `Watch Assistant <${address}>`]) {
      assert.equal(normalizeWatchEmailSender(raw), null);
      await assert.rejects(sendWithResend({ apiKey: 'fake', from: raw }, {
        fetchImpl: async () => assert.fail('invalid sender must not reach the provider'),
      }), { code: 'EMAIL_CONFIGURATION_INVALID' });
    }
  });
}

test('all ASCII controls and DEL are rejected in the name, address and surrounding input', () => {
  for (const code of [...Array(32).keys(), 127]) {
    const c = String.fromCharCode(code);
    for (const raw of [`${c}a@watch.davidlangdesign.com`, `a${c}@watch.davidlangdesign.com`,
      `a@watch.davidlangdesign.com${c}`, `Watch${c} Assistant <a@watch.davidlangdesign.com>`]) {
      assert.equal(normalizeWatchEmailSender(raw), null);
    }
  }
});

test('ASCII parser rejects malformed domains and invalid lengths before authorization', () => {
  for (const address of ['a@', '@example.com', 'a@@example.com', 'a@a..com', 'a@example.com.',
    'a@-label.com', 'a@label-.com', 'a@under_score.com', `a@${'x'.repeat(64)}.com`,
    `${'x'.repeat(65)}@example.com`, `x@${Array(5).fill('x'.repeat(60)).join('.')}`,
    ' a@example.com', 'a@example.com ', 'a@exämple.com']) assert.equal(parseAsciiEmailAddress(address), null);
  assert.ok(parseAsciiEmailAddress(`${'x'.repeat(64)}@example.com`));
});

for (const [getConfig, flag] of [[getMediaWatchEmailConfig, 'MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED'],
  [getCompanyWatchEmailConfig, 'WATCH_EMAIL_NOTIFICATIONS_ENABLED']]) {
  test(`${flag} retains missing, disabled and non-production configuration gates`, () => {
    const valid = { [flag]: 'true', VERCEL_ENV: 'production', NODE_ENV: 'production',
      RESEND_API_KEY: 'fake', WATCH_EMAIL_FROM: 'watch@watch.davidlangdesign.com', WATCH_APP_BASE_URL: 'https://watch.example' };
    assert.ok(getConfig(valid));
    for (const patch of [{ [flag]: undefined }, { [flag]: 'false' }, { [flag]: 'TRUE' },
      { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { VERCEL_ENV: undefined }, { NODE_ENV: 'test' },
      { RESEND_API_KEY: undefined }, { RESEND_API_KEY: 'bad key' }, { WATCH_EMAIL_FROM: undefined },
      { WATCH_APP_BASE_URL: undefined }, { WATCH_APP_BASE_URL: 'http://watch.example' }]) {
      assert.equal(getConfig({ ...valid, ...patch }), null);
    }
  });
}
