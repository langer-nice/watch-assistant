# Supabase foundations (PR1)

PR1 adds Supabase Auth and an isolated database foundation without replacing the existing `localStorage` adapter. DEV and Vercel Preview Test Data continue to work when Supabase is not configured.

## Environment

Browser variables:

- `VITE_SUPABASE_URL`: HTTPS project URL.
- `VITE_SUPABASE_ANON_KEY`: public anon key. It is usable in the browser only because every user table has RLS.

Server-only variables, when a later PR needs privileged maintenance, must not use the `VITE_` prefix. `SUPABASE_SERVICE_ROLE_KEY` must exist only in protected server/Vercel configuration. The current PR does not read or require it. The Vite build rejects `VITE_SUPABASE_SERVICE_ROLE_KEY`.

Configure the Supabase Auth site URL and allowed redirect URLs for `/index.html` on local, Preview and production origins. Supabase sends authentication magic links. Resend is deliberately absent from PR1 and will later send only Watch business notifications. Support should therefore classify a missing sign-in email as a Supabase Auth delivery issue; a future missing Watch notification will be a Resend/outbox issue.

## Schema and security

Migration `20260820120000_supabase_foundations.sql` creates:

- `profiles`, one row per `auth.users` identity;
- a deliberately minimal `watches` table for RLS validation, ready to be extended by PR2;
- ownership constraints, timestamps, supporting indexes and the partial unique index `(user_id, siren) where deleted_at is null`;
- explicit authenticated-only SELECT, INSERT, UPDATE and DELETE policies on both user tables.

The browser always uses the authenticated user's JWT and never bypasses RLS. No anonymous grants exist on user data.

## Apply and validate

With the Supabase CLI and Docker available:

```sh
supabase start
supabase db reset
export LOCAL_SUPABASE_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
```

The SQL test creates two temporary users inside a transaction and proves that user B reads only one own Watch, cannot update user A's Watch, and cannot forge user A ownership. The transaction is rolled back.

## Rollback

Back up data first. Roll back PR1 in this dependency-safe order:

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.watches;
drop table if exists public.profiles;
drop function if exists public.set_updated_at();
```

The `pgcrypto` extension is not removed because it may be shared by other schemas.

## Future operational constraints

Cron, BODACC automation, snapshots, updates, attempts, Reports, outbox, Resend and retention rules are outside PR1. Future Cron claims must be PostgreSQL-atomic using a unique constraint with transactional upsert and/or `SELECT … FOR UPDATE SKIP LOCKED`; an in-memory or application-only lock is not acceptable. The nullable `deleted_at` and timestamp model leave room for a future purge job, but this PR intentionally defines no retention duration.
