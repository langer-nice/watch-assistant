import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const currencyFiles=['20261004120000_currency_alert_policies.sql','20261004150000_currency_strict_comparison.sql'];
const directory=new URL('../supabase/migrations/',import.meta.url);
const bootstrap=`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;`;
const catalog=async db=>(await db.query(`select jsonb_build_object(
'functions',(select jsonb_agg(jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl) order by proname,oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace),
 'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid='public.watches'::regclass and not tgisinternal),
 'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
 'grants',(select jsonb_agg(to_jsonb(g)-'table_catalog' order by table_name,grantee,privilege_type) from information_schema.role_table_grants g where table_schema='public')) as catalog`)).rows[0].catalog;

test('currency migrations after media recovery preserve the final catalog and remove inherited destructive history grants',async()=>{
 const files=(await readdir(directory)).filter(f=>f.endsWith('.sql')).sort();const late=[...files.filter(f=>!currencyFiles.includes(f)),...currencyFiles];let expected;
 for(const order of [files,late]){
  const db=new PGlite();try{
   await db.exec(bootstrap);
   for(const name of order){
    if(name===currencyFiles[0])await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated,service_role;');
    await db.exec((await readFile(new URL(name,directory),'utf8')).replace('create extension if not exists pgcrypto;',''));
   }
   const actual=await catalog(db);if(expected)assert.deepEqual(actual,expected);else expected=actual;
   for(const role of ['anon','authenticated','service_role'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
    const permitted=(role==='authenticated'&&privilege==='SELECT')||(role==='service_role'&&['SELECT','INSERT'].includes(privilege));
    assert.equal((await db.query("select has_table_privilege($1,'public.currency_watch_events',$2) as allowed",[role,privilege])).rows[0].allowed,permitted,role+':'+privilege);
   }
   assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.currency_watch_events'::regclass")).rows[0].relrowsecurity,true);
   const source={type:'currency',provider:'ecb',url:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'};
   const definition={inputType:'text',request:'GBP/EUR > 1.17 each changed daily rate',category:'finance',currencyCriteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'},currencyPolicy:'daily',currencyLanguage:'en',currencyRevision:'00000000-0000-4000-8000-000000000003'};
   const valid=async(s,d)=>(await db.query('select public.valid_media_definition($1,$2) as valid',[s,d])).rows[0].valid;
   assert.equal(await valid(source,definition),true);assert.equal(await valid(source,{...definition,currencyPolicy:'weekly'}),false);
   assert.equal(await valid({type:'feed',url:'https://news.example/rss'},{inputType:'text',request:'Microsoft cloud news',category:'news',mediaMention:{subjects:['Microsoft'],matchMode:'all'},localCreatedAt:'2026-10-05T10:00:00Z'}),true);
  }finally{await db.close();}
 }
});
