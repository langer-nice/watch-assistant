import { authenticateSupabaseRequest } from './supabase-user.js';
import { createSupabaseServiceClient } from './supabase-service.js';
import { fetchAndNormalizeFeed } from './check-watch-api.js';
import { mediaArticleIdentityKeys } from './media-article-identity.js';
import { applyFeedCheckResult, matchFeedItemToWatch } from '../src/js/watch-monitoring.js';

export const createMediaWatchCheckMiddleware = ({ authenticate = authenticateSupabaseRequest,
  serviceClient, fetchFeed = fetchAndNormalizeFeed, ...options } = {}) => async (request, response, next) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname !== '/api/media-watches' || url.searchParams.get('action') !== 'check') return next?.();
  const send = (status, body) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'POST') return send(405, { code: 'METHOD_NOT_ALLOWED' });
  let row; let prior; let service;
  try {
    const { client, user } = await authenticate(request, options);
    let body = request.body;
    if (!body) {
      let raw = '';
      for await (const chunk of request) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 1024) return send(413, { code: 'INVALID_BODY' });
      }
      try { body = JSON.parse(raw); } catch { return send(400, { code: 'INVALID_BODY' }); }
    }
    if (Buffer.byteLength(JSON.stringify(body) || '') > 1024) return send(413, { code: 'INVALID_BODY' });
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body?.id || '') || !Number.isSafeInteger(body.revision)) return send(400, { code: 'INVALID_BODY' });
    const { data, error } = await client.from('watches').select('*,media_watch_snapshots(*)')
      .eq('id', body.id).eq('user_id', user.id).eq('type', 'media_news').is('deleted_at', null).range(0, 0);
    if (error) throw Object.assign(new Error('Database unavailable'), { code: 'PERSISTENCE_UNAVAILABLE' });
    row = data?.[0];
    if (!row) return send(404, { code: 'WATCH_NOT_FOUND' });
    if (row.monitoring_source?.type !== 'feed') return send(400, { code: 'INVALID_MONITORING_SOURCE' });
    if (Number(row.media_revision) !== body.revision) return send(409, { code: 'MEDIA_CONFLICT' });
    prior = Array.isArray(row.media_watch_snapshots) ? row.media_watch_snapshots[0] : row.media_watch_snapshots;
    service = serviceClient || createSupabaseServiceClient(options);
    const feed = await fetchFeed(row.monitoring_source.url);
    const watch = { ...row.watch_definition, id: row.id, status: row.current_status };
    const normalized = applyFeedCheckResult(watch, feed).changes.monitoringSnapshot;
    const items = normalized.items.map(item => ({ ...item, identityKeys: mediaArticleIdentityKeys(item) }));
    const completion = await service.rpc('complete_manual_media_watch_check', {
      p_watch_id: row.id, p_user_id: user.id, p_expected_revision: body.revision,
      p_checked_at: normalized.checkedAt, p_source_title: normalized.source?.title, p_source_url: normalized.source?.url,
      p_item_ids: items.map(item => item.id), p_items: items,
      p_expected_checked_at: prior?.checked_at || null, p_expected_items: prior?.items || null,
      p_notification_items: items.filter(item => matchFeedItemToWatch(item, watch).matched),
    });
    if (completion.error) throw Object.assign(new Error('Check not saved'), { code: 'PERSISTENCE_UNAVAILABLE' });
    if (completion.data?.status !== 'completed') return send(409, { code: 'MEDIA_CONFLICT' });
    const accepted = new Set(completion.data.matchedItems.map(item => item.id));
    const canonical = item => ({ ...item, id: item.identityKeys[0] });
    // The database's durable identity ledger decides which articles are unseen.
    // Reuse the existing formatter with that decision, including stable update IDs.
    const result = applyFeedCheckResult({ ...watch, ...(prior ? {
      monitoringSnapshot: { itemIds: items.filter(item => !accepted.has(item.id)).map(item => item.identityKeys[0]) },
    } : {}) }, { ...feed, items: items.map(canonical) });
    result.outcome = completion.data.outcome;
    result.changes.lastCheckOutcome.type = result.outcome;
    result.changes.lastCheckResult.type = result.outcome;
    result.changes.lastCheckAttempt.outcome = result.outcome;
    result.newItems = result.unseenItems = completion.data.unseenItems.map(canonical);
    for (const key of ['lastCheckOutcome','lastCheckResult']) {
      result.changes[key].newItemIds = result.newItems.map(item => item.id);
      result.changes[key].diagnostics.unseenItemCount = result.newItems.length;
    }
    result.changes.initialContext = prior
      ? (prior.initial_items === null || prior.initial_items === undefined ? null : { checkedAt: prior.baseline_at, items: prior.initial_items })
      : { checkedAt: normalized.checkedAt, items };
    return send(200, result);
  } catch (error) {
    // CAS prevents a failed/stale request from damaging a newer successful check.
    if (row && service) {
      try { await service.rpc('fail_manual_media_watch_check', {
        p_watch_id: row.id, p_user_id: row.user_id, p_revision: row.media_revision, p_expected_checked_at: prior?.checked_at || null, p_code: error.code || 'CHECK_FAILED',
      }); } catch { /* Do not replace the original failure. */ }
    }
    return send(error.statusCode || 503, { code: error.code || 'CHECK_FAILED' });
  }
};
