import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatHomeReportTimestamp,
  resolveHomeReportTimestamp,
} from './home-report-timestamp.js';
import { mapCompanyWatchRow } from '../../server/company-watch-repository.js';

const REPORT_TIMESTAMP = '2026-08-21T08:05:00.000Z';
const SERVER_CHECK_TIMESTAMP = '2026-08-21T10:07:00.000Z';

test('Home uses the latest real report or successful Watch check timestamp', () => {
  assert.equal(resolveHomeReportTimestamp({
    report: {
      completedAt: REPORT_TIMESTAMP,
      entries: [{ checkedAt: '2026-08-21T08:04:00.000Z' }],
    },
    watches: [{
      lastChecked: SERVER_CHECK_TIMESTAMP,
      lastCheckAttempt: {
        status: 'succeeded',
        attemptedAt: SERVER_CHECK_TIMESTAMP,
      },
    }],
  }), SERVER_CHECK_TIMESTAMP);
});

test('Home formats the same persisted timestamp in French and English', () => {
  const french = formatHomeReportTimestamp(SERVER_CHECK_TIMESTAMP, 'fr');
  const english = formatHomeReportTimestamp(SERVER_CHECK_TIMESTAMP, 'en');

  assert.match(french, /^ven\. 21 août · \d{2}:\d{2}$/u);
  assert.match(english, /^Fri 21 Aug · \d{2}:\d{2}$/u);
});

test('server Watch timestamp remains usable after a reload-style JSON round trip', () => {
  const persistedRow = {
    id: '00000000-0000-4000-8000-00000000000a',
    siren: '380129866',
    title: 'Orange',
    created_at: REPORT_TIMESTAMP,
    updated_at: SERVER_CHECK_TIMESTAMP,
    last_checked_at: SERVER_CHECK_TIMESTAMP,
    last_check_outcome: 'no-new-items',
    monitoring_state: 'monitoring',
    current_status: 'watching',
    company_watch_snapshots: [{
      checked_at: SERVER_CHECK_TIMESTAMP,
      item_ids: [],
      items: [],
    }],
  };
  const restoredWatches = JSON.parse(JSON.stringify([mapCompanyWatchRow(persistedRow)]));

  const restoredTimestamp = resolveHomeReportTimestamp({ watches: restoredWatches });
  assert.equal(restoredTimestamp, SERVER_CHECK_TIMESTAMP);
  assert.equal(
    formatHomeReportTimestamp(restoredTimestamp, 'fr'),
    formatHomeReportTimestamp(SERVER_CHECK_TIMESTAMP, 'fr'),
  );
});

test('Home exposes no timestamp only when every candidate is missing or unusable', () => {
  assert.equal(resolveHomeReportTimestamp(), null);
  assert.equal(resolveHomeReportTimestamp({
    report: { completedAt: 'not-a-date', entries: [{ checkedAt: '' }] },
    watches: [{
      lastChecked: null,
      monitoringSnapshot: { checkedAt: 'invalid' },
      lastCheckAttempt: { status: 'failed', attemptedAt: SERVER_CHECK_TIMESTAMP },
    }],
  }), null);
  assert.equal(formatHomeReportTimestamp(null, 'fr'), null);
  assert.equal(formatHomeReportTimestamp('invalid', 'en'), null);
});
