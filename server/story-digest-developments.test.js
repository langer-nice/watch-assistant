import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractStoryDigestDevelopments,loadStoryDigestDevelopments} from './story-digest-developments.js';
import {renderMediaWatchDigest} from './media-watch-digest.js';
import {processStagingLegacyDigests,legacyStagingOwner as owner} from './staging-legacy-notifications.js';
const real=JSON.parse(await readFile(new URL('./test-support/fixtures/limoges-digest-20261021.json',import.meta.url)));
const item=real.articles.find(i=>i.article.summary.includes('interpellé'));
const story={inputType:'url',storyProfile:{concepts:[{type:'location',label:'Limoges'},{type:'event',label:'Incendie de l’hôtel de ville'}],userAddedConcepts:[]}};
const run=(articles=real.articles,knownArticles=[],s=story)=>extractStoryDigestDevelopments({story:s,articles,knownArticles});
const render=(developments,locale='fr',articles=real.articles)=>renderMediaWatchDigest({...real,locale,articles,baseUrl:'https://fixture.vercel.app',includeSourceSummaries:true,storyDevelopments:developments});
test('actual Limoges source yields a concise arrest statement in French and English, without AI',()=>{
 const developments=run();assert.equal(developments.length,1);assert.equal(developments[0].fr,'Un suspect a été interpellé.');assert.equal(developments[0].en,'A suspect was arrested.');
 for(const locale of ['fr','en']){const email=render(developments,locale),statement=developments[0][locale];assert(email.text.includes(statement));assert(email.html.includes(statement));assert(email.text.indexOf(statement)<email.text.indexOf(item.article.title));for(const {article} of real.articles)assert(email.text.includes(article.url));assert(email.text.includes(item.article.source));assert(email.text.includes(item.article.summary));assert(email.text.includes(item.article.title));assert(email.text.includes(developments[0].quote));assert(!/garde à vue|custody|convict/.test(statement));}
});
test('unrelated, speculative, denied, negated, questioned and unsupported events keep sourced fallback',()=>{
 for(const title of ['Un suspect a été interpellé après un vol à Bordeaux.','Un suspect pourrait être interpellé pour l’incendie de l’hôtel de ville de Limoges.','La police dément : un suspect a été interpellé dans l’incendie de l’hôtel de ville de Limoges.','Un suspect n’a pas été interpellé dans l’incendie de l’hôtel de ville de Limoges.','Un suspect a été interpellé dans l’incendie de l’hôtel de ville de Limoges ?','L’hôtel de ville de Limoges a reçu un don.']){
  const articles=[{id:'offline',article:{title,summary:title,url:'https://example.test/'}}];assert.deepEqual(run(articles),[],title);assert(render([], 'fr',articles).text.includes(title));
 }
 assert.deepEqual(run(real.articles,[],{inputType:'text'}),[]);
});
test('duplicate reports share one development and retain both links; ambiguous different arrests are not merged',()=>{
 const copy={id:'other',article:{...item.article,url:'https://example.test/second'}};
 const d=run([item,copy]);assert.equal(d.length,1);assert.equal(d[0].sources.length,2);const email=render(d,'fr',[item,copy]);assert.equal(email.text.split(d[0].fr).length-1,1);assert(email.text.includes(copy.article.url));assert(email.text.includes(item.article.url));
 const different={id:'different',article:{...copy.article,summary:"Un homme soupçonné d'être impliqué dans l'incendie de l'hôtel de ville de Limoges interpellé à Paris"}};
 assert.deepEqual(run([item,different]),[]);
});
test('previously known arrest is not a new development under a different title or publisher',()=>{
 const old={...item.article,title:'Previous report of the same arrest'};assert.deepEqual(run([item],[old]),[]);
 const paraphrase={...item.article,title:'Un suspect a été arrêté dans l’incendie de l’hôtel de ville de Limoges.',summary:''};assert.deepEqual(run([item],[paraphrase]),[]);
 const neutral={...item.article,title:'Un homme a été interpellé dans l’incendie de l’hôtel de ville de Limoges.',summary:''};assert.deepEqual(run([item],[neutral]),[]);
 assert(render([]).text.includes(item.article.summary));
});
test('other stories and English sources reuse the same extraction, with unchanged proper names',()=>{
 const s={inputType:'url',storyProfile:{concepts:[{type:'location',label:'York'},{type:'work',label:'River Bridge'}]}};
 const title='The River Bridge in York reopened after repairs.';const result=run([{id:'bridge',article:{title,url:'https://example.test/bridge'}}],[],s);assert.equal(result.length,1);assert.equal(result[0].en,'River Bridge has reopened.');assert.equal(result[0].fr,'River Bridge a rouvert.');
 const article={id:'en',article:{title:'A suspect was arrested in connection with the Limoges city hall fire.',url:'https://example.test/en'}};
 // Story matching retains the existing literal concept contract.
 const enStory={inputType:'url',storyProfile:{concepts:[{type:'location',label:'Limoges'},{type:'event',label:'City hall fire'}]}};
 assert.equal(run([article],[],enStory)[0].en,'A suspect was arrested.');
});
test('context loader reads only the same owner/Watch baseline and sent history; missing context falls back',async()=>{
 const tables=[],filters=[];let count=0;
 const client={from(table){tables.push(table);const q={select(){return q;},eq(k,v){filters.push([table,k,v]);return q;},is(){return q;},order(){return q;},maybeSingle:async()=>({data:table==='watches'?{watch_definition:story}:{initial_items:[]}}),range:async()=>({data:Array.from({length:count},()=>({article:item.article}))})};return q;}};
 const claimed={watch_id:real.watchId,user_id:owner,articles:real.articles};
 assert.equal((await loadStoryDigestDevelopments({client,claimed})).length,1);assert.deepEqual(tables,['watches','media_watch_snapshots','media_watch_notifications']);for(const table of tables)assert(filters.some(f=>f[0]===table&&f[1]==='user_id'&&f[2]===owner));assert(filters.some(f=>f[1]==='status'&&f[2]==='sent'));
 count=101;assert.deepEqual(await loadStoryDigestDevelopments({client,claimed}),[]);assert.deepEqual(await loadStoryDigestDevelopments({client:{},claimed}),[]);
});

const env={CRON_SECRET:'synthetic',SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',VERCEL_URL:'fixture.vercel.app',WATCH_APP_BASE_URL:'https://fixture.vercel.app',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true',STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:'account',STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'davidlangnce@gmail.com',RESEND_API_KEY:'synthetic',WATCH_EMAIL_FROM:'notifications@watch.davidlangdesign.com'};
test('existing Staging digest worker uses the development before its unchanged submission boundary',async()=>{
 const digestId='f0038dce-73d4-4a90-9331-a982174a9831',sent=[],rpc=[];
 const client={rpc:async name=>{rpc.push(name);return{data:name==='prepare_staging_legacy_digests'?[digestId]:name==='claim_staging_legacy_digest'?{id:digestId,user_id:owner,is_structured:false,watch_id:real.watchId,watch_title:real.watchTitle,period:real.period,articles:real.articles}:name==='get_media_watch_notification_locale'?'fr':true};},auth:{admin:{getUserById:async()=>({data:{user:{email:'davidlangnce@gmail.com',email_confirmed_at:'2026-01-01'}}})}}};
 const result=await processStagingLegacyDigests({client,env,now:()=>Date.parse('2026-10-21T06:15:00Z'),developmentBuilder:async()=>run(),sender:async message=>{sent.push(message);return{id:'offline-only'};}});
 assert.equal(result.sentCount,1);assert(sent[0].text.includes('Un suspect a été interpellé.'));assert(sent[0].html.includes('Un suspect a été interpellé.'));
 assert.deepEqual(rpc,['prepare_staging_legacy_digests','claim_staging_legacy_digest','get_media_watch_notification_locale','begin_media_watch_digest','finish_media_watch_digest']);
 await processStagingLegacyDigests({client,env:{...env,VERCEL_ENV:'production'},developmentBuilder:()=>assert.fail('No extraction in Production'),sender:()=>assert.fail('No sending in Production')});assert.equal(sent.length,1);
});
