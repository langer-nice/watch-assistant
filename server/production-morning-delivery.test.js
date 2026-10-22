import test from 'node:test';
import assert from 'node:assert/strict';
import {getStructuredMediaProductionDigestConfig,getStructuredMediaStagingEmailConfig} from './structured-media-notification-gates.js';
import {morningReportWindow,generateMorningReport} from './morning-report.js';
import {parisDigestWindow,processMediaWatchDigests} from './media-watch-digest.js';
import {createCompanyMonitoringCronHandler} from './company-monitoring-cron.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',watch='cccccccc-cccc-4ccc-8ccc-cccccccccccc',digest='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const at=Date.parse('2026-10-25T07:15Z');
const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',MORNING_REPORT_PRODUCTION_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',CRON_SECRET:'offline',STRUCTURED_MEDIA_PRODUCTION_DIGEST_ENABLED:'true',STRUCTURED_MEDIA_PRODUCTION_DIGEST_ELIGIBLE_AFTER:'2026-10-25T07:00:00Z',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_APP_BASE_URL:'https://watch-assistant-omega.vercel.app',WATCH_EMAIL_FROM:'notifications@watch.davidlangdesign.com',RESEND_API_KEY:'offline'};
test('Production morning route observes Paris windows across both DST transitions and auth',async()=>{
 for(const [day,hour] of [['2026-10-24','06'],['2026-10-25','07'],['2027-03-28','06']]){
  assert(morningReportWindow(`${day}T${hour}:00Z`));assert(!parisDigestWindow(`${day}T${hour}:14:59Z`).open);assert(parisDigestWindow(`${day}T${hour}:15Z`).open);assert(!morningReportWindow(`${day}T${hour}:30Z`));
 }
 let stamp=at-15*60000;const calls=[];
 const handler=createCompanyMonitoringCronHandler({env,now:()=>stamp,clientFactory:()=>({}),structuredRunner:async()=>{calls.push('due');return {claimed:0};},morningReportProcessor:async()=>{calls.push('report');return {status:'completed'};},productionDigestProcessor:async args=>{assert(args.structuredProduction);calls.push('digest');return {};},runner:()=>assert.fail('Legacy cadence unchanged'),mediaRunner:()=>assert.fail('No extra legacy run'),logger:{error(){}}});
 const res={setHeader(){},end(){}};const req={method:'GET',url:'/api/cron/company-monitoring?scope=structured-morning',headers:{authorization:'Bearer offline'}};
 await handler({...req,headers:{}},res);assert.equal(res.statusCode,401);assert.equal(calls.length,0);
 await handler(req,res);assert.deepEqual(calls,['due','report']);calls.length=0;stamp=at;
 await handler(req,res);assert.deepEqual(calls,['due','report','digest']);calls.length=0;stamp=at+15*60000;
 await handler(req,res);assert.equal(calls.length,0);
});
test('reports require enabled authenticated window and completed owner context, never consume outbox',async()=>{
 const noSQL={rpc:()=>assert.fail('No SQL outside conditions')};
 for(const args of [{env,schedulerAuthorized:false,at},{env,at:at+3600000,schedulerAuthorized:true},{env:{...env,MORNING_REPORT_PRODUCTION_ENABLED:undefined},at,schedulerAuthorized:true}])assert.equal((await generateMorningReport({client:noSQL,...args})).status,'disabled');
 const calls=[];const client={rpc:async name=>{calls.push(name);return {data:name==='production_watch_owners'?[owner]:{pending:1}};}};
 assert.equal((await generateMorningReport({client,env,at,schedulerAuthorized:true})).reports[0].status,'awaiting-completed-checks');assert.deepEqual(calls,['production_watch_owners','morning_report_context']);
});
test('Production transport is independently OFF, project/origin/cutoff pinned; Staging guard unchanged',async()=>{
 assert(getStructuredMediaProductionDigestConfig(env,at));assert.equal(getStructuredMediaStagingEmailConfig(env),null);
 for(const change of [{STRUCTURED_PRODUCTION_ENABLED:undefined},{STRUCTURED_MEDIA_PRODUCTION_DIGEST_ENABLED:undefined},{STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:undefined},{WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},{MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},{STRUCTURED_MEDIA_PRODUCTION_DIGEST_ELIGIBLE_AFTER:undefined},{STRUCTURED_MEDIA_PRODUCTION_DIGEST_ELIGIBLE_AFTER:'bad'},{STRUCTURED_MEDIA_PRODUCTION_DIGEST_ELIGIBLE_AFTER:'2027-01-01T00:00:00Z'},{VERCEL_ENV:'preview'},{SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co'},{STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'test@example.test'},{WATCH_APP_BASE_URL:'https://preview.example.test'}]){
  assert.equal(getStructuredMediaProductionDigestConfig({...env,...change},at),null);
  const r=await processMediaWatchDigests({client:{rpc:()=>assert.fail('No SQL when disabled')},env:{...env,...change},structuredProduction:true,now:()=>at,sender:()=>assert.fail('No send')});assert.equal(r.status,'disabled');
 }
});
test('Production digest reuses claims/begin/idempotency with confirmed real owner; no Preview permissions',async()=>{
 let recipient=owner,begin=true,providerError=false;const calls=[],sent=[];
 const client={auth:{admin:{getUserById:async id=>({data:{user:{id:recipient,email:'owner@example.test',email_confirmed_at:'confirmed'}}})}},rpc:async(name,args)=>{
  calls.push([name,args]);if(name==='production_watch_owners')return {data:[owner]};
  if(name==='prepare_production_structured_digests')return {data:[digest]};
  if(name==='claim_production_structured_digest')return {data:{id:digest,watch_id:watch,user_id:owner,is_structured:true,period:'2026-10-25',watch_title:'Existing',articles:[{id:'fresh',article:{title:'Fresh',url:'https://example.test/fresh'}}]}};
  if(name==='get_media_watch_notification_locale')return {data:'en'};
  if(name==='begin_media_watch_digest')return {data:begin};return {data:true};
 }};
 const run=()=>processMediaWatchDigests({client,env,structuredProduction:true,now:()=>at,sender:async args=>{sent.push(args);if(providerError)throw Error('unknown outcome');return {id:'mock-provider'};}});
 assert.equal((await run()).sentCount,1);assert.equal(sent[0].to,'owner@example.test');assert.match(sent[0].idempotencyKey,/^watch-digest-/);assert(calls.some(([name,args])=>name==='claim_production_structured_digest'&&args.p_owners[0]===owner));
 sent.length=0;calls.length=0;recipient=other;await run();assert.equal(sent.length,0);assert(!calls.some(([n])=>n==='begin_media_watch_digest'));assert(calls.some(([n])=>n==='defer_structured_digest_before_send'));
 recipient=owner;begin=false;await run();assert.equal(sent.length,0);
 begin=true;providerError=true;calls.length=0;await run();assert(calls.some(([n,a])=>n==='finish_media_watch_digest'&&a.p_error==='EMAIL_DELIVERY_OUTCOME_UNKNOWN'));assert(!calls.some(([n])=>n==='defer_structured_digest_before_send'));
});
