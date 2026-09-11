import { randomUUID } from 'node:crypto';

import { applyFeedCheckResult } from '../src/js/watch-monitoring.js';
import { deriveCompanyStatus } from '../src/js/company-watch-status.js';
import { normalizeAdministrativeStatus } from '../src/js/company-administrative-status.js';
import { fetchBodaccAnnouncements, normalizeSiren } from './bodacc-api.js';
import { mapCompanyWatchRow } from './company-watch-repository.js';
import { processCompanyWatchEmailNotifications } from './company-watch-notifications.js';
import { createSupabaseServiceClient, requireCronSecret } from './supabase-service.js';

export const COMPANY_MONITORING_CRON_ENDPOINT = '/api/cron/company-monitoring';
export const COMPANY_MONITORING_PAGE_SIZE = 100;
export const COMPANY_MONITORING_CONCURRENCY = 3;

const sendJson = (response, statusCode, body) => {
  response.setHeader('Cache-Control', 'no-store');
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const safeCode = (error) => typeof error?.code === 'string'
  ? error.code.replace(/[^A-Z0-9_-]/giu, '').slice(0, 100) || 'CHECK_FAILED'
  : 'CHECK_FAILED';

const getSnapshotRow = (row) => (Array.isArray(row?.company_watch_snapshots)
  ? row.company_watch_snapshots[0] || null
  : row?.company_watch_snapshots || null);

const loadEligibleWatches = async (client, pageSize = COMPANY_MONITORING_PAGE_SIZE) => {
  const watches = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client.from('watches')
      .select('*, company_watch_snapshots(*)')
      .eq('type', 'company_bodacc')
      .eq('monitoring_state', 'monitoring')
      .is('deleted_at', null)
      .order('id')
      .range(start, start + pageSize - 1);
    if (error) throw Object.assign(new Error('Eligible Watches could not be loaded.'), { code: 'DATABASE_ERROR' });
    watches.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return watches;
};

const persistFailure = async (client, watches, error) => {
  const code = safeCode(error);
  await Promise.all(watches.map(async (row) => {
    const snapshot = getSnapshotRow(row);
    const { error: rpcError } = await client.rpc('record_scheduled_company_watch_failure', {
      p_watch_id: row.id,
      p_error_code: code,
      p_expected_checked_at: snapshot?.checked_at || null,
      p_expected_items: snapshot?.items || null,
    });
    if (rpcError) throw new Error('A scheduled check failure could not be recorded.');
  }));
};

const persistResult = async (client, row, response) => {
  const watch = mapCompanyWatchRow(row);
  const previousSnapshot = getSnapshotRow(row);
  const result = applyFeedCheckResult(watch, response, { trustedSourceType: 'bodacc' });
  const latestChange = result.matchedItems[0] || null;
  const companyStatus = result.changes.company?.status
    || deriveCompanyStatus(response.items, watch.company?.status);
  const administrativeStatus = normalizeAdministrativeStatus(
    result.changes.company?.administrativeStatus || response.company?.administrativeStatus,
  );
  const snapshot = result.changes.monitoringSnapshot;
  const { data, error } = await client.rpc('complete_scheduled_company_watch_check', {
    p_watch_id: row.id,
    p_checked_at: snapshot.checkedAt,
    p_source_title: snapshot.source?.title,
    p_source_url: snapshot.source?.url,
    p_item_ids: snapshot.itemIds,
    p_items: snapshot.items,
    p_expected_checked_at: previousSnapshot?.checked_at || null,
    p_expected_items: previousSnapshot?.items || null,
    p_company_name: result.changes.company?.name || response.company?.officialName || null,
    p_administrative_status: administrativeStatus,
    p_company_status: companyStatus,
    p_outcome: result.outcome,
    p_last_change_item_id: latestChange?.id || null,
    p_last_change_title: latestChange?.title || null,
    p_last_change_url: latestChange?.url || null,
    p_last_change_summary: latestChange?.excerpt || null,
    p_last_change_event_type: latestChange?.eventType || null,
    p_last_change_published_at: latestChange?.publishedAt || null,
    p_notification_items: result.matchedItems,
  });
  if (error) throw Object.assign(new Error('The scheduled result could not be persisted.'), { code: 'DATABASE_ERROR' });
  if (!['changed', 'unchanged', 'skipped'].includes(data)) {
    throw Object.assign(new Error('The scheduled result was invalid.'), { code: 'DATABASE_ERROR' });
  }
  return data;
};

const mapBounded = async (entries, concurrency, worker) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      await worker(entry);
    }
  }));
};

export const runCompanyMonitoring = async ({
  client,
  fetchCompany = (siren) => fetchBodaccAnnouncements(siren),
  pageSize = COMPANY_MONITORING_PAGE_SIZE,
  concurrency = COMPANY_MONITORING_CONCURRENCY,
  env = process.env,
  notificationProcessor = processCompanyWatchEmailNotifications,
} = {}) => {
  const rows = await loadEligibleWatches(client, pageSize);
  const groups = new Map();
  let skipped = 0;
  for (const row of rows) {
    try {
      const siren = normalizeSiren(row.siren);
      const group = groups.get(siren) || [];
      group.push(row);
      groups.set(siren, group);
    } catch {
      skipped += 1;
    }
  }
  let checked = 0; let changed = 0; let unchanged = 0; let failed = 0;
  await mapBounded([...groups], concurrency, async ([siren, watches]) => {
    let response;
    try {
      response = await fetchCompany(siren);
      checked += 1;
    } catch (error) {
      failed += watches.length;
      try { await persistFailure(client, watches, error); } catch { /* run remains partial */ }
      return;
    }
    for (const watch of watches) {
      try {
        const persistence = await persistResult(client, watch, response);
        if (persistence === 'changed') changed += 1;
        else if (persistence === 'skipped') skipped += 1;
        else unchanged += 1;
      } catch (error) {
        failed += 1;
        try { await persistFailure(client, [watch], error); } catch { /* run remains partial */ }
      }
    }
  });
  let notifications = { status: 'disabled', pendingCount: 0, sentCount: 0, failedCount: 0 };
  try {
    notifications = await notificationProcessor({ client, env });
  } catch {
    notifications = { status: 'failed', pendingCount: 0, sentCount: 0, failedCount: 0 };
  }
  return {
    totalEligibleWatches: rows.length,
    uniqueSirens: groups.size,
    checkedCount: checked,
    changedCount: changed,
    unchangedCount: unchanged,
    failedCount: failed,
    skippedCount: skipped,
    notifications,
    status: failed ? 'partial-success' : 'success',
  };
};

export const createCompanyMonitoringCronHandler = ({
  env = process.env,
  clientFactory = createSupabaseServiceClient,
  runner = runCompanyMonitoring,
  logger = console,
  now = () => Date.now(),
  createRunId = randomUUID,
  ...options
} = {}) => async (request, response) => {
  const runId = createRunId();
  const startedAt = now();
  let secret;
  try { secret = requireCronSecret(env); } catch {
    sendJson(response, 500, { runId, status: 'configuration-error' });
    return;
  }
  if (request.headers?.authorization !== `Bearer ${secret}`) {
    sendJson(response, 401, { runId, status: 'unauthorized' });
    return;
  }
  if (request.method && request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { runId, status: 'method-not-allowed' });
    return;
  }
  try {
    const summary = await runner({ client: clientFactory({ env }), env, ...options });
    const result = { runId, ...summary, durationMs: Math.max(0, now() - startedAt) };
    logger.info?.('[Company monitoring cron] Run completed.', result);
    sendJson(response, 200, result);
  } catch (error) {
    const result = { runId, status: 'failed', durationMs: Math.max(0, now() - startedAt) };
    logger.error?.('[Company monitoring cron] Run failed.', { ...result, code: safeCode(error) });
    sendJson(response, 500, result);
  }
};
