import { randomUUID } from 'node:crypto';
import { createMediaNotificationIdempotencyKey, getMediaWatchEmailConfig, renderMediaWatchEmail, sendWithResend } from './media-watch-email.js';

const LIMIT = 25; const CONCURRENCY = 3;
const safeCode = (error) => typeof error?.code === 'string' ? error.code.replace(/[^A-Z0-9_-]/giu, '').slice(0, 100) : 'EMAIL_DELIVERY_FAILED';
const mapBounded = async (rows, worker) => { let cursor = 0; await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => { while (cursor < rows.length) await worker(rows[cursor++]); })); };
export const processMediaWatchEmailNotifications = async ({ client, env = process.env, sender = sendWithResend, createClaimToken = randomUUID } = {}) => {
  const config = getMediaWatchEmailConfig(env); if (!config) return { status: 'disabled', pendingCount: 0, sentCount: 0, failedCount: 0, skippedCount: 0 };
  const { data: pending, error } = await client.from('media_watch_notifications').select('id').eq('status', 'pending').order('created_at').range(0, LIMIT - 1);
  if (error) throw Object.assign(new Error('Media notification outbox unavailable.'), { code: 'DATABASE_ERROR' });
  let sentCount = 0; let failedCount = 0; let skippedCount = 0;
  await mapBounded(pending || [], async ({ id }) => { const token = createClaimToken(); let claimed;
    try {
      const claim = await client.rpc('claim_media_watch_email_notification', { p_notification_id: id, p_claim_token: token }); if (claim.error) throw Object.assign(new Error('Claim failed.'), { code: 'DATABASE_ERROR' });
      claimed = claim.data; if (!claimed) { skippedCount += 1; return; }
      const [auth, locale] = await Promise.all([client.auth.admin.getUserById(claimed.user_id), client.rpc('get_media_watch_notification_locale', { p_user_id: claimed.user_id })]);
      if (auth.error || !auth.data?.user?.email || !auth.data.user.email_confirmed_at) throw Object.assign(new Error('Recipient unavailable.'), { code: 'RECIPIENT_UNVERIFIED' });
      if (locale.error) throw Object.assign(new Error('Locale unavailable.'), { code: 'RECIPIENT_LOCALE_UNAVAILABLE' });
      const content = renderMediaWatchEmail({ locale: locale.data, watchId: claimed.watch_id, watchTitle: claimed.watch_title, article: claimed.article, baseUrl: config.baseUrl });
      const begun = await client.rpc('begin_media_watch_email_submission', { p_notification_id: id, p_claim_token: token }); if (begun.error || begun.data !== true) throw Object.assign(new Error('Submission boundary failed.'), { code: 'DATABASE_ERROR' });
      const delivered = await sender({ ...config, to: auth.data.user.email, ...content, idempotencyKey: createMediaNotificationIdempotencyKey({ watchId: claimed.watch_id, userId: claimed.user_id, sourceArticleId: claimed.source_article_id }) });
      const completed = await client.rpc('complete_media_watch_email_notification', { p_notification_id: id, p_claim_token: token, p_provider_message_id: delivered.id }); if (completed.error || completed.data !== true) throw Object.assign(new Error('Completion failed.'), { code: 'DATABASE_ERROR' }); sentCount += 1;
    } catch (failure) { failedCount += 1; if (claimed) { try { await client.rpc('fail_media_watch_email_notification', { p_notification_id: id, p_claim_token: token, p_error_code: safeCode(failure) }); } catch { /* isolate rows */ } } }
  });
  return { status: failedCount ? 'partial-success' : 'success', pendingCount: (pending || []).length, sentCount, failedCount, skippedCount };
};
