import test from 'node:test';
import assert from 'node:assert/strict';
import {parisDigestWindow,processMediaWatchDigests} from './media-watch-digest.js';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',watchId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',digestId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env={SUPABASE_URL:'https://tseexvbwhrtofcsrvcqc.supabase.co',VERCEL_ENV:'preview',VERCEL_URL:'synthetic-preview.vercel.app',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'codex/structured-interpretation-v1',WATCH_APP_BASE_URL:'https://synthetic-preview.vercel.app',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_TEST_USER_IDS:owner,STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED:'true',STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS:'owner@example.test',STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS:watchId,RESEND_API_KEY:'synthetic',WATCH_EMAIL_FROM:'notifications@watch.davidlangdesign.com',MEDIA_WATCH_DAILY_DIGEST_ENABLED:'true'};
const ms=s=>Date.parse(s);
test('CET/CEST and transition dates map 08:00–08:30 Paris with an exclusive closing boundary',()=>{
 for(const [day,hour] of [['2026-01-15',7],['2026-07-15',6],['2026-03-29',6],['2026-10-25',7]]){
  const at=ms(`${day}T0${hour}:00:00Z`);assert.equal(parisDigestWindow(at-1).open,false);assert.equal(parisDigestWindow(at).open,true);assert.equal(parisDigestWindow(at+15*60000).open,true);assert.equal(parisDigestWindow(at+30*60000-1).open,true);assert.equal(parisDigestWindow(at+30*60000).open,false);assert.equal(parisDigestWindow(at).closesAt,at+30*60000);assert.equal(parisDigestWindow(at).utcHour,hour);
 }
 assert.equal(parisDigestWindow(NaN).open,false);
});
const run=async({at='2026-10-18T06:15:00Z',cross,rows,empty=false}={})=>{
 let clock=ms(at),sent=0;const calls=[];
 const client={auth:{admin:{getUserById:async()=>({data:{user:{email:'owner@example.test',email_confirmed_at:'2026-01-01'}}})}},rpc:async(name,args)=>{
  calls.push({name,args});let data;
  if(name==='prepare_scoped_structured_media_digests')data=empty?[]:rows||[{digestId,watchId,ownerId:owner}];
  else if(name==='claim_structured_media_test_digest')data={id:digestId,watch_id:watchId,user_id:owner,is_structured:true,watch_title:'Example',period:'2026-10-18',articles:[{id:'a',article:{title:'A sourced update',url:'https://example.test/a',publishedAt:'2026-10-17T18:00:00Z'}}]};
  else if(name==='get_media_watch_notification_locale'){data='en';if(cross==='before')clock=ms('2026-10-18T06:30:00Z');}
  else if(name==='begin_media_watch_digest'){data=true;if(cross==='after')clock=ms('2026-10-18T06:30:00Z');}
  else if(['defer_structured_digest_before_send','finish_media_watch_digest'].includes(name))data=true;
  else assert.fail(name);
  return {data};
 }};
 const result=await processMediaWatchDigests({client,env,now:()=>clock,sender:async()=>{sent++;return{id:'synthetic-only'};}});return {result,calls,sent};
};
test('late and early scheduler invocations never claim, discard or send pending updates',async()=>{
 for(const at of ['2026-10-18T05:59:59Z','2026-10-18T06:30:00Z','2026-10-18T17:00:00Z']){const r=await run({at});assert.equal(r.result.status,'outside-morning-window');assert.equal(r.sent,0);assert.equal(r.calls.length,0);}
});
test('08:15 sends only the scoped digest using the corresponding UTC opening hour',async()=>{
 const r=await run();assert.equal(r.sent,1);assert.equal(r.result.sentCount,1);assert.equal(r.calls[0].args.p_send_hour,6);assert.equal(r.calls[1].args.p_send_hour,6);
});
test('empty digests send nothing; delayed prepared digests keep oldest priority per Watch',async()=>{
 assert.equal((await run({empty:true})).sent,0);
 const r=await run({rows:[{digestId,watchId,ownerId:owner},{digestId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',watchId,ownerId:owner}]});assert.equal(r.sent,1);assert.equal(r.calls.filter(c=>c.name==='claim_structured_media_test_digest').length,1);
});
for(const cross of ['before','after'])test(`crossing the closing boundary ${cross} begin defers without provider submission or failed notifications`,async()=>{
 const r=await run({cross});assert.equal(r.sent,0);assert.equal(r.calls.at(-1).name,'defer_structured_digest_before_send');assert.equal(r.calls.some(c=>c.name==='finish_media_watch_digest'),false);assert.equal(r.result.failedCount,0);
});
test('native SQL deferral preserves articles, identities and pending updates, rejects wrong token and terminal outcomes',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;create table public.watches(id uuid primary key,user_id uuid,watch_definition jsonb);create table public.media_watch_digests(id uuid primary key,watch_id uuid,user_id uuid,status text,claim_token uuid,claimed_at timestamptz,submission_started_at timestamptz,provider_message_id text,sent_at timestamptz,error_code text);create table public.media_watch_notifications(digest_id uuid,status text,claim_token uuid,claimed_at timestamptz,submission_started_at timestamptz,attempt_count int,article jsonb);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261018195000_staging_digest_morning_deferral.sql',import.meta.url),'utf8'));
 await db.query("insert into watches values($1,$2,'{\"definitionVersion\":\"watch-definition.v1\"}')",[watchId,owner]);
 await db.query("insert into media_watch_digests values($1,$2,$3,'submitting',$4,now(),now(),null,null,null)",[digestId,watchId,owner,owner]);
 await db.query("insert into media_watch_notifications values($1,'pending',$2,now(),now(),1,'{\"title\":\"Preserve me\"}')",[digestId,owner]);
 await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
 assert.equal((await db.query('select defer_structured_digest_before_send($1,$2) ok',[digestId,watchId])).rows[0].ok,false);
 assert.equal((await db.query('select defer_structured_digest_before_send($1,$2) ok',[digestId,owner])).rows[0].ok,true);
 const d=(await db.query('select * from media_watch_digests')).rows[0],n=(await db.query('select * from media_watch_notifications')).rows[0];assert.equal(d.status,'prepared');assert.equal(d.submission_started_at,null);assert.equal(n.status,'pending');assert.equal(n.attempt_count,0);assert.equal(n.article.title,'Preserve me');
 await db.query("update media_watch_digests set status='failed',error_code='EMAIL_DELIVERY_OUTCOME_UNKNOWN',claim_token=$1",[owner]);assert.equal((await db.query('select defer_structured_digest_before_send($1,$2) ok',[digestId,owner])).rows[0].ok,false);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.defer_structured_digest_before_send(uuid,uuid)','execute') ok",[role])).rows[0].ok,false);
 }finally{await db.close();}
});
