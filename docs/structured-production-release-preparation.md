# Structured release preparation — 22 October 2026

**Decision: BLOCKED.** This document prepares the development → master PR; it does not authorize a merge, deployment, migration, configuration change or email.

## Branch reconciliation

- Comparison refreshed once: development `0ae0e263db00c75d01d6dab48fc7d25a3a5b013c`, master `4536b6ac83a491752f209afd3fe4b48e36eb509e`; 60 development-only / 3 master-only commits, 201 files.
- Master-only commits are merges #53 (`64c16e3`, media-provider query), #52 (`d7f52ba`, recurring-alert policies), #54 (`4536b6a`, email notice loading). Their constituent changes were already in development. A clean merge of master was performed in an isolated worktree; application tree remained exactly `ac1facacf0f695b9551de57ee89ed1da4143fffd`.
- Master is now an ancestor of the release branch. No conflict resolutions, application edits or Production history rewrites were necessary. PR #55 and unrelated PRs/worktrees/local changes were untouched.
- The only preparation changes after reconciliation are this checklist and the stale layout-test assertion: expanded Watch settings is a section, not the removed accordion.

## Genuine release blockers / minimum corrective work

1. **Production rollout is not implemented by environment configuration alone.** `server/structured-creation-access.js` explicitly excludes Production and pins the Staging Supabase URL. Structured scheduling/intents inherit that guard and the test-owner list. `server/structured-media-notification-gates.js` pins Preview, branch, project, recipient restrictions and origin. These are deliberate safeguards; do not remove them globally or copy their values to Production. A separately reviewed Production policy is required.
2. **Automatic Morning Brief / 08:15 release is still Staging-scoped.** `server/morning-report.js` requires `stagingLegacyEnabled`; `src/js/report-sync.js` pins the Staging URL; `20261022160000` hard-codes one Staging owner in its report RPCs. `20261020170000` freezes three Staging legacy identities. The Paris 08:15 window exists in code, but the only checked-in cron is `0 6 * * *` (06:00 UTC), unchanged from master; no new Production 08:15 or hourly scheduling is authorized. Do not describe this as general multi-user Production automation.
3. **Hosted database release plan cannot be certified yet.** Read-only ledger/schema inspection was attempted with the installed Supabase CLI credential; keychain access timed out before any database request. Production migration versions, constraint compatibility and effective grants therefore remain unverified. Reconcile the actual ledgers and approve a Production-safe migration manifest before applying anything. Retained Staging artifacts confirm scoped-digest/deferral migrations were applied, and the deployed Morning Brief release used the new report schema; these are historical evidence, not a current complete ledger.

## Migration manifest (repository delta, not an instruction to apply)

The following 16 files are absent from master. Hosted application status must be reconciled; do not replay an already-applied migration or an older schema-equivalent file.

- `20261012120000_structured_watch_definitions.sql`
- `20261012140000_structured_watch_confirmation.sql`
- `20261012160000_structured_media_completion.sql`
- `20261013140000_authenticated_truncate_revocation.sql`
- `20261015160000_structured_media_scheduling.sql`
- `20261015200000_structured_media_notifications.sql`
- `20261016150000_media_watch_daily_digest.sql`
- `20261017160000_structured_digest_exact_selection.sql`
- `20261018160000_scoped_staging_digest_delivery.sql`
- `20261018170000_structured_article_freshness.sql`
- `20261018180000_role_development_contract.sql`
- `20261018183000_role_topic_grounding.sql`
- `20261018195000_staging_digest_morning_deferral.sql`
- `20261020150000_manual_structured_digest_capture.sql`
- `20261020170000_scoped_legacy_staging_digest.sql`
- `20261022160000_private_morning_reports.sql`

Dependencies: the existing master foundations/media/currency migrations are prerequisites. Rehearse the `20261013140000` TRUNCATE revocation security prerequisite before the Structured rollout, as its header requires; then preserve the ordered dependency chain: definitions → confirmation → completion → scheduling → notification preferences → daily-digest policies/envelopes → later wrappers/selectors → reports. Do not blindly use timestamp order as approval to replay SQL.

Safety assessment from committed SQL: new tables use RLS and restricted grants/RPC access; security-definer paths set a controlled search path and check owners/roles. The security prerequisite revokes TRUNCATE without performing it. No top-level DELETE/TRUNCATE, table drop, user consent backfill or scheduler creation was found in these migration files. This is **not** a claim that every migration is purely additive: existing Watch CHECK constraints are dropped/replaced, completion/claim functions are renamed and wrapped, and privileges change. Existing Production rows and effective grants must satisfy the new checks before release. Staging-scoped selectors/report functions require an explicit portability decision; the legacy-scope migration can abort on a partial match of its pinned Staging identities. Never transplant test identity rules into a general Production rollout.

## Production configuration contract

Read-only Vercel inspection verified the `master` Production branch and existing deployment `dpl_GSpKU4r3bJzXwKLzTvB5R1jbAqhu`. Preview and Production browser Supabase origins are distinct. Secret values were not printed or copied; several Production values are configured but unreadable, so their correctness is not certified.

| Configuration | Current Production evidence / release requirement |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://cztpitujsnzhhenedwjn.supabase.co`; retain this project, never Staging `tseexvbwhrtofcsrvcqc`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Configured but unreadable. Verify they belong to the Production project; retain server-only service-role access. Browser anon key is configured. |
| `STRUCTURED_WATCH_BACKEND_ENABLED`, `STRUCTURED_WATCH_CREATION_ENABLED`, `STRUCTURED_MEDIA_SCHEDULED_ENABLED`, `STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED`, `STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED` | Absent in Production. Keep disabled until the Production policy, schemas and authorization are approved. Enabling them alone cannot bypass the explicit Staging guards. |
| `STRUCTURED_WATCH_SIGNING_SECRET`, `STRUCTURED_WATCH_AUTH_TTL_SECONDS` | Signing secret absent; TTL defaults to 300 seconds. A future authorized rollout needs a dedicated server-only secret; never expose `VITE_STRUCTURED_WATCH_SIGNING_SECRET`. |
| `STRUCTURED_WATCH_TEST_USER_IDS`, `STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED`, `STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS`, `STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS` | Staging test restrictions; absent in Production. Do not copy owner/recipient/Watch allowlists or enable test delivery in Production. |
| `MEDIA_WATCH_DAILY_DIGEST_ENABLED`, `VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED` | Absent in Production. Preserve current behavior; enabling changes creation/preferences/delivery contracts and needs migrations plus separate approval. |
| `WATCH_EMAIL_NOTIFICATIONS_ENABLED`, `MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED`, `RESEND_API_KEY` | Configured but values unreadable. Keep exactly as currently configured; no claim that gates are enabled or inbox delivery verified. Do not replace with Staging credentials. |
| `WATCH_EMAIL_FROM` | Configured. Future release must verify the existing sender is valid under `normalizeWatchEmailSender` and verified in the Production Resend account. No sender change or test email performed. |
| `WATCH_APP_BASE_URL` | `https://watch-assistant-omega.vercel.app`; preserve it. Never use the Preview branch alias in Production emails. |
| `CRON_SECRET` | Configured, unreadable. Preserve it and existing Bearer authentication. No scheduler invoked or changed. |
| `MEDIA_WATCH_DIGEST_SEND_HOUR_UTC` / Paris timing | No new schedule approved. Generic digest fallback is a UTC-hour policy; it must not be presented as the separately gated Staging Paris 08:15 behavior. General Production timing remains a rollout prerequisite. |
| `OPENAI_API_KEY` | Configured, unreadable. No AI calls made. |

Keep `vercel.json` Production cron unchanged and its existing branch auto-deployment suppression. A merge to master may automatically deploy on Vercel; therefore merging is a release boundary, not a harmless way to stage the pending prerequisites.

## Compatibility and reused evidence

- Existing Production legacy, Company and Currency routes remain; new Structured execution and email test scopes fail closed under Production guards. Daily-digest policies default disabled and do not grant consent. This protects disabled-rollout compatibility but does not prove the complete new feature set is Production-ready.
- No users/Watches, identities, baseline, preferences, outbox records or database data were touched. Existing immediate email behavior must remain configured as-is; no recurring Production email activation is part of this PR.
- Reused: `docs/digest-pipeline-verification-2026-10-20.md` records 16 passing real-pipeline/SQL tests with an offline provider, including consent OFF, preserved pending articles, lease recovery, CET/CEST and duplicate-submission protection. It explicitly distinguishes test-provider evidence from live inbox delivery.
- Reused: Staging user delivery evidence and the existing targeted Structured, URL/story, Currency, notification-policy and report tests in the branch. Latest Staging app SHA `0ae0e26` is READY at the stable branch alias; recent FR/EN Watch Detail, navigation, links and keyboard checks were already completed. No full-suite or duplicate UX validation was run here.
- New essential check: merge simulation and real merge preserved the application tree exactly; `master` ancestry confirmed. One corrected layout assertion passed with `node --no-maglev --test --test-name-pattern='Watch Detail presents operational status' src/js/watch-detail-layout.test.js`. No conflict-specific runtime tests were needed because there were no content conflicts.
- **Compatibility decision: legacy evidence reused; complete legacy + Structured Production release BLOCKED** by the portability/configuration/schema prerequisites above. Historical Staging success must not be relabeled as Production verification.

## Release/rollback decision

- [x] Master changes incorporated without application changes; one release PR only.
- [x] Migrations/configuration dependencies identified; existing evidence reused.
- [ ] Verify actual hosted ledgers, row compatibility, RLS and effective grants; approve the Production migration manifest.
- [ ] Review a Production-safe rollout for Structured and account-scoped Morning Brief/08:15 behavior, keeping emails/schedules unchanged until explicitly approved.
- [ ] Explicit merge and Production release approval after blockers are closed.

Rollback: retain the previous Production deployment and unchanged environment configuration. Revert/promote application code only under a separate release authorization; an application rollback does not reverse SQL. Preserve additive data and audit history; do not drop tables, reset consent/baselines, replay old notifications or resend uncertain submissions. Constraint/function-wrapper reversions require their own reviewed database plan. No Production rollback was performed.

**Next action:** complete one reviewed Production portability-and-migration plan before changing this draft PR to ready for merge. No Production deploy, migration, environment update, scheduler change or email has been authorized or performed.
