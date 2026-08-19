import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Home and All Watches derive Updated presentation from persisted Updates', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const sharedRenderer = source.match(/const getSummaryCardStatus =[\s\S]*?const renderHomeWatchCards/)?.[0] || '';
  const homeRenderer = source.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing/)?.[0] || '';
  const listRenderer = source.match(/const renderWatchList =[\s\S]*?const renderWatchDetail/)?.[0] || '';

  assert.match(homeRenderer, /getLatestUpdate\(watch\)/);
  assert.match(sharedRenderer, /getWatchStatusPresentation\(status, t\)/);
  assert.doesNotMatch(homeRenderer, /statuses\.new/);
  assert.match(listRenderer, /const status = statusById\.get\(watch\.id\)/);
});

test('Detail acknowledges only the latest unread Update and retains persisted history', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const detailRenderer = source.match(/const renderWatchDetail =[\s\S]*?const scheduleFirstMonitoringPass/)?.[0]
    || source.match(/const renderWatchDetail =[\s\S]*?const resolveInitialHomeRoute/)?.[0]
    || '';
  const renderIndex = detailRenderer.indexOf('monitoringUpdatesListEl.innerHTML');
  const visibleIndex = detailRenderer.indexOf('monitoringUpdatesEl.hidden = monitoringUpdates.length === 0');

  assert.match(detailRenderer, /getWatchUpdates\(watch\)\.reverse\(\)/);
  assert.match(detailRenderer, /acknowledgeLatestWatchUpdate\(watch\.id\)/);
  assert.match(detailRenderer, /refreshLatestReport\(\{ watches: getWatches\(\) \}\)/);
  assert.match(detailRenderer, /getCanonicalWatchClassification\(watch,[\s\S]*?getSummaryCardStatus\(classification\)[\s\S]*?status-label--\$\{presentation\.modifier\}/);
  assert.match(detailRenderer, /getWatchJourneyEvents\(watch,[\s\S]*?latestMeaningfulUpdate\?\.status === 'new'/);
  assert.match(detailRenderer, /filter\(\(\{ status: updateStatus \}\) => updateStatus === 'new'\)/);
  assert.ok(renderIndex >= 0 && visibleIndex > renderIndex);
  assert.doesNotMatch(detailRenderer, /markUpdatesAsRead\(/);
  assert.match(detailRenderer, /result\.matchedItems\.forEach/);
  assert.match(detailRenderer, /item\.sourceTitle \|\| item\.summary/);
  assert.match(detailRenderer, /formatMonitoringTimestamp\(item\.timestamp\)/);
  assert.doesNotMatch(detailRenderer, /1970-01-01T00:00:00\.000Z/);
});

test('notification journey keeps validated separators and responsive detail styles intact', async () => {
  const [navigation, detailStyles, cardTest] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../scss/pages/_watch-detail.scss', import.meta.url), 'utf8'),
    readFile(new URL('./watch-card-navigation.test.js', import.meta.url), 'utf8'),
  ]);

  assert.match(navigation, /getUpdatedSeparatorWatchId\(/);
  assert.match(detailStyles, /@media \(min-width:/);
  assert.match(detailStyles, /\.monitoring-updates > ul/);
  assert.match(cardTest, /Home keeps fixed priority/);
  assert.match(cardTest, /All Watches renders at most one canonical Home-style update separator/);
});
