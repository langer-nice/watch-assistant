import { configureAccountStorage } from './account-storage.js';
configureAccountStorage({ getState: () => ({ status: 'authenticated', session: { user: { id: 'synthetic-report-owner' } } }) });
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHomeReport } from './home-report.js';
import { generateReport } from './report-service.js';
import { normalizeReport } from './report-storage.js';
import { getCanonicalWatchClassification } from './report-status.js';
import { mapCompanyWatchRow } from '../../server/company-watch-repository.js';

const now = new Date('2026-09-14T12:08:00+02:00');
const createdAt = '2026-09-14T10:05:00Z';
const media = { id: 'media', title: 'Bitcoin media mentions', inputType: 'text', category: 'news',
  status: 'watching', createdAt, mediaPersistence: { ownerId: 'owner' },
  monitoringSource: { type: 'feed', url: 'https://news.example/rss' },
  lastCheckAttempt: { status: 'succeeded', outcome: 'baseline' }, updates: [] };
const reportFor = (watches, classification = 'watching') => ({
  completedAt: now.toISOString(), counts: { completed: watches.length },
  entries: watches.map(watch => ({ watchId: watch.id, title: watch.title, category: watch.category, classification })),
});

test('Home shows a checked synced media Watch from an existing quiet report during its first 24 hours', () => {
  const report = reportFor([media]);
  const selection = selectHomeReport({ report, watches: [media], serverWatches: [media], now });
  assert.deepEqual(selection.newlyCreatedWatches.map(w => w.id), ['media']);
  assert.equal(selection.totalChecked, 1);
  assert.equal(selection.quietWatches.length, 0);
  assert.equal(report.entries[0].classification, 'watching', 'historical report is not mutated');
});

test('Home uses the persisted Company creation timestamp after a successful check', () => {
  const company = mapCompanyWatchRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'company_bodacc',
    title: 'Fixture Company', siren: '123456789', created_at: createdAt, monitoring_state: 'monitoring',
    current_status: 'watching', last_checked_at: now.toISOString(), company_watch_snapshots: [] });
  assert.equal(company.createdAt, createdAt);
  const result = selectHomeReport({ report: reportFor([company]), serverWatches: [company], now });
  assert.deepEqual(result.newlyCreatedWatches.map(w => w.id), [company.id]);
});

test('Home expires cached New entries at 24 elapsed hours, regardless of report refresh time', () => {
  const watches = [
    { ...media, id: 'inside', createdAt: '2026-09-13T10:08:00.001Z' },
    { ...media, id: 'boundary', createdAt: '2026-09-13T10:08:00Z' },
    { ...media, id: 'outside', createdAt: '2026-09-13T10:07:59.999Z' },
  ];
  const report = reportFor(watches, 'new');
  const result = selectHomeReport({ report, serverWatches: watches, now });
  assert.deepEqual(result.newlyCreatedWatches.map(w => w.id), ['inside']);
  assert.deepEqual(result.quietWatches.map(w => w.id), ['boundary', 'outside']);
  const later = selectHomeReport({ report, serverWatches: watches, now: new Date(now.getTime() + 1) });
  assert.equal(later.newlyCreatedWatches.length, 0);
  assert.equal(later.totalChecked, 3);
});

test('server creation wins over a stale browser date and offset timestamps compare as instants', () => {
  for (const serverDate of [createdAt, '2026-09-14T12:05:00+02:00', '2026-09-14T03:05:00-07:00']) {
    const result = selectHomeReport({ report: reportFor([media]), watches: [{ ...media, createdAt: '2020-01-01T00:00:00Z' }],
      serverWatches: [{ ...media, createdAt: serverDate }], now });
    assert.equal(result.newlyCreatedWatches.length, 1);
    assert.equal(result.newlyCreatedWatches[0].createdAt, serverDate);
  }
  const oldServer = { ...media, createdAt: '2026-09-12T10:05:00Z' };
  assert.equal(selectHomeReport({ report: reportFor([media]), watches: [media], serverWatches: [oldServer], now }).newlyCreatedWatches.length, 0);
});

test('Home includes server media Watches created after the report or without a local report, once per UUID', () => {
  for (const report of [null, reportFor([])]) {
    const result = selectHomeReport({ report, watches: [media], serverWatches: [media, { ...media }], now });
    assert.deepEqual(result.newlyCreatedWatches.map(w => w.id), ['media']);
    assert.equal(result.totalChecked, 0);
  }
});

test('refresh after creation keeps report counts and the Watching lifecycle while Home retains New visibility', async () => {
  let watch = { ...media, lastCheckAttempt: null };
  const report = await generateReport({ watches: [watch], getWatch: () => watch,
    saveWatch: (_, changes) => (watch = { ...watch, ...changes }),
    checkController: { check: async () => { watch = { ...media }; return { outcome: 'baseline', matchedItems: [], watch }; } },
    clock: () => now, loadReports: () => [], save: normalizeReport, idFactory: () => 'home-refresh' });
  assert.equal(report.counts.completed, 1);
  assert.equal(report.entries[0].classification, 'watching');
  assert.equal(report.counts.watching, 1);
  const reloaded = normalizeReport(JSON.parse(JSON.stringify(report)));
  assert.equal(selectHomeReport({ report: reloaded, serverWatches: [watch], now }).newlyCreatedWatches.length, 1);
});

test('attention and updates retain priority; local-only Watches still enter Home through reports', () => {
  const watches = [{ ...media, id: 'attention' }, { ...media, id: 'updated' }, { ...media, id: 'local', mediaPersistence: undefined }];
  const report = reportFor(watches);
  report.entries[0].classification = 'attention'; report.entries[1].classification = 'updated';
  const result = selectHomeReport({ report, watches, now });
  assert.deepEqual(result.attentionWatches.map(w => w.id), ['attention']);
  assert.deepEqual(result.updatedWatches.map(w => w.id), ['updated']);
  assert.deepEqual(result.newlyCreatedWatches.map(w => w.id), ['local']);
  assert.equal(selectHomeReport({ watches, now }).watches.length, 0);
  assert.equal(getCanonicalWatchClassification({ ...media, lastCheckAttempt: { status: 'failed' } }, { now }), 'attention');
});

test('invalid, missing, future and completed Watch creation cannot create a New card', () => {
  const watches = [null, 'invalid', '2026-09-14T10:09:00Z'].map((createdAt, i) => ({ ...media, id: String(i), createdAt }));
  watches.push({ ...media, id: 'completed', status: 'completed' });
  const result = selectHomeReport({ report: reportFor(watches, 'new'), serverWatches: watches, now });
  assert.equal(result.newlyCreatedWatches.length, 0);
});


test('older report entries without a current Watch do not crash Home or invent a creation date', () => {
  const result = selectHomeReport({ report: reportFor([media], 'new'), now });
  assert.equal(result.newlyCreatedWatches.length, 0);
  assert.equal(result.quietWatches.length, 1);
  assert.equal(result.totalChecked, 1);
});
