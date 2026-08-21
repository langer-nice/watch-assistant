import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCompanyWatchRepository,
  mapCompanyWatchRow,
  validateWatchId,
} from './company-watch-repository.js';

const baseRow = {
  id: '00000000-0000-4000-8000-00000000000a',
  type: 'company_bodacc',
  title: 'Company A',
  siren: '552100554',
  company_name: 'Company A',
  monitoring_state: 'monitoring',
  current_status: 'watching',
  created_at: '2026-08-21T08:00:00.000Z',
  updated_at: '2026-08-21T09:00:00.000Z',
  last_checked_at: '2026-08-21T09:00:00.000Z',
  last_check_outcome: 'no-change',
  last_change_item_id: 'bodacc-old',
  last_change_title: 'Old announcement',
  last_change_url: 'https://www.bodacc.fr/annonce/old',
  last_change_summary: 'Old persisted change',
  last_change_event_type: 'announcement',
  last_change_published_at: '2026-08-20T09:00:00.000Z',
  company_watch_snapshots: [{
    checked_at: '2026-08-21T09:00:00.000Z',
    source_title: 'BODACC',
    source_url: 'https://www.bodacc.fr',
    item_ids: ['bodacc-old'],
    items: [{ id: 'bodacc-old' }],
  }],
};

test('persisted Company rows restore the canonical snapshot without reviving an old update', () => {
  const watch = mapCompanyWatchRow(baseRow);

  assert.equal(watch.inputType, 'company');
  assert.equal(watch.company.siren, '552100554');
  assert.deepEqual(watch.monitoringSnapshot.itemIds, ['bodacc-old']);
  assert.deepEqual(watch.updates, []);
  assert.equal(watch.unreadUpdateCount, 0);
});

test('a persisted updated status restores exactly one presentable update', () => {
  const watch = mapCompanyWatchRow({ ...baseRow, current_status: 'updated', last_check_outcome: 'changed' });

  assert.equal(watch.updates.length, 1);
  assert.equal(watch.updates[0].id, 'bodacc-old');
  assert.equal(watch.unreadUpdateCount, 1);
  assert.equal(watch.currentStatus, 'updated');
});

test('Company Watch item IDs must be UUIDs', () => {
  assert.equal(validateWatchId(baseRow.id), baseRow.id);
  assert.throws(() => validateWatchId('watch-a'), ({ code, statusCode }) => (
    code === 'INVALID_WATCH_ID' && statusCode === 400
  ));
});

const createMemoryDatabase = () => ({ watches: [], snapshots: new Map(), nextId: 1 });

const createMemoryClient = (database, userId) => {
  const visibleRows = () => database.watches.filter((row) => row.user_id === userId);
  const withSnapshot = (row) => row ? {
    ...row,
    company_watch_snapshots: database.snapshots.has(row.id)
      ? [structuredClone(database.snapshots.get(row.id))]
      : [],
  } : null;

  const from = (table) => {
    assert.equal(table, 'watches');
    const state = { action: 'select', filters: [], payload: null };
    const matches = (row) => state.filters.every(({ kind, key, value }) => (
      kind === 'is' ? row[key] === value : row[key] === value
    ));
    const execute = ({ one = false, maybe = false } = {}) => {
      if (state.action === 'insert') {
        const payload = { ...state.payload };
        const duplicate = database.watches.some((row) => (
          row.user_id === userId
          && row.siren === payload.siren
          && row.deleted_at === null
        ));
        if (duplicate) return { data: null, error: { code: '23505' } };
        const id = `20000000-0000-4000-8000-${String(database.nextId++).padStart(12, '0')}`;
        const now = new Date().toISOString();
        const row = {
          id,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          ...payload,
        };
        database.watches.push(row);
        return { data: withSnapshot(row), error: null };
      }

      if (state.action === 'update') {
        const row = visibleRows().find(matches);
        if (!row) return { data: null, error: null };
        Object.assign(row, state.payload, { updated_at: new Date().toISOString() });
        return { data: withSnapshot(row), error: null };
      }

      const rows = visibleRows().filter(matches).map(withSnapshot);
      if (one || maybe) return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    };
    const builder = {
      select() { return builder; },
      insert(payload) { state.action = 'insert'; state.payload = payload; return builder; },
      update(payload) { state.action = 'update'; state.payload = payload; return builder; },
      eq(key, value) { state.filters.push({ kind: 'eq', key, value }); return builder; },
      is(key, value) { state.filters.push({ kind: 'is', key, value }); return builder; },
      order() { return builder; },
      single() { return Promise.resolve(execute({ one: true })); },
      maybeSingle() { return Promise.resolve(execute({ maybe: true })); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    };
    return builder;
  };

  const rpc = async (name, params) => {
    const row = visibleRows().find((candidate) => (
      candidate.id === params.p_watch_id && candidate.deleted_at === null
    ));
    if (name === 'claim_company_watch_check') {
      if (!row || row.check_started_at) return { data: false, error: null };
      row.check_started_at = new Date().toISOString();
      return { data: true, error: null };
    }
    if (name === 'fail_company_watch_check') {
      if (row) {
        row.check_started_at = null;
        row.last_check_error_code = params.p_error_code;
      }
      return { data: null, error: null };
    }
    assert.equal(name, 'complete_company_watch_check');
    if (!row) return { data: null, error: { code: 'P0002' } };
    database.snapshots.set(row.id, {
      watch_id: row.id,
      user_id: userId,
      checked_at: params.p_checked_at,
      source_title: params.p_source_title,
      source_url: params.p_source_url,
      item_ids: params.p_item_ids,
      items: params.p_items,
    });
    Object.assign(row, {
      company_name: params.p_company_name || row.company_name,
      administrative_status: params.p_administrative_status || row.administrative_status,
      company_status: params.p_company_status || row.company_status,
      monitoring_state: 'monitoring',
      current_status: params.p_current_status,
      last_checked_at: params.p_checked_at,
      last_check_outcome: params.p_outcome,
      last_check_error_code: null,
      last_change_item_id: params.p_last_change_item_id || row.last_change_item_id,
      last_change_title: params.p_last_change_title || row.last_change_title,
      last_change_url: params.p_last_change_url || row.last_change_url,
      last_change_summary: params.p_last_change_summary || row.last_change_summary,
      last_change_event_type: params.p_last_change_event_type || row.last_change_event_type,
      last_change_published_at: params.p_last_change_published_at || row.last_change_published_at,
      check_started_at: null,
      updated_at: new Date().toISOString(),
    });
    return { data: null, error: null };
  };

  return { from, rpc };
};

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const noDirectory = async () => { throw new Error('directory intentionally unavailable'); };
const emptyBodacc = () => jsonResponse({ total_count: 0, results: [] });
const changedBodacc = () => jsonResponse({
  total_count: 1,
  results: [{
    id: 'bodacc-change-1',
    registre: '552100554',
    dateparution: '2026-08-21',
    familleavis_lib: 'Modifications diverses',
    modificationsgenerales: JSON.stringify({ descriptif: 'Changement de dirigeant' }),
    url_complete: 'https://www.bodacc.fr/annonce/detail-change-1',
  }],
});

const createRepository = (database, userId, fetchImpl) => createCompanyWatchRepository({
  client: createMemoryClient(database, userId),
  user: { id: userId },
  fetchImpl,
  directoryFetchImpl: noDirectory,
  now: () => new Date('2026-08-21T10:00:00.000Z'),
});

test('server repository persists baseline, multi-session CRUD, soft delete, and recreation', async () => {
  const database = createMemoryDatabase();
  const userA = '10000000-0000-4000-8000-00000000000a';
  const userB = '10000000-0000-4000-8000-00000000000b';
  const repositoryA = createRepository(database, userA, async () => emptyBodacc());

  const created = await repositoryA.create({
    siren: '552100554',
    title: 'Company A',
    request: 'Monitor Company A',
    summary: 'Pilot Company Watch',
    user_id: userB,
  });
  assert.equal(created.result.outcome, 'baseline');
  assert.equal(created.watch.currentStatus, 'watching');
  assert.equal(created.watch.updates.length, 0);
  assert.deepEqual(created.watch.monitoringSnapshot.itemIds, []);
  assert.equal(database.watches[0].user_id, userA, 'browser-supplied ownership must be ignored');

  await assert.rejects(
    repositoryA.create({ siren: '552100554', title: 'Duplicate' }),
    ({ code, statusCode }) => code === 'ACTIVE_WATCH_EXISTS' && statusCode === 409,
  );
  await assert.rejects(
    repositoryA.create({ siren: 'not-a-siren', title: 'Invalid' }),
    ({ code, statusCode }) => code === 'INVALID_SIREN' && statusCode === 400,
  );

  const secondSessionA = createRepository(database, userA, async () => emptyBodacc());
  assert.equal((await secondSessionA.list())[0].id, created.watch.id);
  assert.deepEqual((await secondSessionA.get(created.watch.id)).monitoringSnapshot.itemIds, []);
  assert.equal((await secondSessionA.update(created.watch.id, { title: 'Company A updated' })).title,
    'Company A updated');

  const repositoryB = createRepository(database, userB, async () => emptyBodacc());
  await assert.rejects(repositoryB.get(created.watch.id), ({ code }) => code === 'WATCH_NOT_FOUND');
  await assert.rejects(
    repositoryB.update(created.watch.id, { title: 'Forged update' }),
    ({ code }) => code === 'WATCH_NOT_FOUND',
  );
  await assert.rejects(repositoryB.remove(created.watch.id), ({ code }) => code === 'WATCH_NOT_FOUND');
  const sameSirenForB = await repositoryB.create({ siren: '552100554', title: 'Company B' });
  assert.notEqual(sameSirenForB.watch.id, created.watch.id);

  await secondSessionA.remove(created.watch.id);
  assert.equal((await secondSessionA.list()).length, 0);
  const recreated = await secondSessionA.create({ siren: '552100554', title: 'Company A recreated' });
  assert.notEqual(recreated.watch.id, created.watch.id);
});

test('persistent checks retain the last valid snapshot, detect change once, and reject concurrency', async () => {
  const database = createMemoryDatabase();
  const userA = '10000000-0000-4000-8000-00000000000a';
  let response = emptyBodacc;
  const repository = createRepository(database, userA, async () => response());
  const { watch: created } = await repository.create({ siren: '552100554', title: 'Company A' });

  const noChange = await repository.check(created.id);
  assert.equal(noChange.result.outcome, 'no-new-items');
  assert.equal(noChange.watch.currentStatus, 'watching');
  assert.deepEqual(noChange.watch.monitoringSnapshot.itemIds, []);

  response = changedBodacc;
  const changed = await repository.check(created.id);
  assert.equal(changed.result.outcome, 'matching-items');
  assert.equal(changed.watch.currentStatus, 'updated');
  assert.deepEqual(changed.watch.monitoringSnapshot.itemIds, ['bodacc-change-1']);
  assert.equal(changed.watch.updates.length, 1);

  const repeated = await repository.check(created.id);
  assert.equal(repeated.result.outcome, 'no-new-items');
  assert.equal(repeated.watch.currentStatus, 'watching');
  assert.deepEqual(repeated.watch.monitoringSnapshot.itemIds, ['bodacc-change-1']);
  assert.equal(repeated.watch.updates.length, 0);

  const beforeFailure = structuredClone(database.snapshots.get(created.id));
  response = () => { throw new Error('BODACC unavailable'); };
  await assert.rejects(repository.check(created.id), ({ code }) => code === 'NETWORK_ERROR');
  assert.deepEqual(database.snapshots.get(created.id), beforeFailure);
  assert.equal(database.watches.find(({ id }) => id === created.id).last_check_error_code,
    'NETWORK_ERROR');

  response = emptyBodacc;
  database.watches.find(({ id }) => id === created.id).check_started_at = new Date().toISOString();
  await assert.rejects(
    repository.check(created.id),
    ({ code, statusCode }) => code === 'CHECK_IN_PROGRESS' && statusCode === 409,
  );
});
