import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCompanyMonitoringCronHandler,
  runCompanyMonitoring,
} from './company-monitoring-cron.js';

const SIREN = '552100554';
const OTHER_SIREN = '380129866';
const watch = (id, siren = SIREN, overrides = {}) => ({
  id, user_id: `user-${id}`, type: 'company_bodacc', siren,
  title: `Company ${id}`, company_name: `Company ${id}`,
  monitoring_state: 'monitoring', current_status: 'watching', deleted_at: null,
  administrative_status: 'active', company_status: 'active',
  company_watch_snapshots: [{
    checked_at: '2026-09-01T06:00:00.000Z', source_title: 'BODACC',
    source_url: 'https://www.bodacc.fr/', item_ids: ['old'],
    items: [{ id: 'old', title: 'Old', publishedAt: '2026-08-31', source: 'BODACC' }],
  }],
  ...overrides,
});

const response = (items = []) => ({
  checkedAt: '2026-09-02T06:00:00.000Z',
  source: { title: 'BODACC', url: 'https://www.bodacc.fr/' }, items,
});

const createClient = (rows, { persistence = () => 'unchanged' } = {}) => {
  const calls = { completed: [], failures: [], fromTables: [], ranges: [], selections: [] };
  const from = (table) => {
    calls.fromTables.push(table);
    const state = { filters: [] };
    const builder = {
      select(columns) { calls.selections.push(columns); return builder; },
      eq(key, value) { state.filters.push([key, value]); return builder; },
      is(key, value) { state.filters.push([key, value]); return builder; },
      order() { return builder; },
      range(start, end) {
        calls.ranges.push([start, end]);
        const filtered = rows.filter((row) => state.filters.every(([key, value]) => row[key] === value));
        return Promise.resolve({ data: filtered.slice(start, end + 1), error: null });
      },
    };
    return builder;
  };
  const rpc = async (name, params) => {
    if (name === 'complete_scheduled_company_watch_check') {
      calls.completed.push(params);
      return { data: persistence(params), error: null };
    }
    calls.failures.push(params);
    return { data: null, error: null };
  };
  return { from, rpc, calls };
};

const invoke = async (handler, authorization) => {
  let body;
  const responseObject = {
    headers: {}, setHeader(key, value) { this.headers[key] = value; },
    end(value) { body = JSON.parse(value); },
  };
  await handler({ headers: authorization ? { authorization } : {} }, responseObject);
  return { status: responseObject.statusCode, body };
};

test('cron rejects missing and incorrect exact Bearer authorization', async () => {
  const handler = createCompanyMonitoringCronHandler({ env: { CRON_SECRET: 'cron-value' } });
  assert.equal((await invoke(handler)).status, 401);
  assert.equal((await invoke(handler, 'Bearer wrong')).status, 401);
  assert.equal((await invoke(handler, 'cron-value')).status, 401);
});

test('correct cron authorization executes and returns only a safe operational summary', async () => {
  const logs = [];
  const handler = createCompanyMonitoringCronHandler({
    env: { CRON_SECRET: 'cron-value' }, clientFactory: () => ({ privileged: true }),
    runner: async () => ({ totalEligibleWatches: 2, uniqueSirens: 1, checkedCount: 1,
      changedCount: 0, unchangedCount: 2, failedCount: 0, skippedCount: 0, status: 'success' }),
    logger: { info: (...args) => logs.push(args) }, createRunId: () => 'run-1', now: () => 10,
  });
  const result = await invoke(handler, 'Bearer cron-value');
  assert.equal(result.status, 200);
  assert.equal(result.body.runId, 'run-1');
  assert.equal(JSON.stringify({ result, logs }).includes('cron-value'), false);
  assert.equal(JSON.stringify({ result, logs }).includes('user-'), false);
});

test('missing service configuration fails safely without returning configured values', async () => {
  const handler = createCompanyMonitoringCronHandler({
    env: { CRON_SECRET: 'cron-value', SUPABASE_URL: 'https://private.invalid' },
    createRunId: () => 'run-safe', logger: { error() {} },
  });
  const result = await invoke(handler, 'Bearer cron-value');
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { runId: 'run-safe', status: 'failed', durationMs: result.body.durationMs });
  assert.equal(JSON.stringify(result.body).includes('private'), false);
});

test('selection excludes paused, deleted, and unsupported Watches and paginates', async () => {
  const eligible = watch('a');
  const client = createClient([
    eligible,
    watch('paused', SIREN, { monitoring_state: 'paused' }),
    watch('deleted', SIREN, { deleted_at: '2026-09-01T00:00:00Z' }),
    watch('news', SIREN, { type: 'news' }),
  ]);
  const summary = await runCompanyMonitoring({ client, pageSize: 1, fetchCompany: async () => response() });
  assert.equal(summary.totalEligibleWatches, 1);
  assert.deepEqual(client.calls.fromTables, ['watches', 'watches']);
  assert.deepEqual(client.calls.selections, [
    '*, company_watch_snapshots(*)',
    '*, company_watch_snapshots(*)',
  ]);
  assert.deepEqual(client.calls.completed.map(({ p_watch_id }) => p_watch_id), ['a']);
  assert.deepEqual(client.calls.ranges, [[0, 0], [1, 1]]);
});

test('invalid SIRENs are skipped and shared SIRENs fetch once while ownership stays per Watch', async () => {
  const client = createClient([watch('a'), watch('b'), watch('invalid', '123')]);
  const fetched = [];
  const summary = await runCompanyMonitoring({ client, fetchCompany: async (siren) => {
    fetched.push(siren); return response();
  } });
  assert.deepEqual(fetched, [SIREN]);
  assert.equal(summary.skippedCount, 1);
  assert.deepEqual(client.calls.completed.map(({ p_watch_id }) => p_watch_id).sort(), ['a', 'b']);
});

test('nullable summaries persist safely and database result controls changed/idempotent counts', async () => {
  const client = createClient([watch('a', SIREN, { current_status: 'updated' })], {
    persistence: ({ p_last_change_item_id }) => (p_last_change_item_id === 'new' ? 'changed' : 'unchanged'),
  });
  const newItem = { id: 'new', title: 'New', url: 'https://www.bodacc.fr/new',
    excerpt: null, publishedAt: '2026-09-02', source: 'BODACC' };
  const first = await runCompanyMonitoring({ client, fetchCompany: async () => response([newItem]) });
  assert.equal(first.changedCount, 1);
  assert.equal(client.calls.completed[0].p_last_change_summary, null);

  client.calls.completed.length = 0;
  const noChangeClient = createClient([watch('a', SIREN, { current_status: 'updated' })]);
  const second = await runCompanyMonitoring({ client: noChangeClient, fetchCompany: async () => response([newItem]) });
  assert.equal(second.unchangedCount, 1);
  assert.equal(noChangeClient.calls.completed.length, 1);
  assert.equal(noChangeClient.calls.completed[0].p_watch_id, 'a');
});

test('canonical no-change content differences cannot fabricate an Updated transition', async () => {
  const correctedItem = {
    id: 'old', title: 'Corrected text', publishedAt: '2026-08-31', source: 'BODACC',
  };
  const client = createClient([watch('a')], {
    persistence: (params) => {
      assert.equal(params.p_outcome, 'no-new-items');
      assert.equal(params.p_last_change_item_id, null);
      return 'unchanged';
    },
  });

  const summary = await runCompanyMonitoring({
    client,
    fetchCompany: async () => response([correctedItem]),
  });

  assert.equal(summary.changedCount, 0);
  assert.equal(summary.unchangedCount, 1);
});

test('overlapping runs reject a stale completion using the snapshot version they read', async () => {
  const initial = watch('a');
  let storedSnapshot = structuredClone(initial.company_watch_snapshots[0]);
  let releaseOlder;
  let olderReachedPersistence;
  const olderWaiting = new Promise((resolve) => { olderReachedPersistence = resolve; });
  const releaseOlderPromise = new Promise((resolve) => { releaseOlder = resolve; });
  const client = createClient([initial]);
  client.rpc = async (name, params) => {
    if (name !== 'complete_scheduled_company_watch_check') return { data: true, error: null };
    if (params.p_last_change_item_id === 'older') {
      olderReachedPersistence();
      await releaseOlderPromise;
    }
    const versionMatches = params.p_expected_checked_at === storedSnapshot.checked_at
      && JSON.stringify(params.p_expected_items) === JSON.stringify(storedSnapshot.items);
    if (!versionMatches) return { data: 'skipped', error: null };
    storedSnapshot = {
      checked_at: params.p_checked_at,
      source_title: params.p_source_title,
      source_url: params.p_source_url,
      item_ids: params.p_item_ids,
      items: params.p_items,
    };
    return { data: 'changed', error: null };
  };
  const itemFor = (id, publishedAt) => ({
    id, title: id, publishedAt, source: 'BODACC',
  });
  const olderRun = runCompanyMonitoring({
    client,
    fetchCompany: async () => response([itemFor('older', '2026-09-01')]),
  });
  await olderWaiting;
  const newerRun = await runCompanyMonitoring({
    client,
    fetchCompany: async () => ({
      ...response([itemFor('newer', '2026-09-02')]), checkedAt: '2026-09-02T06:01:00.000Z',
    }),
  });
  releaseOlder();
  const olderResult = await olderRun;

  assert.equal(newerRun.changedCount, 1);
  assert.equal(olderResult.changedCount, 0);
  assert.equal(olderResult.skippedCount, 1);
  assert.deepEqual(storedSnapshot.item_ids, ['newer']);
});

test('a failure recorded after a concurrent success carries the old snapshot version', async () => {
  const initial = watch('a');
  const client = createClient([initial]);
  await runCompanyMonitoring({
    client,
    fetchCompany: async () => { throw Object.assign(new Error('failed'), { code: 'UPSTREAM_ERROR' }); },
  });

  assert.deepEqual(client.calls.failures, [{
    p_watch_id: 'a',
    p_error_code: 'UPSTREAM_ERROR',
    p_expected_checked_at: initial.company_watch_snapshots[0].checked_at,
    p_expected_items: initial.company_watch_snapshots[0].items,
  }]);
});

test('a lost completion response cannot overwrite the committed success with an error', async () => {
  const initial = watch('a');
  let storedSnapshot = structuredClone(initial.company_watch_snapshots[0]);
  let storedError = null;
  const client = createClient([initial]);
  client.rpc = async (name, params) => {
    const versionMatches = params.p_expected_checked_at === storedSnapshot.checked_at
      && JSON.stringify(params.p_expected_items) === JSON.stringify(storedSnapshot.items);
    if (name === 'complete_scheduled_company_watch_check') {
      assert.equal(versionMatches, true);
      storedSnapshot = {
        checked_at: params.p_checked_at,
        item_ids: params.p_item_ids,
        items: params.p_items,
      };
      return { data: null, error: { code: 'RESPONSE_LOST_AFTER_COMMIT' } };
    }
    if (versionMatches) storedError = params.p_error_code;
    return { data: versionMatches, error: null };
  };

  const summary = await runCompanyMonitoring({
    client,
    fetchCompany: async () => response([{
      id: 'new', title: 'New', publishedAt: '2026-09-02', source: 'BODACC',
    }]),
  });

  assert.equal(summary.failedCount, 1);
  assert.deepEqual(storedSnapshot.item_ids, ['new']);
  assert.equal(storedError, null);
});

test('one failed SIREN preserves processing for others and records only a safe code', async () => {
  const client = createClient([watch('a'), watch('b', OTHER_SIREN)]);
  const summary = await runCompanyMonitoring({ client, concurrency: 2, fetchCompany: async (siren) => {
    if (siren === SIREN) throw Object.assign(new Error('token=user@example.com'), { code: 'UPSTREAM_ERROR' });
    return response();
  } });
  assert.equal(summary.status, 'partial-success');
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.unchangedCount, 1);
  assert.equal(client.calls.failures.length, 1);
  assert.equal(client.calls.failures[0].p_watch_id, 'a');
  assert.equal(client.calls.failures[0].p_error_code, 'UPSTREAM_ERROR');
  assert.equal(client.calls.failures[0].p_expected_checked_at, '2026-09-01T06:00:00.000Z');
  assert.deepEqual(client.calls.failures[0].p_expected_items, watch('a').company_watch_snapshots[0].items);
});
