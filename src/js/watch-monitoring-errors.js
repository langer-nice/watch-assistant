const FAILURE_MESSAGE_KEYS = Object.freeze({
  missingSource: 'detail.checkFailure.missingSource',
  notFound: 'detail.checkFailure.notFound',
  accessDenied: 'detail.checkFailure.accessDenied',
  timeout: 'detail.checkFailure.timeout',
  unreadable: 'detail.checkFailure.unreadable',
  unreachable: 'detail.checkFailure.unreachable',
  temporary: 'detail.checkFailure.temporary',
  generic: 'detail.checkFailed',
});

const FAILURE_CATEGORY_BY_CODE = new Map([
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
