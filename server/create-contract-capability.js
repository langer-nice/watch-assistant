import { normalizeWatchContract } from './watch-contract.js';
import { projectWatchContractToLegacyPlan } from './create-contract-projection.js';
import { traceCreateStage } from './create-core-trace.js';

export const createCoreReviewEnabled = env => env.CREATE_CORE_REPLACEMENT_ENABLED === 'true'
  && (['development','test'].includes(env.VERCEL_ENV)
    || (env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === 'codex/create-core-slice3'
      && env.SUPABASE_URL === 'https://tseexvbwhrtofcsrvcqc.supabase.co'
      && ['STRUCTURED_PRODUCTION_ENABLED','STRUCTURED_MEDIA_SCHEDULED_ENABLED',
        'STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED','WATCH_EMAIL_NOTIFICATIONS_ENABLED',
        'MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED','STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED',
        'STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED','MEDIA_WATCH_DAILY_DIGEST_ENABLED',
        'VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED'].every(key => env[key] === 'false')));

// Resolve execution only; never narrow or rewrite the already-grounded meaning.
export function resolveWatchContractCapability(input, createCoreTrace) {
  return traceCreateStage(createCoreTrace,'capability_resolution',()=>{
  const contract=normalizeWatchContract(input,{},createCoreTrace);
  const projection=projectWatchContractToLegacyPlan(contract,createCoreTrace);
  const {assessment}=projection;
  const status=assessment.status==='supported'?'SUPPORTED'
    :assessment.status==='clarification_required'?'PARTIALLY_SUPPORTED':'UNSUPPORTED';
  return {status,adapter:status==='SUPPORTED'?projection.plan.adapter:null,
    unmetRequirements:[...(assessment.issues||[]),...(assessment.clarifications||[])],
    saveEligible:status==='SUPPORTED'&&projection.status==='COMPATIBLE'
      &&projection.plan.adapter==='google_news_literal_v1',projection};
  });
}
