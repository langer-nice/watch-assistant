import { fetchAndNormalizeFeed } from './check-watch-api.js';
import { applyFeedCheckResult, normalizeFeedUrl } from '../src/js/watch-monitoring.js';
import { getMediaWatchEmailConfig } from './media-watch-email.js';
import { processMediaWatchEmailNotifications } from './media-watch-notifications.js';

const PAGE_SIZE = 50; const CONCURRENCY = 3;
const load = async (client, pageSize) => { const rows = []; for (let start = 0; ; start += pageSize) { const { data, error } = await client.from('watches').select('*, media_watch_snapshots(*)').eq('type', 'media_news').eq('monitoring_state', 'monitoring').is('deleted_at', null).order('id').range(start, start + pageSize - 1); if (error) throw Object.assign(new Error('Media watches unavailable.'), { code: 'DATABASE_ERROR' }); rows.push(...(data || [])); if (!data || data.length < pageSize) return rows; } };
const bounded = async (rows, concurrency, worker) => { let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => { while (cursor < rows.length) await worker(rows[cursor++]); })); };
const snapshot = (row) => Array.isArray(row.media_watch_snapshots) ? row.media_watch_snapshots[0] : row.media_watch_snapshots;
const asWatch = (row) => ({ id: row.id, title: row.title, inputType: row.watch_definition?.inputType || 'text', mediaMention: row.watch_definition?.mediaMention, storyProfile: row.watch_definition?.storyProfile, monitoringSource: row.monitoring_source, monitoringSnapshot: snapshot(row) ? { checkedAt: snapshot(row).checked_at, itemIds: snapshot(row).item_ids, items: snapshot(row).items } : null, seenMonitoringItemIds: snapshot(row)?.item_ids || [], seenMonitoringItemKeys: [], status: row.current_status || 'watching', candidateUpdates: [] });

export const runMediaMonitoring = async ({ client, env = process.env, fetchFeed = fetchAndNormalizeFeed, pageSize = PAGE_SIZE, concurrency = CONCURRENCY, notificationProcessor = processMediaWatchEmailNotifications } = {}) => {
  const rows = await load(client, pageSize); let changedCount = 0; let unchangedCount = 0; let failedCount = 0; let skippedCount = 0;
  await bounded(rows, concurrency, async (row) => { try {
    const sourceUrl = normalizeFeedUrl(row.monitoring_source?.url); if (!sourceUrl) { skippedCount += 1; return; }
    const response = await fetchFeed(sourceUrl); const result = applyFeedCheckResult(asWatch(row), response); const prior = snapshot(row);
    const { data, error } = await client.rpc('complete_scheduled_media_watch_check', { p_watch_id: row.id, p_expected_revision: row.media_revision, p_checked_at: result.changes.monitoringSnapshot.checkedAt, p_source_title: result.changes.monitoringSnapshot.source?.title, p_source_url: result.changes.monitoringSnapshot.source?.url, p_item_ids: result.changes.monitoringSnapshot.itemIds, p_items: result.changes.monitoringSnapshot.items, p_expected_checked_at: prior?.checked_at || null, p_expected_items: prior?.items || null, p_outcome: result.outcome, p_notification_items: result.matchedItems, p_enqueue_notifications: Boolean(getMediaWatchEmailConfig(env)) });
    if (error) throw Object.assign(new Error('Media persistence failed.'), { code: 'DATABASE_ERROR' });
    if (data === 'changed') changedCount += 1; else if (data === 'skipped') skippedCount += 1; else unchangedCount += 1;
  } catch { failedCount += 1; } });
  let notifications = { status: 'disabled', pendingCount: 0, sentCount: 0, failedCount: 0, skippedCount: 0 };
  try { notifications = await notificationProcessor({ client, env }); } catch { notifications = { ...notifications, status: 'failed' }; }
  return { totalEligibleWatches: rows.length, changedCount, unchangedCount, failedCount, skippedCount, notifications, status: failedCount ? 'partial-success' : 'success' };
};
