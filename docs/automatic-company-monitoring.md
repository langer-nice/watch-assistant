# Automatic Company Monitoring V1

## Architecture and scope

Authenticated Company Watches are created and manually checked through the existing protected
Company Watch API. Both paths use `fetchBodaccAnnouncements`, `mapCompanyWatchRow`, and
`applyFeedCheckResult`, so scheduled monitoring uses the same SIREN validation, normalized BODACC
items, compatibility matching, Company status derivation, and Updated lifecycle. The company's
official `administrative_status` remains separate from the Watch UI's `current_status`.

The scheduled job processes only non-deleted `company_bodacc` rows whose `monitoring_state` is
`monitoring`. Paused, preparing, soft-deleted, local/Preview, and every non-company Watch are out of
scope. Reads are paginated in batches of 100. Rows are grouped by normalized SIREN, a SIREN is
fetched once per run, and at most three source checks run concurrently. Each Watch remains an
independent owned row and receives an independent atomic persistence operation.

## Schedule and endpoint

Vercel invokes `GET /api/cron/company-monitoring` once daily at `0 6 * * *` (06:00 UTC). Vercel Cron
Jobs run only for Production deployments; Preview deployments do not run the schedule. On the Hobby
plan, cron expressions may run at most once per day, and invocation can occur at an approximate time
within the scheduled hour rather than at exactly 06:00.

Vercel sends `Authorization: Bearer <CRON_SECRET>`. The endpoint requires that exact header and does
not accept secrets in query parameters. Missing or incorrect authorization returns `401`.

## Required Production environment variables

Configure these as **server-side Production** variables in the Vercel project settings before the
deployment containing this migration and code becomes active:

- `SUPABASE_URL`: the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the application variable for a modern Supabase Secret API key
  (`sb_secret_...`, preferred) or the compatible legacy `service_role` key. Despite the variable's
  legacy name, either value is passed only to the server-side Supabase client and operates as the
  privileged `service_role`. Never prefix it with `VITE_` or expose it to browser code.
- `CRON_SECRET`: a high-entropy random value. Vercel automatically places this value in the cron
  request's Bearer authorization header.

Email Notifications V1 also requires these **server-side Production-only** values:

- `WATCH_EMAIL_NOTIFICATIONS_ENABLED=true`: explicit delivery switch; every other value disables it.
- `RESEND_API_KEY`: a Resend sending API key. Never use a `VITE_` prefix.
- `WATCH_EMAIL_FROM`: the complete From value, such as
  `Watch Assistant <notifications@watch.example>`.
- `WATCH_APP_BASE_URL`: the canonical HTTPS Production origin used for Watch Detail links.

The sender domain must be verified in Resend before Production sending. Preview and Development
deployments do not send even if the switch is accidentally enabled. Tests use a fully mocked sender.

Do not replace the service role with the anonymous key. User routes continue to authenticate with the
anonymous key plus a user JWT and remain subject to RLS. The scheduled SQL functions reject anon and
authenticated callers and are granted only to `service_role`; RLS stays enabled on every table.

## Migration and idempotency

Apply migrations in timestamp order before deploying the application:

1. `20260902120000_automatic_company_monitoring.sql` creates
   `company_watch_snapshot_history` and the two service-role-only write functions. It is intentionally
   one-time-only: a second complete execution stops at its first `create table` statement. Before
   opening a new SQL query, verify in the Supabase migration history and schema whether it has already
   been applied. Do not rerun it after an interrupted or uncertain execution; inspect the schema first.
2. `20260903120000_company_monitoring_service_role_read_grants.sql` grants the scheduled client only
   the direct table reads it needs: `SELECT` on `public.watches` and
   `public.company_watch_snapshots`. Repeating these `GRANT SELECT` statements is safe and does not
   alter data. Scheduled writes remain exclusively behind the existing `security definer` functions.
3. `20260911120000_company_watch_email_notifications.sql` creates the service-role-only email outbox,
   adds a versioned atomic scheduled-completion RPC that enqueues genuine new events without dropping
   the deployed V1 RPC, and adds the delivery RPCs.

Neither migration modifies or deletes existing Watch or current-snapshot data.

### Service-role table grants

A service-role key bypasses RLS, but PostgreSQL still checks table privileges before evaluating RLS.
If the read grants above are missing, the initial PostgREST request for eligible Watches fails before
any BODACC request or persistence RPC. The observed signature was HTTP `403`, PostgreSQL code `42501`,
and `permission denied for table watches`.

Verify the correction without reading row data:

```sql
select
  has_table_privilege('service_role', 'public.watches', 'SELECT')
    as watches_select,
  has_table_privilege('service_role', 'public.company_watch_snapshots', 'SELECT')
    as snapshots_select,
  has_table_privilege('service_role', 'public.watches', 'UPDATE')
    as watches_update,
  has_table_privilege('service_role', 'public.company_watch_snapshot_history', 'SELECT')
    as history_select;
```

After applying the corrective migration, the first two values must be `true` and the last two must
remain `false`. Do not replace a modern Supabase Secret API key (`sb_secret_...`) with a legacy JWT
service-role key: both map to PostgreSQL `service_role`, so changing key formats does not repair a
missing table grant.

The completion function locks each Watch row and verifies that its current snapshot still matches the
version read before the BODACC request. A stale overlapping completion is skipped. Snapshot-content
changes control append-only history, while only the existing canonical `matching-items` decision can
transition the Watch to `updated`. A unique Watch/content-hash index prevents duplicate history.
No-change checks advance `last_checked_at` without clearing a previously unread `updated` state. The
failure function performs the same version check, so a late failure cannot overwrite a concurrent
success. A valid failure stores only a bounded error code and leaves the last valid snapshot intact;
the next daily run retries it.

## Email Notifications V1

An outbox row is inserted in the same transaction that changes a scheduled Company Watch to
`updated`, and only when a prior valid baseline exists, the canonical outcome is `matching-items`, and
the result has a new official BODACC item ID. Baselines, no-new-items, no-matching-items, stale or
failed checks, manual Check now, repeated IDs, and corrections to an existing ID do not enqueue mail.
The Watch update commits before any external request, so provider failure cannot roll it back.

The unique `(watch_id, user_id, channel, source_event_id)` constraint is the durable duplicate guard.
One service-role-only RPC atomically claims a pending row. A second RPC, called immediately before the
provider request, records the submission boundary and increments the attempt count. A claim abandoned
before that boundary is safely reclaimable after 30 minutes. A claim abandoned after the boundary is
marked `failed` with `EMAIL_DELIVERY_OUTCOME_UNKNOWN` rather than resent, preserving at-most-once
delivery. Resend also receives a deterministic SHA-256-based idempotency key. A definite provider or
recipient failure is terminally recorded as `failed` with a bounded safe code.

When delivery is disabled, the processor does not query or repeatedly claim the outbox. Unique pending
rows continue to accumulate so genuine events are not discarded. After enablement, the daily job drains
the oldest pending rows in batches of 25 with at most three concurrent deliveries; a large disabled
backlog can therefore take multiple daily runs to clear.

Recipients are resolved only on the server from Supabase Auth's service-role admin API, and only a
verified Watch-owner email is accepted. `profiles.locale` selects French or English, with English as
the fallback. Recipient email is not stored in the outbox. No per-user email preference exists in the
current product, so V1 uses the global Production switch instead of adding an unexposed settings UI.

## Operations

A successful response contains only `runId`, eligible Watch and unique-SIREN totals, checked, changed,
unchanged, failed and skipped counts, aggregate notification counts/status, `durationMs`, and `status`.
Controlled per-SIREN failures return
`200` with `partial-success`; fatal configuration/database failures return `500`. Runtime logs use the
same safe operational fields and contain no Watch rows, user emails, tokens, or secrets.

For a controlled manual call against a deployment with mocked/non-Production data, keep the secret out
of URLs and shell history where possible:

```sh
read -rs CRON_SECRET
curl --fail-with-body \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  https://your-controlled-deployment.example/api/cron/company-monitoring
unset CRON_SECRET
```

Do not invoke this against Production merely to validate a Preview. Preview does not schedule the job,
but its endpoint can be called manually after setting the three variables for that controlled Preview
and pointing it at an isolated local/test Supabase project. Inspect execution under the Vercel project’s
**Logs** view, filter by `/api/cron/company-monitoring` and the response `runId`, and never paste keys
into log searches.

## Production setup checklist

1. Apply `20260911120000_company_watch_email_notifications.sql` to Supabase and confirm it appears in
   migration history. The existing completion RPC remains available during this step.
2. In Resend, verify a dedicated sending domain or subdomain using its SPF and DKIM records and create
   a least-privilege sending key. In Vercel Production, configure `RESEND_API_KEY`, `WATCH_EMAIL_FROM`,
   and `WATCH_APP_BASE_URL`, but keep `WATCH_EMAIL_NOTIFICATIONS_ENABLED=false`.
3. Merge and deploy the application code. Confirm the daily schedule is still `0 6 * * *`, Preview
   reports email delivery disabled, no real address or secret appears in logs, and the cron function
   has enough duration for the bounded BODACC checks plus at most 25 emails in groups of three.
4. Complete the controlled validation below while Production sending remains disabled.
5. Set `WATCH_EMAIL_NOTIFICATIONS_ENABLED=true` in Production and redeploy. Removing the variable or
   setting it to `false` is the delivery kill switch.

## Safe end-to-end validation

Use an isolated Supabase test project and a Resend-owned test recipient/address. Do not alter a real
Watch snapshot or insert a fabricated BODACC item into Production: doing so would create a false
user-visible event. In the isolated project, create a verified test account with a known
`profiles.locale` and create its Company Watch through the normal application flow so the real initial
BODACC baseline is saved. From a local integration harness, call `runCompanyMonitoring` with that
isolated service client, an injected BODACC fetch returning one normalized event with a unique
synthetic ID, and an injected notification processor whose sender is either fully mocked or restricted
to the owned test inbox. Confirm one Updated transition, one outbox row, the expected locale and detail
link, and a `sent` row with one attempt. Invoke the identical harness again and concurrently twice;
confirm the Watch's existing Last Change remains stable and no second outbox row or message appears.
Repeat with the sender returning a controlled error and confirm the Watch update still commits, the row
is `failed` with a safe code, and a second Watch is still processed. After Production enablement, wait
for a genuine BODACC event instead of manufacturing one, and correlate only aggregate cron counts and
the resulting owned Watch state.

Treat any nonzero notification `failedCount` as an operational alert. Failed rows and
`EMAIL_DELIVERY_OUTCOME_UNKNOWN` are intentionally terminal in V1 and require service-role operator
review; do not reset or resend them automatically. An aggregate privacy-safe inspection query is:

```sql
select status, last_error_code, count(*)
from public.company_watch_notifications
group by status, last_error_code
order by status, last_error_code;
```
