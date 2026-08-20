import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('application surfaces retain report storage and canonical status integration', async () => {
  const [navigation, home, detail, storage] = await Promise.all([
    read('./navigation.js'),
    read('../../index.html'),
    read('../../watch-detail.html'),
    read('./report-storage.js'),
  ]);
  assert.match(navigation, /const report = getLatestReport\(\)/);
  assert.doesNotMatch(navigation, /getReportById|searchParams\.get\('report'\)/);
  assert.match(navigation, /getCanonicalStatusMap\(watches, reports\)/);
  assert.match(navigation, /getWatchDetailPresentationSnapshot\(watch, \{[\s\S]*?reports: getReports\(\)/);
  assert.doesNotMatch(navigation, /queueMicrotask\(\(\) => markUpdatesAsRead/);
  assert.match(storage, /REPORTS_STORAGE_KEY = 'watchAssistant\.reports\.v1'/);
  assert.match(storage, /export const getReportById/);
  assert.match(home, /id="homeGenerateReport"/);
  assert.match(detail, /id="watchCanonicalStatus"/);
});

test('Home presents Generate report as a lightweight refresh icon beside the timestamp', async () => {
  const [home, styles] = await Promise.all([
    read('../../index.html'),
    read('../scss/pages/_home.scss'),
  ]);
  assert.match(home, /briefing-summary__masthead-meta[\s\S]*homeBriefingDate[\s\S]*class="briefing-summary__generate"[\s\S]*data-i18n-aria-label="home\.generateReport"[\s\S]*data-i18n-title="home\.generateReport"[\s\S]*<svg/);
  assert.doesNotMatch(home, /report-controls|button--secondary briefing-summary__generate|data-i18n="home\.generateReport"/);
  assert.match(styles, /\.briefing-summary__generate \{[\s\S]*width: 2\.75rem;[\s\S]*height: 2\.75rem;[\s\S]*background: var\(--color-transparent\);[\s\S]*box-shadow: none;/);
  assert.match(styles, /\.briefing-summary__generate:hover,[\s\S]*\.briefing-summary__generate:focus-visible/);
  assert.match(styles, /\.briefing-summary__generate:active/);
  assert.match(styles, /\.briefing-summary__generate\[aria-busy='true'\] svg[\s\S]*home-report-refresh-spin/);
  assert.match(styles, /@media \(max-width: 32rem\)[\s\S]*briefing-summary__masthead-meta[\s\S]*flex-wrap: wrap/);
});

test('Home blocks interaction and exposes accessible progress, success, and retry states', async () => {
  const [navigation, home, styles] = await Promise.all([
    read('./navigation.js'),
    read('../../index.html'),
    read('../scss/pages/_home.scss'),
  ]);
  assert.match(home, /<dialog[\s\S]*id="homeReportProgress"[\s\S]*aria-modal="true"[\s\S]*aria-labelledby="homeReportProgressMessage"/);
  assert.match(home, /homeReportProgressMessage[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(home, /id="homeReportProgressRetry"[\s\S]*data-i18n="home\.reportTryAgain"/);
  assert.match(home, /id="homeReportProgressClose"[\s\S]*data-i18n="home\.reportClose"/);
  assert.doesNotMatch(home, /homeReportAttemptSummary|homeReportHistory|homeReportHistoryList/);
  assert.doesNotMatch(navigation, /reportAttemptCounts|reportHistoryCounts|homeReportAttemptSummary|homeReportHistory/);
  assert.match(navigation, /toggleAttribute\('aria-busy', generating\)/);
  assert.match(navigation, /setAttribute\('aria-label', generateLabel\)[\s\S]*setAttribute\('title', generateLabel\)/);
  assert.match(navigation, /if \(isReportGenerationInProgress\(\) \|\| homeReportProgressState === 'loading'/);
  assert.match(navigation, /dialog\.showModal\(\)/);
  assert.match(navigation, /successIcon\?\.toggleAttribute\('hidden', state !== 'success'\)/);
  assert.match(navigation, /setHomeReportProgressState\('success'\)[\s\S]*HOME_REPORT_READY_DURATION_MS[\s\S]*closeHomeReportProgress/);
  assert.match(navigation, /setHomeReportProgressState\('error'\)[\s\S]*retryButton\?\.focus/);
  assert.match(navigation, /dialog\.addEventListener\('cancel'[\s\S]*homeReportProgressState === 'error'/);
  assert.match(navigation, /window\.scrollTo\(0, homeReportProgressScrollY\)[\s\S]*homeGenerateReport/);
  assert.match(styles, /\.home-report-progress \{[\s\S]*height: 100dvh;[\s\S]*background:/);
  assert.match(styles, /body\.is-home-report-progress-open[\s\S]*position: fixed;[\s\S]*overflow: hidden/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.home-report-progress[\s\S]*transition: none;[\s\S]*\.home-report-progress__spinner[\s\S]*animation: none/);
  assert.doesNotMatch(navigation, /searchParams\.set\('report'|index\.html\?report=/);
});

test('English and French retain only the user-facing report generation vocabulary', async () => {
  const [en, fr] = await Promise.all([
    read('../locales/en.json').then(JSON.parse),
    read('../locales/fr.json').then(JSON.parse),
  ]);
  const visibleKeys = [
    'generateReport', 'generatingReport', 'reportGenerating', 'reportReady',
    'reportGenerationError', 'reportTryAgain', 'reportClose',
  ];
  visibleKeys.forEach((key) => {
    assert.equal(typeof en.home[key], 'string');
    assert.equal(typeof fr.home[key], 'string');
    assert.notEqual(en.home[key], fr.home[key]);
  });
  assert.equal(en.home.generateReport, 'Generate report');
  assert.equal(fr.home.generateReport, 'Générer le rapport');
  ['reportHistory', 'latestReport', 'reportHistoryCounts', 'reportAttemptCounts'].forEach((key) => {
    assert.equal(key in en.home, false);
    assert.equal(key in fr.home, false);
  });
});
