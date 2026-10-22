# PR #56 — Production release plan, 22 October 2026

**Decision: BLOCKED.** Database evidence is now available. The remaining blocker is that existing Structured/Morning Brief code and report SQL deliberately restrict execution to Staging; environment changes alone cannot activate the same functionality in Production. This task changes documentation only, not those safeguards or application functionality.

## Preserved reconciliation and evidence

Master `4536b6a` is an ancestor of preparation HEAD `960922e`. The three master-only merges (#53, #52, #54) were preserved with no application-tree changes. PR #55, unrelated worktrees and local files remain untouched. Existing Staging tests/user evidence, including `docs/digest-pipeline-verification-2026-10-20.md`, are reused. No compatibility suite, monitoring check, email, AI call, merge or deployment was performed for this follow-up.

## Actual Production database findings

Read through the authenticated Supabase dashboard for Production project `cztpitujsnzhhenedwjn`, using SELECT-only catalog queries. Staging `tseexvbwhrtofcsrvcqc` was not used as substitute evidence.

- `to_regclass('supabase_migrations.schema_migrations')` returned NULL: **the migration registry relation is absent**, not merely an empty ledger. The dashboard also reports no recorded migrations. Do not interpret this as proof that older schema SQL never ran.
- All six exact function signatures that the new files rename are present: `valid_media_definition`, `complete_manual_media_watch_check`, `complete_scheduled_media_watch_check`, `fail_manual_media_watch_check`, `claim_media_watch_email_notification`, `begin_media_watch_email_submission`.
- The existing `watches_media_definition_check` delegates to the installed legacy validator. Required Watch definition/source/revision/deletion/check columns are present. New digest membership columns and later Structured/report markers are absent.
- Relevant existing tables (`watches`, `profiles`, `company_watch_snapshots`, `media_watch_notifications`) have RLS enabled. New Structured mutation/schedule/preference, digest policy/envelope and report tables are absent.
- `authenticated` currently has effective TRUNCATE on `watches`, `profiles`, `company_watch_snapshots`; `anon` does not. This makes the existing revocation migration necessary before the other additions. Its transaction aborts if any inherited effective grant survives; ordinary CRUD/RPC access must remain unchanged.
- The targeted new-object collision query covers the sixteen files' 58 new function/rename-target names, six tables and four triggers. Intentional existing function names that are renamed before replacement are excluded from collision reporting.

Classification below describes current deployable effects, not a fabricated historical registry: **0 already applied; 11 pending; 0 detected conflicts; 5 require special handling**. No registry entry was created, repaired or marked applied.

## Exact migration order and per-file classification

Files are in `supabase/migrations/`. Execute only the numbered pending batch, in this order, after explicit authorization. Every file has its own transaction; stop on the first failure. Never run a blind `supabase db push`: with no ledger it could replay older, already-present foundations. Use the reviewed files/checksums through the existing approved database connection and record their actual outcomes in the release record. Any future ledger initialization/repair requires separate authorization and must not guess older migration history.

| Production order | File | Classification / relevant handling |
| --- | --- | --- |
| 1 | `20261013140000_authenticated_truncate_revocation.sql` | Pending. Revoke effective authenticated TRUNCATE first; abort the batch if its postcondition fails. |
| 2 | `20261012120000_structured_watch_definitions.sql` | Pending. Preserve installed legacy validator by rename; add dispatcher/schema helpers and replace/add Watch CHECK constraints. |
| 3 | `20261012140000_structured_watch_confirmation.sql` | Pending. Private mutation receipts, owner/revision checks and service-only persistence; depends on definitions. |
| 4 | `20261012160000_structured_media_completion.sql` | Pending. Preserve existing completion implementations as aliases, wrap and explicitly grant service execution; depends on steps 2–3. |
| 5 | `20261015160000_structured_media_scheduling.sql` | Pending. RLS-protected lease table, service-only claims/completion and revised CHECK; does not itself create a cron job. |
| 6 | `20261015200000_structured_media_notifications.sql` | Pending. Owner-scoped consent RPCs and service-only outbox wrappers; depends on scheduling. No consent backfill. |
| 7 | `20261016150000_media_watch_daily_digest.sql` | Pending. RLS-protected policies/envelopes, claims and consent cutoffs. Existing notification rows receive the legacy immediate-mode default; existing rows are not prepared/sent by the DDL. Keep digest gates inactive. |
| 8 | `20261018170000_structured_article_freshness.sql` | Pending. Replaces Structured completion, preserving baseline/identity/freshness boundaries; depends on steps 5–7. |
| 9 | `20261018180000_role_development_contract.sql` | Pending. Updates definition/query validation contract; depends on definitions and current completion contract. |
| 10 | `20261018183000_role_topic_grounding.sql` | Pending. Role-topic helper/validator update; depends on step 9. |
| 11 | `20261020150000_manual_structured_digest_capture.sql` | Pending. Service-only manual completion adapter; depends on current Structured completion, both consent/policy tables and existing outbox identity constraints. Runtime activation remains separately gated. |
| Excluded | `20261017160000_structured_digest_exact_selection.sql` | Special handling: Staging exact-test selector. Do not include in the initial Production batch or expose test delivery there. |
| Excluded | `20261018160000_scoped_staging_digest_delivery.sql` | Special handling: scoped Staging digest preparation adapter; not a Production recipient/owner policy. |
| Deferred | `20261018195000_staging_digest_morning_deferral.sql` | Special handling: service-only pre-provider Structured claim deferral. Not identity-pinned SQL; retain as a dependency for any separately approved Production Structured digest worker, not as permission to enable it now. |
| Forbidden as-is | `20261020170000_scoped_legacy_staging_digest.sql` | Special handling: freezes one Staging owner's three existing Watches and can abort on a partial match. Never apply this scope to Production. |
| Forbidden as-is | `20261022160000_private_morning_reports.sql` | Special handling: report storage/RPCs hard-code the Staging owner. A reviewed account-isolated Production equivalent is required before Morning Brief activation. |

Safety: these files do not delete/truncate existing data, reset baselines or backfill consent. They are not all purely additive: constraints and RPC/grant contracts change. Preserve owner RLS, explicit service-only execution, controlled security-definer search paths, original legacy aliases, durable notification identities and uncertain-submission boundaries. Unexpected collisions or failed constraint/grant checks must abort that transaction and stop subsequent files. No existing legacy outbox row may be reset, resubmitted or re-enrolled to make a smoke check pass.

## Production environment reconciliation — names/presence/scopes only

Read-only Vercel metadata confirms the Production branch remains `master`. No secret values were read or printed in this follow-up. Presence does not prove credential validity or that an opaque email gate is enabled; preserve current effective behavior rather than guessing its value.

| Names | Verified presence/scope | Release action, only after separate authorization |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Production entries exist; Staging branch overrides exist. Some public/server defaults also have Preview scope. | Preserve Production credentials/project association and Staging overrides. Confirm project association through the authorized owner without exposing values; never copy Staging credentials or expose a service role in `VITE_`. |
| `WATCH_EMAIL_NOTIFICATIONS_ENABLED`, `MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED`, `RESEND_API_KEY`, `WATCH_EMAIL_FROM`, `WATCH_APP_BASE_URL`, `CRON_SECRET` | Production entries exist; separate branch-scoped Staging settings exist. | **No changes required for the disabled-code release.** Preserve existing email gate state, Resend sender/account, app origin, authenticated scheduler and current legacy delivery. Presence-only evidence does not re-verify a sender domain or an inbox. |
| `OPENAI_API_KEY` | Production and Preview entries exist. | Preserve; no AI validation call. |
| `STRUCTURED_WATCH_BACKEND_ENABLED`, `STRUCTURED_WATCH_CREATION_ENABLED`, `STRUCTURED_MEDIA_SCHEDULED_ENABLED`, `STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED`, `STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED` | Staging branch only; absent in Production. | Keep absent/inactive initially. Future controlled activation needs a reviewed Production policy and the migration prerequisites; flags alone are insufficient. |
| `STRUCTURED_WATCH_SIGNING_SECRET` | Staging branch only; absent in Production. | A future approved rollout requires a dedicated server-only Production secret; do not copy a test secret. Optional `STRUCTURED_WATCH_AUTH_TTL_SECONDS` has a code default and is not a missing mandatory credential. |
| `MEDIA_WATCH_DAILY_DIGEST_ENABLED`, `VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED` | Staging branch only; absent in Production. | Keep absent/inactive. Coordinate both only after approved policy/schema rollout; frequency defaults never grant consent. |
| `STRUCTURED_WATCH_TEST_USER_IDS`, `STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED`, `STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS`, `STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS` | Staging branch only; absent in Production. | Never copy or activate these testing scopes as Production rollout settings. Preserve Staging's restrictions. |
| `MEDIA_WATCH_DIGEST_SEND_HOUR_UTC` | No configured entry found in inspected metadata. | Optional generic UTC-hour contract is not a Paris 08:15 schedule. Do not invent a timezone or reuse a Preview scheduler. |

### Remaining non-configurable blocker

`server/structured-creation-access.js` explicitly rejects Production and pins the Staging project. Structured execution/intents inherit it and the test-user list. `server/structured-media-notification-gates.js` pins Preview/branch/project/recipient/origin safeguards. `server/morning-report.js` requires the Staging legacy scope; `src/js/report-sync.js` pins the Staging URL; report SQL pins one owner. There is **no existing Production variable** that safely converts these contracts to general Production operation. Do not invent a flag or remove the safeguards globally. The smallest resolution is a separately authorized, narrowly reviewed portability change preserving the existing feature behavior, owner isolation and Staging restrictions; application changes are prohibited in this task.

## Executable deployment, activation and containment sequence

1. **Decision/authorization boundary:** do not merge this draft while full Structured/Morning Brief delivery is expected from it. Approve the narrow portability resolution first, or explicitly choose an inactive-code-only release. Actual Production DDL, any ledger bookkeeping, environment changes, merge/deployment, new scheduled work and new recurring email activation each require authorization; none is performed here.
2. **Database prerequisite, after authorization:** preserve the current Production deployment and a recoverable database checkpoint using existing facilities. Run only the eleven numbered files above, sequentially, leaving the five special files out as specified. Record per-file success/checksum; verify the revocation postcondition and required RLS/function grants as each affected transaction commits. Do not replay foundations, create test Watches, migrate consent or change outbox statuses.
3. **Deployment, after authorization:** retain current Production variables, credentials, email behavior and `vercel.json` cron. Merge/deploy the reviewed SHA only after its migration prerequisites are satisfied. Vercel can auto-deploy a master merge, so prepare prerequisites before merging. New gates remain inactive; existing legacy/Company/Currency monitoring, users, preferences and delivery remain configured exactly as before.
4. **Single minimal smoke pass, after deployment authorization:** sign in to an existing authorized Production account; read its existing Watches, Home and Watch Detail; verify source/navigation links and existing owner data isolation without creating, editing or checking a Watch. Read the existing scheduler's authorization/configuration and existing run/provider records, without invoking a job or sending an email. Reuse prior Structured/Currency/story Staging evidence; do not launch another compatibility suite. Any mutation or monitoring needed beyond this read-only pass requires separate approval.
5. **Controlled activation, only when implemented and separately approved:** use a reviewed Production policy, a dedicated signing secret and owner-isolated persistence; activate interpretation/execution/capture before any new transport. Existing consent remains authoritative and determines future eligibility; do not backfill a historical queue. New daily delivery/Morning Brief and Paris timing require their own explicit activation/schedule approval and the corresponding Production-safe schema. The checked-in 06:00 UTC cron is unchanged and is not a universal 08:15 Europe/Paris contract. No new infrastructure or release stage is introduced by this plan.
6. **Containment/rollback, if needed and authorized:** stop only newly activated gates/jobs, preserving the pre-release legacy email/scheduler settings. Restore the prior application deployment/configuration. An app rollback does not undo SQL: retain additive tables, consent, Watches, baseline and outbox audit; any wrapper/constraint reversal needs a reviewed database transaction. Never replay sent, cancelled or uncertain provider submissions. If a migration transaction fails, stop immediately; its rollback does not authorize undoing earlier committed files blindly.

**Result:** the registry/schema blocker is resolved into an exact, bounded migration plan. Existing legacy/email safeguards are preserved. PR #56 remains **BLOCKED** solely for the Production portability/activation contract described above; no general verification cycle is requested. No Production data, schema, registry, environment, scheduler or email behavior was changed.
