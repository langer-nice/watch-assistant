# Resend sender correction and delivery recovery

## Root cause and configuration

At starting master `85b2e2d83492553902802bfbebc7563f16a666ee`, both email config readers accepted any nonempty, single-line `WATCH_EMAIL_FROM`. They passed the legacy `<address>` value unchanged to Resend, consistent with the supplied production HTTP 422 evidence. No production environment or outbox was read during this correction.

Company and media now share one config reader and sender parser, including a transport-level guard. Bare `notifications@davidlangdesign.com` and the exact legacy `<notifications@davidlangdesign.com>` become `Watch Assistant <notifications@davidlangdesign.com>`. A valid existing display name is preserved. The grammar deliberately accepts ordinary ASCII mailboxes and simple unquoted names, not the full RFC mailbox grammar. Missing values, control characters (including CR/LF), arbitrary malformed input, multiple mailboxes, and domains outside the exact central allowlist fail closed. Domain verification itself remains a Resend responsibility. Changing the allowed domains requires a reviewed code change.

Required server variables remain `RESEND_API_KEY`, `WATCH_EMAIL_FROM`, `WATCH_APP_BASE_URL` (HTTPS), plus the independent `WATCH_EMAIL_NOTIFICATIONS_ENABLED` / `MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED` flags. Only literal `true` in production outside tests enables delivery. Preview and test gates are unchanged. No additional variable is required.

Invalid enabled configuration returns `configuration-failed` / `EMAIL_CONFIGURATION_INVALID` before outbox reads, claims or provider calls. Existing pending rows remain pending. Media enqueue/maintenance uses the enablement flag independently of config validity so configuration errors do not erase eligible work or mislabel it `EMAIL_DISABLED`. Baseline suppression, manual-check behavior, identity filtering and disabled-mode behavior are unchanged.

## Sender domain policy (permanent correction)

`server/watch-email-config.js` separates three responsibilities:

1. `parseAsciiEmailAddress` validates an addr-spec independently of authorization. It rejects non-printable/non-ASCII characters before case conversion, requires exactly one `@`, validates a nonempty dot-atom local-part (maximum 64 characters), and validates DNS labels (1–63 ASCII characters, no leading/trailing hyphen, empty label or trailing dot). The address limit is 254 characters. It returns `{ localPart, domain }` or `null`; local-part case is preserved and only ASCII domain case is canonicalized to lowercase.
2. The immutable `WATCH_EMAIL_ALLOWED_DOMAINS` list authorizes exactly `davidlangdesign.com` and `watch.davidlangdesign.com`. Syntax validity alone grants no authorization; other subdomains and suffix lookalikes remain rejected.
3. `normalizeWatchEmailSender` accepts the existing bare, angle-bracket and simple ASCII display-name forms. It preserves the validated local-part and domain, retaining a valid display name or the established `Watch Assistant` default. Formatting is deterministic and idempotent; it never substitutes the root domain. Outer ASCII spaces remain supported, but controls, Unicode and whitespace inside the addr-spec are rejected.

Both config readers and the Resend transport guard already call this shared module. No consumer, dependency, flag, UI or deployment configuration change is necessary.

The September 25 read-only diagnosis found that Production's configured sender uses the Resend-verified `watch.davidlangdesign.com`, while the previous validator only authorized/reconstructed the root domain. The rejection reproduced on both pre-PR-26 master `3a203af324f5ab0e8edfd3b570c292704cc57b7b` and merge `d489ad5dd42f7e2a7d6ca0c2e7113ee5748c71f7`. No full sender address or credential is recorded here.

## Outbox audit and release boundaries

The diagnosis counted 185 historical media rows in `failed`, zero media rows in `pending`, and an empty company outbox. These are observations at diagnosis time, not a guarantee against subsequent independent application activity.

Both processors select only `pending`; company also filters `channel=email`, and media restricts claim eligibility. SQL claim/submission/completion functions require `pending`. Media maintenance only terminalizes pending rows; it cannot change a failed row to pending. Even a provider error classified as retryable is terminal in the current outbox and requires separate operator review. This correction changes none of those paths, migrations, claim timeouts, idempotency keys or retry rules.

Permanent regressions cover both processors with 185 synthetic failed rows plus pending/sent rows: only the new pending row is selected and sent to an injected fake provider, repeated processing does not resend it, and every historical field remains unchanged. A PostgreSQL/PGlite regression also verifies 185 synthetic failed rows against the real migrations, enabled/disabled maintenance, SQL claims and the media processor. No production records are copied or touched.

After a future authorized production deployment, new eligible company events or new matching media articles may enqueue and send during the ordinary scheduled check. An already existing pending backlog, if created in the meantime, may also send (25 per processor per run). Baseline suppression, seen-article/event identities, Watch pause/deletion and verified-recipient requirements still apply. The 185 failed rows do not become eligible and are not requeued.

Staging validation: first ensure the exact branch's Preview resolves exclusively to staging, with no production Supabase fallback, before publication. Do not change Vercel variables or deploy under this correction's authorization. Run the mocked transport and in-memory PostgreSQL tests with the verified subdomain. Any later browser inspection must use staging and prevent writes; do not request OTP, synchronize pending browser jobs, invoke cron or send email. Preview delivery must remain disabled regardless of flags.

Production release is a separate decision requiring explicit user authorization: review the exact commit, tests and outbox audit; verify current nonsecret environment metadata and sender policy; merge/deploy only the approved commit. Reconcile the then-current pending backlog before deployment, because the ordinary scheduled run could send it. This PR does not authorize real-email testing or historical recovery.

Rollback target: `dpl_6kcLnLwUgtCumjzRq9anrzDQGs3C` (commit `d489ad5dd42f7e2a7d6ca0c2e7113ee5748c71f7`). A separately authorized rollback would restore that deployment/alias without resetting outbox rows, snapshots or variables. It restores the known notification blockage; already accepted emails cannot be recalled, and any running invocation must be considered when assessing rollback completion.

## Outcomes and observability

The authenticated cron's existing completion log and response include both notification summaries:

- `pendingCount`: eligible pending candidates selected in the bounded batch (not the total queue; SQL can still reject stale/ineligible claims).
- `claimedCount`: claims actually acquired.
- `submittedCount`: provider acceptances, even if completion persistence fails.
- `sentCount`: acceptances successfully persisted as sent; this does not prove inbox delivery.
- `retryableFailureCount`: HTTP 429 (`EMAIL_RATE_LIMITED`), 408 or 5xx (`EMAIL_PROVIDER_RETRYABLE`). Recoverable by operator review, not automatic replay.
- `permanentFailureCount`: definitive rejections, including HTTP 422 (`EMAIL_PROVIDER_REJECTED_422`), other nonretryable HTTP statuses (`EMAIL_PROVIDER_REJECTED`), or local row failures.
- `configurationFailureCount`: invalid enabled configuration (a stage failure, not a row count).
- `unknownOutcomeCount`: network errors, timeouts, malformed success responses, or accepted submission with failed completion persistence (`EMAIL_DELIVERY_OUTCOME_UNKNOWN`).
- `persistenceFailureCount`: failure recording itself failed; abandoned-claim handling remains the fallback.

Only allowlisted error codes are persisted. Provider response text, API keys, recipients and message content are never included in these diagnostics. Both processors preserve the 25-row limit, concurrency of three and the SQL 30-minute claim timeout.

Unique event/article constraints, atomic claim tokens and the submission boundary prevent competing workers from submitting the same notification. Successful rows are not selected again. Abandoned claims before submission can be reclaimed; claims after the boundary become terminal unknown outcomes rather than being resent. Deterministic hashed Resend keys remain unchanged. These safeguards prevent automatic retry duplicates, but cannot promise end-to-end exactly-once inbox delivery across an external provider and database.

Resend retains idempotency keys for only 24 hours: https://resend.com/docs/dashboard/emails/idempotency-keys . This PR deliberately keeps failed rows terminal. A safe automatic-retry feature would require persisted immutable request payloads, the first submission timestamp, bounded retries/backoff inside that window, and a review state after it expires. No migration or recovery endpoint is introduced.

## Historical failures: separate decision after deployment

The approximately ten failures on 14–15 September are user-supplied evidence, not a fresh production count. The old transport persisted `EMAIL_PROVIDER_ERROR` for HTTP 422 and many other errors. Therefore **that code alone cannot identify sender-format failures safely**. The schema retains event identity, submission time, attempts and claim information, but not HTTP status or the request payload. A bulk requeue based only on the old code or date range is unsafe.

Default recommendation: leave those stale alerts failed (logically abandoned). Their Watch reports remain available; no row mutation is necessary. New eligible events can send after the fix is deployed. Do not reset snapshots, delete identity ledgers, or clone outbox rows to force mail.

If specific alerts are still useful, a separate authorized recovery change must:

1. Privately correlate explicit outbox IDs, the 14–15 September submission timestamps and deterministic keys with provider logs proving sender-format rejection and no acceptance. Do not infer rejection from a timeout, generic code, or missing provider ID alone.
2. Verify current ownership, account confirmation, Watch active/nondeleted state, unchanged media definition, source identity and freshness. Exclude sent rows, unknown outcomes and superseded notifications.
3. Implement a service-role-only local CLI, no HTTP/browser endpoint. Require an explicit ID allowlist and a small hard limit (at most ten); default to dry-run with an explicit apply flag and approved manifest digest. Audit only opaque IDs, classifications, counts and timestamps, never recipients/content.
4. Lock and compare each row's expected failed state/code/attempt count/submission timestamp in one transaction; only proven rejected rows may become pending. Clear `claim_token`, `claimed_at`, `submission_started_at` and `last_error_code` together, preserve identity and attempt history, and never reset sent state. Repeat application must be a no-op. Coordinate with cron to prevent selection before the approved transaction commits.
5. Reuse the existing deterministic provider key and normal claim path. Because the historical keys have expired, operator proof of nonacceptance is mandatory. If proof is unavailable, abandon the alert.

There is intentionally no runnable recovery command in this PR: the required follow-up is the separately reviewed, dry-run-first CLI/transaction above, with its race, authorization, freshness and idempotency tests. Never run a generic `UPDATE ... WHERE last_error_code = 'EMAIL_PROVIDER_ERROR'`.

For new retryable/unknown failures, use the same review workflow: 429 can be reconsidered after rate limits clear; 5xx/network outcomes require reconciliation with Resend before requeue. An accepted message whose local completion failed should be reconciled to sent using its verified provider ID, not submitted again. A lack of delivery is not proof of nonacceptance.

## David's Preview validation (no email)

1. Confirm the PR head SHA matches the successful Vercel Preview check. Open that Preview and sign in to a test account.
2. Check company and media Watch details and existing reports still load; switch test accounts and verify the first account's local Watch/report state is not visible.
3. A manual Check now must not produce automatic email. Preview delivery stays disabled even with flags set. Do not call the production cron or change production variables.
4. For transport evidence, run `NODE_ENV=test node --test server/watch-email-config.test.js server/company-watch-notifications.test.js server/media-watch-notifications.test.js`. All transport requests are mocked; the tests assert the exact canonical outbound sender and one submission per eligible identity.
5. Preview cannot verify real Resend acceptance by design. Review the test results and server diff rather than enabling Preview email.

## Separate post-merge production verification

Only after explicit merge/deployment and real-email authorization: verify the existing sender's domain and safe config metadata, then use one dedicated verified account and one dedicated controlled media Watch/feed. Allow the first scheduled run to establish the baseline with zero email. Publish exactly one fresh matching article after that baseline and let the normal schedule process it. Confirm one claimed row, one accepted provider ID, one persisted sent row and one inbox receipt. A subsequent normal run must send nothing for that identity. Observe only the dedicated test row with separate authorization; do not replay the historical backlog or manually trigger the production cron. Stop and investigate if counts differ. This procedure is not executed by this PR.
