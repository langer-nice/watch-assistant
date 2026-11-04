import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {hasCurrentMorningCompletion} from './morning-report-completeness.js';
import {generateMorningReport,morningReportWindow} from './morning-report.js';

const at='2026-11-04T07:00:56.281Z',window=morningReportWindow(at);
const owner='b4757e02-fc75-4984-b50e-8d933ae7ec04';
const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',MORNING_REPORT_PRODUCTION_ENABLED:'true'};
const schedule={next_due_at:'2026-11-05T06:00Z',interval_seconds:86400,failures:0};
const row=(i,extra={})=>({id:`00000000-0000-4000-8000-00000000000${i}`,user_id:owner,type:'media_news',title:'Watch '+i,watch_definition:{},monitoring_source:{type:'feed',url:'https://example.test/feed'},monitoring_state:'monitoring',current_status:'watching',created_at:'2026-10-31T18:00Z',last_checked_at:'2026-11-04T06:35:39Z',last_check_error_code:null,_morning_schedule:{...schedule},...extra});
async function compose(rows){let report;const before=structuredClone(rows);const client={from:()=>({select:()=>({eq:async()=>({data:[]})})}),rpc:async(name,p)=>{
 if(name==='production_watch_owners')return {data:[owner]};
 if(name==='morning_report_context')return {data:{watches:rows,pending:0,revision:'fixture',exists:false}};
 assert.equal(name,'save_watch_report');report=p.p_report;return {data:true};
 }};const result=await generateMorningReport({client,env,at,schedulerAuthorized:true});assert.deepEqual(rows,before);return {report,result};}

test('07:35 scheduled success counts for 08:00; all current means no partial and City stays Updated',async()=>{
 const city=row(1,{current_status:'updated',last_change_item_id:'new-city',last_change_title:'A material new City development',last_change_summary:'New confirmed facts.',media_last_change_detected_at:'2026-11-04T06:35:39Z'});
 const {report}=await compose([city,row(2)]);assert.equal(report.partial,false);assert.equal(report.entries[0].classification,'updated');
 assert.equal(report.completedAt,at);assert.equal(report.snapshotAt,at);assert.equal(report.startedAt,window.cutoff);assert.equal(report.entries[0].checkedAt,city.last_checked_at);
});
for(const [name,change] of [
 ['failed cycle',{last_check_error_code:'V3_PILOT_CHECK_FAILED',_morning_schedule:{...schedule,failures:1}}],
 ['missing cycle',{last_checked_at:null,_morning_schedule:{...schedule,next_due_at:'2026-11-04T06:00Z'}}],
 ['previous-day completion',{last_checked_at:'2026-11-03T06:35Z',_morning_schedule:{...schedule,next_due_at:'2026-11-04T06:00Z'}}],
 ['new deadline still outstanding',{last_checked_at:'2026-11-04T06:35Z',_morning_schedule:{...schedule,next_due_at:'2026-11-04T06:45Z'}}],
 ])test(name+' is partial without dropping successful Watches or changing Watch status',async()=>{
 const {report,result}=await compose([row(1),row(2,change)]);assert.equal(result.reports[0].status,'generated');assert.equal(report.partial,true);assert.equal(report.entries.length,2);
 assert.equal(report.entries[0].classification,'watching');assert.equal(report.entries[1].classification,'attention');assert.equal(report.attempts[0].status,'succeeded');
});
test('historical change/publication/FX observation timestamps do not override current completion',async()=>{
 const watch=row(1,{last_change_published_at:'2026-10-30T09:00Z',media_last_change_detected_at:'2026-11-03T06:35Z',currency_evaluation:{observationDate:'2026-11-02'}});
 const {report}=await compose([watch]);assert.equal(report.partial,false);assert.equal(report.entries[0].checkedAt,watch.last_checked_at);
 assert(hasCurrentMorningCompletion({...watch,_morning_schedule:null},window,at));
 assert(!hasCurrentMorningCompletion({...watch,last_checked_at:'invalid'},window,at));
 assert(!hasCurrentMorningCompletion({...watch,last_checked_at:'2026-11-04T09:00Z'},window,at));
});
test('Paris current cycle is correct across DST; no fixed UTC-day or post-08:00 requirement',()=>{
 for(const [day,hour] of [['2026-10-24','05'],['2026-10-25','06'],['2027-03-28','05']]){
  const now=`${day}T${hour==='05'?'06':'07'}:00Z`,w=morningReportWindow(now);
  assert(hasCurrentMorningCompletion(row(1,{last_checked_at:`${day}T${hour}:35Z`,_morning_schedule:null}),w,now));
 }
});
test('partial copy is locale-specific, non-technical and visually secondary only for this notice',async()=>{
 for(const [lang,expected] of [['fr','Certains résultats ne sont pas encore disponibles.'],['en','Some results are not yet available.']]){
  const strings=JSON.parse(await readFile(new URL(`../src/locales/${lang}.json`,import.meta.url),'utf8'));assert.equal(strings.home.reportPartial,expected);
  assert(!/partial report|rapport partiel|retained|contrôle récent|timestamps/i.test(strings.home.reportPartial));
 }
 const css=await readFile(new URL('../src/scss/components/_briefing-summary.scss',import.meta.url),'utf8');
 assert.match(css,/\.briefing-summary__masthead #homeServerReportNotice\.briefing-summary__partial-notice\s*\{[^}]*text-transform: none/s);
});

test('actual Production report SQL: failed/missing cycles do not block save; leases, revision, ACL and daily immutability remain',async t=>{
 const db=new PGlite();t.after(()=>db.close());const dir=new URL('../supabase/migrations/',import.meta.url),migration='20261104120000_morning_report_cycle_context.sql';
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create function public.test_morning_clock() returns timestamptz language sql as $$select '${at}'::timestamptz$$;`);
 for(const file of (await readdir(dir)).sort().filter(f=>f.endsWith('.sql')&&f!=='20261022160000_private_morning_reports.sql'&&f!==migration))await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;','').replaceAll('clock_timestamp()','public.test_morning_clock()'));
 const contract=async()=>(await db.query("select proacl,pg_get_functiondef('public.save_watch_report(jsonb,text)'::regprocedure) save_definition from pg_proc where oid='public.morning_report_context(uuid,timestamptz)'::regprocedure")).rows;
 const before=await contract(),sql=(await readFile(new URL(migration,dir),'utf8')).replaceAll('clock_timestamp()','public.test_morning_clock()');await db.exec(sql);await db.exec(sql);assert.deepEqual(await contract(),before);
 await db.query('insert into auth.users values($1,$2)',[owner,'fixture@example.test']);
 for(let i=1;i<=3;i++){
  await db.query("insert into public.watches(id,user_id,type,title,monitoring_state,last_checked_at,last_check_error_code,siren) values($1,$2,'company_bodacc',$3,'monitoring',$4,$5,$6)",[row(i).id,owner,'Watch '+i,i===3?null:'2026-11-04T06:35Z',i===2?'CHECK_FAILED':null,'55210055'+i]);
  await db.query('insert into public.structured_media_schedules(watch_id,next_due_at,failures) values($1,$2,$3)',[row(i).id,i===3?'2026-11-04T06:00Z':schedule.next_due_at,i===2?1:0]);
 }
 await db.exec("set request.jwt.claim.role='service_role'");
 const client={rpc:async(name,p={})=>{const keys=Object.keys(p);try{return {data:(await db.query(`select public.${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) value`,Object.values(p))).rows[0].value};}catch(error){return {error};}}};
 let context=(await client.rpc('morning_report_context',{p_owner:owner,p_cutoff:window.cutoff})).data;assert.equal(context.pending,0);assert.equal(Date.parse(context.watches[0]._morning_schedule.next_due_at),Date.parse(schedule.next_due_at));
 const baseline=(await db.query('select to_jsonb(w) w,to_jsonb(s) s from public.watches w join public.structured_media_schedules s on s.watch_id=w.id order by w.id')).rows;
 const {reports}=await generateMorningReport({client,env,at,schedulerAuthorized:true});assert.equal(reports[0].status,'generated');assert.equal(reports[0].partial,true);
 const saved=(await db.query('select report from public.watch_reports')).rows[0].report;assert.equal(saved.entries.length,3);assert.equal(saved.entries[0].attemptStatus,'succeeded');
 assert.deepEqual((await db.query('select to_jsonb(w) w,to_jsonb(s) s from public.watches w join public.structured_media_schedules s on s.watch_id=w.id order by w.id')).rows,baseline);
 assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
 assert.equal((await generateMorningReport({client,env,at,schedulerAuthorized:true})).reports[0].status,'already-generated');
 await db.query("update public.structured_media_schedules set lease_until='2026-11-04T07:02Z' where watch_id=$1",[row(2).id]);
 context=(await client.rpc('morning_report_context',{p_owner:owner,p_cutoff:window.cutoff})).data;assert.equal(context.pending,1);
 assert.equal((await generateMorningReport({client,env,at,schedulerAuthorized:true})).reports[0].status,'awaiting-completed-checks');
 await db.exec("set role authenticated;set request.jwt.claim.role='authenticated'");
 await assert.rejects(db.query('select public.morning_report_context($1,$2)',[owner,window.cutoff]),/permission denied/);
});
