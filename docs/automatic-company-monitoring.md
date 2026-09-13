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

## Media/news Watch email notifications (V2)

The existing daily cron also checks server-persisted `media_news` Watches. The
`20260913120000_media_watch_email_notifications.sql` migration adds their bounded snapshots and a
separate service-role-only outbox. Each canonical feed article produces at most one outbox row and
one email; a check with several new articles preserves feed order and produces one email per article.
Manual checks never use this outbox, and the first scheduled check only establishes a baseline.

Delivery is separately gated by `MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED=true`, exact case, together
with a Vercel Production environment and the existing complete Resend configuration. When disabled
(or incompletely configured), scheduled snapshots advance but notification intent is deliberately
not enqueued, so enabling the flag cannot release an old backlog. English is the fallback locale.

Safe activation order, for a separately authorized operator: (1) keep
`MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED=false` in Production, (2) verify PR #17 migrations are
already recorded and apply the new migration exactly once, (3) deploy the reviewed code, (4) validate
with synthetic feeds and a mocked sender only in an isolated database, (5) observe genuine Production
baselines with sending still disabled, then (6) explicitly authorize activation, set the flag to
`true` and redeploy. Never manufacture events or call a mocked harness against Production.
Code deployed before the migration reports media monitoring as unavailable while Company monitoring
continues. Rollback is performed by setting the media flag to `false`; do not roll back the migration.

### Authenticated media persistence

Media mention and URL story Watches now use the actual browser `addWatch`/`updateWatch`/`deleteWatch`
path to synchronize with `/api/media-watches`. The API authenticates the bearer token and uses the
user-scoped Supabase client and RLS, never a service-role client. The existing Watch UUID is the
server primary key, so Detail and email links remain stable. Only the bounded request, category,
feed URL/query, subject/all-subject matching rule or story concepts, title and paused state are
sent. Feed URL locale parameters are preserved; email language comes from the owner's profile.
Browser snapshots, fetched article history, recipient addresses and other browser state are not uploaded.

A per-owner, per-Watch durable journal retains pending edits and deletion tombstones. Database
revisions prevent old requests and overlapping tabs from replacing newer definitions; mutation IDs
make retries after a lost response idempotent. Only acknowledgement of the exact mutation can mark
it saved. Authentication generations prevent old responses from being applied after sign-out,
account changes or token changes. Online, focus, authentication, storage events and the Detail retry
button retry unavailable persistence. The local Watch remains available when schema support or
network access is missing. Deletion is an owner-scoped soft deletion and can never be resurrected
by a stale creation retry.

Owned local Watches can recover missing synchronization records. Legacy browser-only Watches have
no reliable ownership provenance: they are **not** assigned to whoever next signs in, and remain
local with an explicit Detail notice. This includes older Watches such as an existing Elon Musk
Watch if it lacks ownership metadata. Non-UUID legacy records also remain local. The application
does not guess ownership or automatically replace their IDs. Company Watches and other browser-only
Watch types are excluded from this media synchronization path.

Conflicting edits remain stored locally and are shown in Detail. “Keep my local changes” is an
explicit resolution against the displayed server revision; a newer concurrent write still causes
a conflict. Unsupported monitoring-definition edits pause the last valid server definition and
retain the edited local copy. A subsequent valid media definition can resume monitoring. The
server baseline is invalidated when source or matching rules change; a revision check also rejects
cron results fetched for older definitions. Pending, unsubmitted notifications for changed Watches
are cancelled. A submission already started may finish; it is never automatically retried.

Browser persistence has no enqueue or delivery permission, and browser roles cannot modify the
scheduled snapshots. The first scheduled check establishes a baseline, later matching articles
are eligible for the separate outbox, and manual checks only update browser history. The migration
is transactional: replay fails and rolls back rather than leaving partially changed privileges.
It has not been applied to any Supabase environment as part of this implementation.

### Local regression coverage

`npm test` includes a development-only PGlite PostgreSQL runtime. It runs the real migration chain
with local auth-role shims, then drives real browser storage and synchronization through the API
middleware and SQL/RLS into the real cron query and scheduled completion RPC. It covers baseline,
outbox uniqueness, ownership, malformed data, missing schema, retries, concurrent/stale requests,
soft deletion, unsupported edits and explicit conflict resolution. PostgreSQL's built-in UUID
function substitutes for the unavailable optional `pgcrypto` extension in this local harness; no
Supabase service is contacted. Production email transport is blocked under `NODE_ENV=test`, while
email rendering/delivery-contract tests use explicit mocked senders or HTTP implementations.

### Production-readiness corrections and operating limits

A durable `media_watch_seen_articles` ledger records canonical URL hashes and stable feed-ID hashes
for every observed item, including baseline, nonmatching and disabled observations. It survives the
20-item snapshot rotation and definition edits. A repeated URL with tracking parameters or a corrected
feed GUID cannot become new after disappearing from the snapshot. Distinct URLs with the same title
remain distinct. Known publication dates at or before the first scheduled baseline are excluded;
items without dates rely on their observed identities. The system cannot determine an undisclosed
publication date or recognize an article whose publisher changes both its URL and stable ID.

The scheduled completion transaction decides which matching identities are truly new and atomically
writes Watch state, the snapshot, identities and outbox rows. The browser hydrates the latest scheduled
article without changing its original detection timestamp or erasing local history/read state, and
retains a more recent manual check timestamp. Detail reports synchronization and the actual server-side
email availability flag separately; a saved Watch does not imply that email is enabled.

The media stage processes at most 50 Watches, with pages of at most 50, three concurrent feed checks
and a 45-second stage deadline. Least-recently-checked Watches are selected first; failed checks record
an attempt so one failing Watch cannot permanently monopolize the batch. Delivery processes at most
25 jobs in groups of three, sharing the media stage deadline (30 seconds when run independently).
Individual asynchronous operations have an eight-second budget. A deadline stops further operations;
an already submitted database/provider request can finish after its caller times out, so transaction
versions, leases and the durable submission boundary remain essential.

This bounds the new media stage, not the pre-existing Company stage: that stage still processes all
eligible Company Watches before media. Before production activation, verify the combined endpoint's
configured duration and observed Company workload leave room for media; no Vercel duration setting or
schedule is changed here. A daily batch of 50 also limits how frequently larger media populations are
checked. Monitor aggregate eligible/failed/skipped/deadline counts and agree capacity before expanding
usage. The identity ledger grows with observed articles; do not prune it without a replacement durable
historical-identity strategy.

Every media cron run cancels unsubmitted pending jobs when email is disabled and terminalizes expired
post-submission claims as `EMAIL_DELIVERY_OUTCOME_UNKNOWN`. Fresh claimed jobs do not block selection of
other pending jobs. Claims abandoned before submission are reclaimable after 30 minutes. Completion
failure or timeout after contacting the provider is uncertain delivery and must never be automatically
resent. Review terminal failures with aggregate status/error counts; do not reset their status to pending.
Disabling requires at least one disabled cron maintenance pass before re-enabling to cancel pre-existing
unsubmitted work; it cannot recall a request whose submission has already started.

### Recreating an unowned legacy Watch

Sign in to the intended account and keep the old local Watch. Open **New Watch**, copy its request and
source/matching concepts, and create the replacement explicitly. Confirm the new Watch shows that it
is synced, reload its Detail page and verify its definition. Only then decide whether to delete the old
local copy. The replacement intentionally has a new UUID; the old Watch is never silently reassigned,
overwritten or deleted. If synchronization fails, retain both local copies and use **Retry sync**.

### Deployment-state checks

- New code before migration: media API failures leave the journal and local Watch intact; media cron
  reports unavailable independently of Company success. No media submission is possible.
- Migration before new code: existing Company functions/grants remain usable; migration statements
  do not manufacture snapshots, notification jobs or email. The media migration is one transactional
  operation, not a replayable repair script; uncertain execution requires inspecting migration history.
- New code with media email disabled: persistence and baselines work; observed identities advance,
  new email intent is discarded and old unsubmitted jobs are cancelled on the next maintenance pass.
- Enabled: only exact lowercase `true`, `VERCEL_ENV=production`, non-test execution and complete valid
  server-only email configuration permit sending. The Company flag does not enable media email.
  Preview, Development and the automated test transport remain blocked.
