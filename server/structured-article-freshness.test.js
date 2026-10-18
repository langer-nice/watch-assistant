import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {definitions} from './test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from '../src/js/watch-definition.js';
import {fingerprint} from './structured-watch-authorization.js';
import {mediaArticleIdentityKeys} from './media-article-identity.js';

// Publication timestamps from the four Royal Caribbean articles sent 18 October.
// No private account, Watch, notification or provider identifiers are fixtures.
const sentPublications=['2026-10-13T12:52:00.000Z','2026-10-18T08:05:36.000Z','2026-09-23T07:00:00.000Z','2026-08-06T07:00:00.000Z'];
const baseline='2026-10-17T15:47:52.949Z',check='2026-10-18T16:00:48.423Z';
const item=(id,publishedAt)=>{const a={id,title:'Synthetic development '+id,url:'https://example.test/'+id,publishedAt};return {...a,identityKeys:mediaArticleIdentityKeys(a)};};
test('Structured completion distinguishes publication from discovery using the initial baseline',async t=>{
 const db=new PGlite(),original=globalThis.fetch;globalThis.fetch=()=>assert.fail('External services forbidden');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const f of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  const owner=randomUUID(),id=randomUUID(),definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
  const as=(role,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,owner]);return tx.query(sql,args);});
  const svc=(sql,args)=>as('service_role',sql,args);
  await db.query("insert into auth.users values($1,'owner@example.test',now())",[owner]);
  await svc("select public.persist_structured_watch_with_digest($1,$2,'create',$3,0,'Fixture',$4,$5,$6,$7)",[owner,id,randomUUID(),source,definition,fingerprint(definition),fingerprint({title:'Fixture',definition,source})]);
  await as('authenticated','select public.set_media_watch_email_policy($1,$2,true)',[id,'daily_digest']);
  const revision=(await db.query('select media_revision from public.watches where id=$1',[id])).rows[0].media_revision;
  await svc('select public.set_structured_media_monitoring($1,$2,$3,true,86400)',[id,owner,revision]);
  const run=async(items,at)=>{
   await db.query("update public.structured_media_schedules set next_due_at=now()-interval '1 second' where watch_id=$1",[id]);
   const lease=(await svc('select public.claim_structured_media_checks($1,1) r',[[owner]])).rows[0].r[0];assert(lease);
   const prior=(await db.query('select * from public.media_watch_snapshots where watch_id=$1',[id])).rows[0];
   return (await svc('select public.finish_structured_check_with_digest($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$8,null,true) r',[id,owner,lease.media_revision,lease.lease_token,at,'Fixture',source.url,items,prior?.checked_at||null,prior?.items||null])).rows[0].r;
  };
  const outbox=async()=>(await db.query('select * from public.media_watch_notifications where watch_id=$1 order by article_position,id',[id])).rows;
  await t.test('initial reference remains silent',async()=>{assert.equal((await run([item('initial','2026-10-17T14:00:00Z')],baseline)).outcome,'baseline');assert.equal((await outbox()).length,0);});
  const four=sentPublications.map((date,n)=>item('sent-'+n,date));
  await t.test('four real publication dates: only 18 October qualifies; dates preserved',async()=>{
   const r=await run(four,check);assert.equal(r.outcome,'matching-items');assert.deepEqual(r.matchedItems.map(x=>x.id),['sent-1']);
   const rows=await outbox();assert.equal(rows.length,1);assert.equal(rows[0].article.publishedAt,sentPublications[1]);assert.equal(rows[0].delivery_mode,'daily_digest');
  });
  await t.test('old discoveries still stored and deduplicated, never relabelled as new',async()=>{
   const snapshot=(await db.query('select * from public.media_watch_snapshots where watch_id=$1',[id])).rows[0];assert.equal(snapshot.items.length,4);assert.equal(snapshot.initial_items.length,1);
   const r=await run(four,'2026-10-19T16:00:00Z');assert.equal(r.outcome,'no-new-items');assert.equal((await outbox()).length,1);
   assert.equal((await db.query('select count(*)::int n from public.media_watch_seen_articles where watch_id=$1',[id])).rows[0].n,10);
  });
  await t.test('late-discovered post-baseline news older than 24 hours remains eligible',async()=>{
   const a=item('late','2026-10-17T16:00:00Z');assert.deepEqual((await run([a],'2026-10-20T16:00:00Z')).matchedItems.map(x=>x.id),['late']);
  });
  await t.test('new reporting about an old story qualifies using its own recent publication',async()=>{
   const a={...item('follow-up','2026-10-20T16:30:00Z'),title:'New development about a story from August'};
   assert.equal((await run([a],'2026-10-20T17:00:00Z')).matchedItems[0].id,'follow-up');
  });
  await t.test('unknown, malformed and future dates remain observations without alerts',async()=>{
   const count=(await outbox()).length,items=[item('undated',null),item('invalid','not-a-date'),item('future','2027-01-01T00:00:00Z')];
   assert.equal((await run(items,'2026-10-20T18:00:00Z')).outcome,'no-matching-items');assert.equal((await outbox()).length,count);
   assert.equal((await db.query('select items from public.media_watch_snapshots where watch_id=$1',[id])).rows[0].items.length,3);
  });
  await t.test('baseline boundary and timezone equivalent compare as instants',async()=>{
   const a=item('boundary','2026-10-17T17:47:52.949+02:00');assert.equal((await run([a],'2026-10-20T19:00:00Z')).matchedItems[0].id,'boundary');
  });
  await t.test('definition, consent and interval preserved; no digest delivery invoked',async()=>{
   const w=(await db.query('select watch_definition,monitoring_state from public.watches where id=$1',[id])).rows[0];assert.deepEqual(w.watch_definition,definition);assert.equal(w.monitoring_state,'monitoring');
   assert.equal((await db.query('select interval_seconds from public.structured_media_schedules where watch_id=$1',[id])).rows[0].interval_seconds,86400);
   assert.equal((await db.query('select enabled from public.structured_media_email_preferences where watch_id=$1',[id])).rows[0].enabled,true);
   assert.equal((await db.query('select count(*)::int n from public.media_watch_digests where watch_id=$1',[id])).rows[0].n,0);
  });
 }finally{globalThis.fetch=original;await db.close();}
});
