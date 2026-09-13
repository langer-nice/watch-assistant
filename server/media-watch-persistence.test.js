import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createMediaWatchMiddleware } from './media-watch-api.js';
import { runMediaMonitoring } from './media-monitoring-cron.js';
import { sendWithResend } from './company-watch-email.js';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const makeWatch = () => ({
  id: randomUUID(), title: 'Elon Musk media mentions', inputType: 'text', request: 'Tell me when Elon Musk is mentioned in the media.',
  mediaMention: { subjects: ['Elon Musk'], matchMode: 'all' },
  monitoringSource: { type: 'feed', url: 'https://news.example/rss?q=Elon+Musk', query: 'Elon Musk' },
  createdAt: '2026-09-13T00:00:00Z', category: 'news', status: 'watching',
});
const article = (id) => ({ id, title: `Elon Musk ${id}`, url: `https://news.example/${id}`, excerpt: 'A report.', publishedAt: '2026-09-13T10:00:00Z' });
const storage = () => {
  const value = {};
  Object.defineProperties(value, {
    getItem: { value: (key) => value[key] ?? null },
    setItem: { value: (key, entry) => { value[key] = String(entry); } },
    removeItem: { value: (key) => { delete value[key]; } },
  });
  return value;
};

test('authenticated browser persistence → PostgreSQL RLS → scheduled media pipeline', async (t) => {
  const db = new PGlite();
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
      assert.equal(table, 'watches');
      const conditions = []; const args = []; let snapshots = false;
      const q = {
        select(fields) { snapshots = fields.includes('media_watch_snapshots'); return q; },
        eq(column, value) { assert.ok(['user_id','type','monitoring_state'].includes(column)); args.push(value); conditions.push(`w.${column}=$${args.length}`); return q; },
        is(column, value) { assert.equal(column, 'deleted_at'); assert.equal(value, null); conditions.push('w.deleted_at is null'); return q; },
        order(column) { assert.equal(column, 'id'); return q; },
        async range(start, end) {
          try {
            const result = await scoped(role, user, `select w.* ${snapshots ? ", (select coalesce(jsonb_agg(s),'[]'::jsonb) from public.media_watch_snapshots s where s.watch_id=w.id) as media_watch_snapshots" : ''}
              from public.watches w ${conditions.length ? `where ${conditions.join(' and ')}` : ''} order by w.id limit ${end-start+1} offset ${start}`, args);
            return { data: result.rows, error: null };
          } catch (error) { return { data: null, error }; }
        },
      };
      return q;
    },
    async rpc(name, params) {
      assert.ok(['persist_media_watch','complete_scheduled_media_watch_check'].includes(name));
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
  globalThis.localStorage = storage();
  globalThis.window = new EventTarget();
  let state = { status: 'authenticated', session: { access_token: USER_A, user: { id: USER_A } } };
  const listeners = new Set();
  const auth = { getState: () => state, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
  const switchUser = (id) => {
    state = id ? { status: 'authenticated', session: { access_token: id, user: { id } } } : { status: 'anonymous', session: null };
    for (const fn of listeners) fn(state);
  };
  let offline = false; let holdGet = null; let holdPost = null;
  const middleware = createMediaWatchMiddleware({ authenticate: async (request) => {
    const id = request.headers.authorization.replace('Bearer ', '');
    if (![USER_A, USER_B].includes(id)) throw Object.assign(new Error('Invalid token'), { statusCode: 401 });
    return { user: { id }, client: client('authenticated', id) };
  } });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/media-watches', 'Tests must never access a live network');
    if (offline) throw new Error('offline or missing schema');
    let status; let body;
    await middleware({ url, method: options?.method || 'GET', headers: { authorization: options.headers.Authorization },
      ...(options.body ? { body: JSON.parse(options.body) } : {}) }, {
      setHeader() {}, set statusCode(value) { status = value; }, end(value) { body = JSON.parse(value); },
    });
    if (!options.method && holdGet) { const hold = holdGet; holdGet = null; await hold(); }
    if (options.method === 'POST' && holdPost) { const hold = holdPost; holdPost = null; await hold(); }
    return { ok: status < 400, status, json: async () => body };
  };
  const store = await import('../src/js/media-watch-server-store.js');
  const watches = await import('../src/js/watch-storage.js');
  const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await store.synchronizeMediaWatches(); await new Promise((resolve) => setTimeout(resolve, 0)); await store.synchronizeMediaWatches(); };
  const count = async (table) => Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);
  let watch;
  try {
    await store.configureMediaWatchServerStore(auth);
    await t.test('real addWatch persists its UUID and bounded definition with no baseline or outbox write', async () => {
      watch = makeWatch();
      watches.addWatch({ ...watch, recipientEmail: 'not-persisted@example.test', monitoringSnapshot: { items: [article('browser-history')] } });
      await flush();
      const row = (await db.query('select * from public.watches where id=$1', [watch.id])).rows[0];
      assert.equal(row.user_id, USER_A); assert.equal(row.id, watch.id); assert.equal(row.type, 'media_news');
      assert.deepEqual(row.watch_definition.mediaMention, watch.mediaMention);
      assert.equal(row.monitoring_state, 'monitoring');
      assert.equal(JSON.stringify(row).includes('not-persisted@example.test'), false);
      assert.equal(await count('media_watch_snapshots'), 0); assert.equal(await count('media_watch_notifications'), 0);
      assert.equal(watches.getStoredWatches()[0].id, watch.id);
    });
    await t.test('reload and repeated sync are idempotent; ownership-free legacy and other types stay local', async () => {
      await store.configureMediaWatchServerStore(auth); await flush();
      const legacy = makeWatch();
      const stored = watches.getStoredWatches(); stored.push(legacy);
      localStorage.setItem('watchAssistant.watches', JSON.stringify(stored));
      watches.updateWatch(legacy.id, { title: 'Legacy remains local' });
      watches.addWatch({ ...makeWatch(), inputType: 'company' });
      watches.addWatch({ ...makeWatch(), inputType: 'url', isStory: false });
      await flush(); assert.equal(await count('watches'), 1);
      assert.ok(watches.getWatchById(legacy.id));
    });
    await t.test('failed synchronization retains local changes and retries without duplicates', async () => {
      offline = true; watches.updateWatch(watch.id, { title: 'Saved offline' }); await flush();
      assert.equal(watches.getWatchById(watch.id).title, 'Saved offline');
      offline = false; await flush();
      assert.equal((await db.query('select title from public.watches where id=$1', [watch.id])).rows[0].title, 'Saved offline');
      assert.equal(await count('watches'), 1);
    });
    const service = client('service_role', null);
    const run = (items) => runMediaMonitoring({ client: service, env: { MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true', VERCEL_ENV: 'production', RESEND_API_KEY: 'fake', WATCH_EMAIL_FROM: 'x@example.test', WATCH_APP_BASE_URL: 'https://watch.example' },
      fetchFeed: async () => ({ checkedAt: new Date().toISOString(), source: { title: 'News', url: watch.monitoringSource.url }, items }),
      notificationProcessor: async () => ({ status: 'disabled' }) });
    await t.test('actual cron query finds browser-persisted row; first check only baselines; next article enqueues once', async () => {
      const first = await run([article('old')]); assert.equal(first.failedCount, 0); assert.equal(first.totalEligibleWatches, 1);
      assert.equal(await count('media_watch_snapshots'), 1); assert.equal(await count('media_watch_notifications'), 0);
      const second = await run([article('new'), article('old')]); assert.equal(second.changedCount, 1);
      await run([article('new'), article('old')]); assert.equal(await count('media_watch_notifications'), 1);
    });
    await t.test('manual local check data cannot write snapshots or enqueue; definition edits invalidate old cron work', async () => {
      watches.updateWatch(watch.id, { monitoringSnapshot: { items: [article('manual')] }, lastChecked: new Date().toISOString() });
      await flush(); assert.equal(await count('media_watch_notifications'), 1);
      const stale = rpcCalls.findLast((call) => call.name === 'complete_scheduled_media_watch_check').params;
      watches.updateWatch(watch.id, { request: 'Tell me when SpaceX is mentioned in the media.', mediaMention: { subjects: ['SpaceX'], matchMode: 'all' } }); await flush();
      assert.equal(await count('media_watch_snapshots'), 0);
      assert.equal((await service.rpc('complete_scheduled_media_watch_check', stale)).data, 'skipped');
      await run([article('different-history')]); assert.equal(await count('media_watch_notifications'), 1);
      assert.equal((await db.query('select status from public.media_watch_notifications')).rows[0].status, 'failed');
    });
    await t.test('RLS forbids cross-user reads, updates, deletes, forged ownership, type injection, snapshots and notification RPCs', async () => {
      assert.equal((await scoped('authenticated', USER_B, 'select * from public.watches')).rows.length, 0);
      assert.equal((await scoped('authenticated', USER_B, 'update public.watches set title=$1 where id=$2 returning id', ['hijack',watch.id])).rows.length, 0);
      assert.equal((await scoped('authenticated', USER_B, 'delete from public.watches where id=$1 returning id', [watch.id])).rows.length, 0);
      await assert.rejects(scoped('authenticated', USER_B, 'insert into public.watches(user_id,type,title,siren) values ($1,$2,$3,$4)', [USER_A,'company_bodacc','forged','123456789']));
      await assert.rejects(scoped('authenticated', USER_A, "update public.watches set type='company_bodacc',siren='123456789' where id=$1", [watch.id]));
      await assert.rejects(scoped('authenticated', USER_A, 'delete from public.media_watch_snapshots'));
      await assert.rejects(scoped('authenticated', USER_A, 'select * from public.media_watch_notifications'));
      for (const fn of ['claim_media_watch_email_notification','begin_media_watch_email_submission']) {
        await assert.rejects(scoped('authenticated', USER_A, `select public.${fn}($1,$2)`, [randomUUID(),randomUUID()]));
      }
      await assert.rejects(scoped('anon', null, 'select * from public.watches'));
      await assert.rejects(scoped('authenticated', USER_A, "update public.watches set watch_definition='{}'::jsonb where id=$1", [watch.id]));
      await assert.rejects(scoped('authenticated', USER_A, 'update public.watches set monitoring_source=null where id=$1', [watch.id]));
    });
    await t.test('stale hydration after sign-out/user switch cannot expose or transfer A data', async () => {
      let release; let entered;
      const ready = new Promise((resolve) => { entered = resolve; });
      holdGet = () => new Promise((resolve) => { release = resolve; entered(); });
      const old = store.synchronizeMediaWatches(); await ready;
      switchUser(USER_B); release(); await old; await flush();
      assert.equal(watches.getWatchById(watch.id), null);
      assert.equal((await scoped('authenticated', USER_B, 'select * from public.watches')).rows.length, 0);
      switchUser(null); await flush(); assert.equal(watches.getWatchById(watch.id), null);
      switchUser(USER_A); await flush(); assert.ok(watches.getWatchById(watch.id));
    });
    await t.test('an edit during an outstanding write survives and advances only its confirmed predecessor', async () => {
      let release; let entered; const ready = new Promise((resolve) => { entered = resolve; });
      holdPost = () => new Promise((resolve) => { release = resolve; entered(); });
      watches.updateWatch(watch.id, { title: 'First edit' }); await ready;
      watches.updateWatch(watch.id, { title: 'Newer edit' }); release(); await flush();
      assert.equal((await db.query('select title from public.watches where id=$1',[watch.id])).rows[0].title,'Newer edit');
    });
    await t.test('overlapping stale writers cannot overwrite a newer server definition', async () => {
      const last = rpcCalls.findLast((call) => call.name === 'persist_media_watch').params;
      const result = await client('authenticated',USER_A).rpc('persist_media_watch', { ...last, p_title:'stale',p_mutation:randomUUID() });
      assert.equal(result.error?.code, '40001');
      assert.equal((await db.query('select title from public.watches where id=$1',[watch.id])).rows[0].title,'Newer edit');
    });
    await t.test('delete writes an owner tombstone, suppresses cron and cannot be resurrected by a create retry', async () => {
      const original = rpcCalls.find((call) => call.name === 'persist_media_watch').params;
      watches.deleteWatch(watch.id); await flush();
      assert.equal(watches.getWatchById(watch.id),null);
      assert.ok((await db.query('select deleted_at from public.watches where id=$1',[watch.id])).rows[0].deleted_at);
      assert.equal((await run([])).totalEligibleWatches,0);
      assert.equal((await client('authenticated', USER_A).rpc('persist_media_watch',original)).error?.code,'40001');
    });
    await t.test('missing schema/API preserves newly owned local Watches until retry', async () => {
      offline=true; const pending=makeWatch(); watches.addWatch(pending); await flush();
      assert.ok(watches.getWatchById(pending.id));
      offline=false; await flush();
      assert.equal((await db.query('select id from public.watches where id=$1',[pending.id])).rows.length,1);
    });
    await t.test('missing migration RPC fails safely and retries after schema becomes available', async () => {
      await db.exec('alter function public.persist_media_watch(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean) rename to unavailable_media_persistence');
      const pending=makeWatch(); watches.addWatch(pending); await flush();
      assert.ok(watches.getWatchById(pending.id));
      assert.equal((await db.query('select id from public.watches where id=$1',[pending.id])).rows.length,0);
      await db.exec('alter function public.unavailable_media_persistence(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean) rename to persist_media_watch');
      await flush(); assert.equal((await db.query('select id from public.watches where id=$1',[pending.id])).rows.length,1);
    });
    await t.test('owned browser-only Watch recovers a missing synchronization record without changing its ID', async () => {
      const pending={...makeWatch(),mediaPersistence:{ownerId:USER_A}};
      const current=watches.getStoredWatches(); current.push(pending);
      localStorage.setItem('watchAssistant.watches',JSON.stringify(current));
      await store.configureMediaWatchServerStore(auth); await flush();
      assert.equal((await db.query('select id from public.watches where id=$1',[pending.id])).rows.length,1);
      await store.configureMediaWatchServerStore(auth); await flush();
      assert.equal((await db.query('select id from public.watches where id=$1',[pending.id])).rows.length,1);
    });
    await t.test('lost successful response retries the same mutation without another row or revision', async () => {
      const pending=makeWatch();
      holdPost=async()=>{throw new Error('response lost after database commit');};
      watches.addWatch(pending); await flush();
      const row=(await db.query('select media_revision from public.watches where id=$1',[pending.id])).rows[0];
      assert.equal(Number(row.media_revision),1);
      await flush(); assert.equal(Number((await db.query('select media_revision from public.watches where id=$1',[pending.id])).rows[0].media_revision),1);
    });
    await t.test('deletion queued during creation commits after its predecessor and remains deleted on reload', async () => {
      let release; let entered; const ready=new Promise(resolve=>{entered=resolve;});
      holdPost=()=>new Promise(resolve=>{release=resolve;entered();});
      const pending=makeWatch(); watches.addWatch(pending); await ready;
      watches.deleteWatch(pending.id); release(); await flush();
      assert.ok((await db.query('select deleted_at from public.watches where id=$1',[pending.id])).rows[0].deleted_at);
      await store.configureMediaWatchServerStore(auth); await flush(); assert.equal(watches.getWatchById(pending.id),null);
    });
    await t.test('browser API rejects oversized, malformed, unrecognized type and forged definitions', async () => {
      const job={definition:{id:randomUUID(),title:'Invalid',watch_definition:{inputType:'company'},monitoring_source:{}},revision:0,mutation:randomUUID(),deleted:false};
      const send=body=>fetch('/api/media-watches',{method:'POST',headers:{Authorization:`Bearer ${USER_A}`},body:JSON.stringify(body)});
      assert.equal((await send(job)).status,400);
      assert.equal((await send({...job,revision:-1})).status,400);
      assert.equal((await send({...job,unexpected:'x'.repeat(13000)})).status,400);
    });
    await t.test('unsupported edits pause server monitoring while retaining the new browser-only definition', async () => {
      const changed=makeWatch(); watches.addWatch(changed); await flush();
      watches.updateWatch(changed.id,{request:'Check the weather tomorrow',category:'travel'}); await flush();
      const row=(await db.query('select monitoring_state from public.watches where id=$1',[changed.id])).rows[0];
      assert.equal(row.monitoring_state,'paused');
      assert.equal(watches.getWatchById(changed.id).request,'Check the weather tomorrow');
      assert.equal(watches.getWatchById(changed.id).category,'travel');
      watches.updateWatch(changed.id,{request:'Tell me when SpaceX is mentioned in the media.'}); await flush();
      assert.equal((await db.query('select monitoring_state from public.watches where id=$1',[changed.id])).rows[0].monitoring_state,'monitoring');
      assert.equal(watches.getWatchById(changed.id).category,'travel');
    });
    await t.test('conflicts preserve local edits, expose an escaped notice, and require explicit resolution', async () => {
      const changed=makeWatch(); watches.addWatch(changed); await flush();
      const previous=rpcCalls.findLast(call=>call.name==='persist_media_watch').params;
      const updated=await client('authenticated',USER_A).rpc('persist_media_watch',{
        ...previous,p_revision:1,p_mutation:randomUUID(),p_title:'<img src=x onerror=alert(1)>',
      });
      assert.equal(updated.error,null);
      watches.updateWatch(changed.id,{title:'My reviewed local title'}); await flush();
      assert.equal(watches.getWatchById(changed.id).title,'My reviewed local title');
      const state=store.getMediaPersistenceState(watches.getWatchById(changed.id));
      assert.equal(state.status,'conflict');
      const originalDocument=globalThis.document;
      globalThis.document=parseHTML('<html><body><h1>Watch</h1></body></html>').document;
      try {
        const {renderMediaPersistenceNotice}=await import('../src/js/media-watch-persistence-notice.js');
        renderMediaPersistenceNotice(watches.getWatchById(changed.id),document.querySelector('h1'),'en');
        assert.equal(document.querySelector('img'),null);
        assert.match(document.body.textContent,/newer version/);
        assert.equal(document.querySelector('button').textContent,'Keep my local changes');
        await store.keepLocalMediaChanges(changed.id,state.revision); await flush();
        assert.equal((await db.query('select title from public.watches where id=$1',[changed.id])).rows[0].title,'My reviewed local title');
        renderMediaPersistenceNotice(watches.getWatchById(changed.id),document.querySelector('h1'),'en');
        assert.equal(document.getElementById('watchMediaPersistenceNotice'),null);
      } finally { if(originalDocument===undefined) delete globalThis.document; else globalThis.document=originalDocument; }
    });
    await t.test('URL story Watches preserve their matching concepts through the real persistence path', async () => {
      const concept={label:'Elon Musk',type:'person'};
      const story={...makeWatch(),inputType:'url',request:'https://news.example/story',isStory:true,pageType:'article',
        mediaMention:null,storyFingerprint:[concept],keywords:['Elon Musk'],selectedKeywords:['Elon Musk'],
        storyProfile:{concepts:[concept],userAddedConcepts:[]}};
      watches.addWatch(story); await flush();
      const row=(await db.query('select watch_definition from public.watches where id=$1',[story.id])).rows[0];
      assert.equal(row.watch_definition.inputType,'url');
      assert.deepEqual(row.watch_definition.storyProfile.concepts,[concept]);
      await store.configureMediaWatchServerStore(auth); await flush();
      assert.deepEqual(watches.getWatchById(story.id).storyProfile.concepts,[concept]);
    });
    await t.test('migration replay rolls back safely and all notification functions stay inaccessible to browser roles', async () => {
      await assert.rejects(db.exec(await readFile(new URL('20260913120000_media_watch_email_notifications.sql',directory),'utf8')));
      await db.exec('rollback');
      const rows = (await db.query(`select p.proname,has_function_privilege('authenticated',p.oid,'execute') as allowed
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
        and ((p.proname like '%media%notification%' or p.proname='begin_media_watch_email_submission') or p.proname='complete_scheduled_media_watch_check')`)).rows;
      assert.ok(rows.length >= 6); assert.ok(rows.every((row) => row.allowed === false));
    });
    await t.test('automated tests cannot invoke real Resend transport', async () => {
      await assert.rejects(sendWithResend({}), { code: 'TEST_EMAIL_TRANSPORT_DISABLED' });
    });
  } finally {
    await flush(); switchUser(null);
    for (const [key,value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key]=value; }
    await db.close();
  }
});
