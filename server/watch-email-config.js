// Exact authorization policy, shared by config readers and the transport guard.
// No wildcard or implicit subdomain authorization. Changes require code review.
export const WATCH_EMAIL_ALLOWED_DOMAINS = Object.freeze([
  'davidlangdesign.com',
  'watch.davidlangdesign.com',
]);

const isValidLocalPart = (localPart) => localPart.length <= 64
  && /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u.test(localPart);

const isValidDomain = (domain) => domain.length <= 253
  && domain.split('.').every((label) => label.length <= 63
    && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(label));

/** Parse an ASCII addr-spec, without display name or surrounding whitespace.
 * Returns null on invalid syntax; otherwise preserves local-part case and
 * canonicalizes only ASCII domain case. Syntax does not grant authorization.
 */
export const parseAsciiEmailAddress = (address) => {
  if (typeof address !== 'string' || address.length > 254 || /[^\x21-\x7e]/u.test(address)) return null;
  const parts = address.split('@');
  if (parts.length !== 2) return null;
  const [localPart, domain] = parts;
  if (!isValidLocalPart(localPart) || !isValidDomain(domain)) return null;
  return { localPart, domain: domain.toLowerCase() };
};

// Deliberately conservative mailbox grammar: bare, <address>, or Name <address>.
// Preserve a valid display name, or use the established default; never repair input.
export const normalizeWatchEmailSender = (value) => {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/u.test(value)) return null;
  const raw = value.replace(/^ +| +$/gu, '');
  const match = /^(?:([A-Za-z0-9][A-Za-z0-9 .'-]{0,99}) )?<([^<>\s]+)>$/u.exec(raw);
  const address = parseAsciiEmailAddress(match ? match[2] : raw);
  if (!address || !WATCH_EMAIL_ALLOWED_DOMAINS.includes(address.domain)) return null;
  return `${match?.[1] || 'Watch Assistant'} <${address.localPart}@${address.domain}>`;
};

export const emailNotificationsEnabled = (env, flag) => env?.[flag] === 'true'
  && env?.VERCEL_ENV === 'production' && env?.NODE_ENV !== 'test';

export const getWatchEmailConfig = (env, flag) => {
  if (!emailNotificationsEnabled(env, flag)) return null;
  const apiKey = typeof env?.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
  const from = normalizeWatchEmailSender(env?.WATCH_EMAIL_FROM);
  if (!apiKey || /\s/u.test(apiKey) || !from) return null;
  try {
    const url = new URL(env?.WATCH_APP_BASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.pathname = url.pathname.replace(/\/$/u, ''); url.search = ''; url.hash = '';
    return { apiKey, from, baseUrl: url.href };
  } catch { return null; }
};

const SAFE_CODES = new Set(['DATABASE_ERROR', 'RECIPIENT_UNVERIFIED', 'RECIPIENT_LOCALE_UNAVAILABLE',
  'INVALID_ARTICLE_URL', 'INVALID_APP_URL', 'EMAIL_PROVIDER_ERROR', 'EMAIL_RATE_LIMITED',
  'EMAIL_PROVIDER_RETRYABLE', 'EMAIL_PROVIDER_REJECTED_422', 'EMAIL_PROVIDER_REJECTED',
  'EMAIL_CONFIGURATION_INVALID', 'EMAIL_DELIVERY_OUTCOME_UNKNOWN', 'MEDIA_DEADLINE_EXCEEDED']);
export const safeEmailCode = (error) => SAFE_CODES.has(error?.code) ? error.code : 'EMAIL_DELIVERY_FAILED';
export const definiteProviderFailure = (code) => ['EMAIL_PROVIDER_ERROR', 'EMAIL_RATE_LIMITED',
  'EMAIL_PROVIDER_RETRYABLE', 'EMAIL_PROVIDER_REJECTED_422', 'EMAIL_PROVIDER_REJECTED'].includes(code);
export const emailFailureCounts = () => ({ claimedCount: 0, submittedCount: 0, retryableFailureCount: 0,
  permanentFailureCount: 0, configurationFailureCount: 0, unknownOutcomeCount: 0, persistenceFailureCount: 0 });
export const countEmailFailure = (counts, code) => {
  if (code === 'EMAIL_CONFIGURATION_INVALID') counts.configurationFailureCount += 1;
  else if (['EMAIL_RATE_LIMITED', 'EMAIL_PROVIDER_RETRYABLE'].includes(code)) counts.retryableFailureCount += 1;
  else if (code === 'EMAIL_DELIVERY_OUTCOME_UNKNOWN') counts.unknownOutcomeCount += 1;
  else counts.permanentFailureCount += 1;
};
export const unavailableEmailResult = (env, flag) => {
  const invalid = emailNotificationsEnabled(env, flag);
  return { status: invalid ? 'configuration-failed' : 'disabled', pendingCount: 0, sentCount: 0,
    failedCount: 0, skippedCount: 0, ...emailFailureCounts(), configurationFailureCount: invalid ? 1 : 0,
    ...(invalid ? { errorCode: 'EMAIL_CONFIGURATION_INVALID' } : {}) };
};
