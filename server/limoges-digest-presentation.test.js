import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderMediaWatchDigest} from './media-watch-digest.js';
import {processStagingLegacyDigests,legacyStagingOwner as owner} from './staging-legacy-notifications.js';
const fixture=JSON.parse(await readFile(new URL('./test-support/fixtures/limoges-digest-20261021.json',import.meta.url)));
const base={...fixture,locale:'en',baseUrl:'https://fixture.vercel.app'};
const arrest="Un homme soupçonné d'être impliqué";
const env={CRON_SECRET:'synthetic',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',VERCEL_URL:'fixture.vercel.app',WATCH_APP_BASE_URL:'https://fixture.vercel.app',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true',STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:'account',STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'davidlangnce@gmail.com',RESEND_API_KEY:'synthetic',WATCH_EMAIL_FROM:'notifications@watch.davidlangdesign.com'};
for(const locale of ['en','fr'])test('real Limoges digest retains the arrest in HTML and plain text: '+locale,()=>{
 const before=renderMediaWatchDigest({...base,locale});
 assert(!before.text.includes(arrest));assert(!before.html.includes(arrest));
 const after=renderMediaWatchDigest({...base,locale,includeSourceSummaries:true});
 assert(after.text.includes(arrest));assert(after.html.includes('interpellé en Haute-Vienne'));
 assert(after.text.includes('interpellé en Haute-Vienne'));
 for(const {article} of fixture.articles)assert(after.text.includes(article.url));
 assert.equal(after.subject,before.subject);
});
test('source excerpts are escaped and bounded, optional defaults retain existing rendering',()=>{
 const input={...base,articles:[{id:'safe',article:{title:'Headline',url:'https://example.test/',summary:'<script>alert(1)</script>'+ 'x'.repeat(2000)}}]};
 const after=renderMediaWatchDigest({...input,includeSourceSummaries:true});
 assert(!after.html.includes('<script>'));assert(after.html.includes('&lt;script&gt;'));
 assert(!after.text.includes('x'.repeat(1201)));
 assert.deepEqual(renderMediaWatchDigest(input),renderMediaWatchDigest({...input,includeSourceSummaries:false}));
});
test('Staging legacy worker passes the real captured excerpts to its sender without source checks',async()=>{
 const digestId='f0038dce-73d4-4a90-9331-a982174a9831',calls=[],sent=[];
 const client={rpc:async(name)=>{calls.push(name);return {data:name==='prepare_staging_legacy_digests'?[digestId]:name==='claim_staging_legacy_digest'?{id:digestId,user_id:owner,is_structured:false,watch_id:fixture.watchId,watch_title:fixture.watchTitle,period:fixture.period,articles:fixture.articles}:name==='get_media_watch_notification_locale'?'en':true};},auth:{admin:{getUserById:async()=>({data:{user:{email:'davidlangnce@gmail.com',email_confirmed_at:'2026-01-01'}}})}}};
 const result=await processStagingLegacyDigests({client,env,now:()=>Date.parse('2026-10-21T06:15:00Z'),sender:async message=>{sent.push(message);return{id:'offline-fixture'};}});
 assert.equal(result.sentCount,1);assert.equal(sent.length,1);assert(sent[0].html.includes('interpellé en Haute-Vienne'));assert(sent[0].text.includes(arrest));
 assert.deepEqual(calls,['prepare_staging_legacy_digests','claim_staging_legacy_digest','get_media_watch_notification_locale','begin_media_watch_digest','finish_media_watch_digest']);
 await processStagingLegacyDigests({client,env:{...env,VERCEL_ENV:'production'},sender:()=>assert.fail('Production must be disabled')});
 assert.equal(calls.length,5);
});
