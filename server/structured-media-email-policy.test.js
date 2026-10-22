import test from 'node:test';
import assert from 'node:assert/strict';
import {getStructuredMediaStagingEmailConfig,structuredMediaEmailDeliveryAllowed} from './structured-media-notification-gates.js';
import {getMediaWatchEmailConfig,renderMediaWatchEmail} from './media-watch-email.js';
import {processMediaWatchEmailNotifications} from './media-watch-notifications.js';
import {createCompanyMonitoringCronHandler} from './company-monitoring-cron.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',VERCEL_URL:'synthetic-preview.vercel.app',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'owner@example.test',RESEND_API_KEY:'dummy-offline',WATCH_EMAIL_FROM:'watch@davidlangdesign.com',WATCH_APP_BASE_URL:'https://synthetic-preview.vercel.app'};
for(const changes of [{STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:undefined},{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{SUPABASE_URL:'https://wrong.example.test'},{VERCEL_PROJECT_ID:'prj_wrong'},{VERCEL_GIT_COMMIT_REF:'other'},{VERCEL_GIT_COMMIT_REF:undefined},{WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},{MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},{STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'false'},{STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'*@example.test'},{STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:''},{WATCH_APP_BASE_URL:'https://unrelated.example.test'},{NODE_ENV:'test'}])test('Staging default-deny '+Object.keys(changes)[0]+' '+String(Object.values(changes)[0]),()=>assert.equal(getStructuredMediaStagingEmailConfig({...env,...changes}),null));
test('exact recipient only, confirmed trusted owner required',()=>{assert(getStructuredMediaStagingEmailConfig(env));assert.equal(getMediaWatchEmailConfig(env),null);assert(structuredMediaEmailDeliveryAllowed(env,owner,'owner@example.test'));for(const email of [undefined,'other@example.test','OWNER@example.test','owner@example.test.evil','owner@example.test\nBcc:x'])assert.equal(structuredMediaEmailDeliveryAllowed(env,owner,email),false);assert.equal(structuredMediaEmailDeliveryAllowed(env,'wrong','owner@example.test'),false);});
function client({email='owner@example.test',structured=true,begun=true,confirmed=true}={}){
 const calls=[];const q={select(s){calls.push(s);return this;},eq(){return this;},in(){return this;},or(){return this;},order(){return this;},range:async()=>({data:[{id:'fixture'}]})};
 return{calls,from:()=>q,auth:{admin:{getUserById:async user=>{assert.equal(user,owner);return{data:{user:{email,email_confirmed_at:confirmed?'now':null}}};}}},rpc:async(name,p)=>{calls.push(name);if(name==='claim_structured_media_test_email_notification'){assert.deepEqual(p.p_owners,[owner]);return{data:{is_structured:structured,user_id:owner,watch_id:'watch',source_article_id:'id:synthetic',watch_title:'Fixture',article:{title:'Publisher headline',url:'https://example.test/article'}}};}if(name==='get_media_watch_notification_locale')return{data:'fr'};if(name==='begin_media_watch_email_submission')return{data:begun};return{data:true};}};
}
test('isolated Staging worker uses dedicated claim and existing sender with trusted recipient',async()=>{const c=client();let sent=0;const r=await processMediaWatchEmailNotifications({client:c,env,sender:async message=>{sent++;assert.equal(message.to,'owner@example.test');assert.match(message.html,/lang="fr"/);assert.match(message.text,/connexion requise/);return{id:'synthetic-provider'};}});assert.equal(r.sentCount,1);assert.equal(sent,1);assert(!c.calls.includes('claim_media_watch_email_notification'));assert.equal(getMediaWatchEmailConfig({...env,VERCEL_ENV:'production'}).baseUrl,env.WATCH_APP_BASE_URL+'/');});
for(const scenario of [{email:'other@example.test'},{email:null},{confirmed:false},{structured:false},{begun:false}])test('worker rejects recipient/scope/current consent '+JSON.stringify(scenario),async()=>{const c=client(scenario);const r=await processMediaWatchEmailNotifications({client:c,env,sender:()=>assert.fail('Provider forbidden')});assert.equal(r.sentCount,0);assert.equal(r.failedCount,1);assert(!JSON.stringify(r).includes('owner@example.test'));});
for(const locale of ['en','fr'])test('authenticated preferences link is safe and descriptive '+locale,()=>{const r=renderMediaWatchEmail({structured:true,locale,watchId:'watch&x',watchTitle:'Fixture',article:{title:'News',url:'https://example.test/article'},baseUrl:'https://synthetic-preview.vercel.app'});assert(r.text.includes('https://synthetic-preview.vercel.app/watch-detail.html?id=watch%26x#email-notifications'));assert(r.text.includes(locale==='fr'?'connexion requise':'sign-in required'));assert(!r.text.includes('one-click'));});
for(const [name,changes,authorization,status] of [['authorized',{},'Bearer synthetic',200],['missing test gate',{STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'false'},'Bearer synthetic',404],['wrong branch',{VERCEL_GIT_COMMIT_REF:'other'},'Bearer synthetic',404],['wrong cron credential',{},'Bearer wrong',401]])test('isolated existing cron email-test scope '+name,async()=>{
 let deliveries=0,body;const handler=createCompanyMonitoringCronHandler({env:{...env,...changes,CRON_SECRET:'synthetic'},clientFactory:()=>({}),runner:()=>assert.fail('No legacy Company'),mediaRunner:()=>assert.fail('No legacy Media/Currency'),structuredRunner:()=>assert.fail('No monitoring'),structuredNotificationProcessor:async()=>{deliveries++;return{status:'success',sentCount:1};}});
 const response={setHeader(){},end(raw){body=JSON.parse(raw);}};await handler({method:'GET',url:'/api/cron/company-monitoring?scope=structured-media-email-test',headers:{authorization}},response);assert.equal(response.statusCode,status);assert.equal(deliveries,status===200?1:0);if(status===200)assert.equal(body.notifications.sentCount,1);
});

// Exact alias independently recorded by the 2026-10-16 Vercel metadata audit.
const branchHost='watch-assistant-git-codex-structured-interpre-7598f2-david-lang.vercel.app';
const branchOrigin=`https://${branchHost}`;
const branchEnv={...env,VERCEL_BRANCH_URL:branchHost,WATCH_APP_BASE_URL:branchOrigin};
test('deployment-specific origin remains accepted without branch-alias configuration',()=>{
 assert(getStructuredMediaStagingEmailConfig(env));
 assert(getStructuredMediaStagingEmailConfig({...env,WATCH_APP_BASE_URL:env.WATCH_APP_BASE_URL+'/'}));
});
test('pinned Staging branch origin accepted with matching system branch identity',()=>{
 assert.equal(getStructuredMediaStagingEmailConfig(branchEnv).baseUrl,branchOrigin+'/');
 assert.equal(getStructuredMediaStagingEmailConfig({...branchEnv,WATCH_APP_BASE_URL:branchOrigin+'/'}).baseUrl,branchOrigin+'/');
});
for(const [label,changes] of [
 ['wrong project',{VERCEL_PROJECT_ID:'prj_wrong'}],
 ['wrong branch',{VERCEL_GIT_COMMIT_REF:'other'}],
 ['Production',{VERCEL_ENV:'production'}],
 ['shared Preview origin',{WATCH_APP_BASE_URL:'https://shared-preview.vercel.app'}],
 ['another branch',{WATCH_APP_BASE_URL:'https://another-git-branch.vercel.app',VERCEL_BRANCH_URL:'another-git-branch.vercel.app'}],
 ['unknown Vercel origin',{WATCH_APP_BASE_URL:'https://untrusted.vercel.app',VERCEL_BRANCH_URL:'untrusted.vercel.app'}],
 ['wildcard',{WATCH_APP_BASE_URL:'https://*.vercel.app'}],
 ['HTTP',{WATCH_APP_BASE_URL:'http://'+branchHost}],
 ['credentials',{WATCH_APP_BASE_URL:'https://user:password@'+branchHost}],
 ['query',{WATCH_APP_BASE_URL:branchOrigin+'?source=email'}],
 ['fragment',{WATCH_APP_BASE_URL:branchOrigin+'#settings'}],
 ['path',{WATCH_APP_BASE_URL:branchOrigin+'/unexpected'}],
 ['normalized path',{WATCH_APP_BASE_URL:branchOrigin+'/%2e/'}],
 ['malformed host',{WATCH_APP_BASE_URL:'https://bad_host.vercel.app'}],
 ['missing branch alias',{VERCEL_BRANCH_URL:undefined}],
 ['empty branch alias',{VERCEL_BRANCH_URL:''}],
 ['ambiguous branch alias',{VERCEL_BRANCH_URL:branchHost+',other.vercel.app'}],
 ['alias array',{VERCEL_BRANCH_URL:[branchHost]}],
 ['missing project',{VERCEL_PROJECT_ID:undefined}],
 ['missing branch identity',{VERCEL_GIT_COMMIT_REF:undefined}],
 ['missing deployment identity',{VERCEL_URL:undefined}],
 ['wrong Supabase',{SUPABASE_URL:'https://other.example.test'}],
 ['port',{WATCH_APP_BASE_URL:branchOrigin+':8443'}],
 ['explicit default port',{WATCH_APP_BASE_URL:branchOrigin+':443'}],
 ['redirect-like path',{WATCH_APP_BASE_URL:branchOrigin+'//evil.example.test'}],
 ['lookalike suffix',{WATCH_APP_BASE_URL:branchOrigin+'.evil.example.test'}],
 ['whitespace',{WATCH_APP_BASE_URL:' '+branchOrigin}],
 ['missing configured origin',{WATCH_APP_BASE_URL:undefined}],
 ['missing explicit test gate',{STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:undefined}],
])test('branch-origin default-deny: '+label,()=>assert.equal(getStructuredMediaStagingEmailConfig({...branchEnv,...changes}),null));
for(const suffix of ['?x=1','#fragment','/unexpected',':8443'])test('deployment origin also rejects unexpected URL components '+suffix,()=>assert.equal(getStructuredMediaStagingEmailConfig({...env,WATCH_APP_BASE_URL:env.WATCH_APP_BASE_URL+suffix}),null));
test('Production and legacy origin configuration retain their original behavior',()=>{
 const production={...env,VERCEL_ENV:'production',WATCH_APP_BASE_URL:'https://legacy.example.test/prefix/?x=1#fragment'};
 assert.equal(getMediaWatchEmailConfig(production).baseUrl,'https://legacy.example.test/prefix');
 assert.equal(getStructuredMediaStagingEmailConfig(production),null);
});
test('branch-origin worker generates stable EN/FR links without network trust lookups',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('Network and real Resend forbidden');
 try{
  for(const locale of ['en','fr']){
   const c=client(),rpc=c.rpc;c.rpc=async(name,p)=>name==='get_media_watch_notification_locale'?{data:locale}:rpc(name,p);
   let sent=0;const result=await processMediaWatchEmailNotifications({client:c,env:branchEnv,sender:async message=>{
    sent++;assert.equal(message.to,'owner@example.test');assert(message.text.includes(branchOrigin+'/watch-detail.html?id=watch'));
    assert(message.html.includes(branchOrigin+'/watch-detail.html?id=watch#email-notifications'));assert(message.html.includes('lang="'+locale+'"'));
    return{id:'synthetic-provider'};
   }});assert.equal(result.sentCount,1);assert.equal(sent,1);assert(!c.calls.includes('claim_media_watch_email_notification'));
  }
  for(const scenario of [{email:'other@example.test'},{confirmed:false},{structured:false},{begun:false}]){
   const result=await processMediaWatchEmailNotifications({client:client(scenario),env:branchEnv,sender:()=>assert.fail('Provider forbidden')});
   assert.equal(result.sentCount,0);assert.equal(result.failedCount,1);
  }
 }finally{globalThis.fetch=original;}
});
