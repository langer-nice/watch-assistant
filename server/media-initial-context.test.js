import { configureAccountStorage } from '../src/js/account-storage.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
register('../src/js/test-support/json-module-loader.js', import.meta.url);
const { createWatchObject } = await import('../src/js/navigation.js');
import { PGlite } from '@electric-sql/pglite';
import { testResources } from './test-support/fixture-resources.js';
import { createMediaWatchMiddleware } from './media-watch-api.js';
import { createWatchCheckController } from '../src/js/watch-monitoring.js';
import { parseMediaMentionRequest } from '../src/js/media-mention-request.js';
import { initialContextArticles } from '../src/js/initial-context.js';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const article = (id) => ({ id, title: `Royal Caribbean Group ${id}`, url: `https://news.example/${id}`, excerpt: 'A report.', publishedAt: '2026-09-13T10:00:00Z' });
const storage = () => {
  const value = {};
  Object.defineProperties(value, {
    getItem: { value: (key) => value[key] ?? null },
    setItem: { value: (key, entry) => { value[key] = String(entry); } },
    removeItem: { value: (key) => { delete value[key]; } },
  });
  return value;
};

test('news Watch creation, authenticated manual checks, durable context and account isolation', async (t) => {
  const resources = testResources(t);
  const db = new PGlite();
  resources.defer(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const filename of (await readdir(directory)).sort()) {
    // PostgreSQL provides gen_random_uuid natively; PGlite does not package pgcrypto.
    await db.exec((await readFile(new URL(filename, directory), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
  }
  await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [USER_A, 'a@example.test', USER_B, 'b@example.test']);
  const scoped = (role, user, sql, params = []) => db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [user || '', role]);
    return tx.query(sql, params);
  });
  const rpcCalls = [];
  const client = (role, user) => ({
    from(table) {
      assert.ok(['watches','media_watch_notifications'].includes(table));
      const conditions = []; const args = []; const ordering = []; let snapshots = false;
      const q = {
        select(fields) { snapshots = fields.includes('media_watch_snapshots'); return q; },
        eq(column, value) { assert.ok(['id','user_id','type','monitoring_state','status','watch_id'].includes(column)); args.push(value); conditions.push(`w.${column}=$${args.length}`); return q; },
        is(column, value) { assert.equal(column, 'deleted_at'); assert.equal(value, null); conditions.push('w.deleted_at is null'); return q; },
        order(column, options) { assert.ok(['id','last_checked_at','created_at','watch_id','article_position'].includes(column)); ordering.push(`w.${column}${options?.nullsFirst ? ' nulls first' : ''}`); return q; },
        or(value) { const cutoff=value.split('claimed_at.lt.')[1]; args.push(cutoff); conditions.push(`(w.claim_token is null or w.claimed_at < $${args.length}::timestamptz)`); return q; },
        async range(start, end) {
          try {
            const result = await scoped(role, user, `select w.* ${snapshots ? ", (select coalesce(jsonb_agg(s),'[]'::jsonb) from public.media_watch_snapshots s where s.watch_id=w.id) as media_watch_snapshots" : ''}
              from public.${table} w ${conditions.length ? `where ${conditions.join(' and ')}` : ''} order by ${ordering.join(',') || 'w.id'} limit ${end-start+1} offset ${start}`, args);
            return { data: result.rows, error: null };
          } catch (error) { return { data: null, error }; }
        },
      };
      return q;
    },
    async rpc(name, params) {
      assert.ok(['persist_media_watch','fail_manual_media_watch_check','complete_manual_media_watch_check','complete_currency_watch_check','complete_scheduled_media_watch_check','fail_scheduled_media_watch_check','maintain_media_watch_notifications','get_media_watch_notification_locale','claim_media_watch_email_notification','begin_media_watch_email_submission','complete_media_watch_email_notification','fail_media_watch_email_notification'].includes(name));
      rpcCalls.push({ role, name, params });
      const entries = Object.entries(params);
      try {
        const result = await scoped(role, user, `select public.${name}(${entries.map(([key], index) => `${key} => $${index+1}`).join(',')}) as data`,
          entries.map(([key, value]) => value && typeof value === 'object' && key !== 'p_item_ids' ? JSON.stringify(value) : value));
        return { data: result.rows[0].data, error: null };
      } catch (error) { return { data: null, error }; }
    },
  });
  const originals = { localStorage: globalThis.localStorage, fetch: globalThis.fetch, window: globalThis.window };
  resources.defer(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  globalThis.localStorage = storage();
  globalThis.window = new EventTarget();
  let state = { status: 'authenticated', session: { access_token: USER_A, user: { id: USER_A } } };
  const listeners = new Set();
  const auth = { getState: () => state, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
  const switchUser = (id) => {
    state = id ? { status: 'authenticated', session: { access_token: id, user: { id } } } : { status: 'anonymous', session: null };
    for (const fn of listeners) fn(state);
  };
  let feedItems = []; let feedError = false; let time = new Date('2026-10-03T14:00:00Z');
  let fetchCount = 0;
  const middleware = createMediaWatchMiddleware({ serviceClient: client('service_role', null),
    authenticate: async request => {
      const id = request.headers.authorization?.replace('Bearer ', '');
      if (![USER_A, USER_B].includes(id)) throw Object.assign(new Error('Unauthenticated'), {statusCode:401,code:'AUTH_REQUIRED'});
      return {user:{id},client:client('authenticated', id)};
    },
    fetchFeed: async () => { fetchCount++; if(feedError) throw Object.assign(new Error('Fixture provider failure'), {code:'TIMEOUT'});
      time = new Date(time.getTime()+60000); return {checkedAt:time.toISOString(),items:feedItems}; },
  });
  globalThis.fetch = async (url, options) => {
    assert.ok(['/api/media-watches','/api/media-watches?action=check'].includes(url), 'No external network');
    let status; let body;
    await middleware({ url, method: options?.method || 'GET', headers: { authorization: options.headers.Authorization },
      ...(options.body ? { body: JSON.parse(options.body) } : {}) }, {
      setHeader() {}, set statusCode(value) { status = value; }, end(value) { body = JSON.parse(value); },
    });
    return { ok: status < 400, status, json: async () => body };
  };
  const store = await import('../src/js/media-watch-server-store.js');
  resources.defer(async () => {
    switchUser(null);
    try { await store.configureMediaWatchServerStore(null); }
    finally { configureAccountStorage(null); }
  });
  const watches = await import('../src/js/watch-storage.js');
  const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await store.synchronizeMediaWatches(); await new Promise((resolve) => setTimeout(resolve, 0)); await store.synchronizeMediaWatches(); };
  const count = async (table) => Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);

  const id = randomUUID();
  const request = 'Monitoring there is new information about Royal Caribbean Cruises.';
  const parsed = parseMediaMentionRequest(request);
  const news = {...createWatchObject(request, '', null, {monitoringSource: {type:'rss',url:'https://news.example/rss?q=Royal+Caribbean',query:'("Royal Caribbean Cruises" OR "Royal Caribbean Group")'}}),id};
  assert.deepEqual(news.mediaMention.subjects,parsed.subjects);
  assert.equal(news.category,'news');
  const old = {...article('old'),title:'Royal Caribbean Group and Sandals announce an agreement',publishedAt:'2026-09-23T07:00:00Z'};
  const other = {...article('other'),title:'Carnival Caribbean sailings'};
  const newer = {...article('new'),title:'Royal Caribbean Group reports a new development',publishedAt:'2026-10-03T15:00:00Z'};
  configureAccountStorage(auth); await store.configureMediaWatchServerStore(auth);
  watches.addWatch(news);
  const controller = createWatchCheckController({getWatch:watches.getWatchById,saveWatch:watches.updateWatch,
    checkStoredWatch:watch => store.canCheckStoredMediaWatch(watch) ? store.checkStoredMediaWatch(watch) : null,
    requestCheck:async()=>assert.fail('Owned checks must not use the anonymous feed endpoint'),
  });
  feedItems = [old,other];
  const first = await controller.check(id);
  assert.equal(first.outcome,'baseline');
  assert.equal((await db.query('select user_id from public.watches where id=$1',[id])).rows[0].user_id,USER_A);
  assert.equal((await db.query('select initial_items from public.media_watch_snapshots where watch_id=$1',[id])).rows[0].initial_items.length,2);
  assert.deepEqual(initialContextArticles(watches.getWatchById(id)).map(item=>item.id),['old']);
  assert.equal((watches.getWatchById(id).updates||[]).length,0);
  assert.equal(await count('media_watch_notifications'),0);

  // Remove every browser record/cache/sync job. Only the database can restore it.
  const restore = async () => {
    for(const key of Object.keys(localStorage)) localStorage.removeItem(key);
    await store.configureMediaWatchServerStore(auth); await flush();
    assert.deepEqual(watches.getStoredWatches(),[]);
    return watches.getWatchById(id);
  };
  let restored = await restore();
  assert.deepEqual(initialContextArticles(restored).map(item=>item.id),['old']);
  assert.equal(restored.mediaPersistence.ownerId,USER_A);
  assert.equal(restored.lastCheckOutcome.type,'baseline');
  assert.equal((restored.updates||[]).length,0);
  assert.equal((await controller.check(id)).outcome,'no-new-items');
  feedItems = [old,other,{...other,id:'unrelated-2',url:'https://news.example/unrelated-2'}];
  const filtered = await controller.check(id);
  assert.equal(filtered.outcome,'no-matching-items');
  assert.equal(filtered.changes.lastCheckResult.diagnostics.unseenItemCount,1);
  feedItems = [old,other,newer];
  assert.equal((await controller.check(id)).matchedItems.length,1);
  restored = await restore();
  assert.equal(restored.updates.length,1);
  assert.deepEqual(initialContextArticles(restored).map(item=>item.id),['old']);
  assert.equal((await controller.check(id)).outcome,'no-new-items');
  // Changed provider ID / tracking parameters still identify the initial article.
  feedItems = [{...old,id:'reappeared',url:old.url+'?utm_source=fixture'}, newer];
  assert.equal((await controller.check(id)).outcome,'no-new-items');
  assert.equal(watches.getWatchById(id).updates.length,1);
  const reference = JSON.stringify((await db.query('select * from public.media_watch_snapshots where watch_id=$1',[id])).rows);
  feedError=true; await assert.rejects(controller.check(id));
  assert.equal(watches.getWatchById(id).lastCheckAttempt.status,'failed','cached server success cannot erase the newer local failure');
  assert.equal(JSON.stringify((await db.query('select * from public.media_watch_snapshots where watch_id=$1',[id])).rows),reference);
  restored=await restore();
  assert.equal(restored.lastCheckAttempt.status,'failed');
  assert.equal(new Date(restored.lastChecked).getTime(),new Date(JSON.parse(reference)[0].checked_at).getTime());
  assert.deepEqual(initialContextArticles(restored).map(item=>item.id),['old']);
  assert.equal(await count('media_watch_notifications'),0);
  feedError=false;

  // The manual path retains its existing no-publication-cutoff rule.
  feedItems=[{...old,id:'older-unseen',url:'https://news.example/older-unseen'}];
  assert.equal((await controller.check(id)).outcome,'matching-items');

  // Empty matching context is persisted as known empty, not as unavailable.
  const emptyId=randomUUID(); watches.addWatch({...news,id:emptyId}); feedItems=[other];
  await controller.check(emptyId);
  for(const key of Object.keys(localStorage)) localStorage.removeItem(key);
  await store.configureMediaWatchServerStore(auth);await flush();
  assert.ok(watches.getWatchById(emptyId).initialContext);
  assert.deepEqual(initialContextArticles(watches.getWatchById(emptyId)),[]);

  // SQL permissions and compare-and-swap protect against direct and stale calls.
  const completion = rpcCalls.find(call => call.name === 'complete_manual_media_watch_check').params;
  for (const role of ['anon', 'authenticated']) {
    const deniedRpc = await client(role, USER_A).rpc('complete_manual_media_watch_check', completion);
    assert.ok(deniedRpc.error, `${role} cannot execute the service-only RPC`);
    const deniedFailure = await client(role, USER_A).rpc('fail_manual_media_watch_check', {
      p_watch_id:id,p_user_id:USER_A,p_revision:1,p_expected_checked_at:null,p_code:'TIMEOUT',
    });
    assert.ok(deniedFailure.error);
  }
  const beforeStale = JSON.stringify((await db.query('select * from public.media_watch_snapshots order by watch_id')).rows);
  for (const changes of [{}, {p_user_id:USER_B}, {p_expected_revision:999}]) {
    const stale = await client('service_role',null).rpc('complete_manual_media_watch_check', {...completion,...changes});
    assert.equal(stale.error,null);assert.equal(stale.data.status,'skipped');
  }
  assert.equal(JSON.stringify((await db.query('select * from public.media_watch_snapshots order by watch_id')).rows),beforeStale);

  // The existing scheduled RPC shares the durable ledger: initial items never mail.
  const snapshot=(await db.query('select * from public.media_watch_snapshots where watch_id=$1',[id])).rows[0];
  const definition=(await db.query('select * from public.watches where id=$1',[id])).rows[0];
  const {p_user_id:unusedOwner,...scheduled}=completion;
  const scheduledResult=await client('service_role',null).rpc('complete_scheduled_media_watch_check',{
    ...scheduled,p_checked_at:'2026-10-03T18:00:00Z',p_expected_checked_at:snapshot.checked_at,
    p_expected_items:snapshot.items,p_expected_revision:Number(definition.media_revision),
    p_outcome:'no-new-items',p_enqueue_notifications:true,
  });
  assert.equal(scheduledResult.error,null);assert.equal(scheduledResult.data,'unchanged');
  assert.equal(await count('media_watch_notifications'),0);
  assert.deepEqual((await db.query('select initial_items from public.media_watch_snapshots where watch_id=$1',[id])).rows[0].initial_items,snapshot.initial_items);

  const scheduledId=randomUUID();watches.addWatch({...news,id:scheduledId});await flush();
  const scheduledDefinition=(await db.query('select media_revision from public.watches where id=$1',[scheduledId])).rows[0];
  const scheduledBaseline=await client('service_role',null).rpc('complete_scheduled_media_watch_check',{
    ...scheduled,p_watch_id:scheduledId,p_expected_revision:Number(scheduledDefinition.media_revision),
    p_checked_at:'2026-10-03T18:00:00Z',p_expected_checked_at:null,p_expected_items:null,
    p_outcome:'baseline',p_enqueue_notifications:true,
  });
  assert.equal(scheduledBaseline.error,null);assert.equal(scheduledBaseline.data,'unchanged');
  assert.equal(await count('media_watch_notifications'),0);
  assert.deepEqual((await db.query('select initial_items from public.media_watch_snapshots where watch_id=$1',[scheduledId])).rows[0].initial_items,completion.p_items);

  // Same UUID cannot be read or checked by another authenticated account.
  switchUser(USER_B); configureAccountStorage(auth); await store.configureMediaWatchServerStore(auth);await flush();
  assert.equal(store.getMediaServerWatches().length,0);
  const beforeFetch=fetchCount;
  const denied=await fetch('/api/media-watches?action=check',{method:'POST',headers:{Authorization:`Bearer ${USER_B}`},body:JSON.stringify({id,revision:1})});
  assert.equal(denied.status,404);assert.equal(fetchCount,beforeFetch);
  assert.equal((await scoped('authenticated',USER_B,'select * from public.media_watch_snapshots')).rows.length,0);
  const anonymous=await fetch('/api/media-watches?action=check',{method:'POST',headers:{Authorization:'Bearer none'},body:JSON.stringify({id,revision:1})});
  assert.equal(anonymous.status,401);
  assert.equal(await count('media_watch_notifications'),0);
  assert.ok(rpcCalls.every(({name})=>!String(name).includes('email')));
});
