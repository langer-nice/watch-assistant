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
- existing authorized sender/credential validation; trusted `WATCH_APP_BASE_URL`
  origin must equal the exact deployment's `https://${VERCEL_URL}`.

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
