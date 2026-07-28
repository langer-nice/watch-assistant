import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getMonitoringFailureCategory,
  getMonitoringFailureMessageKey,
  MONITORING_FAILURE_CODES,
} from './watch-monitoring-errors.js';

const expectedCategories = {
  MISSING_FEED_URL: 'missingSource',
  MISSING_SOURCE_URL: 'missingSource',
  SOURCE_NOT_FOUND: 'notFound',
  ACCESS_DENIED: 'accessDenied',
  TIMEOUT: 'timeout',
  UNSUPPORTED_CONTENT_TYPE: 'unreadable',
  NOT_A_FEED: 'unreadable',
  EMPTY_RESPONSE: 'unreadable',
  EMPTY_FEED: 'unreadable',
  UNSAFE_XML: 'unreadable',
  MALFORMED_XML: 'unreadable',
  RESPONSE_TOO_LARGE: 'unreadable',
  INVALID_RESPONSE: 'unreadable',
  DNS_FAILURE: 'unreachable',
  NETWORK_ERROR: 'unreachable',
  UPSTREAM_ERROR: 'unreachable',
  TOO_MANY_REDIRECTS: 'unreachable',
  INVALID_REDIRECT: 'unreachable',
  CHECK_FAILED: 'temporary',
  INTERNAL_ERROR: 'temporary',
};

test('every supported monitoring failure code maps to its reliable category', () => {
  assert.deepEqual([...MONITORING_FAILURE_CODES].sort(), Object.keys(expectedCategories).sort());
  for (const [code, category] of Object.entries(expectedCategories)) {
    assert.equal(getMonitoringFailureCategory(code), category);
    assert.equal(getMonitoringFailureMessageKey(code), `detail.checkFailure.${category}`);
  }
});

test('unknown and raw provider errors use only the safe generic fallback', () => {
  for (const code of [undefined, null, '', 'PRIVATE_STACK', 'HTTP_520 secret.internal']) {
    assert.equal(getMonitoringFailureCategory(code), 'generic');
    assert.equal(getMonitoringFailureMessageKey(code), 'detail.checkFailed');
  }
});

test('English and French failure explanations are complete, actionable and non-technical', async () => {
  const [englishSource, frenchSource] = await Promise.all([
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);
  const locales = [JSON.parse(englishSource).detail, JSON.parse(frenchSource).detail];
  const categories = [...new Set(Object.values(expectedCategories))];

  for (const detail of locales) {
    assert.ok(detail.checkFailedStatus);
    assert.ok(detail.checkFailed);
    for (const category of categories) {
      const message = detail.checkFailure[category];
      assert.ok(message?.length > 25, `${category} should have a useful explanation`);
      assert.doesNotMatch(message, /\b(?:RSS|Atom|feed|flux|HTTP|stack|exception|status code)\b/i);
    }
  }
});
