# Supabase Company Watch persistence (PR2)

PR2 makes authenticated Company Watches durable in Supabase while preserving the existing local adapter for unauthenticated use, DEV and explicit Preview Test Data. It does not migrate existing browser data silently.

## Source of truth

- An authenticated Company Watch (`inputType: company`) is read and written through the protected server API and Supabase RLS.
- An unauthenticated/local Watch stays in `localStorage` with the existing behavior.
- Explicit Preview Test Data stays local even during an authenticated session.
- Existing local Company Watches are not imported, merged or deleted automatically.
- Reports remain local in PR2. The Home and All Watches views can present current server Company Watches without writing a synthetic local Report.

## Environment and trust boundary

Browser build variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server runtime variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The server verifies every Bearer token with Supabase Auth, then creates a Supabase client carrying that same user JWT. Database access therefore remains subject to RLS. PR2 does not use or require a service-role key.

The deployed anonymous `/api/check-company` route is removed. Authenticated Company checks use `/api/check-company-watch`; local Vite development retains its local connector middleware so the pre-existing local mode still works.

## Schema

Migration `20260821120000_company_watch_persistence.sql` extends `public.watches` with the approved Company fields, monitoring state, latest check outcome, latest meaningful change and a short-lived check claim timestamp.

`public.company_watch_snapshots` stores one current normalized BODACC snapshot per Watch:

- source and check timestamp;
- at most 100 item IDs;
- at most 100 normalized JSON items;
- the owning user ID, constrained by RLS to the Watch owner.

This deliberately stores no full check history. The latest meaningful change is kept on the Watch so the existing Updated presentation survives a reload. A later no-change result stops presenting that old change as unread.

The PR1 partial unique index on `(user_id, siren) where deleted_at is null` prevents two active Company Watches for the same owner and SIREN.

## API contract

All routes require `Authorization: Bearer <Supabase access token>` and return `Cache-Control: no-store`.

- `GET /api/company-watches`: list the authenticated user's active Company Watches.
- `POST /api/company-watches`: create a provisional Watch, fetch its BODACC baseline, persist the snapshot, then return the ready Watch. A failed baseline soft-deletes the provisional row.
- `GET /api/company-watch?id=<uuid>`: load one owned Watch.
- `PATCH /api/company-watch?id=<uuid>`: update title, summary or pause/resume state.
- `DELETE /api/company-watch?id=<uuid>`: soft-delete one owned Watch.
- `POST /api/check-company-watch?id=<uuid>`: claim the check, query BODACC, compare against the persisted snapshot and atomically persist the result.

The API never accepts ownership from the request body. `user_id` always comes from the verified Supabase user.

## Concurrency and failure semantics

`claim_company_watch_check(uuid)` atomically sets `check_started_at` only when no live claim exists. Claims older than two minutes are recoverable. A competing request receives `CHECK_IN_PROGRESS`.

`complete_company_watch_check(...)` locks the owned Watch, upserts its single snapshot and updates the Watch result in one database transaction. `fail_company_watch_check(...)` releases the claim and records a bounded safe error code without destroying the previous snapshot.

## Validation

Local automated validation:

```sh
npm test
npm run build
```

Local Supabase validation after applying all migrations:

```sh
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/company_watch_rls.sql
```

The Company SQL test proves own read/update, cross-user Watch and snapshot isolation, forged snapshot rejection, cross-user check-claim rejection and anonymous denial.

## Rollback

Back up the pilot data first. Roll back PR2 without touching PR1 Auth/profile foundations:

```sql
drop function if exists public.fail_company_watch_check(uuid, text);
drop function if exists public.complete_company_watch_check(
  uuid, timestamptz, text, text, text[], jsonb, text, text, text, text, text,
  text, text, text, text, text, timestamptz
);
drop function if exists public.claim_company_watch_check(uuid);
drop table if exists public.company_watch_snapshots;

alter table public.watches
  drop constraint if exists watches_company_name_length_check,
  drop constraint if exists watches_summary_length_check,
  drop constraint if exists watches_request_length_check,
  drop column if exists check_started_at,
  drop column if exists last_change_published_at,
  drop column if exists last_change_event_type,
  drop column if exists last_change_summary,
  drop column if exists last_change_url,
  drop column if exists last_change_title,
  drop column if exists last_change_item_id,
  drop column if exists last_check_error_code,
  drop column if exists last_check_outcome,
  drop column if exists last_checked_at,
  drop column if exists current_status,
  drop column if exists monitoring_state,
  drop column if exists company_status,
  drop column if exists administrative_status,
  drop column if exists company_name,
  drop column if exists summary,
  drop column if exists request;
```

This rollback deletes persisted Company snapshots and the PR2 Watch fields. It does not delete Auth users, profiles, the base `watches` table or local browser data.

## Explicit PR3 boundaries

Cron scheduling, emails, Resend, outbox/idempotent notification delivery, full check history, complete Update acknowledgement persistence, server-backed Reports and retention/purge policy are deferred. PR2 only establishes authenticated Company CRUD, one current BODACC snapshot, atomic manual Check now and owner isolation.
