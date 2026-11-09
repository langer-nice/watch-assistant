import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createV3WatchHandler,V3_ENGINE,v3CurrencyCriteria,v3Capability} from './v3-creation.js';
import {runPilotMonitoring,PILOT_OWNER,PILOT_SPECS,pilotSource} from './v3-pilot.js';
import {createMediaWatchCheckMiddleware} from './media-watch-check-api.js';
import {generateMorningReport} from './morning-report.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env={V3_PILOT_ENABLED:'true',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true',MORNING_REPORT_PRODUCTION_ENABLED:'true',CRON_SECRET:'fixture'};
const cases=[
 ['social movements','Keep me updated on important new developments concerning protests, strikes and major social movements in France.',['protests','strikes','major social movements','France']],
 ['City','Keep me updated on important new developments concerning Manchester City.',['Manchester City']],
 ['Gucci','Keep me updated on new Gucci products.',['Gucci']],
 ['Microsoft','Keep me updated on important Microsoft developments.',['Microsoft']],
 ['Apple','Tell me when Apple does something important.',['Apple']],
 ['Metallica','Keep me updated on new Metallica concerts in Europe.',['Metallica','Europe']],
 ['GBP/EUR','Tell me when GBP/EUR goes above 1.17.',['GBP/EUR']],
 ['exact URL','https://example.test/news.rss?region=fr#latest',[]],
];
const ready=(raw,refs=[])=>({...(v3CurrencyCriteria(raw)?{}:{display_title:refs.length?refs.join(' / '):'Public news updates'}),intent:{canonical_text:raw,references:refs.map(label=>({label,source_ref:'raw_input'})),explicit_constraints:raw.includes('1.17')?[{kind:'threshold',text:'1.17',source_ref:'raw_input',value:'1.17'},{kind:'comparator',text:'above',source_ref:'raw_input'}]:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Meaningful identified subject and scope.'}});
const feed=async url=>({source:{title:'Existing RSS source',url},checkedAt:'2026-11-01T10:00:00Z',items:[{id:'item',title:'A materially new development',excerpt:'Independent reports describe the new development.',url:'https://example.test/news',publishedAt:'2026-11-01T09:00:00Z',source:'News'}]});
const currency=async()=>({criteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'},observation:{base:'GBP',quote:'EUR',rate:'1.171',date:'2026-11-01'},checkedAt:'2026-11-01T10:00:00Z'});

test('general V3 real API → atomic SQL → engine scheduler → existing delivery and reports',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 await db.exec("create function public.test_v3_clock() returns timestamptz language sql as $$select '2026-11-01T07:16:00Z'::timestamptz$$");
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).sort().filter(x=>x.endsWith('.sql')&&x!=='20261022160000_private_morning_reports.sql'))await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;','').replaceAll('clock_timestamp()','public.test_v3_clock()'));
 for(const id of [owner,other,PILOT_OWNER])await db.query('insert into auth.users values($1,$2)',[id,'fixture@example.test']);
 const role=async(r,sql,args=[],sub=owner)=>{await db.exec(`set role ${r};set request.jwt.claim.role='${r}';set request.jwt.claim.sub='${sub}'`);try{return await db.query(sql,args);}finally{await db.exec('reset role;reset request.jwt.claim.role;reset request.jwt.claim.sub');}};
 const rpc=async(name,p={})=>{const keys=Object.keys(p);try{return {data:(await role('service_role',`select public.${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) value`,keys.map(k=>p[k]))).rows[0].value};}catch(error){return {error};}};
 const client={rpc,from:table=>{const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){const a=filters.map(x=>x[1]);return {data:(await db.query(table==='watches'?'select id,user_id,deleted_at from public.watches where user_id=$1 and id=$2':'select engine from public.v3_pilot_watches where user_id=$1 and watch_id=$2',a)).rows[0]||null};}};return q;}};
 let output,modelCalls=0,sourceCalls=0;const model=async req=>{modelCalls++;assert.deepEqual(req.input.conversation,[]);return output;};
 const api=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,model,feed:async url=>{sourceCalls++;return feed(url);},currency});
 const invoke=async(body,handler=api)=>{let value;const res={setHeader(){},end(raw){value=JSON.parse(raw);}};await handler({method:'POST',body},res);return {http:res.statusCode,...value};};
 const count=async table=>(await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
 const ids=[];
 // Pilot data survives generic creation and remains separately identified.
 for(let i=0;i<4;i++){const text=PILOT_SPECS[i].instruction;const u={intent:ready(text).intent,decision:{status:'READY_TO_MONITOR'}};assert.ok(!(await rpc('create_v3_pilot',{p_slot:i+1,p_understanding:u,p_source:pilotSource(PILOT_SPECS[i])})).error);}
 const pilotSchedules=(await db.query('select * from public.structured_media_schedules order by watch_id')).rows;
 const beforePilot=(await db.query('select watch_id,user_id,slot,engine,instruction,understanding,baseline_at,prior_state from public.v3_pilot_watches where slot is not null order by slot')).rows;
 for(const [name,text,refs] of cases)await t.test(name+' creates through V3 without exact instruction routing',async()=>{
  const id=randomUUID();output=ready(text,refs);const body={watchId:id,instruction:text,captureKind:name==='exact URL'?'URL':'FREE_TEXT'};
  const before=modelCalls;const r=await invoke(body);assert.equal(r.http,200);assert.equal(r.id,id);assert.equal(r.engine,V3_ENGINE);assert.equal(modelCalls,before+1);ids.push(id);
  const row=(await db.query('select w.*,p.understanding,p.capture_kind,p.engine,p.baseline_at from public.watches w join public.v3_pilot_watches p on p.watch_id=w.id where w.id=$1',[id])).rows[0];
  assert.equal(row.user_id,owner);assert.equal(row.watch_definition.request,text);assert.deepEqual(row.understanding.intent,output.intent);assert.equal(row.engine,V3_ENGINE);assert.equal(row.monitoring_state,'monitoring');assert.ok(row.baseline_at);assert.equal(row.last_check_outcome,'baseline');assert.equal(row.capture_kind,body.captureKind);
  assert.equal((await db.query('select count(*)::int n from public.structured_media_schedules where watch_id=$1',[id])).rows[0].n,1);
  if(name==='exact URL')assert.equal(row.understanding.resource.exact_url,text);
  if(name==='GBP/EUR'){assert.deepEqual(row.watch_definition.currencyCriteria,{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'});assert.equal(row.title,text);assert.equal(row.understanding.display_title,undefined);}
  const again=await invoke({...body,watchId:randomUUID()});assert.equal(again.id,id);assert.equal(modelCalls,before+1);
 });
 // Mock labels test wiring/persistence, not live model wording or a hard-coded production map.
 const titleCases=[
  ['Tell me when Virtuoso publishes new research or substantive findings about luxury-travel demand, traveller behaviour or destination preferences. Exclude hotel promotions, deals, awards and repeated coverage of the same findings.','Virtuoso','Virtuoso Luxury Travel Research'],
  ['Tell me when Cruise Lines International Association (CLIA) publishes new industry research or announces material changes affecting cruise regulation, port access or decarbonisation. Exclude event invitations, training, promotions and repeated coverage.','Cruise Lines International Association (CLIA)','CLIA Industry Developments'],
  ['Tell me when Regent Seven Seas Cruises announces a new ship, a material fleet investment, a new itinerary programme, or a substantive new onboard product or partnership. Exclude fares, discounts, routine promotions and duplicate coverage.','Regent Seven Seas Cruises','Regent Fleet & Product'],
  ['Apple product launches.','Apple','Apple product launches'],
 ];
 for(const [text,subject,label] of titleCases)await t.test(subject+' persists the separate model title and unchanged full request',async()=>{
  const id=randomUUID(),exclusion=text.match(/Exclude .+$/)?.[0];
  output={...ready(text,[subject]),display_title:label};
  if(exclusion)output.intent.explicit_constraints=[{kind:'exclusion',text:exclusion,source_ref:'raw_input'}];
  const original=structuredClone(output.intent),before=modelCalls;
  assert.equal((await invoke({watchId:id,instruction:text})).http,200);assert.equal(modelCalls,before+1);
  const read=async()=>JSON.parse(JSON.stringify((await db.query('select w.title,w.watch_definition,p.instruction,p.understanding from public.watches w join public.v3_pilot_watches p on p.watch_id=w.id where w.id=$1',[id])).rows[0]));
  const row=await read();assert.equal(row.title,label);assert(row.title.split(/\s+/u).length<=16);assert(!/Tell me|Exclude|excluding/.test(row.title));
  assert.equal(row.watch_definition.request,text);assert.equal(row.instruction,text);assert.deepEqual(row.understanding.intent,original);
  assert.equal(row.watch_definition.storyProfile.concepts[0].label,text.slice(0,200));assert.equal(row.understanding.display_title,label);
  assert.deepEqual(await read(),row); // Reload from the actual SQL store, no title recomputation.
  output.display_title='A changed label';assert.equal((await invoke({watchId:randomUUID(),instruction:text})).id,id);
  assert.equal(modelCalls,before+1);assert.deepEqual(await read(),row); // Existing Watches are not renamed.
 });
 await t.test('article seed persists through unchanged atomic SQL with original URL and a silent reference baseline',async()=>{
  const url='https://example.test/story/assault-20261022',id=randomUUID();let calls=0;
  const articleApi=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,
   feed:async()=>{throw Object.assign(Error('HTML'),{code:'UNSUPPORTED_CONTENT_TYPE'});},
   pageMetadata:async()=>({pageType:'article',title:'A shop manager was assaulted in Nice',description:'Police appeal for witnesses to the 22 October assault.',openGraphType:'article',titleSource:'open_graph_title',siteName:'Public news',canonicalUrl:url,publishedAt:'2026-10-22T10:00:00Z'}),
   model:async req=>{calls++;assert.equal(req.input.capture.kind,'PAGE_CONTEXT');return {...ready('Follow future developments in the shop manager assault in Nice.',['shop manager assault','Nice']),display_title:'Shop manager assault in Nice'};}});
  const r=await invoke({instruction:url,watchId:id,captureKind:'URL'},articleApi);assert.equal(r.http,200);assert.equal(r.id,id);assert.equal(calls,1);
  const p=(await db.query('select * from public.v3_pilot_watches where watch_id=$1',[id])).rows[0];
  const persisted=(await db.query('select title,watch_definition from public.watches where id=$1',[id])).rows[0];assert.equal(persisted.title,'Shop manager assault in Nice');assert.equal(persisted.watch_definition.storyProfile.concepts[0].label,'Follow future developments in the shop manager assault in Nice.');assert.equal(p.understanding.intent.canonical_text,'Follow future developments in the shop manager assault in Nice.');
  assert.equal(p.instruction,url);assert.equal(p.capture_kind,'URL');assert.equal(p.understanding.story_seed.original_url,url);assert.equal(p.understanding.story_seed.canonical_url,url);assert(!p.understanding.resource);
  assert.equal(p.prior_state.entries.length,1);assert.match(p.prior_state.entries[0].fact,/shop manager was assaulted/);assert.equal(p.prior_state.entries[0].alerted,false);assert.equal(p.last_judgment,null);
  const snapshot=(await db.query('select initial_items from public.media_watch_snapshots where watch_id=$1',[id])).rows[0];assert.equal(snapshot.initial_items[0].url,url);
 });
 await t.test('pilot records and schedules remain unchanged by creation; baseline creates no notifications',async()=>{
  assert.deepEqual((await db.query('select watch_id,user_id,slot,engine,instruction,understanding,baseline_at,prior_state from public.v3_pilot_watches where slot is not null order by slot')).rows,beforePilot);
  assert.deepEqual((await db.query('select s.* from public.structured_media_schedules s join public.v3_pilot_watches p on p.watch_id=s.watch_id where p.slot is not null order by s.watch_id')).rows,pilotSchedules);
  assert.equal(await count('media_watch_notifications'),0);
 });
 const existingCount=await count('watches');const existingSchedules=await count('structured_media_schedules');
 const noWrite=async()=>{assert.equal(await count('watches'),existingCount);assert.equal(await count('structured_media_schedules'),existingSchedules);};
 await t.test('missing, instruction-shaped and exclusion-bearing titles fail before baseline/write without a naming retry',async()=>{
  for(const title of [undefined,'Tell me when AsterCo launches a phone','AsterCo updates excluding promotions','word '.repeat(17).trim()]){
   output={...ready('Follow AsterCo launches.',['AsterCo']),display_title:title};
   const before=modelCalls,feeds=sourceCalls;
   assert.equal((await invoke({watchId:randomUUID(),instruction:'Follow AsterCo launches.'})).http,503);
   assert.equal(modelCalls,before+1);assert.equal(sourceCalls,feeds);await noWrite();
  }
 });
 await t.test('missing referent clarification cannot persist or schedule',async()=>{
  const text='Tell me when this company changes something.';output={intent:{canonical_text:text,references:[],explicit_constraints:[],unresolved_ambiguities:['Missing company']},decision:{status:'NEEDS_CLARIFICATION',reason:'Company not identified.',clarification_question:'Which company?'}};
  const r=await invoke({watchId:randomUUID(),instruction:text});assert.equal(r.status,'NEEDS_CLARIFICATION');await noWrite();
 });
 await t.test('unsupported booking capability is blocked even if Intent is READY',async()=>{
  const text='Tell me when booking availability opens at https://example.test/flights';output=ready(text,['flights']);
  const r=await invoke({watchId:randomUUID(),instruction:text});assert.equal(r.status,'UNSUPPORTED_FOR_NOW');await noWrite();
 });
 await t.test('provider and baseline acquisition failures leave no partial rows',async()=>{
  const fail=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,model:async()=>{throw Error('Provider down');}});
  assert.equal((await invoke({watchId:randomUUID(),instruction:'Follow another company.'},fail)).http,503);await noWrite();
  output=ready('Follow another company.',['Another company']);
  const failFeed=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,model,feed:async()=>{throw Error('Feed down');}});
  assert.equal((await invoke({watchId:randomUUID(),instruction:'Follow another company.'},failFeed)).http,503);await noWrite();
 });
 await t.test('empty baseline after clarification is actionable and leaves no Watch or schedule',async()=>{
  const instruction='french trains nice to monaco';
  const clarifications=[{question:'What would you like to track?',answer:'delays and cancellations'}];
  const events=[];
  const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),
   serviceClient:{...client,rpc:async(name,args)=>{
    assert.equal(args.p_baseline,null,'must stop before persistence');
    return client.rpc(name,args);
   }},
   model:async req=>{
    events.push('model');
    assert.equal(req.input.capture.raw_input,instruction);
    return ready('Follow news about delays and cancellations on trains between Nice and Monaco.',['Nice to Monaco']);
   },
   feed:async()=>{events.push('feed');throw Object.assign(Error('No initial items'),{code:'EMPTY_FEED'});},
  });
  const body={watchId:randomUUID(),instruction};
  assert.deepEqual(await invoke({...body,clarifications},handler),{http:422,code:'V3_CLARIFICATION_EMPTY_FEED'});
  assert.deepEqual(events.splice(0),['model','feed']);
  assert.deepEqual(await invoke(body,handler),{http:503,code:'V3_CREATION_UNAVAILABLE'});
  assert.deepEqual(events,['model','feed']);
  await noWrite();
 });
 await t.test('client cannot supply owner, engine or admitted Intent; auth cannot bypass',async()=>{
  for(const extra of [{owner:other},{engine:V3_ENGINE},{understanding:output}])assert.equal((await invoke({watchId:randomUUID(),instruction:'A request',...extra})).http,400);
  const failAuth=createV3WatchHandler({env,authenticate:async()=>{throw Object.assign(Error('auth'),{statusCode:401,code:'INVALID_SESSION'});}});
  assert.equal((await invoke({watchId:randomUUID(),instruction:'A request'},failAuth)).http,401);await noWrite();
  for(const r of ['anon','authenticated']){
   await assert.rejects(role(r,'select * from public.v3_pilot_watches'),/permission denied/);
   await assert.rejects(role(r,'select public.create_v3_watch($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),other,'A request','FREE_TEXT',{}, {},null,{}]),/permission denied/);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.v3_pilot_watches'::regclass")).rows[0].relrowsecurity,true);
  const foreign=await role('authenticated','select id from public.watches where id=$1',[ids[0]],other);assert.equal(foreign.rows.length,0);
 });
 await t.test('generic V3 manual check cannot accidentally invoke legacy judgment',async()=>{
  const row=(await db.query('select * from public.watches where id=$1',[ids[0]])).rows[0];
  const q={select(){return q;},eq(){return q;},is(){return q;},async range(){return {data:[row]};}};
  const v3={select(){return v3;},eq(){return v3;},async maybeSingle(){return {data:{engine:V3_ENGINE}};}};
  let value;const res={setHeader(){},end(raw){value=JSON.parse(raw);}};
  let claims=0;
  const check=createMediaWatchCheckMiddleware({env,authenticate:async()=>({user:{id:owner},client:{from:()=>q}}),serviceClient:{from:()=>v3,rpc:async(name)=>{assert.equal(name,'claim_structured_media_manual_check');claims++;return {data:null};}},fetchFeed:()=>assert.fail('No legacy source check')});
  await check({url:'/api/media-watches?action=check',method:'POST',body:{id:ids[0],revision:1}},res);
  assert.equal(res.statusCode,409);assert.equal(value.code,'MEDIA_CONFLICT');assert.equal(claims,1);
 });
 await t.test('atomic rejection does not leave a Watch or schedule',async()=>{
  const args={p_id:randomUUID(),p_owner:owner,p_instruction:'Bad baseline',p_kind:'FREE_TEXT',p_understanding:output,p_source:pilotSource({query:'Another company'}),p_criteria:null,p_baseline:{evidence:{id:'baseline'},items:[],judgment:{action:'ALERT'},article:null}};
  assert.ok((await rpc('create_v3_watch',args)).error);await noWrite();
 });
 await t.test('generic engine selects V3 Brain; original text is not the selector; existing outbox reused',async()=>{
  await db.query("update public.structured_media_schedules set next_due_at='2026-11-01T07:15:00Z' where watch_id=any($1::uuid[])",[ids]);
  // Existing pilot schedules excluded here to leave the baseline cohort unchanged.
  await db.exec("update public.structured_media_schedules s set next_due_at=clock_timestamp()+interval '1 day' from public.v3_pilot_watches p where p.watch_id=s.watch_id and p.slot is not null");
  let calls=0;const result=await runPilotMonitoring({client,env,schedulerAuthorized:true,feed,currency,model:async req=>{calls++;return {action:'ALERT',evidence_status:'STRONG_UNCONFIRMED',reason:'Credible materially new independently corroborated reports, not officially confirmed.',novelty_summary:'A new report.',condition_check:null,evidence_refs:req.input.evidence.segments.filter(s=>['CLAIM','MEASUREMENT'].includes(s.role)).map(s=>s.id),provenance_refs:req.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)};}});
  // Currency baseline is already above threshold, so a second ALERT is fenced.
  assert.equal(result.claimed,8);assert.equal(result.completed,7);assert.equal(result.failed,1);assert.equal(calls,8);
  const n=(await db.query('select * from public.media_watch_notifications')).rows;assert.equal(n.length,7);assert.ok(n.every(n=>n.user_id===owner&&n.delivery_mode==='daily_digest'&&n.status==='pending'));
  const digest=await rpc('prepare_production_structured_digests',{p_since:'2026-10-30T00:00:00Z',p_owners:[owner]});assert.ok(!digest.error);assert.ok(digest.data.length>0);
 });
 await t.test('NO_ALERT creates no delivery; report consumes generic V3 metadata',async()=>{
  const prior=await count('media_watch_notifications');await db.query("update public.structured_media_schedules set next_due_at='2026-11-01T07:15:00Z' where watch_id=$1",[ids[0]]);
  const r=await runPilotMonitoring({client,env,schedulerAuthorized:true,feed,currency,model:async req=>({action:'NO_ALERT',evidence_status:'STRONG_UNCONFIRMED',reason:'Already represented in prior state.',novelty_summary:null,condition_check:null,evidence_refs:req.input.evidence.segments.filter(s=>s.role==='CLAIM').map(s=>s.id),provenance_refs:[]})});assert.equal(r.completed,1);assert.equal(await count('media_watch_notifications'),prior);
  let saved;const rows=(await db.query('select * from public.watches where id=$1',[ids[0]])).rows;
  const reportClient={from:()=>({select:()=>({eq:async(k,v)=>({data:(await db.query('select watch_id,engine from public.v3_pilot_watches where user_id=$1',[v])).rows})})}),rpc:async(name,p)=>{if(name==='production_watch_owners')return {data:[owner]};if(name==='morning_report_context')return {data:{pending:0,exists:false,watches:rows,revision:'generic-v3'}};if(name==='save_watch_report'){saved=p.p_report;return {data:true};}throw Error(name);}};
  await generateMorningReport({client:reportClient,env,schedulerAuthorized:true,at:Date.parse('2026-11-01T07:10:00Z')});assert.ok(saved.watchIdsConsidered.includes(ids[0]));
 });

 const getState=async id=>(await db.query(`
  select to_jsonb(w) as watch, to_jsonb(p) as runtime, to_jsonb(s) as snapshot,
    to_jsonb(c) as schedule,
    (select count(*)::int from public.media_watch_notifications n where n.watch_id=w.id) as notifications,
    (select count(*)::int from public.structured_watch_mutations m where m.watch_id=w.id) as receipts,
    (select count(*)::int from public.currency_watch_events e where e.watch_id=w.id) as events
  from public.watches w join public.v3_pilot_watches p on p.watch_id=w.id
  join public.media_watch_snapshots s on s.watch_id=w.id
  join public.structured_media_schedules c on c.watch_id=w.id where w.id=$1`,[id])).rows[0];
 const recreationCases=[
  ['text','Keep me updated on Jannik Sinner.',['Jannik Sinner']],
  ['multi-entity','Notify me when Gucci or Prada bring out new products.',['Gucci','Prada']],
  ['threshold','Tell me when GBP/EUR goes above 1.18.',['GBP/EUR']],
  ['article','https://example.test/story/recreation',['Shop manager assault','Nice']],
 ];
 for(const [name,instruction,refs] of recreationCases)await t.test(name+' recreates with fresh identity and baseline, while old tokens remain bound',async()=>{
  let models=0,sources=0;
  const article=name==='article';
  const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,
   model:async req=>{
    models++;
    if(!article)return ready(instruction,refs);
    assert.equal(req.input.capture.kind,'PAGE_CONTEXT');
    return {...ready('Follow the shop manager assault in Nice.',refs),display_title:'Shop manager assault in Nice'};
   },
   feed:async url=>{
    if(article)throw Object.assign(Error('HTML'),{code:'UNSUPPORTED_CONTENT_TYPE'});
    sources++;
    const result=await feed(url);
    return {...result,items:result.items.map(item=>({...item,id:'fresh-'+sources,url:item.url+'?observation='+sources}))};
   },
   pageMetadata:async()=>({
    pageType:'article',title:'A shop manager was assaulted in Nice',description:'Witness appeal version '+(++sources),
    openGraphType:'article',titleSource:'open_graph_title',siteName:'Public news',canonicalUrl:instruction,publishedAt:'2026-10-22T10:00:00Z',
   }),
   currency:async()=>({
    criteria:{base:'GBP',quote:'EUR',operator:'gt',target:'1.18'},
    observation:{base:'GBP',quote:'EUR',rate:sources++?'1.179':'1.181',date:'2026-11-01'},checkedAt:'2026-11-01T10:00:00Z',
   }),
  });
  const original={instruction,watchId:randomUUID(),captureKind:article?'URL':'FREE_TEXT'};
  const alias={...original,watchId:randomUUID()};
  assert.equal((await invoke(original,handler)).id,original.watchId);
  assert.equal((await invoke(alias,handler)).id,original.watchId);
  assert.equal((await invoke(original,handler)).id,original.watchId);
  assert.equal(models,1);
  await db.query(`update public.watches set deleted_at='2026-11-04T16:22:49Z',
    media_revision=media_revision+1, current_status='updated', last_change_item_id='old-change',
    last_check_error_code='OLD_ERROR' where id=$1`,[original.watchId]);
  await db.query(`update public.v3_pilot_watches set history=history||'[{"old":true}]',
    last_judgment='{"action":"ALERT"}' where watch_id=$1`,[original.watchId]);
  await db.query(`insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article)
    values($1,$2,'old-notification','Historical development','{}')`,[original.watchId,owner]);
  const deleted=await getState(original.watchId);
  assert.equal(deleted.notifications,1);
  assert.equal(deleted.receipts,1);
  for(const retry of [original,alias]){
   const response=await invoke(retry,handler);
   assert.equal(response.http,409);
   assert.equal(response.code,'V3_CREATION_DELETED');
  }
  assert.equal(models,1);
  const fresh={...original,watchId:randomUUID()};
  const response=await invoke(fresh,handler);
  assert.equal(response.http,200);
  assert.equal(response.id,fresh.watchId);
  assert.equal(response.persisted,true);
  assert.equal(models,2);
  assert.equal(sources,name==='multi-entity'?4:2);
  assert.deepEqual(await getState(original.watchId),deleted);
  const created=await getState(fresh.watchId);
  assert.equal(created.watch.deleted_at,null);
  assert.equal(created.watch.media_revision,1);
  assert.notEqual(created.watch.media_mutation_id,deleted.watch.media_mutation_id);
  assert.equal(created.watch.last_change_item_id,null);
  assert.equal(created.watch.last_check_error_code,null);
  assert.equal(created.watch.current_status,'watching');
  assert.equal(created.watch.last_check_outcome,'baseline');
  assert.equal(created.runtime.last_judgment,null);
  assert.equal(created.runtime.history.length,1);
  assert.equal(created.runtime.history[0].baseline,true);
  assert.ok(created.runtime.prior_state.entries.every(entry=>entry.alerted===false));
  assert.notDeepEqual(created.runtime.last_evidence,deleted.runtime.last_evidence);
  assert.equal(created.schedule.failures,0);
  assert.equal(created.schedule.lease_token,null);
  assert.equal(created.notifications,0);
  assert.equal(created.receipts,0);
  assert.equal(created.events,0);
  if(article){
   assert.equal(created.watch.title,'Shop manager assault in Nice');
   assert.equal(created.runtime.understanding.story_seed.original_url,instruction);
   assert.equal(created.runtime.understanding.intent.canonical_text,'Follow the shop manager assault in Nice.');
   assert.equal(created.snapshot.initial_items[0].url,instruction);
  }
  if(name==='multi-entity')assert.equal(new URL(created.watch.monitoring_source.url).searchParams.get('q'),'"Gucci" OR "Prada"');
  if(name==='threshold'){
   assert.notEqual(created.watch.watch_definition.currencyRevision,deleted.watch.watch_definition.currencyRevision);
   assert.equal(created.watch.currency_evaluation.met,false);
  }
  assert.equal((await invoke(alias,handler)).code,'V3_CREATION_DELETED');
  assert.equal((await invoke({...fresh,watchId:randomUUID()},handler)).id,fresh.watchId);
  assert.equal(models,2);
 });

 await t.test('direct and multi-round clarified booking requests fail identically before baseline or writes',async()=>{
  const original='Nice to Monaco trains';
  const canonical='Notify me when booking availability opens for Nice to Monaco trains.';
  const clarifications=[
   {question:'What do you want to follow?',answer:'Reservations'},
   {question:'Which reservation event?',answer:'Notify me when booking availability opens'},
  ];
  const expectedCalls=[
   {instruction:canonical,answers:[]},
   {instruction:original,answers:clarifications.slice(0,1).map(turn=>turn.answer)},
   {instruction:original,answers:clarifications.map(turn=>turn.answer)},
   {instruction:original,answers:clarifications.map(turn=>turn.answer)},
  ];
  const before=await Promise.all([count('watches'),count('structured_media_schedules')]);
  let calls=0,baselines=0;
  const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,
   feed:async url=>{baselines++;return feed(url);},
   model:async req=>{
    const expected=expectedCalls[calls++];
    assert.equal(req.input.capture.raw_input,expected.instruction);
    assert.deepEqual(req.input.conversation,expected.answers);
    if(calls===2)return {intent:{canonical_text:original,references:[],explicit_constraints:[],unresolved_ambiguities:['Missing reservation event']},
     decision:{status:'NEEDS_CLARIFICATION',reason:'Event unclear',clarification_question:clarifications[1].question},display_title:null};
    if(calls===4){
     const paraphrased=ready('Alert me when tickets go on sale for Nice to Monaco trains',['Nice to Monaco trains']);
     paraphrased.intent.explicit_constraints=[{kind:'condition',text:'booking availability',source_ref:'conversation:1'}];
     return paraphrased;
    }
    return ready(canonical,['Nice to Monaco trains']);
   }});
  const direct=await invoke({instruction:canonical,watchId:randomUUID()},handler);
  assert.equal(direct.http,200);
  assert.equal(direct.status,'UNSUPPORTED_FOR_NOW');
  const body={instruction:original,watchId:randomUUID()};
  assert.equal((await invoke({...body,clarifications:clarifications.slice(0,1)},handler)).status,'NEEDS_CLARIFICATION');
  assert.deepEqual(await invoke({...body,clarifications},handler),direct);
  assert.deepEqual(await invoke({...body,clarifications},handler),direct);
  assert.equal(calls,4);
  assert.equal(baselines,0);
  assert.deepEqual(await Promise.all([count('watches'),count('structured_media_schedules')]),before);
 });

 await t.test('clarification options and answers share the normal model call and persist only on ready',async()=>{
  const instruction='Blackburn Rovers',watchId=randomUUID(),question='Which developments matter?';
  const answer='Injury updates only. Exclude booking availability.',clarifications=[{question,answer}];
  const intent={...ready('Follow Blackburn Rovers injury updates only. Exclude booking availability.',['Blackburn Rovers']).intent,
   explicit_constraints:[{kind:'condition',text:'Injury updates only',source_ref:'conversation:0'},
    {kind:'exclusion',text:'Exclude booking availability',source_ref:'conversation:0'}]};
  let calls=0;
  const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,feed,
   model:async req=>{
    assert.equal(req.input.capture.raw_input,instruction);
    if(++calls===1){
     assert.deepEqual(req.input.conversation,[]);
     return {intent:{...intent,explicit_constraints:[],unresolved_ambiguities:['Missing scope']},display_title:null,
      decision:{status:'NEEDS_CLARIFICATION',reason:'Scope unclear',clarification_question:question,suggestions:['Injury updates','Match results','Injury updates']}};
    }
    assert.deepEqual(req.input.conversation,[answer]);
    assert.deepEqual(req.input.clarification_questions,[question]);
    return {intent,display_title:'Blackburn Rovers Injury Updates',decision:{status:'READY_TO_MONITOR',reason:'Scope clarified'}};
   }});
  const body={instruction,watchId};
  const first=await invoke(body,handler);
  assert.equal(first.status,'NEEDS_CLARIFICATION');
  assert.deepEqual(first.clarification_options,['Injury updates','Match results']);
  assert.equal((await db.query('select id from public.watches where id=$1',[watchId])).rows.length,0);
  assert.equal((await invoke({...body,clarifications},handler)).id,watchId);
  assert.equal((await invoke({...body,clarifications},handler)).id,watchId);
  assert.equal(calls,2);
  const [row]=(await db.query('select title,watch_definition,understanding from public.watches join public.v3_pilot_watches on watch_id=id where id=$1',[watchId])).rows;
  assert.equal(row.title,'Blackburn Rovers Injury Updates');
  assert.equal(row.watch_definition.request,instruction);
  assert.deepEqual(row.understanding.intent,intent);
  assert.deepEqual(row.understanding.clarifications,clarifications);
 });

 await t.test('explicit RSS and Atom are read only after capability validation',async()=>{
  const weatherUrl='https://example.test/weather.rss';
  const cases=[
   ['https://example.test/news.rss','Notify me when booking availability opens','Alert me when tickets go on sale','booking availability',false],
   [weatherUrl,'Monitor weather alerts','Monitor weather alerts from '+weatherUrl+'.',null,false],
   [weatherUrl,'Follow new articles','Follow new articles from '+weatherUrl+'.',null,true],
   ['https://example.test/news.atom?edition=public','Follow new injury updates','Follow new injury updates','Follow new injury updates',true],
  ];
  for(const [instruction,answer,canonical,constraint,supported] of cases){
   const watchId=randomUUID(),events=[];
   const clarifications=[{question:'What should I track?',answer}];
   const title='Club Injury Updates';
   const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,
    feed:async url=>{events.push('feed');assert.equal(url,instruction);return feed(url);},
    model:async req=>{
     events.push('model');
     assert.equal(req.input.capture.raw_input,instruction);
     assert.deepEqual(req.input.conversation,[answer]);
     const result=ready(canonical);
     const explicit_constraints=[{kind:'exact_resource',text:instruction,source_ref:'resource'}];
     if(constraint)explicit_constraints.push({kind:'condition',text:constraint,source_ref:'conversation:0'});
     return {...result,display_title:title,intent:{...result.intent,explicit_constraints}};
    }});
   const result=await invoke({instruction,watchId,captureKind:'URL',clarifications},handler);
   assert.equal(result.http,200);
   assert.equal(result.status,supported?'READY_TO_MONITOR':'UNSUPPORTED_FOR_NOW');
   assert.deepEqual(events,supported?['model','feed']:['model']);
   for(const table of ['media_watch_snapshots','structured_media_schedules']){
    const {rows}=await db.query('select watch_id from public.'+table+' where watch_id=$1',[watchId]);
    assert.equal(rows.length,supported?1:0);
   }
   const {rows}=await db.query('select title,watch_definition from public.watches where id=$1',[watchId]);
   if(supported){
    assert.equal(result.id,watchId);
    assert.equal(rows[0].title,title);
    assert.equal(rows[0].watch_definition.request,instruction);
    const [saved]=(await db.query('select understanding from public.v3_pilot_watches where watch_id=$1',[watchId])).rows;
    assert.equal(saved.understanding.resource.exact_url,instruction);
    assert.equal(saved.understanding.intent.canonical_text,canonical);
    assert.deepEqual(saved.understanding.intent.explicit_constraints[0],{kind:'exact_resource',text:instruction,source_ref:'resource'});
   }else assert.equal(rows.length,0);
  }
 });

 await t.test('clarification identity gates both Watch reuse and persistence',async()=>{
  const instruction='Nice to Monaco trains';
  const request=answer=>({instruction,watchId:randomUUID(),clarifications:[{question:'What should I track?',answer}]});
  const events=[];
  const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,
   feed:async url=>{events.push('feed');return feed(url);},
   model:async req=>{
    const [answer]=req.input.conversation;
    events.push(answer);
    assert.equal(req.input.capture.raw_input,instruction);
    const result=ready(answer,['Nice to Monaco trains']);
    result.intent.explicit_constraints=[{kind:'condition',text:answer,source_ref:'conversation:0'}];
    return result;
   }});
  const first=request('New timetable announcements');
  assert.equal((await invoke(first,handler)).id,first.watchId);
  assert.deepEqual(events.splice(0),['New timetable announcements','feed']);

  const repeat={...first,watchId:randomUUID()};
  const reused=await invoke(repeat,handler);
  assert.equal(reused.id,first.watchId);
  assert.equal(reused.existing,true);
  assert.equal((await invoke(first,handler)).id,first.watchId);
  assert.deepEqual(events,[]);

  const before=await Promise.all([count('watches'),count('structured_media_schedules')]);
  const rejected=request('Notify me when booking availability opens');
  const refusal=await invoke(rejected,handler);
  assert.equal(refusal.status,'UNSUPPORTED_FOR_NOW');
  assert.equal(refusal.id,undefined);
  assert.deepEqual(events.splice(0),['Notify me when booking availability opens']);
  assert.deepEqual(await Promise.all([count('watches'),count('structured_media_schedules')]),before);

  const second=request('New station improvement announcements');
  assert.equal((await invoke(second,handler)).id,second.watchId);
  assert.deepEqual(events.splice(0),['New station improvement announcements','feed']);
  assert.deepEqual(await Promise.all([count('watches'),count('structured_media_schedules')]),before.map(n=>n+1));
  const {rows}=await db.query('select watch_id,instruction,understanding from public.v3_pilot_watches where watch_id in ($1,$2)',[first.watchId,second.watchId]);
  for(const body of [first,second]){
   const row=rows.find(r=>r.watch_id===body.watchId);
   assert.equal(row.instruction,instruction);
   assert.deepEqual(row.understanding.clarifications,body.clarifications);
  }
  assert.equal((await invoke({...second,watchId:repeat.watchId},handler)).http,409);
  assert.deepEqual(events,[]);
 });

 await t.test('same instruction is independent across owners and a bound token cannot change payload or owner',async()=>{
  const instruction='Keep me updated on Jannik Sinner.';
  const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:other}}),serviceClient:client,
   model:async()=>ready(instruction,['Jannik Sinner']),feed});
  const otherBody={instruction,watchId:randomUUID()};
  assert.equal((await invoke(otherBody,handler)).id,otherBody.watchId);
  assert.equal((await invoke(otherBody)).http,409);
  assert.equal((await invoke({...otherBody,instruction:'Follow other news.'},handler)).http,409);
  assert.equal((await invoke(otherBody,handler)).id,otherBody.watchId);
 });
});

test('capability connector retains exact comparison and rejects unimplemented conditions',()=>{
 assert.deepEqual(v3CurrencyCriteria(cases[6][1]),{base:'GBP',quote:'EUR',operator:'gt',target:'1.17'});
 assert.equal(v3CurrencyCriteria('Tell me when GBP/EUR goes below 1.17.'),null);
 const text='Tell me when GBP/EUR goes below 1.17.';assert.equal(v3Capability({raw_input:text},ready(text)).decision.status,'UNSUPPORTED_FOR_NOW');
 const vague={raw_input:'GBP/EUR'};
 for(const canonical_text of [cases[6][1],text]){
  const understanding={intent:ready(canonical_text).intent};
  assert.deepEqual(v3Capability(vague,understanding,{clarified:true}),v3Capability({raw_input:canonical_text},understanding));
 }
});


test('an explicit exclusion does not hide a separate positive occurrence in clarified text',()=>{
 const capture={raw_input:'Blackburn Rovers'};
 for(const text of ['Exclude booking availability','booking availability']){
  const intent={
   canonical_text:'Follow Blackburn Rovers injury updates. Exclude booking availability. Alert me when booking availability opens.',
   references:[{label:'Blackburn Rovers',source_ref:'raw_input'}],
   explicit_constraints:[{kind:'exclusion',text,source_ref:'conversation:0'}],
  };
  assert.equal(v3Capability(capture,{intent},{clarified:true}).decision.status,'UNSUPPORTED_FOR_NOW');
 }
});
