# November 7 Morning Brief: owner authentication diagnostics

DIAGNOSTIC IMPROVEMENT READY FOR REVIEW — PRODUCTION INCIDENT NOT RESOLVED.

## Evidence and execution path

The production alias was inspected once on November 7: READY deployment
`dpl_3R4Zt52UcwfPycL3ueYt2kcWKYu8`, master commit
`2e428b57409a71497d71467730f9adcc61b65d5b`, matching the supplied baseline.
The supplied production evidence is reused: all nine checks completed with no
new items; the November 7 report is absent; November 6 reports and sent digests
exist. No additional check, report query, notification query, cron invocation,
or expired-log query was made.

At 08:00:59 and 08:15:31 Europe/Paris, the owner RPC returned 401; the latter
has PostgREST PGRST303 (log ID 403207a5-9dfc-45ad-8ade-cf6e4f6757cd).
This establishes JWT validation/parsing failure, not its specific cause.
Expiration, revocation, clock skew, SDK incompatibility and a provider incident
remain unproven. Existing function permissions do not justify changes.

The production `structured-morning` handler awaits `runMorningBatches`, then
`generateMorningReport`, then the separately gated digest processor. The
structured scheduler starts `runPilotMonitoring` before awaiting
`productionWatchOwners`; its finally block waits for pilot work even when
owner enumeration fails. Thus completed pilot checks can coexist with a failed
main orchestration path. The failure propagates to the cron's outer catch
before report composition. Report composition itself also enumerates owners;
its catch previously hid that error as `unavailable`. Other existing catches
are covered by the same diagnostic logging. No new scheduler behavior is added.
The repository identifies externally configured Paris ticks; exact external
job configuration was not independently re-read, and the incident RPC logs
alone do not prove a particular scope URL.

## Focused change

Preserve an allowlisted upstream PostgREST/SQL code, HTTP status and fixed
owner-lookup stage. Replace arbitrary upstream text with a safe message; never
attach raw messages, details, hints, causes, tokens or owner lists. Cron logging
adds the existing run ID and timestamp, including report-only catches.
A Supabase request ID is not exposed by the current RPC result, so none is
invented. Public response bodies retain their existing shape.

No retries, window changes, credentials, permissions, RLS, account selection,
report writes, consent, notification delivery or idempotency behavior changes.

## Validation

24 targeted tests pass: the complete company cron and new owner-access suites,
and the morning window/composition/zero-development tests. Coverage includes
401/PGRST303 propagation, safe logging at scheduler and report stages, transport
and malformed-owner rejection, unchanged success, and one automatic report for
a completed cycle with zero developments followed by `already-generated`.
The latter uses mocked storage; it does not establish live recovery.
`git diff --check` passes. No build or unrelated suites were run.

The full morning-report file also contains an existing SQL migration test
failure: `public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb)`
is missing during migration loading. The identical failure was reproduced with
the unchanged HEAD test file. No migration or test harness repair is included.

## Access limitation and execution error

No local production service-role key was configured. A Vercel CLI `env run`
attempt reported that nine production Secrets could not be pulled. It then
unexpectedly dispatched a separate CLI deployment instead of running Node,
creating the empty project `probe` and deployment
`dpl_DCmSbmrFZoLrP7wjtopoH4TLz2yH`. This violated the no-deployment instruction.
The accidentally created project and all its deployments were subsequently
removed; the CLI confirmed `Success! Project probe removed`. Watch Assistant
was not deployed or modified. The intended service RPC probe never ran, and
no current authentication recovery is claimed. No credentials were printed.

A future authorized production service-context read of
`production_watch_owners`, retaining sanitized response diagnostics, is still
needed. Any successful result establishes current recovery only. Diagnosing
the incident's specific JWT rejection requires evidence unavailable here.
The old Savoie Watch on the phone remains a separate follow-up; device-local
storage is only a hypothesis.

Changes are prepared on a local isolated branch. No branch is pushed because
a Git-integrated push may trigger a deployment; a local draft PR description
is supplied separately for review.

## Local update: preserve sanitized rejection wording

DIAGNOSTIC UPDATE READY FOR REVIEW — INCIDENT NOT RESOLVED.

The follow-up extends this same owner-failure/logging mechanism. It retains the
upstream message's recognized authentication words, original case and
punctuation, up to 400 characters. Thus `JWT expired`, `JWT not yet valid`,
`Invalid JWT: signature verification failed` and `JWSError (JWSInvalidSignature)`
remain distinct. No expiration or signature reason is inferred from PGRST303.
Missing messages use `Production owner context unavailable.`

The existing V3 sanitizer recognizes unrelated fixed messages and cannot be
reused for these rejections. This narrow sanitizer redacts authorization values,
JWTs, modern keys, URLs, emails, UUIDs, quoted values and assignments before
retaining only an explicit authentication vocabulary. Arbitrary unknown words
are redacted too: a pattern-only filter cannot reliably exclude opaque keys or
personal names. Unknown diagnostic vocabulary can consequently be lost; this
is an explicit limitation, not a promise to preserve arbitrary upstream prose.
The input processing bound is 8192 characters; output is at most 400 characters
with control/non-ASCII characters removed. SQL/PostgREST codes are format
restricted. No original error, response, cause, details, hint or owner list is
attached. The outer cron catch emits only the owner diagnostic for this error,
not an additional generic failure log. Report-only catches retain their prior
caller behavior. Public responses, RPC arguments, authentication and scheduling
are unchanged.

No response headers/request ID are provided by the current Supabase RPC result.
The service factory and transport are unchanged, so this update includes no
Supabase request ID. The existing cron runId and timestamp correlate the event
with its Vercel invocation. There are no additional requests or new log stores.

Validation: 28 tests pass in `structured-production-access.test.js` and
`company-monitoring-cron.test.js`, using mocked clients and synthetic secrets.
They cover safe original wording, expiration versus invalid signature,
redaction including opaque credentials/personal data, output bounds, absent
optional metadata, success/failure propagation, scheduler/report logging and
one diagnostic event per failure. `git diff --check` passes. The prior morning
composition/window/zero-development results are reused unchanged; no SQL,
frontend, production, email or broad test run is repeated.

### Observation after a separately approved deployment

Nothing is deployed or scheduled by this task. After approval and deployment
in a separate task, use the next normal morning opportunities at **08:00 and
08:15 Europe/Paris**. Do not invoke cron or generate a report manually.

At approximately **08:02–08:05**, and again **08:17–08:20**, read the existing
Vercel runtime logs for the approved production deployment and
`/api/cron/company-monitoring`. Use the existing runtime-log connector or
Vercel dashboard; filter for
`[Company monitoring cron] Production owner lookup failed.` and its `runId`.
Capture only timestamp, deployment/commit reference, runId, fixed stage,
allowlisted code, upstreamStatus and sanitized message. The provider request
identifier remains unavailable in this change. Do not export entire invocation
logs, headers, raw errors or unrelated events.

The previous detailed runtime logs expired before inspection. Capture these
fields within minutes of each scheduled run and keep the sanitized evidence
locally for the investigation; do not defer collection until the afternoon.
This task does not re-verify the account's exact retention duration or extend
it, and does not create a background observer, reminder or logging service.

If failure recurs, the returned sanitized wording may establish a specific
rejection reason; interpret only what it actually says. Unknown/redacted text
or PGRST303 alone may still leave the cause unconfirmed. If processing succeeds,
separately verify the actual stored automatic report, date and owner using an
authorized read-only report inspection. HTTP success alone does not prove report
creation. Neither outcome retrospectively explains the November 7 rejection or
establishes email delivery recovery.
