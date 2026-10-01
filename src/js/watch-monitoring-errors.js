const FAILURE_MESSAGE_KEYS = Object.freeze({
  missingSource: 'detail.checkFailure.missingSource',
  notFound: 'detail.checkFailure.notFound',
  accessDenied: 'detail.checkFailure.accessDenied',
  timeout: 'detail.checkFailure.timeout',
  unreadable: 'detail.checkFailure.unreadable',
  unreachable: 'detail.checkFailure.unreachable',
  temporary: 'detail.checkFailure.temporary',
  authentication: 'detail.checkFailure.authentication',
  duplicate: 'detail.checkFailure.duplicate',
  invalidIdentifier: 'detail.checkFailure.invalidIdentifier',
  persistence: 'detail.checkFailure.persistence',
  configuration: 'detail.checkFailure.configuration',
  currency: 'detail.checkFailure.currency',
  edited: 'detail.checkFailure.edited',
  generic: 'detail.checkFailed',
});

const FAILURE_CATEGORY_BY_CODE = new Map([
  ['STALE_CURRENCY_DATA', 'currency'],
  ['INVALID_CURRENCY_DATA', 'currency'],
  ['CURRENCY_PROVIDER_UNAVAILABLE', 'currency'],
  ['INVALID_CURRENCY_CRITERIA', 'currency'],
  ['STALE_CHECK', 'edited'],
  ['MISSING_FEED_URL', 'missingSource'],
  ['MISSING_SOURCE_URL', 'missingSource'],
  ['SOURCE_NOT_FOUND', 'notFound'],
  ['ACCESS_DENIED', 'accessDenied'],
  ['TIMEOUT', 'timeout'],
  ['UNSUPPORTED_CONTENT_TYPE', 'unreadable'],
  ['NOT_A_FEED', 'unreadable'],
  ['EMPTY_RESPONSE', 'unreadable'],
  ['EMPTY_FEED', 'unreadable'],
  ['UNSAFE_XML', 'unreadable'],
  ['MALFORMED_XML', 'unreadable'],
  ['RESPONSE_TOO_LARGE', 'unreadable'],
  ['INVALID_RESPONSE', 'unreadable'],
  ['DNS_FAILURE', 'unreachable'],
  ['NETWORK_ERROR', 'unreachable'],
  ['UPSTREAM_ERROR', 'unreachable'],
  ['TOO_MANY_REDIRECTS', 'unreachable'],
  ['INVALID_REDIRECT', 'unreachable'],
  ['CHECK_FAILED', 'temporary'],
  ['INTERNAL_ERROR', 'temporary'],
  ['AUTH_REQUIRED', 'authentication'],
  ['INVALID_SESSION', 'authentication'],
  ['ACTIVE_WATCH_EXISTS', 'duplicate'],
  ['INVALID_SIREN', 'invalidIdentifier'],
  ['DATABASE_ERROR', 'persistence'],
  ['ROLLBACK_FAILED', 'persistence'],
  ['SERVER_NOT_CONFIGURED', 'configuration'],
]);

export const getMonitoringFailureCategory = (code) => (
  FAILURE_CATEGORY_BY_CODE.get(code) || 'generic'
);

export const getMonitoringFailureMessageKey = (code) => (
  FAILURE_MESSAGE_KEYS[getMonitoringFailureCategory(code)]
);

export const MONITORING_FAILURE_CODES = Object.freeze(
  [...FAILURE_CATEGORY_BY_CODE.keys()],
);
