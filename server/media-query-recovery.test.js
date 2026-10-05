import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { testResources } from './test-support/fixture-resources.js';
import { exerciseMediaQueryRecovery } from '../scripts/test-support/media-query-recovery.mjs';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('legacy conversational query repair retains history, eligibility and account isolation', async (t) => {
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
  let currencyBefore;
  const currencyFunctions = () => db.query("select proname,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace and proname in ('valid_media_definition','invalidate_media_watch_baseline','complete_currency_watch_check') order by proname");
  for (const filename of (await readdir(directory)).sort()) {
    if (filename === '20261005160000_media_query_history.sql' && process.env.MEDIA_TEST_PR52_MIGRATIONS) {
      for (const extra of ['20261004120000_currency_alert_policies.sql','20261004150000_currency_strict_comparison.sql']) {
        await db.exec(await readFile(join(process.env.MEDIA_TEST_PR52_MIGRATIONS, extra), 'utf8'));
      }
      currencyBefore = (await currencyFunctions()).rows;
    }
    // PostgreSQL provides gen_random_uuid natively; PGlite does not package pgcrypto.
    await db.exec((await readFile(new URL(filename, directory), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
  }
  if (currencyBefore) assert.deepEqual((await currencyFunctions()).rows,currencyBefore);
  await db.exec('grant select on all tables in schema public to service_role');
  await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [USER_A, 'a@example.test', USER_B, 'b@example.test']);
  const scoped = (role, user, sql, params = []) => db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [user || '', role]);
    return tx.query(sql, params);
  });
  const rpcCalls = [];
  const client = (role, user) => ({
    from(table) {
      assert.ok(['watches','media_watch_notifications','media_watch_snapshots','media_watch_seen_articles'].includes(table));
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
              from public.${table} w ${conditions.length ? `where ${conditions.join(' and ')}` : ''} order by ${ordering.join(',') || (table==='watches'?'w.id':'w.watch_id')} limit ${end-start+1} offset ${start}`, args);
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
  await exerciseMediaQueryRecovery({ service:client('service_role',null),clientA:client('authenticated',USER_A),clientB:client('authenticated',USER_B),userA:USER_A,userB:USER_B });
});
