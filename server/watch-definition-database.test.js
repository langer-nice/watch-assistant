import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { definitions } from './test-support/watch-definition-fixtures.js';
import { structuredMonitoringSource, watchDefinitionSchema, watchDefinitionSize } from '../src/js/watch-definition.js';
import { monitoringPlanForDefinition } from '../src/js/watch-definition.js';
import { contentFingerprint } from '../src/js/structured-fingerprint.js';

const migration = '20261012120000_structured_watch_definitions.sql';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stranger = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const legacyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const structuredId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const mutation = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
test('isolated SQL upgrade preserves legacy data and blocks every authenticated structured write path', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(directory)).sort().filter(file => file.endsWith('.sql') && file < migration)) {
      await db.exec((await readFile(new URL(file, directory), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
    }
    await db.query('insert into auth.users values($1,$2),($3,$4)', [owner,'owner@example.test',stranger,'other@example.test']);
    const asUser = (sql, args = [], user = owner) => db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [user]);
      return tx.query(sql, args);
    });
    const persist = (definition, source, revision, id = legacyId, token = mutation) => asUser(
      "select public.persist_media_watch($1,'Fixture',$2,$3,'monitoring',$4,$5,false) as row", [id,source,definition,revision,token]);
    const legacy = { inputType: 'text', request: 'Monitor news about Gucci.', category: 'news', mediaMention: { subjects: ['Gucci'], matchMode: 'all' } };
    const legacySource = { type: 'feed', url: 'https://example.test/rss' };
    await persist(legacy, legacySource, 0);
    await db.query("insert into public.watches(user_id,title,siren,request) values($1,'Legacy company','552100554','Original company request')", [owner]);
    await db.query("insert into public.media_watch_snapshots(watch_id,user_id,checked_at,baseline_at,source_title,source_url,item_ids,items) values($1,$2,'2026-10-12','2026-10-12','Fixture','https://example.test/rss',array['old'],'[]')", [legacyId,owner]);
    const state = async () => (await db.query('select to_jsonb(w) data from public.watches w order by id')).rows;
    const snapshot = async () => (await db.query('select to_jsonb(s) data from public.media_watch_snapshots s order by watch_id')).rows;
    const before = await state(), baseline = await snapshot();
    const triggerDefinitions = (await db.query("select p.proname,pg_get_functiondef(p.oid) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'complete_%' or p.proname like 'invalidate_%' or p.proname='revise_media_query_without_rebaseline') order by p.proname")).rows;
    const sql = await readFile(new URL(migration, directory), 'utf8');
    await db.exec(sql);
    assert.deepEqual(await state(), before);
    assert.deepEqual(await snapshot(), baseline);
    assert.deepEqual((await db.query("select p.proname,pg_get_functiondef(p.oid) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'complete_%' or p.proname like 'invalidate_%' or p.proname='revise_media_query_without_rebaseline') order by p.proname")).rows, triggerDefinitions);
    assert.deepEqual((await db.query('select public.watch_definition_v1_schema() schema')).rows[0].schema, watchDefinitionSchema);
    assert.equal((await db.query("select public.watch_utf16_length('😀Jannik') size,public.watch_utf16_slice('😀Jannik',2,8) span,public.watch_utf16_slice('😀Jannik',1,8) cut")).rows[0].size,8);
    assert.equal((await db.query("select public.watch_utf16_slice('😀Jannik',2,8) span")).rows[0].span,'Jannik');
    assert.equal((await db.query("select public.watch_utf16_slice('😀Jannik',1,8) cut")).rows[0].cut,null);
    const valid = async (value, source = structuredMonitoringSource(value.plan.criteria)) => (await db.query('select public.valid_structured_watch_definition($1,$2) ok', [source,value])).rows[0].ok;
    for (const value of definitions()) {
      assert.equal(await valid(value), true, value.request);
      assert.equal((await db.query('select octet_length($1::jsonb::text) size',[value])).rows[0].size, watchDefinitionSize(value));
    }
    const definition = definitions()[0], source = structuredMonitoringSource(definition.plan.criteria);
    for (const mutate of [v => { v.definitionVersion = null; }, v => { v.definitionVersion = 'future'; },
      v => { delete v.metadata; }, v => { v.plan.criteria.query = 'Prada'; }, v => { v.plan.criteria.subjects = ['Prada']; },
      v => { v.request = v.request.trim(); }, v => { v.plan.adapter = 'ecb_reference_v1'; },
      v => { v.interpretation.conditions[0].subjects = ['missing']; }, v => { v.plan.executable = true; }]) {
      const changed = structuredClone(definition); mutate(changed); assert.equal(await valid(changed,source), false);
    }
    assert.equal(await valid(definition,{...source,url:'https://attacker.test/rss'}),false);
    assert.equal(await valid(definition,null),false);
    const forged = structuredClone(definition);
    forged.plan.criteria.subjects = ['Prada']; forged.plan.criteria.query = 'Prada';
    forged.metadata.planFingerprint = contentFingerprint({...monitoringPlanForDefinition(definition),criteria:forged.plan.criteria});
    assert.equal(await valid(forged),false); // Rehashed metadata and a coherent forged source are still insufficient.
    assert.equal(await valid({...definition,definitionVersion:undefined},source),false);
    await assert.rejects(persist(definition, source, 0, structuredId), { code: '22023' });
    await assert.rejects(asUser("insert into public.watches(id,user_id,title,type,watch_definition,monitoring_source,monitoring_state) values($1,$2,'Forged','media_news',$3,$4,'paused')", [structuredId,owner,definition,source]), { code: '42501' });
    await assert.rejects(asUser('update public.watches set watch_definition=$1,monitoring_source=$2 where id=$3',[definition,source,legacyId]), { code: '42501' });
    // Seed an inert structured fixture as the database owner, never via an application path.
    await db.query("insert into public.watches(id,user_id,title,type,watch_definition,monitoring_source,monitoring_state) values($1,$2,'Structured fixture','media_news',$3,$4,'paused')",[structuredId,owner,definition,source]);
    // FOR UPDATE also enforces the restrictive old-row policy, so this is hidden
    // from the authenticated legacy writer before the RPC's explicit target guard.
    await assert.rejects(persist(legacy,legacySource,1,structuredId),{code:'PT409'});
    assert.equal((await asUser('select id from public.watches where id=$1',[structuredId])).rows.length,1);
    assert.equal((await asUser('select id from public.watches where id=$1',[structuredId],stranger)).rows.length,0);
    assert.equal((await asUser('update public.watches set watch_definition=$1,monitoring_source=$2 where id=$3 returning id',[legacy,legacySource,structuredId])).rows.length,0);
    assert.equal((await asUser('update public.watches set title=$1 where id=$2 returning id',['Altered',structuredId])).rows.length,0);
    assert.equal((await asUser('delete from public.watches where id=$1 returning id',[structuredId])).rows.length,0);
    await db.exec(`create function public.fixture_definer_bypass(target uuid) returns void language sql security definer set search_path='' as $$ update public.watches set title='forged through definer' where id=target $$; grant execute on function public.fixture_definer_bypass(uuid) to authenticated;`);
    await assert.rejects(asUser('select public.fixture_definer_bypass($1)',[structuredId]), { code: '42501' });
    await assert.rejects(db.query("update public.watches set monitoring_state='monitoring' where id=$1",[structuredId]), { code: '23514' });
    assert.equal((await db.query('select title from public.watches where id=$1',[structuredId])).rows[0].title,'Structured fixture');
    // Legacy RPC identity, revisions, idempotency, ownership and baseline are unchanged.
    const revision = Number((await db.query('select media_revision from public.watches where id=$1',[legacyId])).rows[0].media_revision);
    const nextMutation = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await persist(legacy,legacySource,revision,legacyId,nextMutation);
    const afterEdit = await state();
    await persist(legacy,legacySource,revision,legacyId,nextMutation);
    assert.deepEqual(await state(),afterEdit);
    await assert.rejects(persist(legacy,legacySource,revision,legacyId,mutation), { code: 'PT409' });
    assert.deepEqual(await snapshot(),baseline);
    await assert.rejects(asUser('insert into public.watches(user_id,title,siren) values($1,$2,$3)',[owner,'Cross-user','732829320'],stranger), { code: '42501' });
    const currency = { inputType:'text', request:'GBP is above 1.18 EUR.', category:'finance', currencyCriteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.18'}, currencyRevision:mutation,currencyLanguage:'en',currencyPolicy:'crossing' };
    assert.equal((await db.query('select public.valid_media_definition($1,$2) ok',[structuredMonitoringSource(definitions()[4].plan.criteria),currency])).rows[0].ok,true);
    const legacyUrl = {inputType:'url',request:'https://example.test/article',category:'news',storyProfile:{concepts:[{label:'Gucci',type:'manual'}],userAddedConcepts:[]}};
    assert.equal((await db.query('select public.valid_media_definition($1,$2) ok',[legacySource,legacyUrl])).rows[0].ok,true);
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=\'public.watches\'::regclass')).rows[0].relrowsecurity,true);
    assert.equal((await db.query("select has_function_privilege('anon','public.persist_media_watch(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean)','execute') ok")).rows[0].ok,false);
  } finally { await db.close(); }
});
