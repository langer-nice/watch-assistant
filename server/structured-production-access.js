// Separate opt-in; the existing Preview/test rollout is not widened.
export const productionProjectMatches = env => env?.VERCEL_ENV === 'production'
  && env.VERCEL_PROJECT_ID === 'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF'
  && env.VERCEL_GIT_COMMIT_REF === 'master'
  && env.SUPABASE_URL === 'https://cztpitujsnzhhenedwjn.supabase.co'
  && (!env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL === env.SUPABASE_URL)
  && ['STRUCTURED_WATCH_TEST_USER_IDS','STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED',
    'STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS','STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS']
    .every(key => env[key] === undefined || env[key] === '');
export const structuredProductionEnabled = env => productionProjectMatches(env)
  && env.STRUCTURED_PRODUCTION_ENABLED === 'true';
export const productionExecutionEnabled = env => structuredProductionEnabled(env)
  && env.STRUCTURED_MEDIA_SCHEDULED_ENABLED === 'true';
export const productionReportsEnabled = env => productionProjectMatches(env)
  && env.MORNING_REPORT_PRODUCTION_ENABLED === 'true';
// Keep only protocol diagnostics. Upstream messages/details can contain secrets
// or account data and must never become cron log fields.
export const productionOwnerFailure = (error, status) => {
  const code = /^(PGRST[0-9]{3}|[0-9A-Z]{5})$/.test(error?.code || '')
    ? error.code : 'PRODUCTION_OWNER_CONTEXT_UNAVAILABLE';
  return Object.assign(new Error(code === 'PGRST303'
    ? 'JWT claims validation or parsing failed.' : 'Production owner context unavailable.'), {
    code,
    stage: 'production_watch_owners',
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { upstreamStatus: status } : {}),
  });
};
export const productionWatchOwners = async client => {
  let result;
  try { result = await client.rpc('production_watch_owners'); }
  catch (error) { throw productionOwnerFailure(error); }
  if (result.error) throw productionOwnerFailure(result.error, result.status);
  if (!Array.isArray(result.data) || !result.data.every(id =>
    typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    throw productionOwnerFailure(null, result.status);
  }
  return result.data;
};
