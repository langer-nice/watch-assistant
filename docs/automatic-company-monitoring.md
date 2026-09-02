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
- `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role key; never prefix it with `VITE_` or expose it
  to browser code.
- `CRON_SECRET`: a high-entropy random value. Vercel automatically places this value in the cron
  request's Bearer authorization header.

Do not replace the service role with the anonymous key. User routes continue to authenticate with the
anonymous key plus a user JWT and remain subject to RLS. The scheduled SQL functions reject anon and
authenticated callers and are granted only to `service_role`; RLS stays enabled on every table.

## Migration and idempotency

Apply migrations in timestamp order before deploying the application. The V1 migration creates
`company_watch_snapshot_history` and two service-role-only functions. It does not modify or delete
existing Watch or current-snapshot data.

The completion function locks each Watch row. It compares canonical normalized JSON with the current
snapshot inside the transaction, records distinct old/new snapshots in append-only history, updates
the current snapshot, and transitions to `updated` only when content differs. A unique
Watch/content-hash index and row lock make repeated or overlapping runs idempotent. No-change checks
advance `last_checked_at` without clearing a previously unread `updated` state. A failure stores only a
bounded error code and leaves the last valid snapshot intact; the next daily run retries it.

## Operations

A successful response contains only `runId`, eligible Watch and unique-SIREN totals, checked, changed,
unchanged, failed and skipped counts, `durationMs`, and `status`. Controlled per-SIREN failures return
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
