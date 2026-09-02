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

const createClient = (rows, { changed = () => false } = {}) => {
  const calls = { completed: [], failures: [], ranges: [] };
  const from = () => {
    const state = { filters: [] };
    const builder = {
      select() { return builder; },
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
      return { data: changed(params), error: null };
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
    changed: ({ p_last_change_item_id }) => p_last_change_item_id === 'new',
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

test('one failed SIREN preserves processing for others and records only a safe code', async () => {
  const client = createClient([watch('a'), watch('b', OTHER_SIREN)]);
  const summary = await runCompanyMonitoring({ client, concurrency: 2, fetchCompany: async (siren) => {
    if (siren === SIREN) throw Object.assign(new Error('token=user@example.com'), { code: 'UPSTREAM_ERROR' });
    return response();
  } });
  assert.equal(summary.status, 'partial-success');
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.unchangedCount, 1);
  assert.deepEqual(client.calls.failures, [{ p_watch_id: 'a', p_error_code: 'UPSTREAM_ERROR' }]);
});
