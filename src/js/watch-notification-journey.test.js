import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Home and All Watches derive unread presentation from persisted Updates', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const homeRenderer = source.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing/)?.[0] || '';
  const listRenderer = source.match(/const renderWatchList =[\s\S]*?const renderWatchDetail/)?.[0] || '';

  assert.match(homeRenderer, /getUnreadUpdates\(watch\)/);
  assert.match(homeRenderer, /getLatestUpdate\(watch\)/);
  assert.match(homeRenderer, /statuses\.new/);
  assert.match(listRenderer, /getUnreadUpdates\(watch\)\.length \? 'new' : 'updated'/);
});

test('Detail renders persisted history before marking only displayed unread Updates read', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const detailRenderer = source.match(/const renderWatchDetail =[\s\S]*?const scheduleFirstMonitoringPass/)?.[0]
    || source.match(/const renderWatchDetail =[\s\S]*?const resolveInitialHomeRoute/)?.[0]
    || '';
  const renderIndex = detailRenderer.indexOf('monitoringUpdatesListEl.innerHTML');
  const visibleIndex = detailRenderer.indexOf('monitoringUpdatesEl.hidden = monitoringUpdates.length === 0');
  const readIndex = detailRenderer.indexOf('queueMicrotask(() => markUpdatesAsRead(watch.id, readableUpdateIds))');

  assert.match(detailRenderer, /getWatchUpdates\(watch\)\.reverse\(\)/);
  assert.match(detailRenderer, /filter\(\(\{ status: updateStatus \}\) => updateStatus === 'new'\)/);
  assert.ok(renderIndex >= 0 && visibleIndex > renderIndex && readIndex > visibleIndex);
  assert.match(detailRenderer, /!detailCheckInProgress/);
  assert.match(detailRenderer, /!detailDeferredReadUpdateIds\.has\(getDeferredReadKey\(watch\.id, updateId\)\)/);
  assert.match(detailRenderer, /result\.matchedItems\.forEach/);
  assert.match(detailRenderer, /item\.sourceTitle \|\| item\.summary/);
  assert.match(detailRenderer, /formatMonitoringTimestamp\(item\.timestamp\)/);
  assert.match(detailRenderer, /1970-01-01T00:00:00\.000Z[\s\S]*?localizeField\(watch, 'latestChangeAt'\)/);
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
  assert.match(cardTest, /Home preserves the validated separator/);
  assert.match(cardTest, /All Watches renders at most one canonical Home-style update separator/);
});
