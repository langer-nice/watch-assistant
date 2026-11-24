# Bounded daily recovery and durable V3 failures

Review candidate based on Production commit e7ba077d1c7d70dfec6f7df8f501cafb149a4a21. Neither deployment nor activation is authorized by this change.

## Existing failure and policy

Normal Production preparation **and** claim use yesterday 08:15 Europe/Paris as a lower bound, additionally constrained by rollout `p_since` and policy `eligible_after`. If owner enumeration fails for a whole daily opportunity, an unattempted notification falls behind that boundary forever. Preparation/claim have not been globally widened.

The recovery exception covers **one missed daily opportunity**: detection from day D−2 08:15 through D−1 08:15, during the existing day D 08:15–08:30 dispatch window. This derives from the existing daily cadence: an outage of one morning can be recovered the next morning. It is a proposed conservative policy for review, not a claim that arbitrary old news remains relevant. Calendar boundaries follow Paris DST (not a hard-coded 48-hour duration).

Only the current latest V3 development is eligible, with unchanged source identity, URL and summary; a successful check after the missed daily cutoff with CONFIRMED or STRONG_UNCONFIRMED evidence; no explicitly false condition; a known source publication date within the grace interval and no future date; current active Watch, verified/non-disabled account, daily consent, and no previous/uncertain equivalent submission. A NO_ALERT with INSUFFICIENT evidence cannot establish current relevance. Non-V3/unknown relevance, composite overlap not established by persisted state, expired windows and ambiguous cases remain pending for explicit review. This is deliberately not a universal semantic deduplicator or a guarantee that every historical development can be automatically replayed.

Normal current notifications take priority. Recovery does not add to an existing digest: one current recovery digest freezes one notification and uses existing Watch/day uniqueness, claims, submission boundary, provider idempotency key and finish/defer states. All eligibility is checked again before claim and before begin. A recovery preparation outage does not block normal digests. Source publication and detection timestamps are preserved and the email explicitly says delayed delivery. Immediate and Staging delivery remain separate.

No automatic retry after the provider submission boundary: an uncertain submission remains blocked for reconciliation. Pre-submission claims can expire/retry, and known pre-provider errors use the existing safe deferral. A crash after durable begin is conservative even if no email was actually sent. Original records remain available; expired/unsafe candidates are not deleted or silently marked sent.

## Migration and rollout, separate approval stages

1. Review this patch and the local tests first. No merge/deployment in this task.
2. Apply the additive migrations to an isolated Staging database using its **appropriate migration manifest**, with fake delivery, then validate normal/recovery parity and account isolation. Never mix the legacy one-owner Staging reporting manifest with Production V3 presentation migrations. Production migration/deployment require separate authorization.
3. The diagnostic migration adds a service-only fenced RPC writing a bounded allowlist to existing `history[].diagnostic`. It preserves the generic error and old RPC. Older apps keep working; new app falls back to the old RPC if the diagnostic RPC is unavailable. Failure retry scheduling is still handled by the existing fenced SQL transaction.
4. The recovery migration adds one nullable `media_watch_digests.recovery_since` column and service-only functions. It creates an immutable migration-time lower boundary. No existing notification is rewritten. Old apps reject old membership and cannot accidentally render recovery as a normal digest.
5. Deploy capability **with recovery disabled** (the default). After separate validation/authorization, set `STRUCTURED_MEDIA_RECOVERY_ENABLED=true` and `STRUCTURED_MEDIA_RECOVERY_SINCE` to the actual UTC activation instant, not earlier than migration installation. Both are required. Preserve existing Production gates and schedule. The application normal rollout timestamp remains a separate lower boundary. Do not predate activation to catch up.
6. The seven 12/19/21 November records predate the immutable migration boundary and cannot be selected even with a mistaken earlier environment activation value. Historical review/replay remains a separate unimplemented operation requiring authorization.

Rollback: turn the recovery flag off; normal processing continues and cannot claim the historical recovery membership. Do not reset submitting/failed/sent states or erase the migration boundary. Reverting application code preserves already stored diagnostics and original pending history. Keep the additive SQL/column installed; do not drop renamed claim internals while wrappers depend on them. After any provider uncertainty, reconcile before considering a manual recovery. An existing recovery digest cannot be relabeled or reopened after submission.

## Diagnostics

Persist only Watch ID (authoritative SQL value), attempt/context UUIDs, authoritative UTC timestamp, allowlisted stage, stable error code, sanitized category, and whether this failure schedules a retry. No message, prompt, provider response, article content, header, credential or stack is stored. The database repeats the allowlist validation; stale/foreign lease tokens cannot append diagnostics. Scheduled and manual contexts share this path, with manual retry_scheduled=false. A database outage can still prevent all persistence; fallback preserves the previous best-effort behavior, not impossible guarantees.

## Local validation

`node --no-maglev --test server/bounded-notification-recovery.test.js server/v3-scheduled-diagnostics.test.js server/media-watch-digest.test.js server/structured-digest-selection.test.js server/digest-user-journey.test.js server/v3-pilot.test.js server/v3-manual-parity.test.js server/structured-production-access.test.js server/structured-production-compatibility.test.js`

156 tests pass, including actual isolated PostgreSQL via PGlite, fake sender/provider acceptance, owner outages, pending/delivered/uncertain/suppressed states, consent/account/Watch revocation, later equivalent developments, concurrent/repeated claims, transaction rollback, expired claims, lost provider acknowledgments before/after durable completion, grace/activation bounds, seven unchanged historical fixtures, failure isolation, diagnostic sanitization/fencing/retry/historical compatibility, existing normal digests and manual/scheduled V3. Tests reject external fetches in the new integration suite. PGlite serializes database transactions: Promise-based competing-worker checks verify atomic idempotent state transitions locally; independent-connection contention has now been verified on native PostgreSQL 17.11 (see concurrency evidence); hosted gateway/platform behavior remains outside that local proof.

Existing Staging test fixtures were made deterministic (fixed Date/database clock where necessary), skip only Production V3 migrations whose required capability is absent, and assert the current hourly route's no-delivery contract. No application schedule or presentation behavior was changed to accommodate tests.

`npm run build` passes (existing >500 kB chunk-size warning). No paid OpenAI, real Resend, hosted migration, live Watch/cron or Production data access is used by validation.

Security references checked before implementation: [Supabase database functions](https://supabase.com/docs/guides/database/functions) (service-only grants and safe search_path), [Supabase changelog](https://supabase.com/changelog.md). No relevant platform change was required.

## Targeted review, 24 November 2026

Three bounded corrections were made with focused regressions: require a successful check after the missed daily cutoff (the original alert's check is insufficient); reject a missing source URL explicitly despite SQL NULL semantics; retain an allowlisted HTTP_4xx/HTTP_5xx stable diagnostic code when the provider returns only a numeric failure status. No Brain, prompt, model or source-acquisition changes.

The available hosted Staging project is ACTIVE_HEALTHY but does not have v3_pilot_watches installed; it has no development branch available. No hosted migration or synthetic record was created: installing the patch into that shared public schema would require broader V3 provisioning. That earlier hosted limitation is superseded for the database-concurrency blocker by five synchronized races across separate native PostgreSQL 17.11 backends, plus 14 safety scenarios, all passing. Local PGlite results remain distinct from this native proof and from hosted gateway/platform validation. Decision: READY FOR PR PREPARATION, without deployment or recovery activation authorization. No merge, deployment or activation authorization is implied.


## Native PostgreSQL concurrency evidence

A temporary installed PostgreSQL 17.11 cluster was initialized under a private /private/tmp directory with Unix socket permissions 0700, no TCP listener, no provider configuration, and no copied Production data. The Production migration manifest (excluding the incompatible legacy Staging report manifest) and the two exact proposed migration sources were loaded. The only SQL execution adaptation was clock_timestamp() -> public.recovery_test_clock(), matching the existing fixtures to model a missed daily interval; claim predicates, row locks, transaction isolation, permissions, constraints and submission transitions were not simplified.

Two separate psql processes/backends (23566 and 23568) executed independent READ COMMITTED transactions. A third backend held the Watch row lock until pg_stat_activity showed both workers waiting on PostgreSQL locks. Five fixed repetitions each produced one winning claim, one rejected duplicate, distinct transaction IDs, and one persisted digest identity. Native checks also covered different owners, cross-owner rejection, rollback, lease expiration/stale-token fencing, repeated claims/begin, unknown submission, sent/history/expiry exclusions, consent, fresh-check requirement, missing URL and denial to anon/authenticated.

The new native validation made no application/SQL corrections. The existing 156 passing tests and successful build remain applicable to unchanged application/SQL source hashes. PostgreSQL roles/JWT claim settings are locally simulated: this is not hosted Supabase JWT-signature, PostgREST, or real email validation. The temporary server was stopped and its entire cluster removed after preserving non-secret evidence and the reproducible harness under docs/evidence/reliability-2026-11-24/.

Repository evidence: [native PostgreSQL results](evidence/reliability-2026-11-24/concurrency.json), [integration validation](evidence/reliability-2026-11-24/README.md), and [reproducible native harness](../scripts/native-notification-recovery-concurrency.py). The harness requires a fresh disposable local database named reliability_concurrency_test, a private Unix socket under /private/tmp/watch-reliability-pg.*, PostgreSQL 17 binaries, and --source pointing to this repository. Never target a shared/hosted database.
