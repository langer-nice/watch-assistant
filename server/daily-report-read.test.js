import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('daily report read retains both kinds without modifying history or access', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select current_setting('request.jwt.claim.role',true)
    $$;
    create table public.watch_reports (
      user_id uuid, kind text, completed_at timestamptz, created_at timestamptz default now(), report jsonb
    );
    alter table public.watch_reports enable row level security;
    create function public.latest_watch_report() returns jsonb language sql security definer set search_path='' as $$
      select report from public.watch_reports where user_id=auth.uid() order by completed_at desc limit 1
    $$;
    revoke all on function public.latest_watch_report() from public,anon,authenticated,service_role;
    grant execute on function public.latest_watch_report() to authenticated;
  `);
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const automatic = { id: 'auto', origin: 'automatic', partial: true };
  const manual = { id: 'manual', origin: 'manual' };
  for (const [id, snapshot, at] of [
    [owner, automatic, '2026-11-06T07:01:00Z'],
    [owner, manual, '2026-11-06T07:59:00Z'],
    [other, { id: 'foreign', origin: 'automatic' }, '2026-11-06T08:01:00Z'],
  ]) {
    await db.query('insert into public.watch_reports(user_id, kind, completed_at, report) values($1,$2,$3,$4)',
      [id, snapshot.origin, at, snapshot]);
  }
  const history = () => db.query('select report from public.watch_reports order by completed_at');
  const acl = () => db.query("select proacl from pg_proc where oid='public.latest_watch_report()'::regprocedure");
  const before = await history();
  const beforeAcl = await acl();
  const migration = await readFile(new URL('../supabase/migrations/20261106120000_latest_watch_report_automatic_context.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const read = (id, role = 'authenticated') => db.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [id, role]);
    return (await tx.query('select public.latest_watch_report() as report')).rows[0].report;
  });
  assert.deepEqual(await read(owner), { ...manual, automaticReport: automatic });
  assert.deepEqual(await read(other), { id: 'foreign', origin: 'automatic' });
  await assert.rejects(read(owner, 'anon'), { code: '42501' });
  await assert.rejects(read(owner, 'service_role'), { code: '42501' });
  await assert.rejects(read(''), { code: '42501' });
  assert.deepEqual(await history(), before);
  assert.deepEqual(await acl(), beforeAcl);
});
