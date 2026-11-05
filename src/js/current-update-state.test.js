import test from 'node:test';
import assert from 'node:assert/strict';
import { mapMediaReportRow } from './media-watch-row.js';
import { buildStoredReport } from './report-snapshot.js';
import { getCanonicalWatchClassification } from './report-status.js';
import { selectHomeReport } from './home-report.js';
import { groupWatches } from './watch-grouping.js';
import { HOME_SORT_MODES, orderAllWatchGroups, sortHomeWatches } from './home-watch-order.js';
import { getWatchUpdates, getUnreadUpdates, markUpdateAsRead } from './watch-updates.js';

const reportAt = '2026-11-05T07:01:00Z';
const checkedAt = '2026-11-05T06:35:40Z';
const watchFixture = (id, title, developmentAt, alert = false) => mapMediaReportRow({
  id, title,
  created_at: '2026-11-01T12:00:00Z',
  watch_definition: { category: 'news' },
  monitoring_source: { url: 'https://example.test/feed' },
  monitoring_state: 'monitoring',
  current_status: alert ? 'updated' : 'watching',
  last_checked_at: checkedAt,
  last_check_outcome: alert ? 'matching-items' : 'no-new-items',
  last_change_item_id: developmentAt ? `development-${id}` : null,
  last_change_title: 'A verified development',
  last_change_url: `https://example.test/${id}`,
  media_last_change_detected_at: developmentAt,
}, 'fixture-owner');

const watches = [
  watchFixture('taylor', 'Taylor Swift', '2026-11-03T06:35:39Z'),
  watchFixture('gucci', 'Gucci / Prada', checkedAt, true),
  watchFixture('france', 'France protests and social movements', '2026-11-03T14:29:56Z'),
  watchFixture('elections', 'French elections', checkedAt, true),
  watchFixture('city', 'Manchester City', checkedAt, true),
];
const classification = watch => getCanonicalWatchClassification(watch, { now: new Date(reportAt) });

test('the five row shapes yield three current updates and preserve historical unread developments', () => {
  const report = buildStoredReport({
    watches, ownerId: 'fixture-owner', id: 'report',
    startedAt: '2026-11-05T07:00:00Z', completedAt: reportAt,
  });
  const home = selectHomeReport({ report, watches, now: new Date(reportAt) });
  assert.equal(home.totalChecked, 5);
  assert.deepEqual(home.updatedWatches.map(({ id }) => id), ['gucci', 'elections', 'city']);
  for (const [index, watch] of watches.entries()) {
    const alert = watch.status === 'updated';
    const entry = report.entries[index];
    assert.equal(classification(watch), alert ? 'updated' : 'watching', watch.title);
    assert.equal(entry.classification, classification(watch), watch.title);
    assert.equal(entry.outcome, alert ? 'matching-items' : 'no-new-items');
    assert.deepEqual(entry.resultIds, alert ? [`development-${watch.id}`] : []);
    assert.equal(getWatchUpdates(watch)[0].id, `development-${watch.id}`);
    assert.equal(getUnreadUpdates(watch).length, 1);
  }
});

test('acknowledging a current development still clears its badge and retains its history', () => {
  const current = watches[1];
  const read = markUpdateAsRead(current, 'development-gucci');
  assert.equal(classification(read), 'watching');
  assert.equal(getWatchUpdates(read)[0].status, 'read');
  assert.equal(classification(current), 'updated');
});

test('Most recent renders a global order across status groups, with a quiet check fallback and stable ties', () => {
  const quiet = watchFixture('quiet', 'Quiet Watch', null);
  const input = [...watches, quiet];
  const mode = HOME_SORT_MODES.MOST_RECENT;
  const groups = groupWatches(input, {
    now: new Date(reportAt),
    getMeaningfulUpdate: watch => classification(watch) === 'updated' ? 'development' : '',
  });
  assert.equal(groups.length, 2);
  const orderedWatches = sortHomeWatches(input, { mode, getStatus: classification });
  const visible = orderAllWatchGroups(groups, { mode, orderedWatches })
    .flatMap(group => group.watches.map(({ id }) => id));
  assert.deepEqual(visible, ['city', 'elections', 'gucci', 'quiet', 'france', 'taylor']);
  assert.deepEqual(sortHomeWatches([...input].reverse(), { mode }).map(({ id }) => id), visible);
});
