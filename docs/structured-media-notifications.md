# Structured Media notifications (local only)

The unapplied `20261015200000_structured_media_notifications.sql` migration extends
existing outbox and completion RPCs. The only new table stores per-Watch affirmative
email consent. Missing preference means Off. Creating a Watch or activating
monitoring does not opt in. No legacy preference is rewritten.

## Consent and authenticated management

Watch details → Email notifications controls email independently of Watching/Paused.
The browser uses the existing authenticated Supabase session. Only the owner can
read/change the preference through narrow RPCs; no direct preference writes are
granted, including to the service role. Cross-owner mutations are rejected.
The existing signed Watch definition and revision are not changed by preferences.
There was no existing account-level unsubscribe/consent model in the inspected media
infrastructure; no additional global preference is assumed.

Opt-out serializes with completion/submission on the Watch row and cancels pending,
unsubmitted intents (`EMAIL_OPTED_OUT`). Sent audit records and article history
remain. Pause/delete/edit keep existing invalidation behavior. Claim and submission
recheck consent/eligibility in SQL. A submission already started cannot be recalled.
EN/FR email copy links to the trusted Watch-detail origin and authenticated settings
anchor; it performs no mutation on GET and does not claim one-click unsubscribe.

## Atomic handoff and delivery

`STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED=true`, strict Staging rollout gates,
active due state, owner/lease/CAS validation and current consent are required for
new intents. Existing completion's accepted matching items enter the existing
unique `(watch_id,user_id,source_article_id)` outbox in the same transaction as
article history. Baselines (empty or nonempty), known and unmatched items stay
silent. Observations while opted out remain known: opting in does not replay them.
Insert failure rolls back snapshot/history/lease release. Manual checks stay silent.

Production legacy delivery configuration/transport remains unchanged. Structured
rows are excluded from Production delivery. Staging delivery has a separate policy:

- `VERCEL_ENV=preview`, exact Vercel project `prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF`,
  branch `codex/structured-interpretation-v1`, exact Staging Supabase URL, existing
  Structured rollout flags and approved owner IDs;
- explicit `STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED=true` and
  `STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED=true`;
- both `WATCH_EMAIL_NOTIFICATIONS_ENABLED=true` and
  `MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED=true`;
- `STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS`: 1–3 exact, individually approved
  addresses, no wildcard/domain grants; confirmed recipient resolved from Auth,
  never client input, checked again before submission;
- existing authorized sender/credential validation; clean `WATCH_APP_BASE_URL`
  origin must equal the deployment origin or the pinned, independently verified
  branch origin with matching system branch identity (see the correction below).

The existing media worker is reused. A dedicated service-only claim prevents legacy
or non-allowlisted owner rows from entering this test path. At most one pending
record is selected per test invocation; no unrelated legacy delivery is enabled.
The existing cron endpoint supports separate authenticated GET scopes:
`structured-media` checks only; `structured-media-email-test` delivery only, guarded
by the full test policy and normal cron authorization. No new Serverless Function.
The email-test scope never invokes monitoring or Company/Currency/legacy workers.

Language is saved profile `fr`, otherwise English. Existing templates escape HTML,
require HTTPS URLs without credentials, use publisher text and configured origins.
Provider failures are not marked sent. Existing terminal/uncertain-outcome behavior
is preserved, including no automatic replay on timeout. Any future authorized
retry must reuse the durable row and hashed provider key; this is not a promise of
exactly-once external email delivery.

## Next controlled validation (separate approval)

1. Approve a local Vercel CLI upgrade to >=48.8.0 if still at 46.0.2. Use official
   `vercel curl FULL_PREVIEW_URL` with existing Vercel authentication, exact project,
   branch/SHA/deployment metadata and offline validator. Never use a path-only URL,
   which targets Production. No custom bypass-response parsing or weaker protection.
2. Review/commit only scoped changes, push with automatic deployment suppressed,
   apply this single migration to Staging, and deploy with all new flags disabled.
3. Confirm the existing fixture/owner and explicitly enable its consent through the
   authenticated preference flow. Authorize one temporary enabled Preview and one
   `structured-media` invocation with intent generation on and delivery off.
4. Verify one new matching intent (a first baseline correctly produces zero; a
   second matching observation would need separate authorization, not a hidden
   extra check). Real baseline-only scheduler success cannot prove positive enqueue.
5. Separately approve one exact recipient and independent test gates/credentials,
   then one `structured-media-email-test` invocation; no other monitoring runs.
6. Pause fixture, disable temporary gates, revoke/remove temporary credentials,
   deploy disabled Preview and contain the exact enabled deployment(s). Keep within
   separately approved deployment/call counts; consent can also be turned off.

No hosted migration, request, flag change or email has been performed by this task.
Actual protected access and hosted end-to-end delivery remain unverified.

## Stable Staging email origin (2026-10-16 correction; local only)

The Structured Staging email config accepts a clean HTTPS origin (optionally a
trailing slash), with no credentials, explicit port, path, query or fragment.
This is checked on the original `WATCH_APP_BASE_URL` before credential parsing.
The current deployment origin `https://${VERCEL_URL}` remains supported.

The only additional permitted origin is:

`https://watch-assistant-git-codex-structured-interpre-7598f2-david-lang.vercel.app`

This host is pinned in server code, not supplied by a client or an unrestricted
alias environment variable. The official Vercel alias metadata on 2026-10-16
resolved it to `dpl_5KHKhPeYeYWBNqQemZWmi5Yth28N`, whose project was
`prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF`, branch
`codex/structured-interpretation-v1`, commit `059ee9a`, target Preview, READY.
The project's Deployment Protection remained enabled. The private evidence report
is `structured-staging-trusted-origin-20261016T105648Z.json`.

The alias exception additionally requires the Vercel system `VERCEL_BRANCH_URL`
to equal that exact pinned host. Missing, different or multiple alias values fail
closed. The existing exact project, branch, Preview, Staging Supabase URL, owner,
recipient and delivery gates all remain required. Neither a hostname suffix nor
`VERCEL_URL` alone establishes alias trust. No per-email API lookup or redirect
resolution occurs. Production and legacy origin validation are unchanged.

Before future publication/configuration, reverify alias ownership and routing
through official Vercel metadata and ensure system environment variables are
available. An alias reassignment or missing runtime branch identity must block
activation; changing the pin requires a reviewed code change and new evidence.

Next steps require separate approval: commit only this correction, tests and
this documentation; push the existing feature branch; deploy one disabled
Git-pinned Preview; verify its branch alias and `VERCEL_BRANCH_URL`; configure
`WATCH_APP_BASE_URL` to the origin above; retain branch-only Resend key/sender and
all scheduling/email gates disabled. A later bounded single-email test still
requires an eligible hosted notification, confirmed Auth owner, current consent,
exact recipient allowlist, and sole eligible intended record. On cleanup, route
the alias to the final disabled Preview before deleting enabled deployments.
No publication, hosted configuration, deployment or delivery is part of this fix.

## Exact-record Staging email test (local extension; not published)

The existing service-only `claim_structured_media_test_email_notification` already
claims an exact notification UUID atomically. No new SQL migration or privilege
is required. Its owner/Structured/domain checks, Watch lock, current consent,
claim expiry, submission boundary and terminal uncertain-result policy remain.

The authenticated existing `scope=structured-media-email-test` route now accepts
an optional group of three query parameters: `notificationId`, `watchId`, and
`ownerId`. All must be single UUID values; the owner must be in the server-side
test-owner allowlist. Missing/duplicate/malformed fields return no delivery.
The group is rejected on other cron scopes. Existing cron Bearer authentication
and every independent Staging gate remain mandatory; browser Auth is not enough.
No new endpoint is added.

The worker's corresponding `notificationSelection` object filters the exact
pending row, expected Watch, notification owner, joined Watch owner, Structured
version and Media type, with no prior submission. It restricts the existing
atomic claim to the expected owner and verifies claimed identity before delivery.
Unknown, cancelled, sent, currently claimed or uncertain-submission IDs cannot
fall back to a different row. Expired claims before submission retain existing
safe recovery semantics. A selector in Production is explicitly rejected before
outbox access; execution without a selector preserves normal legacy/Production
and Staging behavior. Only fabricated local records/providers are used in tests.

Future hosted procedure requires separate approval:

1. Publish only this worker/route/test/documentation changeset and deploy a disabled
   Git-pinned Preview. No hosted migration is needed.
2. Reverify permanent branch Resend/sender/origin settings and confirmed recipient,
   genuine consent, protected access and the exact Staging project/branch.
3. Obtain a **new legitimate** eligible intent through normal monitoring. Existing
   cancelled intents stay terminal; do not reset history, fabricate news, insert
   a hosted outbox row or resurrect an old intent. Waiting may be necessary.
4. Record the intended notification/Watch/owner UUIDs privately. Recheck pending
   state, consent, recipient allowlist and absence of prior/uncertain submission.
5. Under an explicit deployment/call budget, temporarily enable only branch-scoped
   Staging delivery gates and independent cron authorization. Keep monitoring
   disabled during delivery. Preserve capacity for final disabled cleanup.
6. Deploy one temporary email-enabled Preview and invoke the existing route **once**
   with all three selection parameters. Never put credentials in URL parameters.
   The real worker validates the trusted origin before querying/claiming the row.
7. Verify the intended row, one provider submission and provider acceptance; inbox
   receipt needs independent confirmation. Never retry an unknown outcome.
8. Disable temporary gates, remove only task-owned temporary credentials, pause the
   fixture according to approved cleanup, retain baseline/consent/audit, deploy a
   final disabled Preview and contain enabled deployments. Verify stable alias
   routing, no outstanding claims, other Watches and Production remain unchanged.

This procedure is a plan only. No real cancelled notification was changed and no
hosted operation, publication, deployment, monitoring or email was performed here.
