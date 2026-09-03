import assert from 'node:assert/strict';
import test from 'node:test';

import { getWatchDetailPresentationSnapshot } from '../src/js/watch-detail-presentation.js';
import { getCurrentSituationPresentation } from '../src/js/watch-update-presentation.js';
import { getCanonicalWatchClassification } from '../src/js/report-status.js';
import { createCompanyWatchRepository, mapCompanyWatchRow } from './company-watch-repository.js';

const ORANGE_CHANGE_ID = 'A20260160287';
const orangeRow = (overrides = {}) => ({
  id: '00000000-0000-4000-8000-000000000013',
  user_id: '10000000-0000-4000-8000-000000000013',
  type: 'company_bodacc',
  title: 'ORANGE',
  category: 'finance',
  siren: '380129866',
  company_name: 'ORANGE',
  administrative_status: 'active',
  company_status: 'active',
  monitoring_state: 'monitoring',
  current_status: 'updated',
  deleted_at: null,
  created_at: '2026-08-21T08:00:00.000Z',
  updated_at: '2026-09-03T06:00:01.000Z',
  last_checked_at: '2026-09-03T06:00:00.000Z',
  last_check_outcome: 'matching-items',
  last_change_item_id: ORANGE_CHANGE_ID,
  last_change_title: 'Ventes et cessions : ORANGE STORE, Orange',
  last_change_url: 'https://www.bodacc.fr/annonce/detail-annonce/A/20260160/287',
  last_change_summary: 'A business sale involving ORANGE STORE was published.',
  last_change_event_type: 'business_sale',
  last_change_published_at: '2026-08-23T00:00:00.000Z',
  company_watch_snapshots: [{
    checked_at: '2026-09-03T06:00:00.000Z',
    source_title: 'BODACC',
    source_url: 'https://www.bodacc.fr/',
    item_ids: [ORANGE_CHANGE_ID],
    items: [{ id: ORANGE_CHANGE_ID }],
  }],
  ...overrides,
});

const currentSituation = (watch) => getCurrentSituationPresentation(watch, {
  fallback: 'No meaningful update has been detected yet.',
  sanitizeUrl: (value) => value || '',
  translateBusinessEvent: (key) => (key === 'detail.businessEvents.business_sale'
    ? 'Business sold'
    : ''),
});

test('acknowledged server Company change remains the Watch Detail current situation', () => {
  const unread = mapCompanyWatchRow(orangeRow());
  const opened = getWatchDetailPresentationSnapshot(unread);
  assert.deepEqual(opened, { classification: 'updated', updateId: ORANGE_CHANGE_ID });
  assert.equal(currentSituation(unread).title, 'Business sold');

  const acknowledged = mapCompanyWatchRow(orangeRow({ current_status: 'watching' }));
  assert.equal(acknowledged.currentStatus, 'watching');
  assert.equal(acknowledged.updates.length, 1);
  assert.equal(acknowledged.updates[0].status, 'read');
  assert.equal(currentSituation(acknowledged).update.id, ORANGE_CHANGE_ID);
  assert.equal(currentSituation(acknowledged).title, 'Business sold');
});

test('reload and a later no-change check retain acknowledged detail without an Updated badge', () => {
  const persisted = orangeRow({
    current_status: 'watching',
    last_check_outcome: 'no-new-items',
    last_checked_at: '2026-09-04T06:00:00.000Z',
  });

  for (const row of [persisted, structuredClone(persisted)]) {
    const hydrated = mapCompanyWatchRow(row);
    assert.equal(getCanonicalWatchClassification(hydrated), 'watching');
    assert.equal(hydrated.unreadUpdateCount, 0);
    assert.equal(hydrated.updates.length, 1);
    assert.equal(currentSituation(hydrated).update.id, ORANGE_CHANGE_ID);
  }
});

test('a Company Watch without a stored change keeps the existing empty state', () => {
  const watch = mapCompanyWatchRow(orangeRow({
    current_status: 'watching',
    last_change_item_id: null,
    last_change_title: null,
    last_change_url: null,
    last_change_summary: null,
    last_change_event_type: null,
    last_change_published_at: null,
  }));
  const presentation = currentSituation(watch);

  assert.equal(watch.updates.length, 0);
  assert.equal(presentation.update, null);
  assert.equal(presentation.summary, 'No meaningful update has been detected yet.');
});

test('nullable stored change summary and URL still render safe title and event content', () => {
  const watch = mapCompanyWatchRow(orangeRow({
    current_status: 'watching',
    last_change_summary: null,
    last_change_url: null,
  }));
  const presentation = currentSituation(watch);

  assert.equal(presentation.update.id, ORANGE_CHANGE_ID);
  assert.equal(presentation.title, 'Business sold');
  assert.equal(presentation.summary, 'Ventes et cessions : ORANGE STORE, Orange');
  assert.equal(presentation.articleUrl, '');
});

const createAcknowledgementClient = (initialRow) => {
  let row = structuredClone(initialRow);
  const from = (table) => {
    assert.equal(table, 'watches');
    const state = { filters: [], payload: null };
    const builder = {
      update(payload) { state.payload = payload; return builder; },
      select() { return builder; },
      eq(key, value) { state.filters.push([key, value]); return builder; },
      is(key, value) { state.filters.push([key, value]); return builder; },
      maybeSingle() {
        const matches = state.filters.every(([key, value]) => row[key] === value);
        if (matches && state.payload) row = { ...row, ...state.payload };
        return Promise.resolve({ data: matches ? structuredClone(row) : null, error: null });
      },
    };
    return builder;
  };
  return { client: { from }, getRow: () => structuredClone(row) };
};

test('server acknowledgement targets the displayed ID and keeps its content after the status change', async () => {
  const database = createAcknowledgementClient(orangeRow());
  const repository = createCompanyWatchRepository({
    client: database.client,
    user: { id: '10000000-0000-4000-8000-000000000013' },
  });

  const acknowledged = await repository.update(orangeRow().id, {
    acknowledgeUpdateId: ORANGE_CHANGE_ID,
  });

  assert.equal(database.getRow().current_status, 'watching');
  assert.equal(acknowledged.currentStatus, 'watching');
  assert.equal(acknowledged.updates[0].id, ORANGE_CHANGE_ID);
  assert.equal(acknowledged.updates[0].status, 'read');
  assert.equal(currentSituation(acknowledged).title, 'Business sold');
});

test('an older detail view cannot acknowledge a concurrently persisted newer update', async () => {
  const newerId = 'A20260160288';
  const database = createAcknowledgementClient(orangeRow({
    last_change_item_id: newerId,
    last_change_title: 'Newer ORANGE change',
    last_change_event_type: 'director_change',
  }));
  const repository = createCompanyWatchRepository({
    client: database.client,
    user: { id: '10000000-0000-4000-8000-000000000013' },
  });

  const result = await repository.update(orangeRow().id, {
    acknowledgeUpdateId: ORANGE_CHANGE_ID,
  });

  assert.equal(database.getRow().current_status, 'updated');
  assert.equal(result.currentStatus, 'updated');
  assert.equal(result.updates[0].id, newerId);
  assert.equal(result.updates[0].status, 'new');
});
