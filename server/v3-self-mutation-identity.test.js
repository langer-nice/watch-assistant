import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {PILOT_OWNER,PILOT_SPECS,pilotSource} from './v3-pilot.js';

test('unchanged installed V3 trigger rejects identity edits while owner controls still persist',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).sort().filter(x=>x.endsWith('.sql')&&x!=='20261022160000_private_morning_reports.sql'))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.query('insert into auth.users values($1,$2)',[PILOT_OWNER,'fixture@example.test']);
 const role=async(r,sql,args=[],sub=PILOT_OWNER)=>{await db.exec(`set role ${r};set request.jwt.claim.role='${r}';set request.jwt.claim.sub='${sub}'`);
  try{return await db.query(sql,args);}finally{await db.exec('reset role;reset request.jwt.claim.role;reset request.jwt.claim.sub');}};
 const id=(await role('service_role','select public.create_v3_pilot(1,$1,$2) id',[
  {intent:{canonical_text:PILOT_SPECS[0].instruction,references:[],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR'}},pilotSource(PILOT_SPECS[0])])).rows[0].id;
 // Generic V3 shares this same registered identity guard.
 await db.query("update public.v3_pilot_watches set slot=null,engine='wa-v3-evidence-refs.v1' where watch_id=$1",[id]);
 const read=async()=>(await db.query('select * from public.watches where id=$1',[id])).rows[0];
 const persist=async(row,sub=PILOT_OWNER)=>(await role('authenticated','select public.persist_media_watch($1,$2,$3,$4,$5,$6,$7,$8) value',[
  row.id,row.title,row.monitoring_source,row.watch_definition,row.monitoring_state,row.media_revision,randomUUID(),Boolean(row.deleted_at)],sub)).rows[0].value;
 for(const [name,change] of [
  ['title',r=>{r.title='Changed';}],['instruction',r=>{r.watch_definition.request='Changed';}],
  ['concept punctuation',r=>{r.watch_definition.storyProfile.concepts[0].label+='.';}],
  ['source',r=>{r.monitoring_source.url='https://other.test/feed';}],
 ])await t.test(name+' remains rejected by actual SQLSTATE 42501',async()=>{
  const before=await read(),edited=structuredClone(before);change(edited);
  await assert.rejects(persist(edited),error=>error.code==='42501'&&error.message==='Pilot identity is immutable');assert.deepEqual(await read(),before);
 });
 await t.test('pause/resume use actual RPC and leave identity unchanged',async()=>{
  const before=await read();let r=await persist({...before,monitoring_state:'paused'});assert.equal(r.monitoring_state,'paused');
  r=await persist({...await read(),monitoring_state:'monitoring'});assert.equal(r.monitoring_state,'monitoring');
  assert.deepEqual(r.watch_definition,before.watch_definition);assert.deepEqual(r.monitoring_source,before.monitoring_source);assert.equal(r.title,before.title);
 });
 await t.test('cross-owner RLS denies persistence and sidecar remains inaccessible',async()=>{
  await assert.rejects(persist(await read(),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),error=>error.code==='PT409');
  await assert.rejects(role('authenticated','select * from public.v3_pilot_watches'),/permission denied/);
 });
 await t.test('soft deletion is an allowed explicit control, retaining identity',async()=>{
  const before=await read(),after=await persist({...before,deleted_at:'2026-11-03T12:00:00Z'});
  assert(after.deleted_at);assert.deepEqual(after.watch_definition,before.watch_definition);
 });
});
