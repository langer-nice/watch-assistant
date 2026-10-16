import { structuredCreationEnabled } from './structured-creation-access.js';
import { parseAsciiEmailAddress, getWatchEmailCredentials } from './watch-email-config.js';

// Intent creation is independent of delivery. Neither flag is enabled by default.
export const structuredMediaNotificationIntentsEnabled = env =>
  env?.STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED === 'true' && structuredCreationEnabled(env);

export const structuredEmailTestOwners = env => String(env?.STRUCTURED_WATCH_TEST_USER_IDS || '')
  .split(',').map(value => value.trim()).filter(value => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value));
const address = value => { const parsed = parseAsciiEmailAddress(value); return parsed ? `${parsed.localPart}@${parsed.domain}` : null; };
const recipients = env => {
  const values = String(env?.STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS || '').split(',').map(value => value.trim());
  return values.length <= 3 && values.every(value => !value.includes('*') && address(value)) ? values.map(address) : [];
};
export const structuredMediaStagingEmailTestEnabled = env =>
  structuredCreationEnabled(env) && env?.VERCEL_ENV === 'preview' && env?.NODE_ENV !== 'test'
  && env?.VERCEL_PROJECT_ID === 'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF'
  && env?.VERCEL_GIT_COMMIT_REF === 'codex/structured-interpretation-v1'
  && env?.STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED === 'true'
  && env?.STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED === 'true'
  && env?.WATCH_EMAIL_NOTIFICATIONS_ENABLED === 'true' && env?.MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED === 'true'
  && structuredEmailTestOwners(env).length > 0 && recipients(env).length > 0;

// Server-side pin: Vercel alias metadata verified on 2026-10-16 against the
// exact project/branch above. See docs/structured-media-notifications.md.
// An environment-variable string alone cannot add another trusted alias.
const stagingBranchHost = 'watch-assistant-git-codex-structured-interpre-7598f2-david-lang.vercel.app';
const structuredMediaAppOriginAllowed = env => {
  const raw = env?.WATCH_APP_BASE_URL;
  if (typeof raw !== 'string') return false;
  let url;
  try { url = new URL(raw); } catch { return false; }
  // Inspect the original setting before credential parsing strips components.
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || (raw !== url.origin && raw !== `${url.origin}/`)) return false;
  if (!/^[a-z0-9-]+\.vercel\.app$/.test(env?.VERCEL_URL || '')) return false;
  if (url.origin === `https://${env.VERCEL_URL}`) return true;
  return url.hostname === stagingBranchHost && env.VERCEL_BRANCH_URL === stagingBranchHost;
};

export const getStructuredMediaStagingEmailConfig = env => {
  if (!structuredMediaStagingEmailTestEnabled(env) || !structuredMediaAppOriginAllowed(env)) return null;
  const config = getWatchEmailCredentials(env);
  return config;
};
export const structuredMediaEmailDeliveryAllowed = (env, owner, recipient) =>
  Boolean(getStructuredMediaStagingEmailConfig(env)) && structuredEmailTestOwners(env).includes(owner)
  && Boolean(address(recipient)) && recipients(env).includes(address(recipient));
