# PR #56 — Production release plan, 22 October 2026

**Decision: code compatibility FIXED; release remains DRAFT pending the external Paris-time trigger configuration and authorized execution prerequisites.** Explicit opt-in Production paths now exist for Structured interpretation/creation, due execution, consented intent capture and private Morning Brief generation/synchronization. The verified Production migrations and separate activation authorization remain prerequisites. No live Production request, migration, configuration change, merge, deployment or email was performed for this correction.

## Preserved reconciliation and evidence

Master `4536b6a` is an ancestor of preparation HEAD `960922e`. The three master-only merges (#53, #52, #54) were preserved with no application-tree changes. PR #55, unrelated worktrees and local files remain untouched. Existing Staging tests/user evidence, including `docs/digest-pipeline-verification-2026-10-20.md`, are reused. Only the focused boundary checks below were run for this correction; no general compatibility suite, real monitoring check, email, AI call, merge or deployment was performed.

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

Files are in `supabase/migrations/`. The original inventory is retained below; the final fourteen-file manifest governs execution after explicit authorization. Every file has its own transaction; stop on the first failure. Never run a blind `supabase db push`: with no ledger it could replay older, already-present foundations. Use the reviewed files/checksums through the existing approved database connection and record their actual outcomes in the release record. Any future ledger initialization/repair requires separate authorization and must not guess older migration history.

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
| 13 (final manifest) | `20261018195000_staging_digest_morning_deferral.sql` | Special handling resolved: apply unchanged for Production pre-provider deferral, after step 12 and before new step 14. Does not itself authorize transport. |
| Forbidden as-is | `20261020170000_scoped_legacy_staging_digest.sql` | Special handling: freezes one Staging owner's three existing Watches and can abort on a partial match. Never apply this scope to Production. |
| Forbidden as-is | `20261022160000_private_morning_reports.sql` | Special handling: report storage/RPCs hard-code the Staging owner. REPLACE with Production step 12 below; never apply both. |

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

### Code compatibility correction — disabled by default

- `server/structured-production-access.js` adds simple explicit gates using the existing environment conventions, pinned to the intended Production Supabase project, Vercel project, Production environment and master branch. Copied Staging test-owner/recipient/Watch controls fail closed. It does not read browser-supplied owner lists or turn on delivery.
- `STRUCTURED_PRODUCTION_ENABLED` is the new server opt-in. Interpretation/creation still additionally require `STRUCTURED_WATCH_BACKEND_ENABLED` and `STRUCTURED_WATCH_CREATION_ENABLED`; execution additionally requires `STRUCTURED_MEDIA_SCHEDULED_ENABLED` and existing cron authorization. Capture additionally requires `STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED`; existing consent/identity/lease SQL remains authoritative. Execution/capture can operate independently of opening creation or enabling transport.
- `MORNING_REPORT_PRODUCTION_ENABLED` separately gates server report generation and requires scheduler-authorized context. `VITE_MORNING_REPORT_PRODUCTION_ENABLED`, scoped to Production only, selects browser synchronization for the intended Production project. Both are absent/OFF by default. Reports reuse the existing snapshot shape, Home loading/read rules, manual-generation flow and private table/RPC design; no UI changes.
- Production owner IDs come from the new service-only `production_watch_owners` RPC, selecting actual owners of active Watches in the connected Production database. Existing account authentication, per-Watch owner checks, revision checks, signing and role permissions remain required. Staging retains its existing owner/test-recipient/project/branch restrictions and original SQL signatures.
- The new **Production-only manifest addition** is `20261023120000_production_private_reports.sql`, after numbered step 11 above. It installs the same private `watch_reports` design, a service-only owner enumeration/context RPC, authenticated owner-only manual writes/latest reads and service-only automatic writes. It rechecks nested Watch ownership/source revision and preserves one automatic report per owner/Paris day. All direct table grants remain revoked, including service_role, and RLS stays enabled.
- Do **not** apply excluded `20261022160000_private_morning_reports.sql` to Production. The new file does not edit it or broaden installed Staging functions: when the original one-argument Staging report context/table already exists, the new transaction does nothing. An unexpected existing report schema raises an error for review. No migration was applied remotely.
- New Structured intents remain excluded from the existing Production legacy sender, even after opt-in is turned off. The Production-only SQL addition preserves legacy transport-off cancellation while leaving Structured pre-submission intents durable; uncertain-submission handling stays terminal. The existing Staging SQL is unchanged. That initial correction did not authorize transport; the targeted follow-up below adds independent default-OFF Production digest authorization using the same provider-submission path.

**Gate names to add only under later Production authorization:** `STRUCTURED_PRODUCTION_ENABLED`, `MORNING_REPORT_PRODUCTION_ENABLED`, `VITE_MORNING_REPORT_PRODUCTION_ENABLED`. The applicable existing capability flags/signing secret remain separately required; none was configured here. Deployment system identity and credential/project association must be valid; this offline correction does not certify hosted credentials.

**Prior focused evidence, reused (outbound networking blocked):** five new Production-boundary tests cover explicit OFF defaults, project/branch/config isolation, unchanged Staging access restrictions, service-derived owners, missing-context failures, separate capture/transport, cron authorization, account-isolated report writes/reads and SQL uniqueness/ACLs. Four reused report checks pass (Staging composition/private SQL and browser account-switch isolation for Staging and Production). One existing legacy-worker overlapping-claims test passes with its query stub extended for the exclusion predicate. The SQL fixture also verifies authenticated callers cannot query another account's context and legacy maintenance leaves valid Structured pending intents untouched. Ten unique focused tests passed; no full suite or real providers were used. Historical migration files, notification identity/submission implementations, UI and scheduler configuration are unchanged.

## Final migration decisions — no remaining classification ambiguity

Apply the eleven numbered pending files above, then step 12 Production private reports, step 13 existing pre-provider deferral, and step 14 Production digest adapters (manifest below). Historical SQL remains unchanged. Four historical special cases are excluded; the deferral case is now a required dependency:

| Special migration | Dependencies / effect if installed | Final safe action |
| --- | --- | --- |
| `20261017160000_structured_digest_exact_selection.sql` | Step 7; service-only exact-test digest claim adapter; no row backfill in DDL. | **EXCLUDE**: only the Staging test route consumes it. |
| `20261018160000_scoped_staging_digest_delivery.sql` | Step 7; service-only test-scope preparation function; invoking it can assign pending rows to envelopes. DDL does not enroll rows. | **EXCLUDE**: test owner/Watch scope is not Production policy. |
| `20261018195000_staging_digest_morning_deferral.sql` | Step 7; service-only pre-provider claim deferral; not identity-pinned, but consumed by Staging Structured delivery. No DDL data changes. | **APPLY at step 13**, unchanged: the new Production digest mode reuses this exact safe pre-provider release contract. It does not authorize a recipient or submit email by itself. |
| `20261020170000_scoped_legacy_staging_digest.sql` | Steps 4–7; evaluates/fixes one Staging owner and three Watch identities, aborts on partial match; installs test legacy completion/digest functions. | **EXCLUDE as-is**; never substitute Production identities or alter Watches to satisfy its scope. Existing legacy immediate delivery needs no replacement. |
| `20261022160000_private_morning_reports.sql` | Scheduling plus Staging legacy adapters; creates report table/RPCs restricted to one Staging owner. | **EXCLUDE / REPLACE with step 12**, which uses actual Production owner context. No transfer of Staging reports/data/consent. |

Step 12 also replaces the maintenance function while preserving legacy cancellation and uncertain-provider outcomes and protecting Structured pending intents. It does not invoke maintenance or change notification statuses during DDL. The file's existing-Staging-schema no-op must **not** count as Production success: require its owner enumeration and two-argument context RPC afterward. Unexpected existing report schema is a stop condition.

### Exact fourteen-file manifest

Files are in `supabase/migrations/`; sequence overrides timestamp sorting. SHA-256 pins unchanged reviewed SQL:

| Order | File | SHA-256 |
| --- | --- | --- |
| 1 | `20261013140000_authenticated_truncate_revocation.sql` | `edc44bd37118f6c7058e4a385c1316c54af52f7b8b46c491a09114896943cfa3` |
| 2 | `20261012120000_structured_watch_definitions.sql` | `01072e7a5207067e5d62a5d46dec233dd5267d4d658d9ff1352fc80819ad960f` |
| 3 | `20261012140000_structured_watch_confirmation.sql` | `55e7c68d5b8e7f9b2569933aad264a6af44eabde59b9a916643d3ff07e8fccc2` |
| 4 | `20261012160000_structured_media_completion.sql` | `6fae01489fbe6a488c2924f1103e574c8f912c2dc7d26e1a8b3ce5328fe44dab` |
| 5 | `20261015160000_structured_media_scheduling.sql` | `ee7b72fee7d248d3dfcc5918a483b06baa75a2a57329174555844f711d1bf727` |
| 6 | `20261015200000_structured_media_notifications.sql` | `a9644c293b3e5efb62db7abbb562cc8a147230510ea2f235ba64d9c62e6a439b` |
| 7 | `20261016150000_media_watch_daily_digest.sql` | `ff373da551e675a4e948be3c9b60d3d7f5430a3d3cfdb3813f58c9d46c415fea` |
| 8 | `20261018170000_structured_article_freshness.sql` | `296ba1c9412ca77da9aec3f8d09fce221483907793d17246eb8f86218efd515b` |
| 9 | `20261018180000_role_development_contract.sql` | `cd2239b140c8b1ce1347563adac67db2a25b22b5087cc28cd2a11b2541e48e0f` |
| 10 | `20261018183000_role_topic_grounding.sql` | `9a0594eaaa2c14909231bd25c17ffb54abe550f7392749f2e1809e5094ed47d7` |
| 11 | `20261020150000_manual_structured_digest_capture.sql` | `907a7e24cb6af825346b39d5b1e09aeb22524de14e459cb696d9e004be7b8b1e` |
| 12 | `20261023120000_production_private_reports.sql` | `e27dc35368f5ae7052506ead262a4476d54011e31e28bbdfe0abc6c5e4aa9a20` |
| 13 | `20261018195000_staging_digest_morning_deferral.sql` | `8d559c7817fb79809dd639600ca84c8a47be39c2af68d2c480719b1239ed6b47` |

| 14 | `20261023140000_production_structured_digest_delivery.sql` | `50a486c74df6e9d5e29ff6d8cb1aefacee5233153a628a8ba90927fb19c71cfd` |

### Registry and apply recipe — future authorized execution only

Reuse the already verified catalog/collision/rename prerequisites. Missing registry does **not** mean empty schema. Keep the registry absent: no `db push`, migration-history repair, fabricated applied versions or replay of older foundations. Record approved SHA, per-file checksum, UTC transaction outcome and postconditions in a private external execution journal. On uncertain connection outcome, compare installed function bodies/constraints/ACLs to that file before retry; object-name presence alone is insufficient.

Use clean approved PR checkout, PostgreSQL 17, the existing TLS endpoint/project login, official CA and mode-0600 `.pgpass`. Do not reuse the old currency release helper: its manifest belongs to another release.

```sh
APPROVED_HEAD=REPLACE_WITH_APPROVED_FULL_PR56_HEAD
PGTOOLS=/opt/homebrew/opt/postgresql@17/bin
CA_PATH=/Users/davidlang/documents-local/watch-assistant-backups/production-20261001T121222Z/supabase-ca.crt
test "$(git rev-parse HEAD)" = "$APPROVED_HEAD" || exit 1
test -z "$(git status --porcelain)" || exit 1
unset PGPASSWORD PGSERVICE PGHOSTADDR
export PGHOST=aws-1-eu-west-3.pooler.supabase.com PGPORT=5432
export PGUSER=postgres.cztpitujsnzhhenedwjn PGDATABASE=postgres
export PGSSLMODE=verify-full PGSSLROOTCERT="$CA_PATH" PGCONNECT_TIMEOUT=10
export PGPASSFILE="$HOME/.pgpass"
export PGOPTIONS='-c lock_timeout=3s -c statement_timeout=60s'
# After backup and disabled configuration below, repeat for ONE numbered file:
# Set MIGRATION_FILE to its repository-relative path; compare checksum to manifest.
shasum -a 256 "$MIGRATION_FILE"
"$PGTOOLS/psql" -X -w -v ON_ERROR_STOP=1 -f "$MIGRATION_FILE"
```

Each file already contains BEGIN/COMMIT. Execute sequentially, stop on first failure/timeout; do not wrap in automatic history tools. Confirm project/login before DDL. Avoid 06:00 UTC scheduled work, other due workers and administrative DDL; no schedule change or terminating competing sessions. CHECK scans/locks can briefly block writes. Do not raise timeouts to force success. Earlier committed files remain installed if a later transaction fails.

## Final configuration reconciliation and activation order

Read-only Vercel Production metadata reconfirmed on 22 October (names/types/scopes only; no decryption). All previously documented Production credentials remain present. `VITE_AUTH_MODE` and `VITE_AUTH_OTP_RESEND_SECONDS` also exist and remain untouched. No new gate is incorrectly scoped: all new gates below are absent Production. Existing shared Production/Preview defaults and branch overrides stay intact.

| Capability | Exact variables / identity | Production presence; required action after authorization |
| --- | --- | --- |
| Supabase isolation | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | All present; preserve current scopes/credentials. Intended project `cztpitujsnzhhenedwjn`; never copy Staging keys/URLs. Service role never public/VITE. |
| Platform identity | `VERCEL_ENV`, `VERCEL_PROJECT_ID`, `VERCEL_GIT_COMMIT_REF` | Platform-injected, not missing user vars. Require production / `prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF` / master. Do not create spoofing overrides. |
| Structured interpretation/creation | `STRUCTURED_PRODUCTION_ENABLED`, `STRUCTURED_WATCH_BACKEND_ENABLED`, `STRUCTURED_WATCH_CREATION_ENABLED`, `STRUCTURED_WATCH_SIGNING_SECRET`; existing `OPENAI_API_KEY` | First four absent, AI key present. New dedicated server-only Production signing secret (at least 32 random bytes, never print). Initially three gates `false`; supported activation sets three `true` after migrations/deployment. No additional browser Structured flag. Optional `STRUCTURED_WATCH_AUTH_TTL_SECONDS` retains 300-second code default. |
| Structured execution/automatic monitoring | `STRUCTURED_MEDIA_SCHEDULED_ENABLED`, Production root, existing `CRON_SECRET` | Flag absent: initially `false`, then `true` only for approved supported media execution. Existing normal authenticated cron already invokes Structured runner before legacy media work; no new endpoint/infrastructure required. Claims due media Watches; does not imply support for every Structured domain or increase cadence. Legacy cron has no new global monitoring flag. |
| Consented intent capture | `STRUCTURED_MEDIA_NOTIFICATION_INTENTS_ENABLED`, Production root | Absent: initially `false`, then approved `true` for future completed checks under existing owner/consent/revision rules; no backfill. |
| Legacy delivery | `WATCH_EMAIL_NOTIFICATIONS_ENABLED`, `MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED` | Present: preserve exact effective values and current immediate delivery; names/presence alone do not reveal gate state. |
| Digest capture/UI/generic legacy delivery | `MEDIA_WATCH_DAILY_DIGEST_ENABLED`, `VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED`, optional `MEDIA_WATCH_DIGEST_SEND_HOUR_UTC` | Absent: **backend remains absent/OFF** to preserve legacy completion/delivery routing. Existing browser flag can be explicitly enabled for existing consent/frequency UI; no preference backfill/default change. Production Structured transport uses its separate mode below; UTC-hour configuration does not control that mode. |
| Structured Production digest | `STRUCTURED_MEDIA_PRODUCTION_DIGEST_ENABLED`, `STRUCTURED_MEDIA_PRODUCTION_DIGEST_ELIGIBLE_AFTER`, `STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED` plus root/global email gates | New settings default absent/OFF. After steps 13–14 and deployment, authorize both transport flags true and set eligible-after to that activation’s UTC ISO timestamp (seconds or milliseconds plus Z). No pre-activation queue enrollment. Existing global email gates must already be true; never turn on legacy delivery as a side effect. Dedicated origin pin is `https://watch-assistant-omega.vercel.app`. Stage controls stay absent. |
| Private automatic Morning Brief | `MORNING_REPORT_PRODUCTION_ENABLED` | Absent: initially `false`. Enable only with the external Paris-time invocation described below, after due Structured work completes within 08:00–08:30 Europe/Paris. This generates report data, not email. |
| Private browser report sync | `VITE_MORNING_REPORT_PRODUCTION_ENABLED` | Absent: initially `false`; activate with server gate after step 12 only after the external Paris trigger prerequisite below holds. Requires new browser build; owner isolation enforced by RPC, not public flag. |
| Resend / app links | `RESEND_API_KEY`, `WATCH_EMAIL_FROM`, `WATCH_APP_BASE_URL` | All present: preserve provider account/sender/current Production origin; no new key/domain/test send. |
| Scheduler auth | `CRON_SECRET` | Present: preserve Bearer auth/secret and existing `0 6 * * *` job. No manual cron invocation or schedule change in preparation. |
| Prohibited test controls | `STRUCTURED_WATCH_TEST_USER_IDS`, `STRUCTURED_MEDIA_STAGING_EMAIL_TEST_ENABLED`, `STRUCTURED_MEDIA_STAGING_EMAIL_RECIPIENTS`, `STRUCTURED_MEDIA_STAGING_DIGEST_WATCH_IDS` | Absent Production: remain absent/empty, **not string `false`**, because Production guard rejects any nonempty value. Preserve branch-only Preview values. |

New settings must be Production-only. Presence does not certify credential validity; no test provider call requested. Vercel env edits apply to subsequent deployments, not already deployed immutable builds: activation needs deployment of the same approved application revision, including rebuild for public VITE flag. Preserve unrelated settings.

## Backup and recovery procedure — prerequisite before schema mutation

Existing verified 1 October backup/restore evidence establishes a reusable method, **not a fresh recovery point**. Reuse `docs/currency-migration-state-audit.md` and private `/Users/davidlang/documents-local/watch-assistant-backups/production-20261001T121222Z/RESTORE.md`; the latter's historical migration-registry warning was superseded by the reviewed direct-file procedure above. Do not reuse its old apply guard.

1. After release authorization, create a fresh private directory outside Git (`umask 077`, directory 0700). Record current deployment/merge SHA, names/scopes and secure configuration recovery references, UTC recovery point and coverage. Credentials/backup data stay private.
2. Reuse PostgreSQL 17 exported REPEATABLE READ snapshot workflow: keep snapshot-exporting read-only transaction open through archive and source fingerprints. In another connection run `pg_dump --format=custom --snapshot=EXPORTED_SNAPSHOT --lock-wait-timeout=3s --file=PRIVATE_ARCHIVE` with fixed TLS Production connection above; capture source data fingerprints/counts from the same snapshot. Capture roles separately with `pg_dumpall --roles-only --no-role-passwords`; avoid concurrent administrative DDL. Hash archive and role files. Close exporting transaction without mutation.
3. Restore fresh archive to a **new isolated Unix-socket-only local PostgreSQL 17 cluster**, using documented role/extension/schema/ACL handling in private `RESTORE.md`. No app, Auth, cron, SMTP or network workers. Compare public/Auth fingerprints, sequences, owners, functions, constraints, ACLs and RLS. Stop before DDL on restore/coverage mismatch or unavailable private recovery access. This verifies backup recoverability, not another application test suite.
4. Retain old/new archives privately. Confirm current Storage/Vault/external-service recovery coverage; historic zero counts are not proof of current absence. Logical archive excludes passwords/platform settings/external assets; do not claim whole hosted-project disaster recovery.
5. Recovery uses the archive in an **isolated recovery database**, followed by reviewed forward repair of selected definitions/current records. Never restore old backup over live Production or erase newer user/notification state. Whole-project disaster recovery requires the platform's verified facilities and incident authorization. Application rollback cannot undo SQL.

## One ordered release checklist — no execution during this preparation

One explicit future authorization can cover this checklist and its bounded containment; no additional approval stages are imposed.

1. **Pin/recover:** approve full PR head (compatibility `9db0e9a` plus docs-only descendant), record current master/deployment/config recovery references; complete fresh backup/isolated restore above. Reuse existing audit; recheck only targeted prerequisite drift if intervening DDL occurred. Stop on incompatible drift, not broaden investigation.
2. **Prepare OFF:** preserve existing Production/Preview creds, legacy gate states/sender/cron. Provision dedicated Production signing secret and needed new gates `false`; digest/transport remain absent/OFF until the final explicit activation contract below. No activation before migration/deploy.
3. **Apply SQL:** execute fourteen checksum-pinned transactions in exact order. Exclude the four historical test/single-owner files; apply the unchanged special deferral file only at step 13. Keep registry absent; external outcome journal only. No Watch, consent, baseline or queue mutations to prepare release.
4. **Minimal SELECT-only database checks:** validate reviewed renamed aliases/wrapper bodies, CHECK constraints validated, existing and six new private tables RLS, no anon/authenticated effective TRUNCATE on protected three tables. Inspect explicit least-privilege ACLs: mutation/completion/claim/owner-context RPCs service-only; reports latest authenticated-only, save authenticated/service with owner checks; no direct report grants even service; no private receipt/schedule/envelope table access, existing own-policy SELECT retained. Require `production_watch_owners()` and `morning_report_context(uuid,timestamptz)` installed (not Staging no-op). Preserve October 30 least-privilege readiness: explicit required GRANTs only, no blanket/schema/default grant expansion. Compare existing data fingerprints; only documented added notification column defaults or independently evidenced normal concurrent activity may differ. DDL alone creates no consent, report, digest or historical notification rows. Use migration schema reload notifications; after final step an authorized `NOTIFY pgrst, 'reload schema'` may refresh new RPCs. Failed data/security postcondition blocks merge.
5. **Merge/disabled deploy:** verify exact PR head/base/checks/checksums; only after authorization mark draft ready for bounded scope. Use `gh pr merge 56 --repo langer-nice/watch-assistant --squash --match-head-commit "$APPROVED_HEAD"`. Record resulting merge SHA. Master Git integration creates Production deploy; wait for same SHA Ready/assigned to alias, no duplicate deploy. All new gates OFF.
6. **Supported activation:** after successful disabled deployment, set approved root/backend/creation/execution/capture gates `true`. Reports server/browser gates stay OFF unless existing invocation meets Paris window. Deploy same reviewed merge SHA with that config (VITE requires rebuild). Existing normal cron owns due checks; do not add overlapping worker. Transport remains OFF until its separately explicit activation, eligibility cutoff and Paris trigger are in place; generic backend digest remains OFF. No historical drain. If window unmet, report partial release instead of claiming automatic reports work.
7. **One minimal actual smoke observation:** read authenticated existing media/company/report GETs, deployment/project identities, Watch Detail and account isolation. Avoid agent browser initialization that might sync pending local edits; owner can use their clean session. Observe next existing scheduled run logs and durable completion records, without manual checks, synthetic Watches, provider/AI calls or test email. Report per-owner/day automatic row and cross-account read denial only if an actual in-window run exists; otherwise outcome unavailable/pending. Observe normal existing legacy Resend records for actual delivery evidence, never send a test or replay backlog.
8. **Protect emails/users throughout:** preserve consent cutoffs, recipient ownership, revision gates, unique article/digest identities, atomic claims/leases, idempotency and terminal uncertain submissions. Legacy pending queue continues original behavior; do not change sent/failed/cancelled/unknown rows or re-enroll historical articles. Production legacy sender excludes Structured pending intents even when root OFF. Capture affects future checks only; new Structured transport is enabled solely through the final explicit gate/cutoff contract below, with no legacy permission expansion.
9. **Failure/containment:** precommit failure rolls back that file; stop later files. Earlier commits require forward recovery, no blind DDL undo. Merge/deploy failure leaves compatible schema with gates OFF. Post-activation failure: redeploy same reviewed code with only new gates OFF, preserving legacy cron/email. Prior application/config rollback is reversible only before new Structured definitions are persisted; afterward prefer current code OFF and a targeted forward fix, because old clients cannot represent new definitions safely. Never drop data, reset baselines/consent, replay uncertain notifications or restore database wholesale. Lost connection: verify actual commit state before retry. Record exact last successful step.

## Targeted scheduling / delivery correction — final activation contract

Only two compatibility blockers are corrected. Existing Staging guards, renderer/templates, legacy sender path, ordinary cron, UI, consent defaults, Watch intervals and historical migrations remain unchanged.

- **Morning scheduling:** existing authenticated `/api/cron/company-monitoring` gains `scope=structured-morning`, Production-only behind report or transport opt-in. Outside 08:00–08:30 Paris it does no work. Inside, it drains only existing due Structured leases (same intervals/claims), composes the existing private report from stored results, then at/after 08:15 invokes the existing digest processor in explicit Production Structured mode. Report failures do not consume notifications or grant transport. The normal 06:00 UTC legacy cron remains unchanged.
- **Latest available results:** step 14 adjusts only Production report context's no-Structured-schedule branch: already-completed legacy results can be included without forcing extra legacy checks after 08:00. Existing report `partial`/failure/checked-at classifications preserve stale or failed evidence; no freshness is invented. Never-checked legacy Watches and required pending/failed/in-flight Structured work still block composition. Private ownership, source revision fence, immutable owner/Paris-day report, Home sync and manual reports stay unchanged.
- **Production transport:** `getStructuredMediaProductionDigestConfig` requires new opt-in, existing Structured/root/global email gates, exact Production identity/origin, and a valid nonfuture activation cutoff. It cannot activate Staging or immediate Structured delivery. The digest processor defaults to its previous behavior; only the new authenticated scope requests Production Structured mode. Real owner IDs come from service RPC; recipient comes from Supabase Auth and must have matching user ID and confirmed email. No test-recipient/owner/Watch list is used.
- **Eligibility/duplicates:** new service-only preparation/claim adapters retain the same envelope table, owner/consent policy, frozen membership, atomic claim/begin/finish RPCs, per-Watch/day uniqueness and provider idempotency. Selection is limited by the later of explicit activation, per-Watch consent cutoff and previous Paris morning 08:15. Legitimate previous-evening updates remain eligible; older backlog is never assigned or replayed. Period is current Paris day; during permitted morning send window it is also the existing UTC period date, preserving existing identity. Empty membership causes no email. Previously submitted/failed/uncertain envelopes never become eligible again. Retries before provider invocation reuse unchanged step 13; after possible submission, unknown outcome remains terminal.
- **Migration 14:** `20261023140000_production_structured_digest_delivery.sql` creates two RPC-only adapters with explicit service-only EXECUTE and empty search paths, no tables/direct grants/data backfill. It updates only the Production two-argument report context; installed Staging one-argument context makes this migration a no-op. Missing prerequisites or unexpected context contract abort. No hosted SQL was applied.

### External scheduler configuration required — NOT performed

Use the **existing cron-job.org account/service**, a Production-only task (do not edit Staging tasks), with:

- URL: `https://watch-assistant-omega.vercel.app/api/cron/company-monitoring?scope=structured-morning`
- Method: **GET**; header **Authorization: Bearer [existing Production CRON_SECRET]**, stored privately in scheduler, never printed or embedded in URL.
- Timezone: **Europe/Paris**; daily at **08:00 and 08:15** (custom hour 8, minutes 0 and 15, all dates). Optional bounded retries **08:20 and 08:25** use the same task/window for transient errors or additional existing ten-Watch batches; no manual replay or post-window catch-up. Keep execution overlap disabled where supported; SQL leases/uniqueness remain authoritative regardless.
- Keep the checked-in normal `0 6 * * *` legacy job and all existing Staging tasks unchanged. No new infrastructure, UTC-offset switching or monthly DST edit. Never trigger a test/manual run for preparation.

At 08:00 the route can compose but **cannot send**; 08:15 is the first allowed delivery tick. Europe/Paris windows are independently enforced in application and Production SQL, including 25 October 2026 and 28 March 2027 transitions. A scheduler trigger is not a guarantee of exact provider arrival; slow/incomplete work remains pending/partial, never reported fresh. Without this external configuration, automatic year-round operation is **not** ready.

### Updated authorized-execution sequence

The backup/TLS/direct-file/registry/recovery procedure above remains required. Apply **fourteen** transactions, not twelve: unchanged original eleven, private reports (12), unchanged deferral dependency (13), new Production adapters (14). Do not apply any of the other four special files. Verify new service-only adapter ACLs and Staging no-op alongside existing postconditions.

Prepare all new gates OFF, perform migrations, merge/deploy exact authorized SHA OFF, then configure the external Paris task and explicitly activate supported capabilities on the same reviewed application revision. Add `STRUCTURED_MEDIA_PRODUCTION_DIGEST_ENABLED=true`, `STRUCTURED_MEDIA_EMAIL_NOTIFICATIONS_ENABLED=true`, and `STRUCTURED_MEDIA_PRODUCTION_DIGEST_ELIGIBLE_AFTER=ACTUAL_ACTIVATION_UTC_ISO`. Root, execution and consented-intent gates must be enabled for new monitoring/capture; daily consent remains a separate user action, never a backfill. Set server/browser report gates together and optionally enable existing public digest frequency UI via `VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED=true`. Keep **server** `MEDIA_WATCH_DAILY_DIGEST_ENABLED` absent/OFF so generic legacy routing is unchanged. Production sender credentials/global gate states are preserved; if existing global gates are OFF, stop instead of broadening legacy permissions. Build/deploy activation config (public VITE values need rebuild); no change affects the current immutable deployment retroactively.

After authorization, observe one normal morning sequence and existing durable report/claim/provider outcomes. No synthetic Watch/test email/historical drain. If more work than existing bounds remains, report that outcome and use only scheduled in-window retries. Rollback disables new Production digest/report/root gates, retaining legacy sender/cron; never move eligibility cutoff backward, re-enroll outboxes or retry uncertain submissions. Existing additive schema stays for forward recovery.

### Essential focused evidence and remaining decision

Outbound networking blocked. **Nine unique focused checks passed:** four new window/auth/report/gate/recipient/submission mocks; three reused Staging guard/disabled-mail and Production legacy exclusion checks; one enhanced Production SQL fixture for real ownership, consent-off exclusion, independent Watches, pre-activation/historical membership rejection, atomic duplicate claim and terminal unknown outcome; one existing Staging private-SQL case confirms the new migration is a no-op there. Only the failed SQL case was rerun after correcting an alias; no full suite or live source/AI/provider/database call. Prior ten compatibility tests remain reused evidence, not rerun.

**Code compatibility FIXED; CET/CEST VERIFIED locally; all new transport OFF by default.** The single remaining operational dependency is configuring the existing external scheduler as specified, together with already documented authorized migration/deployment/activation execution. PR stays DRAFT; no claim of hosted delivery/report operation. Next decision: authorize the exact fourteen-migration / scheduler-configuration / deployment-and-activation procedure. No merge, deploy, hosted migration, env/scheduler change, Watch mutation or email was performed here.
