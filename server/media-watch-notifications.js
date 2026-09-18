import { safeEmailCode, definiteProviderFailure, emailFailureCounts, countEmailFailure, unavailableEmailResult } from './watch-email-config.js';
import { withinMediaDeadline } from './media-deadline.js';
import { randomUUID } from 'node:crypto';
import { createMediaNotificationIdempotencyKey, getMediaWatchEmailConfig, renderMediaWatchEmail, sendWithResend } from './media-watch-email.js';

const LIMIT = 25; const CONCURRENCY = 3;
const mapBounded = async (rows, worker) => { let cursor = 0; await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => { while (cursor < rows.length) await worker(rows[cursor++]); })); };
export const processMediaWatchEmailNotifications = async ({ client, env = process.env, sender = sendWithResend, createClaimToken = randomUUID, deadline = Date.now() + 30000 } = {}) => {
  const config = getMediaWatchEmailConfig(env); if (!config) return unavailableEmailResult(env, 'MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED');
  const counts = emailFailureCounts();
  const request = (operation) => withinMediaDeadline(operation, deadline);
  const expired = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: pending, error } = await request(() => client.from('media_watch_notifications').select('id').eq('status', 'pending')
    .or(`claim_token.is.null,claimed_at.lt.${expired}`).order('created_at').order('watch_id').order('article_position').order('id').range(0, LIMIT - 1));
  if (error) throw Object.assign(new Error('Media notification outbox unavailable.'), { code: 'DATABASE_ERROR' });
  let sentCount = 0; let failedCount = 0; let skippedCount = 0;
  await mapBounded(pending || [], async ({ id }) => { const token = createClaimToken(); let claimed; let boundaryAttempted = false; let deliveredSuccessfully = false;
    try {
      if (Date.now() >= deadline) { skippedCount += 1; return; }
      const claim = await request(() => client.rpc('claim_media_watch_email_notification', { p_notification_id: id, p_claim_token: token })); if (claim.error) throw Object.assign(new Error('Claim failed.'), { code: 'DATABASE_ERROR' });
      claimed = claim.data; if (!claimed) { skippedCount += 1; return; }
      counts.claimedCount += 1;
      const [auth, locale] = await Promise.all([request(() => client.auth.admin.getUserById(claimed.user_id)), request(() => client.rpc('get_media_watch_notification_locale', { p_user_id: claimed.user_id }))]);
      if (auth.error || !auth.data?.user?.email || !auth.data.user.email_confirmed_at) throw Object.assign(new Error('Recipient unavailable.'), { code: 'RECIPIENT_UNVERIFIED' });
      if (locale.error) throw Object.assign(new Error('Locale unavailable.'), { code: 'RECIPIENT_LOCALE_UNAVAILABLE' });
      const content = renderMediaWatchEmail({ locale: locale.data, watchId: claimed.watch_id, watchTitle: claimed.watch_title, article: claimed.article, baseUrl: config.baseUrl });
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
  return { ...counts, status: failedCount ? 'partial-success' : 'success', pendingCount: (pending || []).length, sentCount, failedCount, skippedCount };
};
