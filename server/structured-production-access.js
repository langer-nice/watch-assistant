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
export const productionWatchOwners = async client => {
  const result = await client.rpc('production_watch_owners');
  if (result.error || !Array.isArray(result.data) || !result.data.every(id =>
    typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) throw Error('Production owner context unavailable');
  return result.data;
};
