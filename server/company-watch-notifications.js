import { safeEmailCode, definiteProviderFailure, emailFailureCounts, countEmailFailure, unavailableEmailResult } from './watch-email-config.js';
import { randomUUID } from 'node:crypto';

import {
  createNotificationIdempotencyKey,
  getCompanyWatchEmailConfig,
  renderCompanyWatchEmail,
  sendWithResend,
} from './company-watch-email.js';

const MAX_NOTIFICATIONS_PER_RUN = 25;
const NOTIFICATION_CONCURRENCY = 3;

const loadPendingNotifications = async (client) => {
  const { data, error } = await client.from('company_watch_notifications')
    .select('id')
    .eq('channel', 'email')
    .eq('status', 'pending')
    .order('created_at')
    .range(0, MAX_NOTIFICATIONS_PER_RUN - 1);
  if (error) throw Object.assign(new Error('Notification outbox could not be loaded.'), { code: 'DATABASE_ERROR' });
  return data || [];
};

const claimNotification = async (client, id, claimToken) => {
  const { data, error } = await client.rpc('claim_company_watch_email_notification', {
    p_notification_id: id,
    p_claim_token: claimToken,
  });
  if (error) throw Object.assign(new Error('Notification could not be claimed.'), { code: 'DATABASE_ERROR' });
  return data;
};

const beginSubmission = async (client, id, claimToken) => {
  const { data, error } = await client.rpc('begin_company_watch_email_submission', {
    p_notification_id: id,
    p_claim_token: claimToken,
  });
  if (error || data !== true) {
    throw Object.assign(new Error('Notification submission could not be started.'), { code: 'DATABASE_ERROR' });
  }
};

const loadRecipient = async (client, userId) => {
  const [{ data: authData, error: authError }, { data: locale, error: localeError }] = await Promise.all([
    client.auth.admin.getUserById(userId),
    client.rpc('get_company_watch_notification_locale', { p_user_id: userId }),
  ]);
  const user = authData?.user;
  if (authError || !user?.email || !user.email_confirmed_at) {
    const error = new Error('A verified notification recipient is unavailable.');
    error.code = 'RECIPIENT_UNVERIFIED';
    throw error;
  }
  if (localeError) {
    const error = new Error('The notification locale is unavailable.');
    error.code = 'RECIPIENT_LOCALE_UNAVAILABLE';
    throw error;
  }
  return { email: user.email, locale: locale === 'fr' ? 'fr' : 'en' };
};

const recordFailure = async (client, notificationId, claimToken, error) => {
  const { data, error: persistenceError } = await client.rpc('fail_company_watch_email_notification', {
    p_notification_id: notificationId,
    p_claim_token: claimToken,
    p_error_code: safeEmailCode(error),
  });
  if (persistenceError || data !== true) throw new Error('Failure persistence failed.');
};

const mapBounded = async (entries, concurrency, worker) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (cursor < entries.length) await worker(entries[cursor++]);
  }));
};

export const processCompanyWatchEmailNotifications = async ({
  client,
  env = process.env,
  sender = sendWithResend,
  createClaimToken = randomUUID,
} = {}) => {
  const config = getCompanyWatchEmailConfig(env);
  if (!config) return unavailableEmailResult(env, 'WATCH_EMAIL_NOTIFICATIONS_ENABLED');
  const counts = emailFailureCounts();

  const pending = await loadPendingNotifications(client);
  let sentCount = 0; let failedCount = 0; let skippedCount = 0;
  await mapBounded(pending, NOTIFICATION_CONCURRENCY, async ({ id }) => {
    const claimToken = createClaimToken();
    let notification; let boundaryAttempted = false; let accepted = false;
    try {
      notification = await claimNotification(client, id, claimToken);
      if (!notification) {
        skippedCount += 1;
        return;
      }
      counts.claimedCount += 1;
      const recipient = await loadRecipient(client, notification.user_id);
      const content = renderCompanyWatchEmail({
        locale: recipient.locale,
        watchId: notification.watch_id,
        companyName: notification.company_name,
        event: notification.event,
        baseUrl: config.baseUrl,
      });
      boundaryAttempted = true;
      await beginSubmission(client, id, claimToken);
      const delivered = await sender({
        ...config,
        to: recipient.email,
        ...content,
        idempotencyKey: createNotificationIdempotencyKey({
          watchId: notification.watch_id,
          userId: notification.user_id,
          sourceEventId: notification.source_event_id,
        }),
      });
      accepted = true; counts.submittedCount += 1;
      const { data: markedSent, error: sentError } = await client.rpc(
        'complete_company_watch_email_notification',
        {
          p_notification_id: id,
          p_claim_token: claimToken,
          p_provider_message_id: delivered.id,
        },
      );
      if (sentError || markedSent !== true) {
        throw Object.assign(new Error('Notification delivery could not be recorded.'), { code: 'DATABASE_ERROR' });
      }
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      const code = boundaryAttempted && (accepted || !definiteProviderFailure(error.code))
        ? 'EMAIL_DELIVERY_OUTCOME_UNKNOWN' : safeEmailCode(error);
      countEmailFailure(counts, code);
      if (notification) {
        try { await recordFailure(client, id, claimToken, { code }); } catch { counts.persistenceFailureCount += 1; }
      }
    }
  });
  return {
    status: failedCount ? 'partial-success' : 'success',
    ...counts,
    pendingCount: pending.length,
    sentCount,
    failedCount,
    skippedCount,
  };
};
