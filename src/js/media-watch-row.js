import {hasDefinitionVersion} from './watch-definition.js';
import {canExecuteStructuredMedia} from './structured-media-execution.js';
const feedSnapshot = row => Array.isArray(row.media_watch_snapshots) ? row.media_watch_snapshots[0] : row.media_watch_snapshots;
const storedCurrency = row => Boolean(row.watch_definition.currencyCriteria || row.watch_definition.plan?.criteria?.kind === 'ecb_threshold');
const feedState = row => {
  const snapshot = feedSnapshot(row);
  return {
    initialContext: snapshot?.initial_items == null ? null : { checkedAt: snapshot.baseline_at, items: snapshot.initial_items },
    ...(snapshot ? { monitoringSnapshot: { checkedAt: snapshot.checked_at, itemIds: snapshot.item_ids, items: snapshot.items } } : {}),
    lastCheckOutcome: row.last_check_outcome ? { type: row.last_check_outcome } : null,
    lastCheckAttempt: row.last_check_error_code ? { status: 'failed', code: row.last_check_error_code, attemptedAt: row.updated_at }
      : row.last_checked_at ? { status: 'succeeded', attemptedAt: row.last_checked_at } : null,
  };
};

export const mapMediaReportRow = (row, ownerId) => ({
  ...row.watch_definition,...(row.v3Engine?{v3Engine:row.v3Engine}:{}), id: row.id, title: row.title, serverReadOnly: Boolean(row.clientReadOnly),
  ...(row.watch_definition.inputType === 'url' ? { isStory: true } : {}),
  monitoringSource: row.monitoring_source, feedUrl: row.monitoring_source.url,
  monitoringState: row.monitoring_state,
  status: row.monitoring_state === 'paused' ? 'paused' : row.current_status,
  createdAt: row.watch_definition?.localCreatedAt || row.created_at,
  ...(!storedCurrency(row) ? feedState(row) : {}),
  lastChecked: row.last_checked_at || null,
  ...(storedCurrency(row) ? {
    currencyEvaluation: row.currency_evaluation || null,
    currencySatisfied: Boolean(row.last_change_item_id?.startsWith(`currency:${row.watch_definition.currencyRevision}:`)),
    lastCheckOutcome: row.last_check_outcome ? { type: row.last_check_outcome } : null,
    lastCheckAttempt: row.last_check_error_code ? { status: 'failed', code: row.last_check_error_code, attemptedAt: row.updated_at }
      : row.last_checked_at ? { status: 'succeeded', attemptedAt: row.last_checked_at } : null,
  } : {}),
  updates: row.currency_watch_events?.length ? row.currency_watch_events.map(event => ({ id: event.id, timestamp: event.detected_at, sourceTitle: event.article.title, sourceUrl: event.article.url, summary: event.article.excerpt, publishedAt: event.article.publishedAt, currencyEvaluation: event.evaluation, status: 'new' })) : row.last_change_item_id ? [{ id: row.last_change_item_id, timestamp: row.media_last_change_detected_at,
    sourceTitle: row.last_change_title, sourceUrl: row.last_change_url, summary: row.last_change_summary,
    publishedAt: row.last_change_published_at, status: 'new' }] : [],
  mediaPersistence: { ownerId, ...(hasDefinitionVersion(row.watch_definition)
    ? { revision: Number(row.media_revision), mutation: row.media_mutation_id } : {}) },
  ...(hasDefinitionVersion(row.watch_definition) ? { structuredExecutionDisabled: !canExecuteStructuredMedia({ ...row.watch_definition, monitoringSource: row.monitoring_source }) } : {}),
});
