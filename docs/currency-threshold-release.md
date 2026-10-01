# Currency threshold release — PR #47

Prepared 2026-10-01. Production execution is **not authorized** by the preparation task. No production migration, merge, deployment, Watch check, cron invocation or notification was performed. The original Watch remains unverified.

## Review and evidence

Initial PR head: `c9d2d1dcd97b9910c400e67d782ab790120d1671`; base `master`: `aeb09ef6c7977d8a453b807877a644fd2042fc9e`. No intervening commits or base conflicts were found. GitHub records production deployment 6740858258 as successful at that base SHA (2026-09-29). This does not prove the production alias, configuration or database state today; those remain execution-time prerequisites.

The request parser is authoritative on creation/edit and normalizes `1,17` to `1.17`. The source is a fixed ECB XML endpoint; `1 GBP >= 1.17 EUR` is compared with ECB's EUR→GBP decimal by integer cross multiplication. The displayed reciprocal is truncated to 12 places with an approximation sign, never used to decide whether the threshold is met. Relevant edits create a new condition UUID and invalidate the evaluation. Browser definition guards and database revision/snapshot comparisons reject obsolete checks. Manual and scheduled checks use the same evaluator; first-match detection and condition event IDs prevent repeat/dip/rebound duplicates. Scheduled notifications reuse the existing claimed, idempotent outbox and feature flags. Manual checks do not send email. Failure remains distinct from a successful below-target observation.

No new product-code defect was confirmed in this review. Preparation adds an upgrade/failure/retry regression test, guarded SQL generation, read-only verification, more holiday/DST cases, and explicit English/French browser assertions for reference-rate/non-live wording.

Current local validation, rerun after these additions:

- `NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' npm test`: **1,117 passed**, zero failed/skipped. Includes real PostgreSQL semantics through PGlite, existing generic/company regressions, currency API/persistence/cron/outbox tests and the upgrade test.
- Upgrade test seeds company and feed Watches on the preceding schema, exercises the old persistence RPC before and after migration, compares complete existing Watch rows and RLS policies, checks PT409 and service-only completion permission, injects a pre-commit failure and verifies rollback, then verifies successful application and safe rejection of a second application. The generated release SQL and read-only SQL both execute in that isolated database.
- `npm run build`: passed; existing Sass legacy API deprecation warning.
- Isolated Chrome English/French edit 1.70 → 1.17 → save → check flows passed, including source/date/non-live text, first match, repeat deduplication, below-target and stale-provider error. The deliberate 502 produces the expected console warning; no uncaught page errors. External traffic was blocked and no real notifications were sent.
- `git diff --check`: passed. Current GitHub checks and final SHA are recorded in the PR/release handoff rather than treating older checks as final-head evidence.

Supabase CLI and `psql` are not installed here. Consequently a local Docker/Supabase reset and a hosted PostgREST migration were **not** run. PGlite is the repository's existing automated migration/persistence harness. Hosted schema cache, live database permissions/drift, volume/lock timing and authenticated production behavior remain preflight/post-release checks.

## Migration and compatibility

Exact migration: `supabase/migrations/20261001120000_currency_threshold_watches.sql`.

SHA-256: `3ec56f4dd43415b17caab335936a17989f93a32de30929df1cf61bb327385842`.

It adds nullable `watches.currency_evaluation` with no default or backfill; preserves the old feed validator by renaming it; creates a currency-aware dispatcher and rebinds the validated CHECK constraint; adds edit invalidation and a service-role-only completion RPC; and extends scheduled failure recording without changing generic failure behavior. Existing RLS policies and persisted rows are unchanged. Authenticated/service roles gain SELECT on the new column; currency result writes are through the service RPC. The trigger is an invoker function and does not grant table privileges.

ALTER TABLE takes an ACCESS EXCLUSIVE lock, and CHECK recreation scans existing Watches. The prepared wrapper limits lock acquisition to 3 seconds and each statement to 15 seconds. It does not terminate sessions or retry automatically. Review database size and active transactions first. If the scan cannot fit the limit, stop and plan a maintenance window or separately reviewed staged constraint validation; do not simply remove the limits.

The current base application can keep serving existing company/feed Watches on the migrated schema. This was tested using its unchanged persistence RPC, including the PT409 conflict fix. Apply schema **before** merging because the new API selects the new column. Old code does not implement currency definitions: after new currency rows exist, an application rollback alone is insufficient (see recovery).

## Ordered execution procedure — requires new authorization

1. **Revalidate prerequisites.** Confirm approval covers migration, merge/automatic deployment and the original Watch's manual check. Re-read PR head, base, clean mergeability and green final-head checks; stop on drift. Confirm production Supabase project from the deployed application's non-secret project reference, not the historical staging ref `tseexvbwhrtofcsrvcqc`. Verify the production alias points to the expected current deployment, record its ID/SHA for rollback, and confirm a recoverable database backup. Verify Preview remains isolated from production before any authenticated Preview testing. Inspect existing notification flags without changing them; no new API key is required. Avoid overlap with the existing daily 06:00 UTC cron and inspect active transactions; do not invoke it.

2. **Read-only database preflight.** In the verified production project's Supabase SQL Editor, run the whole `supabase/tests/currency-release-readonly.sql` and retain results privately. Expect the eight earlier migrations through `20260925130000`, no currency column/function/trigger or currency migration registration, and `persist_media_watch` definition MD5 `c9dfbd9127b543e5bd33ce2764eacc1a` (the PT409 version). Check there is no unreviewed schema drift, failed/looping transaction or lock contention. Record Watch fingerprints, outbox counts, RLS/policies/ACL and relation size. Never paste connection strings or Watch contents into logs. The fingerprint query has a 15-second bound; investigate rather than proceeding if it times out.

3. **Generate and apply exactly one guarded migration.** From the reviewed PR checkout:

   ```sh
   node scripts/prepare-currency-migration.mjs > /tmp/watch-assistant-currency-release.sql
   shasum -a 256 supabase/migrations/20261001120000_currency_threshold_watches.sql /tmp/watch-assistant-currency-release.sql
   ```

   The generated file's reviewed SHA-256 is `31ab19db2c6554fd23a82632feda293c3c049deeb8824a358265ad38b66ddee3`. Generation only writes a local file. In the verified production SQL Editor, open a new query, replace its complete contents with that file, verify beginning/end and hash-equivalent content, then execute the **whole** script after authorization. It wraps the exact migration body plus migration-history registration in one transaction, rejects wrong prerequisites/already-applied/partially-present schema, and notifies PostgREST to reload schema on commit. This follows the repository's prior guarded SQL Editor workflow in `docs/incidents/2026-09-25-staging-evidence/apply-staging.sql`. Do not execute the raw migration and then register it in a separate transaction; do not use a blanket `db push` against unknown pending migrations.

4. **Read-only post-migration verification.** Rerun the same read-only SQL in a new transaction. Require exactly one `20261001120000 / currency_threshold_watches` registration; a nullable JSONB column with no default; enabled invalidation trigger; validated `watches_media_definition_check` calling the new dispatcher; both validators present; completion signature `(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint,jsonb)`, SECURITY DEFINER, empty search path, EXECUTE only owner/service_role (not PUBLIC/anon/authenticated); dispatcher executable by authenticated/service_role. Compare function definitions with the reviewed migration, and unchanged PT409 function hash. Require unchanged RLS/policies, existing Watch fingerprints and outbox counts, allowing only independently explained concurrent user/cron changes. Stop if unexplained. Confirm a read-only authenticated media-list request works against the old app before proceeding; no Watch checks. Hosted PostgREST cache visibility must be verified after deploying the new API as well.

5. **Merge using recent repository practice: squash.** Recheck PR head and checks immediately before merging. With `EXPECTED_HEAD` set to the full approved PR SHA:

   ```sh
   gh pr merge 47 --repo langer-nice/watch-assistant --squash --match-head-commit "$EXPECTED_HEAD"
   gh pr view 47 --repo langer-nice/watch-assistant --json mergeCommit,mergedAt
   ```

   Recent PRs #44–46 used squash; the repository permits it. Do not enable auto-merge ahead of database verification. Record the resulting master merge SHA, which differs from the PR head.

6. **Verify deployment.** The Git integration deploys the merge; do not separately deploy the branch. Wait for a successful Production deployment whose Git SHA equals that resulting merge SHA. In Vercel verify `watch-assistant-omega.vercel.app` is assigned to that deployment. Using an existing authorized account, load Home/All Watches/details in EN/FR and perform read-only company/media list requests. Confirm the new media API's SELECT succeeds and no missing-column/RPC/schema-cache errors appear. Do not invoke cron, replay outbox or send test notifications.

7. **Validate the original Watch only within the new approval.** Use the owner's existing account, locate the original by its persisted ID, and record current request/source/revision plus last result. Do not delete/recreate it or force an unowned local Watch to sync. Confirm effective criteria `base=GBP`, `quote=EUR`, `operator=gte`, `target=1.17`; if this is not the intended Watch/state, stop for a scoped correction. Run one manual check. Record exact ECB provider decimal/date, check time, displayed reciprocal and outcome. Verify `1 >= 1.17 × providerRate` using decimal/rational precision; an already-satisfied fresh rate must be reported immediately. A below-target result may legitimately be correct. Repeat once to verify a single condition event and no manual notification. Confirm EN/FR source/date/reference/non-live wording and successful Last Checked. Do not assume the historical example rate is current or trigger a scheduled check to test email.

## Retry and recovery

- **SQL error/lock timeout:** the transaction must roll back. If a session remains in an aborted transaction, issue `ROLLBACK` in that same session. In a new session run read-only verification: absent registry and absent currency schema plus unchanged old objects means no application. Resolve the cause, then rerun the exact wrapper only under the authorized execution scope.
- **Connection lost / outcome unknown:** never retry blindly. Exactly one registry entry plus all expected schema objects means committed; proceed to verification, not reapplication. Registry/schema mismatch is an inconsistent state: stop, preserve evidence and investigate. Do not drop objects or fabricate migration history. A second wrapper execution after success deliberately raises an error without changing data.
- **Deployment fails before currency use:** retain the additive schema and the PT409 fix; keep or restore the recorded previous successful deployment, then fix forward. Do not roll back data/schema to rescue a frontend deployment.
- **Regression after currency use:** prefer fixing forward. Before reverting to old application code, disable scheduled monitoring and email delivery through the established operations controls under separate approval, account for already-running work/submissions, and prevent old clients from editing currency definitions. Existing currency Watches/outbox must be preserved and explicitly reconciled; the old RSS evaluator cannot safely run these definitions. If these controls cannot be guaranteed, stop and stage a compatibility fix instead of promoting the old app. Do not reset revisions, replay notification rows, undo PT409 or drop the new column/functions.

## Rate freshness and remaining limits

[ECB reference-rate policy](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) publishes around 16:00 CET on working days excluding TARGET closure days. [ECB's calendar](https://www.ecb.europa.eu/ecb/contacts/working-hours/html/index.en.html) marks New Year, Good Friday, Easter Monday, May Day and December 25/26 as TARGET closures. Office-only holidays are not excluded. The code uses Europe/Berlin civil time, accepts the previous TARGET business date until 18:00, then requires today's publication on publication days; weekends/closures retain the last publication. Two hours is an application grace policy, not an ECB guarantee. Unexpected publication delays become explicit verification failures.

Observation date is the ECB daily date, not an intraday quote time. Check time is stored separately. Update `publishedAt` uses midnight as a date carrier and must not be interpreted as the ECB's actual publication timestamp. Daily 06:00 UTC scheduled checks usually see the preceding business day's rate and may detect a new reference rate the next morning. Only the supported GBP/EUR threshold language is covered; this is not a live trading-price service. Original production Watch behavior, live schema state and actual delivery remain unverified.
