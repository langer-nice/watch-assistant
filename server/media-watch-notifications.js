import {mediaDailyDigestEnabled, processMediaWatchDigests, validStructuredMediaDigestSelection} from './media-watch-digest.js';
import { safeEmailCode, definiteProviderFailure, emailFailureCounts, countEmailFailure, unavailableEmailResult } from './watch-email-config.js';
import { withinMediaDeadline } from './media-deadline.js';
import { randomUUID } from 'node:crypto';
import { createMediaNotificationIdempotencyKey, getMediaWatchEmailConfig, renderMediaWatchEmail, sendWithResend } from './media-watch-email.js';
import { structuredMediaEmailDeliveryAllowed, getStructuredMediaStagingEmailConfig, structuredEmailTestOwners } from './structured-media-notification-gates.js';

const LIMIT = 25; const CONCURRENCY = 3;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const validStructuredMediaEmailSelection = (selection, env) => Boolean(selection
  && typeof selection === 'object' && !Array.isArray(selection)
  && Object.keys(selection).length === 3
  && ['notificationId', 'watchId', 'ownerId'].every(key => uuid(selection[key]))
  && structuredEmailTestOwners(env).includes(selection.ownerId.toLowerCase()));
const mapBounded = async (rows, worker) => { let cursor = 0; await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => { while (cursor < rows.length) await worker(rows[cursor++]); })); };
export const processMediaWatchEmailNotifications = async ({ client, env = process.env, sender = sendWithResend, createClaimToken = randomUUID, deadline = Date.now() + 30000, notificationSelection, digestSelection } = {}) => {
  const productionConfig = getMediaWatchEmailConfig(env);
  const config = productionConfig || getStructuredMediaStagingEmailConfig(env);
  const stagingTest = !productionConfig && Boolean(config);
  if (digestSelection !== undefined) {
    const empty = { ...emailFailureCounts(), pendingCount: 0, sentCount: 0, failedCount: 0, skippedCount: 0 };
    if (notificationSelection !== undefined || !stagingTest || !validStructuredMediaDigestSelection(digestSelection, env)) {
      return { ...empty, status: 'invalid-selection' };
    }
    const digests = await processMediaWatchDigests({client,env,sender,deadline,digestSelection});
    return { ...empty, status: digests.status, digests };
  }
  if (notificationSelection !== undefined && (!stagingTest || !validStructuredMediaEmailSelection(notificationSelection, env))) {
    return { ...emailFailureCounts(), status: 'invalid-selection', pendingCount: 0, sentCount: 0, failedCount: 0, skippedCount: 0 };
  }
  if (!config) return unavailableEmailResult(env, 'MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED');
  const selection = notificationSelection === undefined ? null : Object.fromEntries(Object.entries(notificationSelection).map(([key, value]) => [key, value.toLowerCase()]));
  const digests = notificationSelection === undefined && mediaDailyDigestEnabled(env)
    ? await processMediaWatchDigests({client,env,sender,deadline}) : undefined;
  const counts = emailFailureCounts();
  const request = (operation) => withinMediaDeadline(operation, deadline);
  const expired = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  let query = client.from('media_watch_notifications').select(stagingTest ? 'id,watches!inner(watch_definition,user_id)' : 'id').eq('status', 'pending');
  if (mediaDailyDigestEnabled(env)) query = query.eq('delivery_mode', 'immediate');
  if (stagingTest) query = query.eq('watches.watch_definition->>definitionVersion', 'watch-definition.v1').in('watches.user_id', structuredEmailTestOwners(env));
  if (selection) query = query.eq('id', selection.notificationId).eq('watch_id', selection.watchId)
    .eq('user_id', selection.ownerId).eq('watches.user_id', selection.ownerId)
    .eq('watches.type', 'media_news').is('submission_started_at', null);
  const { data: pending, error } = await request(() => query
    .or(`claim_token.is.null,claimed_at.lt.${expired}`).order('created_at').order('watch_id').order('article_position').order('id').range(0, (stagingTest ? 1 : LIMIT) - 1));
  if (error) throw Object.assign(new Error('Media notification outbox unavailable.'), { code: 'DATABASE_ERROR' });
  if (selection && (!Array.isArray(pending) || pending.length > 1 || pending.some(row => row.id !== selection.notificationId))) {
    throw Object.assign(new Error('Exact notification selection unavailable.'), { code: 'DATABASE_ERROR' });
  }
  let sentCount = 0; let failedCount = 0; let skippedCount = 0;
  await mapBounded(pending || [], async ({ id }) => { const token = createClaimToken(); let claimed; let boundaryAttempted = false; let deliveredSuccessfully = false;
    try {
      if (Date.now() >= deadline) { skippedCount += 1; return; }
      const claim = await request(() => client.rpc(stagingTest ? 'claim_structured_media_test_email_notification' : 'claim_media_watch_email_notification', { p_notification_id: id, p_claim_token: token, ...(stagingTest ? {p_owners: selection ? [selection.ownerId] : structuredEmailTestOwners(env)} : {}) })); if (claim.error) throw Object.assign(new Error('Claim failed.'), { code: 'DATABASE_ERROR' });
      claimed = claim.data; if (!claimed) { skippedCount += 1; return; }
      counts.claimedCount += 1;
      if ((claimed.is_structured && !stagingTest) || (stagingTest && !claimed.is_structured)
        || (selection && (claimed.id !== selection.notificationId || claimed.watch_id !== selection.watchId || claimed.user_id !== selection.ownerId))) {
        throw Object.assign(new Error('Structured email delivery is disabled.'), { code: 'STRUCTURED_EMAIL_DISABLED' });
      }
      const [auth, locale] = await Promise.all([request(() => client.auth.admin.getUserById(claimed.user_id)), request(() => client.rpc('get_media_watch_notification_locale', { p_user_id: claimed.user_id }))]);
      if (auth.error || !auth.data?.user?.email || !auth.data.user.email_confirmed_at) throw Object.assign(new Error('Recipient unavailable.'), { code: 'RECIPIENT_UNVERIFIED' });
      if (stagingTest && !structuredMediaEmailDeliveryAllowed(env, claimed.user_id, auth.data.user.email)) throw Object.assign(new Error('Recipient not authorized.'), {code:'RECIPIENT_UNVERIFIED'});
      if (locale.error) throw Object.assign(new Error('Locale unavailable.'), { code: 'RECIPIENT_LOCALE_UNAVAILABLE' });
      const content = renderMediaWatchEmail({ locale: locale.data, watchId: claimed.watch_id, watchTitle: claimed.watch_title, article: claimed.article, baseUrl: config.baseUrl, structured: claimed.is_structured === true });
      boundaryAttempted = true;
      const begun = await request(() => client.rpc('begin_media_watch_email_submission', { p_notification_id: id, p_claim_token: token }));
      if (!begun.error && begun.data !== true) boundaryAttempted = false;
      if (begun.error || begun.data !== true) throw Object.assign(new Error('Submission boundary failed.'), { code: 'DATABASE_ERROR' });
      const delivered = await request(() => sender({ ...config, to: auth.data.user.email, ...content, idempotencyKey: createMediaNotificationIdempotencyKey({ watchId: claimed.watch_id, userId: claimed.user_id, sourceArticleId: claimed.source_article_id }) }));
      deliveredSuccessfully = true; counts.submittedCount += 1;
      const completed = await request(() => client.rpc('complete_media_watch_email_notification', { p_notification_id: id, p_claim_token: token, p_provider_message_id: delivered.id })); if (completed.error || completed.data !== true) throw Object.assign(new Error('Completion failed.'), { code: 'DATABASE_ERROR' }); sentCount += 1;
    } catch (failure) {
      failedCount += 1;
      const code = boundaryAttempted && (deliveredSuccessfully || !definiteProviderFailure(failure.code))
        ? 'EMAIL_DELIVERY_OUTCOME_UNKNOWN' : safeEmailCode(failure);
      countEmailFailure(counts, code);
      if (claimed) {
        try {
          const saved = await request(() => client.rpc('fail_media_watch_email_notification', {
            p_notification_id: id, p_claim_token: token, p_error_code: code,
          }));
          if (saved.error || saved.data !== true) counts.persistenceFailureCount += 1;
        } catch { counts.persistenceFailureCount += 1; }
      }
    }
  });
  return { ...(digests ? {digests} : {}), ...counts, status: failedCount ? 'partial-success' : 'success', pendingCount: (pending || []).length, sentCount, failedCount, skippedCount };
};
