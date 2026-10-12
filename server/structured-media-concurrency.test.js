import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile,spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,mkdir,readFile,readdir,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { definitions } from './test-support/watch-definition-fixtures.js';
import { structuredMonitoringSource } from '../src/js/watch-definition.js';
import { mediaArticleIdentityKeys } from './media-article-identity.js';
import { fingerprint } from './structured-watch-authorization.js';

// Opt-in, real independent PostgreSQL sessions. No inherited PG/service credentials,
// TCP listeners, existing databases, hosted projects or monitoring are used.
test('native isolated PostgreSQL serializes structured completions across independent sessions',{
  skip:process.env.WATCH_STRUCTURED_NATIVE_DB_TEST!=='true',timeout:60000,
},async()=>{
  const root=await mkdtemp('/private/tmp/watch-structured-pg-'),data=join(root,'data'),socket=join(root,'socket');
  const env={PATH:'/opt/homebrew/bin:/usr/bin:/bin',LANG:'C',LC_ALL:'C'};
  const run=promisify(execFile);let started=false;
  const psql=sql=>new Promise((resolve,reject)=>{
    const child=spawn('/opt/homebrew/bin/psql',['-X','-q','-At','-v','ON_ERROR_STOP=1','-h',socket,'-p','5432','-U','step2_test','-d','postgres'],{env,stdio:['pipe','pipe','pipe']});
    let output='',failure='';const timer=setTimeout(()=>child.kill('SIGTERM'),20000);
    child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{failure+=chunk;});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(failure||'Local PostgreSQL check failed'));});
    child.stdin.on('error',()=>{});child.stdin.end(sql);
  });
  try{
    await mkdir(socket);
    await run('/opt/homebrew/bin/initdb',['-D',data,'-U','step2_test','-A','trust','-E','UTF8','--no-locale'],{env,timeout:20000});
    started=true;
    await run('/opt/homebrew/bin/pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-c listen_addresses= -k ${socket} -p 5432`,'-w','start'],{env,timeout:20000});
    await psql(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const directory=new URL('../supabase/migrations/',import.meta.url);
    for(const file of (await readdir(directory)).sort().filter(file=>file.endsWith('.sql') && file<='20261012160000_structured_media_completion.sql')) await psql((await readFile(new URL(file,directory),'utf8')).replace('create extension if not exists pgcrypto;',''));
    const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await psql(`insert into auth.users values('${owner}','fixture@example.test');`);
    const definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
    const literal=value=>`'${JSON.stringify(value).replace(/'/g,"''")}'::jsonb`;
    const rpc=async(mutation,operation='create',revision=0,title='Fixture')=>{
      const result=await psql(`begin;set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
        select public.persist_structured_watch_v1('${owner}','${id}','${operation}','${mutation}',${revision},'${title}',${literal(source)},${literal(definition)},
          '${fingerprint(definition)}','${fingerprint({definition,source,title})}');commit;`);
      return JSON.parse(result.split('\n').find(line=>line.startsWith('{')));
    };
    const mutation='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await rpc(mutation);
    const article={id:'one',title:'Jannik Sinner wins',url:'https://example.test/one',excerpt:'News'};
    const items=[{...article,identityKeys:mediaArticleIdentityKeys(article)}];
    const complete=async(at,prior=null)=>{
      const result=await psql(`begin;set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
        select public.complete_manual_media_watch_check('${id}','${at}','News',${literal(source.url)}#>>'{}',array['one'],${literal(items)},
        ${prior ? "'"+prior.checked_at+"'::timestamptz" : 'null'},${prior ? literal(prior.items) : 'null'},${literal(items)},1,'${owner}');commit;`);
      return JSON.parse(result.split('\n').find(line=>line.startsWith('{')));
    };
    const first=await Promise.all([complete('2026-10-12T12:00:00Z'),complete('2026-10-12T12:01:00Z')]);
    assert.equal(first.filter(r=>r.status==='completed').length,1);assert.equal(first.filter(r=>r.status==='skipped').length,1);
    const prior=JSON.parse((await psql(`select row_to_json(s) from public.media_watch_snapshots s where watch_id='${id}'`)).trim());
    const next=await Promise.all([complete('2026-10-12T13:00:00Z',prior),complete('2026-10-12T13:01:00Z',prior)]);
    assert.equal(next.filter(r=>r.status==='completed').length,1);assert.equal(next.filter(r=>r.status==='skipped').length,1);
    assert.equal(next.find(r=>r.status==='completed').outcome,'no-new-items');
    assert.equal((await psql("select media_revision||':'||monitoring_state from public.watches;")).trim(),'1:paused');
    assert.equal((await psql('select count(*) from public.media_watch_notifications;')).trim(),'0');
    assert.equal((await psql('select count(*) from public.media_watch_seen_articles;')).trim(),String(items[0].identityKeys.length));
    const stored=JSON.parse((await psql('select watch_definition from public.watches;')).trim());assert.deepEqual(stored,definition);
  }finally{
    if(started)await run('/opt/homebrew/bin/pg_ctl',['-D',data,'-m','immediate','-w','stop'],{env,timeout:10000}).catch(()=>{});
    await rm(root,{recursive:true,force:true});
  }
});
