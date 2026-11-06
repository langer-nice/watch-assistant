import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHomeReport } from './home-report.js';
import { getCanonicalWatchClassification } from './report-status.js';
import { markUpdateAsRead } from './watch-updates.js';

const morning = '2026-11-06T06:35:00Z';
const later = '2026-11-06T07:59:00Z';
const now = new Date('2026-11-06T08:00:00Z');
const update = (id, timestamp) => ({ id, timestamp, status: 'new', summary: `Development ${id}` });
const watch = (id, updates = [], failed = false) => ({
  id, title: id, category: 'news', status: 'watching', updates,
  createdAt: id === 'nice' ? '2026-11-05T17:05:56Z' : '2026-10-31T12:00:00Z',
  lastChecked: later, lastCheckOutcome: { type: 'no-new-items' },
  lastCheckAttempt: { status: failed ? 'failed' : 'succeeded', attemptedAt: later },
});
const entry = (watchId, development, checkedAt = morning, failed = false) => ({
  watchId, title: watchId, checkedAt, classification: failed ? 'attention' : development ? 'updated' : 'watching',
  attemptStatus: failed ? 'failed' : 'succeeded',
  outcome: failed ? 'failed' : development ? 'matching-items' : 'no-new-items',
  summary: development?.summary, resultIds: development ? [development.id] : [],
});
const report = (origin, completedAt, entries) => ({
  id: origin + completedAt, origin, completedAt, partial: entries.some(e => e.attemptStatus === 'failed'),
  attempts: entries.map(e => ({ watchId: e.watchId, status: e.attemptStatus })),
  entries,
});
const view = (reports, watches, options = {}) => selectHomeReport({
  reports, watches, now, timeZone: 'Europe/Paris', watchListAvailability: { active: true }, ...options,
});

test('6 Nov scheduled results remain visible across a manual refresh, reading and later NO_ALERT', () => {
  const city = update('city-morning', morning);
  const elections = update('elections-morning', morning);
  const taylor = update('taylor-morning', morning);
  const followup = update('taylor-later', later);
  const automatic = report('automatic', '2026-11-06T07:01:00Z', [
    entry('city', city), entry('elections', elections), entry('taylor', taylor), entry('nice', null, morning, true),
  ]);
  const manual = report('manual', later, [
    entry('city', null, later), entry('elections', null, later), entry('taylor', followup, later), entry('nice', null, later, true),
  ]);
  const cityWatch = markUpdateAsRead(watch('city', [city]), city.id);
  const taylorWatch = watch('taylor', [taylor, followup]);
  const watches = [cityWatch, watch('elections'), taylorWatch, watch('nice', [], true)];
  const before = structuredClone([automatic, manual, watches]);
  const result = view([manual, automatic], watches);
  assert.deepEqual(result.report, automatic);
  assert.equal(result.report.partial, true);
  assert.deepEqual(result.updatedWatches.map(w => [w.id, w.reportSummary]), [
    ['city', city.summary], ['elections', elections.summary], ['taylor', followup.summary],
  ]);
  assert.equal(getCanonicalWatchClassification(cityWatch, { now }), 'watching');
  assert.equal(cityWatch.updates[0].status, 'read');
  assert.deepEqual(result.updatedWatches.map(w => [w.briefUpdateId, w.briefUpdateRead]), [
    [city.id, true], [elections.id, false], [followup.id, false],
  ]);
  assert.equal(result.failureCount, 1);
  assert.deepEqual([...result.failedIds], ['nice']);
  assert.equal(taylorWatch.updates.length, 2);
  assert.equal(result.statusById.get('nice'), 'attention');
  assert.equal(result.totalChecked, 3);
  assert.deepEqual([automatic, manual, watches], before);
});

test('a live manual alert can join a quiet automatic report even if read before Home renders', () => {
  const automatic = report('automatic', '2026-11-06T07:01:00Z', [entry('nice')]);
  const development = update('newer', '2026-11-06T13:00:00Z');
  const fresh = markUpdateAsRead(watch('nice', [development]), development.id);
  const result = view([automatic], [fresh], { now: new Date('2026-11-06T14:00:00Z') });
  assert.equal(result.updatedWatches[0].reportSummary, development.summary);
  assert.equal(result.updatedWatches[0].briefUpdateRead, true);
  assert.equal(result.statusById.get('nice'), 'updated');
  assert.equal(result.newlyCreatedWatches.length, 0);
});

test('only the selected report supplies failure attribution and counts each failed Watch once', () => {
  const automatic = report('automatic', morning, [entry('one', null, morning, true), entry('quiet')]);
  automatic.attempts.push({ watchId: 'one', status: 'failed' },
    { watchId: 'two', status: 'failed' }, { watchId: 'skip', status: 'skipped' });
  const manual = report('manual', later, [entry('one'), entry('other', null, later, true)]);
  const watches = ['one', 'two', 'other', 'quiet', 'skip'].map(id => watch(id));
  const result = view([automatic, manual], watches);
  assert.equal(result.failureCount, 2);
  assert.deepEqual([...result.failedIds], ['one', 'two']);
  assert.deepEqual(result.attentionWatches.map(w => w.id), ['one', 'two']);
  assert.equal(result.updatedWatches.length, 0);
  assert.equal(view([report('automatic', morning, [entry('one')])], watches).failureCount, 0);
  const missing = { ...automatic, entries: [], attempts: [] };
  assert.equal(view([missing], watches).failureCount, null);
  assert.equal(view([missing], watches).failedIds.size, 0);
});

test('a newer exact result restores unread presentation while ambiguous report IDs cannot prove a read', () => {
  const first = { ...update('first', morning), status: 'read' };
  const next = update('next', later);
  const oldReport = report('automatic', morning, [entry('city', first)]);
  const old = view([oldReport], [watch('city', [first])]);
  assert.equal(old.updatedWatches[0].briefUpdateRead, true);
  const fresh = view([oldReport], [watch('city', [first, next])]);
  assert.equal(fresh.updatedWatches[0].briefUpdateId, next.id);
  assert.equal(fresh.updatedWatches[0].briefUpdateRead, false);
  const ambiguous = report('manual', later, [{
    ...entry('city', first, later), resultIds: [first.id, 'another'],
  }]);
  const unresolved = view([oldReport, ambiguous], [watch('city', [first])]);
  assert.equal(unresolved.updatedWatches[0].briefUpdateId, '');
  assert.equal(unresolved.updatedWatches[0].briefUpdateRead, false);
});

test('local midnight expires the card without changing history, including across time zones', () => {
  const development = update('late', '2026-11-06T22:59:59Z');
  const live = watch('city', [development]);
  const snapshot = report('manual', development.timestamp, [entry('city', development, development.timestamp)]);
  const midnight = new Date('2026-11-06T23:00:00Z');
  assert.equal(view([snapshot], [live], { now: midnight }).updatedWatches.length, 0);
  assert.equal(view([snapshot], [live], { now: midnight, timeZone: 'America/New_York' }).updatedWatches.length, 1);
  assert.equal(view([snapshot], [live], { now: midnight }).report, null);
  assert.deepEqual(live.updates, [development]);
  assert.deepEqual(snapshot.entries[0].resultIds, ['late']);
});

test('a stale Updated entry from a quiet check cannot add yesterday’s development', () => {
  const old = update('yesterday', '2026-11-05T14:00:00Z');
  const stale = { ...entry('city', old), outcome: 'no-new-items' };
  const automatic = report('automatic', '2026-11-06T07:01:00Z', [stale]);
  const result = view([automatic], [watch('city', [old])]);
  assert.equal(result.statusById.get('city'), 'watching');
  assert.equal(result.updatedWatches.length, 0);
});
