import {mediaDailyDigestEnabled} from './media-watch-digest.js';
import {structuredMediaNotificationIntentsEnabled} from './structured-media-notification-gates.js';
import { requireStructuredCreationAccess } from './structured-creation-access.js';
import { hasDefinitionVersion } from '../src/js/watch-definition.js';
import { currencyCriteriaFor, applyCurrencyCheckResult } from '../src/js/currency-watch.js';
import { fetchCurrencyRate } from './currency-rate.js';
import { validateMediaQuery } from '../src/js/media-provider-query.js';
import { authenticateSupabaseRequest } from './supabase-user.js';
import { createSupabaseServiceClient } from './supabase-service.js';
import { fetchAndNormalizeFeed } from './check-watch-api.js';
import { mediaArticleIdentityKeys } from './media-article-identity.js';
import { applyFeedCheckResult, matchFeedItemToWatch } from '../src/js/watch-monitoring.js';

export const createMediaWatchCheckMiddleware = ({ authenticate = authenticateSupabaseRequest,
  serviceClient, fetchCurrency = fetchCurrencyRate, fetchFeed = fetchAndNormalizeFeed, ...options } = {}) => async (request, response, next) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname !== '/api/media-watches' || url.searchParams.get('action') !== 'check') return next?.();
  const send = (status, body) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'POST') return send(405, { code: 'METHOD_NOT_ALLOWED' });
  let row; let prior; let service; let lease;
  const leasedParams = (params = {}) => ({ p_watch_id: row.id, p_owner: row.user_id,
    p_revision: row.media_revision, p_token: lease, p_manual: true,
    p_checked_at: params.p_checked_at || null, p_source_title: params.p_source_title || null,
    p_source_url: params.p_source_url || null, p_items: params.p_items || [],
    p_expected_checked_at: prior?.checked_at || null, p_expected_items: prior?.items || null,
    p_matching: params.p_notification_items || [], p_error: params.p_error || null });
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
    if (!['feed','currency'].includes(row.monitoring_source?.type)) return send(400, { code: 'INVALID_MONITORING_SOURCE' });
    if (Number(row.media_revision) !== body.revision) return send(409, { code: 'MEDIA_CONFLICT' });
    // Only the owner-filtered persisted definition selects structured dispatch.
    // The authenticated read is needed to distinguish legacy Watches; reject
    // structured execution before service-client initialization or side effects.
    if (hasDefinitionVersion(row.watch_definition)) {
      requireStructuredCreationAccess(user, options.env || process.env);
      validateMediaQuery(row.watch_definition, row.monitoring_source);
    }
    prior = Array.isArray(row.media_watch_snapshots) ? row.media_watch_snapshots[0] : row.media_watch_snapshots;
    service = serviceClient || createSupabaseServiceClient(options);
    if (hasDefinitionVersion(row.watch_definition) && (options.env || process.env).STRUCTURED_MEDIA_SCHEDULED_ENABLED === 'true') {
      const claim = await service.rpc('claim_structured_media_manual_check', {
        p_watch_id: row.id, p_owner: user.id, p_revision: row.media_revision,
      });
      if (claim.error) throw Object.assign(new Error('Manual claim unavailable'), { code: 'PERSISTENCE_UNAVAILABLE' });
      if (!claim.data?.lease_token) return send(409, { code: 'MEDIA_CONFLICT' });
      lease = claim.data.lease_token;
      row = claim.data;
      prior = Array.isArray(row.media_watch_snapshots) ? row.media_watch_snapshots[0] : row.media_watch_snapshots;
    }
    if (row.monitoring_source.type === 'currency') {
      if (row.monitoring_state !== 'monitoring') return send(409, { code: 'MEDIA_CONFLICT' });
      const watch = { ...row.watch_definition, id: row.id, status: row.current_status,
        currencyEvaluation: row.currency_evaluation,
        currencySatisfied: Boolean(row.last_change_item_id?.startsWith(`currency:${row.watch_definition.currencyRevision}:`)) };
      if (!currencyCriteriaFor(watch)) return send(400, { code: 'INVALID_CURRENCY_CRITERIA' });
      const result = applyCurrencyCheckResult(watch, await fetchCurrency(watch.request));
      const snapshot = result.changes.monitoringSnapshot;
      const completion = await service.rpc('complete_currency_watch_check', {
        p_watch_id: row.id, p_expected_revision: body.revision,
        p_checked_at: snapshot.checkedAt, p_source_title: snapshot.source.title, p_source_url: snapshot.source.url,
        p_item_ids: snapshot.itemIds, p_items: snapshot.items,
        p_expected_checked_at: prior?.checked_at || null, p_expected_items: prior?.items || null,
        p_outcome: result.outcome, p_evaluation: result.changes.currencyEvaluation,
        p_notification_items: result.matchedItems, p_enqueue_notifications: false,
      });
      if (completion.error) throw Object.assign(new Error('Check not saved'), { code: 'PERSISTENCE_UNAVAILABLE' });
      if (completion.data === 'skipped') return send(409, { code: 'MEDIA_CONFLICT' });
      return send(200, result);
    }
    validateMediaQuery(row.watch_definition, row.monitoring_source);
    const feed = await fetchFeed(row.monitoring_source.url,{roleContext:{criteria:row.watch_definition?.plan?.criteria,baselineAt:prior?.baseline_at,priorItems:prior?.items}});
    const watch = { ...row.watch_definition, id: row.id, monitoringSource: row.monitoring_source, status: row.current_status };
    const normalized = applyFeedCheckResult(watch, feed).changes.monitoringSnapshot;
    const items = normalized.items.map(item => ({ ...item, identityKeys: mediaArticleIdentityKeys(item) }));
    const completionParams = {
      p_watch_id: row.id, p_user_id: user.id, p_expected_revision: body.revision,
      p_checked_at: normalized.checkedAt, p_source_title: normalized.source?.title, p_source_url: normalized.source?.url,
      p_item_ids: items.map(item => item.id), p_items: items,
      p_expected_checked_at: prior?.checked_at || null, p_expected_items: prior?.items || null,
      p_notification_items: items.filter(item => matchFeedItemToWatch(item, watch).matched),
    };
    const completion = lease
      ? await service.rpc(mediaDailyDigestEnabled(options.env || process.env)
        && structuredMediaNotificationIntentsEnabled(options.env || process.env)
        ? 'finish_structured_manual_check_with_digest' : 'finish_structured_media_check', leasedParams(completionParams))
      : await service.rpc('complete_manual_media_watch_check', completionParams);
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
    if (hasDefinitionVersion(row.watch_definition) && row.monitoring_state === 'paused') result.changes.status = 'paused';
    return send(200, result);
  } catch (error) {
    // CAS prevents a failed/stale request from damaging a newer successful check.
    if (row && service) {
      try { if (lease) await service.rpc('finish_structured_media_check', leasedParams({p_error:error.code || 'CHECK_FAILED'}));
      else await service.rpc(row.monitoring_source.type === 'currency' ? 'fail_scheduled_media_watch_check' : 'fail_manual_media_watch_check', {
        p_watch_id: row.id, p_revision: row.media_revision, p_expected_checked_at: prior?.checked_at || null, ...(row.monitoring_source.type === 'currency' ? {} : { p_user_id: row.user_id, p_code: error.code || 'CHECK_FAILED' }),
      }); } catch { /* Do not replace the original failure. */ }
    }
    return send(error.statusCode || 503, { code: error.code || 'CHECK_FAILED' });
  }
};
