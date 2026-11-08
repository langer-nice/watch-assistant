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


test('automatic morning title survives viewing time, reload and language changes independently of greeting/timestamp', async () => {
  const { readFile } = await import('node:fs/promises');
  const { register } = await import('node:module');
  register('./test-support/json-module-loader.js', import.meta.url);
  const { t, setLanguage, getLanguage } = await import('./i18n.js');
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const heading = source.slice(source.indexOf('  const currentHour ='), source.indexOf('  if (checkedSummary) {'));
  const timestampStart = source.indexOf('  if (briefingDate) {\n    briefingDate.hidden');
  const timestamp = source.slice(timestampStart, source.indexOf('\n  const {', timestampStart));
  assert.ok(heading.includes('home.namedGreetings'));assert.ok(timestamp.includes('resolveHomeReportTimestamp'));
  const renderHeading = new Function('Date','homeReport','briefLabel','greeting','getProfileFirstName','homeGreetingAuth','t', heading);
  const renderTimestamp = new Function('briefingDate','reportHeader','homeReport','resolveHomeReportTimestamp','formatHomeReportTimestamp','getLanguage','t','escapeHtml', timestamp);
  const oldDocument = globalThis.document;
  const briefLabel = { dataset: { i18n: 'home.briefLabels.morning' }, textContent: '' };
  const greeting = { textContent: '' };
  globalThis.document = { documentElement: {}, dispatchEvent() {},
    querySelectorAll: selector => selector === '[data-i18n]' ? [briefLabel] : [] };
  try {
    for (const origin of ['automatic', 'manual', null]) {
      const report = origin ? { origin, completedAt: '2026-11-08T07:01:00.000Z' } : null;
      for (const name of ['David', null]) {
        for (const language of ['en', 'fr', 'en']) {
          setLanguage(language, { persist: false });
          // A language switch also translates the previously selected title key.
          if (origin === 'automatic' && briefLabel.dataset.i18n === 'home.briefLabels.morning') {
            assert.equal(briefLabel.textContent, language === 'fr' ? 'Rapport du matin' : 'Morning Brief');
          }
          let originalTimestamp;
          for (const [hour, daypart] of [[9, 'morning'], [12, 'afternoon'], [20, 'evening']]) {
            const homeReport = { report: JSON.parse(JSON.stringify(report)) }; // reload-style restoration
            renderHeading(class { getHours() { return hour; } }, homeReport, briefLabel, greeting, () => name, null, t);
            assert.equal(briefLabel.dataset.i18n, `home.briefLabels.${origin === 'automatic' ? 'morning' : daypart}`);
            assert.equal(briefLabel.textContent, t(briefLabel.dataset.i18n));
            if (origin === 'automatic') assert.equal(briefLabel.textContent, language === 'fr' ? 'Rapport du matin' : 'Morning Brief');
            assert.equal(greeting.textContent, t(`home.${name ? 'namedGreetings' : 'greetings'}.${daypart}`, name ? { name } : {}));
            const briefingDate = { removeAttribute(key) { delete this[key]; } };
            renderTimestamp(briefingDate, { hideTimestamp: !report }, homeReport, resolveHomeReportTimestamp, formatHomeReportTimestamp, getLanguage, t, value => value);
            assert.equal(briefingDate.dateTime, report?.completedAt);
            if (originalTimestamp === undefined) originalTimestamp = briefingDate.innerHTML;
            assert.equal(briefingDate.innerHTML, originalTimestamp);
            assert.equal(briefingDate.hidden, !report);
          }
        }
      }
    }
  } finally { globalThis.document = oldDocument; }
});
