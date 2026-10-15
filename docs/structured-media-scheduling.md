# Structured Media scheduling (local implementation)

The existing authenticated `/api/cron/company-monitoring` handler also runs a
bounded Structured Media stage. No new Vercel function or cron expression is
introduced. Legacy Company, Currency and Media execution keeps its existing path.

## Gates and lifecycle

`STRUCTURED_MEDIA_SCHEDULED_ENABLED` stays off by default. Execution additionally
requires the cron-authorized server context, `CRON_SECRET`, both Structured
creation/backend flags, exact Staging Supabase URL, non-Production Vercel context,
and the approved owner allowlist. Browser sessions are never scheduler credentials.

The local `20261015160000_structured_media_scheduling.sql` migration must precede
using the new service-only RPCs or enabling scheduling (including leased manual
checks). Apply migrations before enabling the flag. Creation still saves paused. There is no new public
activation endpoint or activation UI. A future owner-authenticated activation
handler must enforce the existing Staging/allowlist gates before calling
`set_structured_media_monitoring` with the authenticated owner and reviewed revision.
The RPC validates the saved definition, controls only lifecycle fields, increments
revision, and preserves the baseline and identity registry. Pausing revokes a lease.

Each schedule stores an interval (one hour to seven days; default one day), due
instant, two-minute lease token/revision, and failure count. Claims lock Watch rows
with `FOR UPDATE SKIP LOCKED`. The server claims at most three per invocation and
uses at most 18 seconds of the existing media deadline. A stale/expired worker cannot
finish a newer lease. Success advances the next due instant by the configured
interval; failure backs off from five minutes up to the configured interval (capped
exponentially). An abandoned lease recovers after expiry; no automatic HTTP retry.
When scheduling is enabled, manual checks acquire the same lease before fetching
(the paused manual path also remains paused). Concurrent manual/scheduled requests
therefore do not fetch twice. With the flag off, the existing manual path is
unchanged; snapshot/revision CAS also fences an older in-flight completion across
a flag transition. A committed result cannot be undone by a lost-response failure.

## Results and notification handoff

Source normalization, saved criteria, literal matcher and identity generation are
shared with manual checks. `finish_structured_media_check` uses the existing atomic
manual completion engine: first context is retained; all observed identities enter
the ledger; only unseen matching articles produce matching results. No notification
intent is inserted and no delivery processor is invoked by the Structured stage.

The notification phase must extend this same completion transaction to atomically
insert approved matching items into the existing outbox, unique by Watch/owner/
canonical article identity, behind a separate flag. Enqueueing after completion in
JavaScript would risk losing intents after a committed response is lost. Do not
wire delivery to the current last-change field or to every raw source candidate.

## Controlled hosted validation (separate approval required)

Commit/review the targeted changes; apply the local migration to Staging only;
deploy one Preview with the scheduling flag still off. Then separately authorize
an isolated disposable fixture, activation, temporary server-only cron access and
one invocation of the existing authenticated workflow using
`?scope=structured-media`. This scope never runs Company/legacy Media or delivery
processors, still requires cron authorization and the strict Staging gates, and
claims only due active owners on the allowlist. Verify due/lease behavior,
positive results, duplicate suppression, pause, unchanged definitions and empty
outbox. Existing real Watches must remain paused. No hosted step has been performed.

The configured Vercel cron is daily. Hobby supports daily cron execution with
hour-level timing precision, so shorter stored intervals are eligibility bounds,
not a promise of hourly execution. Current limits:
https://vercel.com/docs/cron-jobs/usage-and-pricing
A Preview must be tested through an explicitly authorized invocation; no Preview
cron activation or Production rollout is part of this change.

Vercel native cron targets Production deployments, not Preview:
https://vercel.com/docs/cron-jobs
