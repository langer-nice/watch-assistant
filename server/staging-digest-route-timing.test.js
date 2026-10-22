import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanyMonitoringCronHandler} from './company-monitoring-cron.js';
const owner='4eee8bb6-21c1-46c2-b150-0fa8981a0aef';
const env={CRON_SECRET:'synthetic',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',VERCEL_URL:'fixture.vercel.app',WATCH_APP_BASE_URL:'https://fixture.vercel.app',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true',STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:'account',STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'davidlangnce@gmail.com',RESEND_API_KEY:'synthetic',WATCH_EMAIL_FROM:'notifications@watch.davidlangdesign.com'};
const invoke=async(handler,scope)=>{let body;const response={setHeader(){},end(value){body=JSON.parse(value);}};await handler({method:'GET',url:'/api/cron/company-monitoring?scope='+scope,headers:{authorization:'Bearer '+env.CRON_SECRET}},response);assert.equal(response.statusCode,200);return body;};
test('hourly Staging captures both types without preparing or sending any digest, including at 08:00',async()=>{
 for(const at of ['2026-10-22T06:00:00Z','2026-10-22T06:15:00Z']){
  const calls=[];const handler=createCompanyMonitoringCronHandler({env,now:()=>Date.parse(at),clientFactory:()=>({}),structuredRunner:async()=>{calls.push('structured-check');return{status:'success'};},legacyRunner:async()=>{calls.push('legacy-check');return{status:'success'};},structuredNotificationProcessor:()=>assert.fail('Hourly route must not deliver'),legacyDigestProcessor:()=>assert.fail('Hourly route must not deliver')});
  const result=await invoke(handler,'structured-media');assert.deepEqual(calls.sort(),['legacy-check','structured-check']);assert(!Object.hasOwn(result,'notifications'));
 }
});
test('existing dedicated 08:15 Staging scope still processes both digest types without running monitoring',async()=>{
 const calls=[];const handler=createCompanyMonitoringCronHandler({env,now:()=>Date.parse('2026-10-22T06:15:00Z'),clientFactory:()=>({}),structuredRunner:()=>assert.fail('No monitoring in delivery route'),legacyRunner:()=>assert.fail('No monitoring in delivery route'),structuredNotificationProcessor:async()=>{calls.push('structured-email');return{sentCount:0};},legacyDigestProcessor:async()=>{calls.push('legacy-email');return{sentCount:0};}});
 const result=await invoke(handler,'structured-media-email-test');assert.deepEqual(calls.sort(),['legacy-email','structured-email']);assert.deepEqual(result.notifications,{sentCount:0});assert.deepEqual(result.legacyDigests,{sentCount:0});
});
