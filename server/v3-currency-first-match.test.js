import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { evaluateV3Source, PILOT_OWNER, PILOT_ENGINE } from './v3-pilot.js';
import { fetchCurrencyRate } from './currency-rate.js';
import { createV3WatchHandler } from './v3-creation.js';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const source = { type: 'currency', provider: 'ecb', url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml' };
const criteria = { base: 'GBP', quote: 'EUR', operator: 'gt', target: '1.17' };
const understanding = text => ({ intent: { canonical_text: text, references: [], explicit_constraints: [], unresolved_ambiguities: [] }, decision: { status: 'READY_TO_MONITOR' } });
const observation = (row, rate, date) => ({ criteria: row.criteria,
  observation: { base: row.criteria.base, quote: row.criteria.quote, rate, date }, checkedAt: date + 'T07:35:00Z' });
const model = action => async req => ({ action, evidence_status: 'CONFIRMED', reason: 'The supplied observation and prior state determine this decision.',
  novelty_summary: null, condition_check: null,
  evidence_refs: req.input.evidence.segments.filter(s => s.role !== 'PROVENANCE').map(s => s.id),
  provenance_refs: req.input.evidence.segments.filter(s => s.role === 'PROVENANCE').map(s => s.id) });

test('first-match comparison reuses exact numeric evaluation for both directions/operators and all existing policies', async t => {
  for (const [base, quote, operator, target, rate, matches] of [
    ['GBP', 'EUR', 'gt', '1.17', '1.17', false],
    ['GBP', 'EUR', 'gt', '1.17', '1.170000000001', true],
    ['GBP', 'EUR', 'gt', '1.17', '1.169999999999', false],
    ['GBP', 'EUR', 'gte', '1.17', '1.17', true],
    ['EUR', 'GBP', 'gt', '0.8', '0.81', true],
    ['EUR', 'GBP', 'gte', '0.8', '0.8', true],
  ]) for (const currencyPolicy of ['once', 'crossing', 'daily']) await t.test([base, quote, operator, rate, currencyPolicy].join(' '), async () => {
    const row = { criteria: { base, quote, operator, target }, currencyPolicy, baseline_at: null, understanding: understanding('Currency fixture'), prior_state: { entries: [] } };
    const before = structuredClone(row);
    const result = await evaluateV3Source(row, source, { currency: async () => observation(row, rate, '2026-11-13'), model: () => assert.fail('No initial Brain call') });
    assert.equal(result.evaluation.met, matches); assert.equal(result.judgment?.action === 'ALERT', matches);
    assert.equal(Boolean(result.article), matches); assert.deepEqual(row, before);
  });
});

test('ECB inversion and invalid/unavailable first data use the existing connector without false baseline', async () => {
  const row = { criteria, baseline_at: null, understanding: understanding('Currency fixture'), prior_state: { entries: [] } };
  const connector = (rate, status = 200) => request => fetchCurrencyRate(request, {
    now: () => new Date('2026-11-13T07:35:00Z'), fetchImpl: async () => new Response(
      `<Envelope><Cube><Cube time="2026-11-12"><Cube currency="GBP" rate="${rate}"/></Cube></Cube></Envelope>`, { status }),
  });
  const result = await evaluateV3Source(row, source, { currency: connector('0.83595') });
  assert.equal(result.evaluation.observedRate, '1.196243794485'); assert.equal(result.evaluation.inverted, true);
  assert.equal(result.judgment.action, 'ALERT');
  for (const currency of [connector('invalid'), connector('0'), connector('0.83595', 503)]) {
    await assert.rejects(evaluateV3Source(row, source, { currency }));
    assert.equal(row.baseline_at, null); assert.deepEqual(row.prior_state, { entries: [] });
  }
});

test('missing or unsupported currency criteria fail before source acquisition, without fallback evidence',async()=>{
  for(const invalid of [undefined,null,{}, {...criteria,operator:'lt'}, {...criteria,target:'invalid'}, {...criteria,base:'USD'}]){
    await assert.rejects(evaluateV3Source({criteria:invalid,baseline_at:null,understanding:understanding('Currency fixture')},source,
      {currency:()=>assert.fail('Invalid criteria must not fetch')}),/criteria/);
  }
});

test('new currency creation and subsequent checks persist through isolated real SQL and existing outbox', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table public.fixture_clock(at timestamptz); insert into public.fixture_clock values('2026-11-13T07:35:00Z');
    create function public.fixture_now() returns timestamptz language sql as $$select at from public.fixture_clock$$;`);
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const migration = '20261113120000_v3_currency_first_match.sql';
  for (const f of (await readdir(dir)).sort().filter(f => f.endsWith('.sql') && f !== '20261022160000_private_morning_reports.sql' && f !== migration)) {
    await db.exec((await readFile(new URL(f, dir), 'utf8')).replace('create extension if not exists pgcrypto;', '').replaceAll('clock_timestamp()', 'public.fixture_now()'));
  }
  const contracts = async () => (await db.query(`select oid,oid::regprocedure::text signature,proowner::regrole::text owner,
    proacl,prosecdef,proconfig,prorettype::regtype::text result,proargdefaults::text defaults from pg_proc
    where proname in ('create_v3_watch','finish_v3_pilot_check','claim_v3_pilot_checks','production_watch_owners') order by 1`)).rows;
  const definitions = async () => (await db.query(`select pg_get_functiondef(oid) definition from pg_proc
    where pronamespace='public'::regnamespace and proname in ('create_v3_watch','finish_v3_pilot_check') order by proname`)).rows.map(r=>r.definition);
  const unrelatedCatalog = async () => (await db.query(`select oid::regprocedure::text signature,proowner,proacl,proconfig,prosecdef,
    md5(pg_get_functiondef(oid)) body from pg_proc where pronamespace='public'::regnamespace and prokind='f'
    and proname not in ('create_v3_watch','finish_v3_pilot_check') order by 1`)).rows;
  const tableCatalog = async () => (await db.query(`select c.relname,c.relowner,c.relacl,c.relrowsecurity,a.attname,
    a.atttypid,a.attnotnull from pg_class c left join pg_attribute a on a.attrelid=c.oid and a.attnum>0
    where c.relnamespace='public'::regnamespace order by c.relname,a.attnum`)).rows;
  const before = await contracts();
  const originalDefinitions = await definitions(), originalUnrelated = await unrelatedCatalog(), originalTables = await tableCatalog();
  await db.query('insert into auth.users values($1,$2)', [owner, 'synthetic@example.test']);
  await db.exec("set request.jwt.claim.role='service_role'");
  const existing = randomUUID();
  const oldInitial = await evaluateV3Source({ criteria, baseline_at:null, understanding:understanding('Untouched existing currency'), prior_state:{entries:[]} },
    source,{currency:async()=>observation({criteria},'1.19','2026-11-13')});
  // Seed the old silent-baseline contract before applying the new function DDL.
  await db.query('select public.create_v3_watch($1,$2,$3,$4,$5,$6,$7,$8)',
    [existing,owner,'Untouched existing currency','FREE_TEXT',understanding('Untouched existing currency'),source,criteria,{...oldInitial,judgment:null,article:null}]);
  const existingState = async () => (await db.query(`select to_jsonb(w) watch,to_jsonb(p) runtime,to_jsonb(s) snapshot,to_jsonb(c) schedule,
    (select count(*)::int from public.currency_watch_events where watch_id=w.id) events,
    (select count(*)::int from public.media_watch_notifications where watch_id=w.id) notifications
    from public.watches w join public.v3_pilot_watches p on p.watch_id=w.id join public.media_watch_snapshots s on s.watch_id=w.id
    join public.structured_media_schedules c on c.watch_id=w.id where w.id=$1`,[existing])).rows;
  const persistedBefore = await existingState();
  const sql = (await readFile(new URL(migration, dir), 'utf8')).replaceAll('clock_timestamp()', 'public.fixture_now()');
  await db.exec(sql);
  const migratedDefinitions = await definitions();
  assert(originalDefinitions.every((definition,i)=>definition!==migratedDefinitions[i]));
  await db.exec(sql);
  assert.deepEqual(await definitions(),migratedDefinitions,'second execution preserves both complete definitions exactly');
  assert.deepEqual(await contracts(), before, 'signatures, permissions, security and owner RPC unchanged');
  assert.deepEqual(await unrelatedCatalog(),originalUnrelated);
  assert.deepEqual(await tableCatalog(),originalTables);
  await t.test('function migration leaves an existing matching baseline and all its records untouched',async()=>{
    assert.deepEqual(await existingState(),persistedBefore);
    assert.equal(persistedBefore[0].events,0);assert.equal(persistedBefore[0].notifications,0);
  });
  await t.test('strict anchors, complete two-function idempotence and transactional postconditions',async t=>{
    const status="'monitoring','watching',1,gen_random_uuid(),at_time,'baseline',";
    const finish="alert:=p.baseline_at is not null and j->>'action'='ALERT';";
    const cases=[
      ['extra whitespace in status anchor',[originalDefinitions[0].replace(status,status.replace(",'watching'",", 'watching'")),originalDefinitions[1]]],
      ['missing creation anchor',[originalDefinitions[0].replace('prior jsonb;','prior jsonb ;'),originalDefinitions[1]]],
      ['missing completion anchor',[originalDefinitions[0],originalDefinitions[1].replace(finish,finish.replace('alert:=','alert :='))]],
      ['duplicated creation anchor',[originalDefinitions[0].replace('prior jsonb;','prior jsonb; -- prior jsonb;\n'),originalDefinitions[1]]],
      ['duplicated completion anchor',[originalDefinitions[0],originalDefinitions[1].replace(finish,finish+' -- '+finish+'\n')]],
      ['only creation migrated',[migratedDefinitions[0],originalDefinitions[1]]],
      ['only completion migrated',[originalDefinitions[0],migratedDefinitions[1]]],
      ['partial creation status',[migratedDefinitions[0].replace("case when initial_alert then 'updated'","case when initial_alert then 'watching'"),migratedDefinitions[1]]],
      ['partial completion classification',[migratedDefinitions[0],migratedDefinitions[1].replace("case when alert then 'matching-items'","case when alert then 'baseline'")]],
      ['missing creation outbox postcondition',[migratedDefinitions[0].replace('if initial_alert then','if initial_alert  then'),migratedDefinitions[1]]],
      ['missing completion history postcondition',[migratedDefinitions[0],migratedDefinitions[1].replace("'baseline',p.baseline_at is null and not coalesce(alert,false)","'baseline',p.baseline_at is null")]],
    ];
    const rejectUnchanged = async (input,script=sql,pattern=/anchor|postcondition|contract/) => {
      for(const definition of input)await db.exec(definition);
      const inputDefinitions=await definitions();
      await assert.rejects(db.exec(script),pattern);
      await db.exec('rollback');
      assert.deepEqual(await definitions(),inputDefinitions,'failure restores BOTH input definitions');
      assert.deepEqual(await existingState(),persistedBefore);
      assert.deepEqual(await contracts(),before);
      assert.deepEqual(await unrelatedCatalog(),originalUnrelated);
      assert.deepEqual(await tableCatalog(),originalTables);
    };
    for(const [name,input] of cases)await t.test(name,()=>rejectUnchanged(input));
    await t.test('missing installed postcondition rolls back both published definitions',async()=>{
      const injected=sql.replace('execute expected[2];',
        "execute replace(expected[2], 'case when alert then ''matching-items''', 'case when alert then ''baseline''');");
      assert.notEqual(injected,sql);
      await rejectUnchanged(originalDefinitions,injected,/postcondition/);
    });
    await t.test('failure publishing second function rolls back the first',async()=>{
      const injected=sql.replace('execute expected[2];',"raise exception 'Injected second definition failure';");
      assert.notEqual(injected,sql);
      await rejectUnchanged(originalDefinitions,injected,/Injected second definition failure/);
    });
    for(const definition of migratedDefinitions)await db.exec(definition);
    await db.exec(sql);
    assert.deepEqual(await definitions(),migratedDefinitions);
  });
  await db.query('insert into auth.users values($1,$2)', [PILOT_OWNER, 'synthetic@example.test']);
  const rpc = async (name, args) => {
    await db.exec("set request.jwt.claim.role='service_role'");
    return (await db.query(`select public.${name}(${Object.keys(args).map((k,i) => `${k}=>$${i+1}`).join(',')}) value`, Object.values(args))).rows[0].value;
  };
  const clock = at => db.query('update public.fixture_clock set at=$1', [at]);
  // Match the JSON RPC transport: PGlite direct timestamptz columns are Dates.
  const row = async id => JSON.parse(JSON.stringify((await db.query(`select p.*,w.watch_definition->'currencyCriteria' criteria
    from public.v3_pilot_watches p join public.watches w on w.id=p.watch_id where p.watch_id=$1`, [id])).rows[0]));
  const counts = async id => (await db.query(`select
    (select count(*)::int from public.currency_watch_events where watch_id=$1) events,
    (select count(*)::int from public.media_watch_notifications where watch_id=$1) notifications`, [id])).rows[0];
  const make = async (label, rate) => {
    await clock('2026-11-13T07:35:00Z');
    const id = randomUUID(), instruction = 'Currency fixture ' + label;
    const initial = await evaluateV3Source({ criteria, baseline_at: null, understanding: understanding(instruction), prior_state: { entries: [] } }, source,
      { currency: async () => observation({ criteria }, rate, '2026-11-13') });
    const args = { p_id: id, p_owner: owner, p_instruction: instruction, p_kind: 'FREE_TEXT', p_understanding: understanding(instruction), p_source: source, p_criteria: criteria, p_baseline: initial };
    assert.equal(await rpc('create_v3_watch', args), id);
    assert.equal(await rpc('create_v3_watch', args), id, 'creation retry is idempotent');
    return id;
  };
  const check = async (id, rate, date, action) => {
    const at = date + 'T07:35:00Z'; await clock(at);
    const current = await row(id), token = randomUUID();
    const result = await evaluateV3Source(current, source, { currency: async () => observation(current, rate, date), model: model(action) });
    await db.query(`update public.structured_media_schedules set lease_token=$2,lease_kind='scheduled',lease_revision=1,
      lease_until=public.fixture_now()+interval '2 minutes' where watch_id=$1`, [id, token]);
    const args = { p_id: id, p_token: token, p_result: result };
    assert.equal(await rpc('finish_v3_pilot_check', args), true);
    assert.equal(await rpc('finish_v3_pilot_check', args), false, 'completed lease cannot persist twice');
    return result;
  };
  for (const [label, rates, actions, dates] of [
    ['first match', ['1.19'], ['ALERT']],
    ['first nonmatch', ['1.15'], ['NO_ALERT']],
    ['nonmatch then match', ['1.15','1.19'], ['NO_ALERT','ALERT']],
    ['stays matching', ['1.19','1.20','1.21'], ['ALERT','NO_ALERT','NO_ALERT']],
    ['rearms', ['1.19','1.15','1.18'], ['ALERT','NO_ALERT','ALERT']],
    ['repeat match publication', ['1.19','1.19'], ['ALERT','NO_ALERT'], ['2026-11-13','2026-11-13']],
    ['repeat nonmatch publication', ['1.15','1.15'], ['NO_ALERT','NO_ALERT'], ['2026-11-13','2026-11-13']],
  ]) await t.test(label, async () => {
    const id = await make(label, rates[0]);
    for (let i=1;i<rates.length;i++) await check(id,rates[i],dates?.[i] || `2026-11-${13+i}`,actions[i]);
    const expected = actions.filter(a => a === 'ALERT').length;
    assert.deepEqual(await counts(id), { events: expected, notifications: expected });
    const saved = await row(id);
    assert.equal(saved.engine, 'wa-v3-evidence-refs.v1');
    assert.equal(saved.history[0].baseline, actions[0] !== 'ALERT');
    assert.equal(saved.history[0].judgment?.action === 'ALERT', actions[0] === 'ALERT');
    const policy = (await db.query('select mode,enabled from public.media_watch_email_policies where watch_id=$1',[id])).rows[0];
    assert.deepEqual(policy, { mode:'daily_digest', enabled:true });
    const notifications = (await db.query('select delivery_mode,status,provider_message_id from public.media_watch_notifications where watch_id=$1',[id])).rows;
    for (const n of notifications) assert.deepEqual(n,{delivery_mode:'daily_digest',status:'pending',provider_message_id:null});
    assert.equal((await db.query(`select count(*)::int n from public.media_watch_notifications n join public.media_watch_email_policies p using(watch_id)
      where n.watch_id=$1 and n.created_at<p.eligible_after`,[id])).rows[0].n,0);
    await db.query("update public.watches set monitoring_state='paused' where id=$1",[id]);
  });
  await t.test('actual V3 creation handler persists consistent ECB evidence for both directions, operators and initial outcomes',async t=>{
    const env={V3_PILOT_ENABLED:'true',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',
      VERCEL_GIT_COMMIT_REF:'master',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',
      STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true'};
    const client={rpc:async(name,args)=>{try{return {data:await rpc(name,args)};}catch(error){return {error};}},from:table=>{
      const filters={};const query={select(){return query;},eq(k,v){filters[k]=v;return query;},async maybeSingle(){
        const column=table==='watches'?'id':'watch_id';
        return {data:(await db.query(`select * from public.${table} where ${column}=$1 and user_id=$2`,[filters[column],filters.user_id])).rows[0]||null};
      }};return query;
    }};
    for(const [base,quote,operator,target,expectedRate,met] of [
      ['EUR','GBP','gte','0.8','0.83595',true],['EUR','GBP','gte','0.9','0.83595',false],
      ['GBP','EUR','gt','1.17','1.196243794485',true],['GBP','EUR','gt','1.25','1.196243794485',false],
      ['EUR','GBP','gt','0.83595','0.83595',false],['EUR','GBP','gte','0.83595','0.83595',true],
    ])await t.test(`${base}/${quote} ${operator} ${target}`,async()=>{
      await clock('2026-11-13T07:35:00Z');
      const id=randomUUID(),metric=`${base}/${quote}`,comparison=`${metric} ${operator==='gt'?'>':'>='} ${target}`;
      const instruction=`Tell me when ${metric} is ${operator==='gt'?'above':'at least'} ${target}.`;
      let fetches=0,intents=0,xml='<Envelope><Cube><Cube time="2026-11-12"><Cube currency="GBP" rate="0.83595"/></Cube></Cube></Envelope>';
      const currency=request=>fetchCurrencyRate(request,{now:()=>new Date('2026-11-13T07:35:00Z'),fetchImpl:async url=>{
        assert.equal(String(url),source.url);fetches++;return new Response(xml,{status:200});
      }});
      const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,currency,
        model:async()=>{intents++;return {intent:{canonical_text:instruction,references:[{label:base,source_ref:'raw_input'},{label:quote,source_ref:'raw_input'}],
          explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'The currency condition is explicit.'}};}});
      const invoke=async watchId=>{let body;const response={setHeader(){},end(raw){body=JSON.parse(raw);}};
        await handler({method:'POST',body:{watchId,instruction,captureKind:'FREE_TEXT'}},response);return {status:response.statusCode,body};};
      const response=await invoke(id);assert.equal(response.status,200);assert.equal(response.body.id,id);
      const saved=await row(id),evidence=saved.last_evidence;
      assert.deepEqual(saved.criteria,{base,quote,operator,target});
      assert.equal(saved.evaluation.met,met);assert.equal(saved.evaluation.observedRate,expectedRate);
      assert.equal(saved.evaluation.inverted,base==='GBP');assert.equal(saved.evaluation.observationDate,'2026-11-12');
      assert.equal(evidence.title,`ECB ${metric} reference observation`);
      assert.deepEqual(evidence.measurement,{metric,value:expectedRate,quote:`${metric} ${expectedRate}`});
      assert.equal(evidence.content,`${metric} ${expectedRate} (display truncated at 12 decimal places). Source observation: EUR/GBP 0.83595. Exact rational comparison ${comparison}: ${met}.`);
      assert.equal(evidence.source,'ECB');assert.equal(evidence.url,source.url);assert.equal(evidence.published_at,'2026-11-12T00:00:00Z');
      assert.equal(saved.history[0].evidence.content,evidence.content);assert.equal(saved.history[0].baseline,!met);
      const watch=(await db.query('select current_status,last_check_outcome,currency_evaluation from public.watches where id=$1',[id])).rows[0];
      assert.equal(watch.current_status,met?'updated':'watching');assert.equal(watch.last_check_outcome,met?'matching-items':'baseline');
      assert.deepEqual(watch.currency_evaluation,saved.evaluation);
      assert.deepEqual(await counts(id),{events:met?1:0,notifications:met?1:0});
      if(met){
        assert.equal(saved.last_judgment.action,'ALERT');assert.equal(saved.last_judgment.evidence_basis[0].text,evidence.content);
        assert(saved.last_judgment.reason.includes(`1 ${base}`));assert(saved.last_judgment.reason.includes(`${operator==='gt'?'>':'≥'} ${target} ${quote}`));
        const event=(await db.query('select article,evaluation from public.currency_watch_events where watch_id=$1',[id])).rows[0];
        const notification=(await db.query('select article,delivery_mode,status from public.media_watch_notifications where watch_id=$1',[id])).rows[0];
        assert.deepEqual(event.evaluation,saved.evaluation);assert.equal(event.article.summary,saved.last_judgment.reason);
        assert.deepEqual(notification.article,event.article);assert.equal(notification.article.url,evidence.url);
        assert.equal(notification.article.publishedAt,evidence.published_at);assert.equal(notification.delivery_mode,'daily_digest');assert.equal(notification.status,'pending');
      }else assert.equal(saved.last_judgment,null);
      assert.equal((await invoke(id)).status,200);assert.equal(fetches,1);assert.equal(intents,1);
      const repeated=await evaluateV3Source(saved,source,{currency,model:model('NO_ALERT')});
      assert.deepEqual(repeated.evidence,evidence);assert.equal(repeated.judgment.action,'NO_ALERT');assert.equal(repeated.article,null);
      const token=randomUUID();await db.query(`update public.structured_media_schedules set lease_token=$2,lease_kind='scheduled',lease_revision=1,
        lease_until=public.fixture_now()+interval '2 minutes' where watch_id=$1`,[id,token]);
      assert.equal(await rpc('finish_v3_pilot_check',{p_id:id,p_token:token,p_result:repeated}),true);
      assert.deepEqual(await counts(id),{events:met?1:0,notifications:met?1:0});
      await db.query("update public.watches set monitoring_state='paused' where id=$1",[id]);
    });
    for(const [index,xml] of [
      '<Envelope><Cube><Cube time="2026-11-12"><Cube currency="GBP"/></Cube></Cube></Envelope>',
      '<Envelope><Cube><Cube time="2026-11-12"><Cube currency="GBP" rate="invalid"/></Cube></Cube></Envelope>',
      '<Envelope><Cube><Cube><Cube currency="GBP" rate="0.83595"/></Cube></Cube></Envelope>',
    ].entries())await t.test(`invalid ECB creation observation ${index+1} leaves no evidence or Watch`,async()=>{
      const id=randomUUID(),instruction=`EUR >= 0.8${'0'.repeat(index+1)} GBP`;let fetches=0;
      const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:owner}}),serviceClient:client,
        model:async()=>({intent:{canonical_text:instruction,references:[{label:'EUR',source_ref:'raw_input'},{label:'GBP',source_ref:'raw_input'}],
          explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'The currency condition is explicit.'}}),
        currency:request=>fetchCurrencyRate(request,{now:()=>new Date('2026-11-13T07:35:00Z'),fetchImpl:async()=>{fetches++;return new Response(xml,{status:200});}})});
      let body;const response={setHeader(){},end(raw){body=JSON.parse(raw);}};
      await handler({method:'POST',body:{watchId:id,instruction}},response);
      assert.equal(response.statusCode,503);assert.equal(body.code,'V3_CREATION_UNAVAILABLE');assert.equal(fetches,1);
      assert.equal((await db.query('select count(*)::int n from public.watches where id=$1',[id])).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.v3_pilot_watches where watch_id=$1',[id])).rows[0].n,0);
      assert.deepEqual(await counts(id),{events:0,notifications:0});
    });
  });
  await t.test('invalid observation cannot rearm or change already persisted currency state', async () => {
    const id = await make('invalid middle', '1.19'), before = await row(id);
    await assert.rejects(evaluateV3Source(before, source, { currency: async () => { throw Error('INVALID_CURRENCY_DATA'); } }));
    assert.deepEqual(await row(id), before); assert.deepEqual(await counts(id), { events:1, notifications:1 });
    await check(id,'1.20','2026-11-14','NO_ALERT'); assert.deepEqual(await counts(id), { events:1, notifications:1 });
    await db.query("update public.watches set monitoring_state='paused' where id=$1",[id]);
  });
  await t.test('first scheduled pilot match uses existing completion/outbox with currency-only baseline exception', async () => {
    await clock('2026-11-13T07:35:00Z');
    const instruction='Tell me when GBP/EUR goes above 1.17.';
    const id=await rpc('create_v3_pilot',{p_slot:2,p_understanding:understanding(instruction),p_source:source});
    const current=await row(id); assert.equal(current.engine,PILOT_ENGINE); assert.equal(current.baseline_at,null);
    const first=await check(id,'1.19','2026-11-13','ALERT');
    assert.equal(first.judgment.action,'ALERT'); assert.deepEqual(await counts(id),{events:1,notifications:1});
    const saved=await row(id); assert.equal(saved.history[0].baseline,false); assert(saved.prior_state.entries.every(e=>e.alerted));
    const watch=(await db.query('select current_status,last_check_outcome from public.watches where id=$1',[id])).rows[0];
    assert.deepEqual(watch,{current_status:'updated',last_check_outcome:'matching-items'});
  });
  await t.test('initial match enters the existing morning digest window without a provider submission',async()=>{
    const id=await make('morning delivery','1.19');await clock('2026-11-14T07:16:00Z');
    const ids=await rpc('prepare_production_structured_digests',{p_since:'2026-11-12T00:00:00Z',p_owners:[owner]});
    assert.equal(ids.length,1);
    const digest=(await db.query('select watch_id,status,submission_started_at,provider_message_id from public.media_watch_digests where id=$1',[ids[0]])).rows[0];
    assert.deepEqual(digest,{watch_id:id,status:'prepared',submission_started_at:null,provider_message_id:null});
    assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications where watch_id=$1 and digest_id=$2',[id,ids[0]])).rows[0].n,1);
  });
});
