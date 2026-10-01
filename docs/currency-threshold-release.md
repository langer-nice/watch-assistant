# Currency threshold release — PR #47

Revised 2026-10-01 after the [production migration-state audit](currency-migration-state-audit.md). **Execution authorized** for `0db91b375cdf1873b3102930981baf42b7fb349d` and the documentation-only adjustment below: the owner explicitly authorized moving authenticated HTTP reads to their final browser validation and continuing the release. This authorization covers the resulting documentation-only descendant, whose exact SHA must be recorded and used for apply/merge. Migration SQL, generator, manifest and application code must remain identical to that approved head. Execution outcomes are recorded separately; this document is not proof of deployment.

## Resolution and pinned artifacts

Production has no Supabase CLI history. All eight preceding migrations' current schema effects match, with preserved platform additions described in the audit. Use direct capability verification for the existing explicit SQL deployment workflow. No history table, fabricated execution record, baseline repair or replay of old migrations is proposed.

The exact source `supabase/migrations/20261001120000_currency_threshold_watches.sql` is unchanged, SHA-256 `3ec56f4dd43415b17caab335936a17989f93a32de30929df1cf61bb327385842`. It adds a nullable evaluation column without backfill, retains feed validation, installs currency validation/invalidation/completion and extends failure recording. RLS and existing rows are retained. The old application/RPC supports existing company/feed Watches after migration, but cannot evaluate new currency definitions.

`scripts/currency-schema-manifest.json` pins the production catalog before (`e0711f5aac458d2ef9f5b92a55b900db`, 260 entries) and after (`a35f36da68175d6562fcc475a2d31d66`, 265 entries). Catalog-query SHA-256 is `9e7332f45deba794b1ee59f1ac73924141a9f691e43af14f413d79931657caf1`. Generated transaction SHA-256 is `41710803edce4dc2e860d48bce5b27e0f133f57cb0fe12e6e02d8452c06a78f9`.

Generation is local only:

```sh
node scripts/prepare-currency-migration.mjs > /tmp/watch-assistant-currency-release.sql
shasum -a 256 /tmp/watch-assistant-currency-release.sql
```

The transaction locks Watches, asserts the entire reviewed catalog state, executes the original migration body verbatim, asserts the resulting catalog, and notifies PostgREST before commit. It does not write CLI history. PostgreSQL major 17, absent registry namespace, lock timeout 3 seconds and statement timeout 15 seconds are mandatory. An ACCESS EXCLUSIVE lock and CHECK validation scan are required; do not remove timeouts or terminate competing sessions to force success.

## Authorized execution sequence

Use the final approved PR checkout, clean working tree, from the repository root. Record the full approved head in `APPROVED_HEAD`; never substitute an unapproved revision. The execution helper checks local HEAD and cleanliness for `--apply`, fixes the project/host/login, and uses `.pgpass` without displaying it. It requires mode 0600 and TLS verify-full with the official CA. No password in shell arguments or environment variables.

```sh
export PSQL_PATH=/opt/homebrew/opt/postgresql@17/bin/psql
export CA_PATH=/Users/davidlang/documents-local/watch-assistant-backups/production-20261001T121222Z/supabase-ca.crt
export APPROVED_HEAD=REPLACE_WITH_FULL_NEWLY_APPROVED_PR_HEAD
```

1. **Revalidate release and identity.** Re-read PR #47 head, open/ready/mergeable state and all required checks for that exact head. Compare current base and deployed commit with audited `aeb09ef6c7977d8a453b807877a644fd2042fc9e`; investigate intervening changes. Confirm Vercel Production/Current deployment and alias `watch-assistant-omega.vercel.app`, and deployed Supabase ref `cztpitujsnzhhenedwjn` (`watch-assistant-pilot`, not staging `tseexvbwhrtofcsrvcqc`). Recheck artifact SHA-256 values above. Stop for material incompatibility or unapproved changes.

2. **Backup and read-only preflight.** Reassess freshness of the verified 12:17:43 UTC backup recorded in the audit. Compare fresh data/schema evidence with its private manifest. If intervening changes exist or freshness cannot be established, create a new consistent logical backup and verify its isolated restore using private `RESTORE.md` before continuing. Retain old/new archives privately; never restore an older archive over newer production data. Confirm documented recovery coverage is sufficient; otherwise stop. Avoid the existing daily 06:00 UTC processing window and competing administrative DDL; do not invoke or alter schedules. Then run:

   ```sh
   node scripts/currency-release.mjs --preflight --ca "$CA_PATH"
   node scripts/currency-release.mjs --inspect --ca "$CA_PATH"
   ```

   Both are read-only. Expect the before digest and absent history namespace/table, no currency objects, unchanged PT409 function, and reviewed RLS/ACL. Retain inspection output privately for comparison; it contains only metadata, fingerprints/counts and lock information. Stop on blocked/long transactions, lock contention, unexpected drift, insufficient recovery evidence, or scan size unsuitable for the time limit. No prerequisite repair/history reconciliation is needed or authorized by this procedure. A new history namespace or unexpected catalog hash requires investigation and a reviewed revision.

3. **Apply the exact guarded transaction once.** Only after every prerequisite passes:

   ```sh
   node scripts/currency-release.mjs --apply --approved-head "$APPROVED_HEAD" --ca "$CA_PATH"
   ```

   This pipes the pinned generated SQL to psql with ON_ERROR_STOP. Never use raw migration SQL, blanket `db push`, a separate registration statement, or override hashes. If the process fails or connection is lost, follow outcome verification below before considering retry.

4. **Verify before merge.** In new read-only sessions:

   ```sh
   node scripts/currency-release.mjs --verify --ca "$CA_PATH"
   node scripts/currency-release.mjs --inspect --ca "$CA_PATH"
   ```

   Require the after digest and still absent CLI history. This asserts full reviewed function bodies/ACL, nullable JSONB/no default, enabled invalidation trigger, validated dispatcher CHECK, preserved feed validator, PT409, RLS and old grants. Completion RPC must remain owner/service-only. Compare pre/post Watch fingerprints and outbox counts; accept differences only with independent evidence of normal concurrent activity. Confirm other existing application data/access protections remain intact. Retain the successful isolated old-RPC compatibility tests and rerun production READ ONLY SQL projections under SET LOCAL ROLE authenticated with transaction-local owner claims, checking owner isolation and both media/company projections (including currency_evaluation after migration). These SQL checks prove database permissions/projections, not JWT authentication or hosted PostgREST cache. The owner explicitly accepts deferring those HTTP checks to final browser validation after deployment. Do not open the application or trigger synchronization on the owner’s behalf. Stop before merge on any failed SQL/data/permissions gate.

5. **Squash merge, pinned to approval.** Recheck remote head/checks immediately before this step; do not enable auto-merge in advance:

   ```sh
   gh pr view 47 --repo langer-nice/watch-assistant --json headRefOid,baseRefOid,state,isDraft,mergeable,statusCheckRollup
   gh pr merge 47 --repo langer-nice/watch-assistant --squash --match-head-commit "$APPROVED_HEAD"
   gh pr view 47 --repo langer-nice/watch-assistant --json mergeCommit,mergedAt
   ```

   Record resulting merge SHA. Repository Git integration deploys master automatically; do not create a duplicate deployment.

6. **Verify production read-only.** Wait for a successful Vercel Production deployment of that resulting merge SHA; confirm the production alias is assigned to it. Check static application availability, deployed project identity and successful production alias assignment. Authenticated media/company HTTP reads are delegated to the owner in step 7, not a prerequisite for this deployment. Report them as pending; never claim SQL proves the HTTP path. Record deployment ID/URL, alias and source SHA. Do not call monitoring APIs, click Check now, synchronize/edit/delete Watches, run scheduled processing, replay outboxes or send notifications. Normal existing schedules are not authorization for extra runs.

7. **Owner final browser validation, then original Watch validation.** In their connected Chrome browser, the owner first reloads the application and checks that the media and company lists load normally, without authentication, database or loading errors. This exercises GET /api/media-watches (including currency_evaluation) and GET /api/company-watches (including snapshot relationships) through Vercel, Supabase Auth and PostgREST. No token extraction or network-request replay is requested. Normal browser initialization can synchronize pending local definitions; opening/reloading is performed only by the owner, not the release agent. UI success is a functional observation, not independently captured HTTP status evidence. If either list fails, stop the owner’s functional checks and follow the failure guidance below. Report deployment complete with authenticated and functional validation pending until the owner confirms. Then provide these iPhone steps: reload Watch Assistant; open the original Watch and confirm `1 GBP ≥ 1.17 EUR`; if “Sync this Watch” appears, synchronize and wait for confirmation; click “Check now”; inspect exact ECB reference rate, observation date and decision (below 1.17 must not be achieved); repeat and confirm no duplicate update. The owner performs these steps manually. ECB rates are daily references, not live quotes; functional production validation remains pending that test.

## Failure and recovery

- **Preflight failure:** stop, no DDL or merge. Retain evidence privately. Do not modify manifests to make a mismatch pass. A partial/incompatible state requires separately reviewed repair.
- **SQL failure or uncertain connection outcome:** never blindly retry. If still in the same aborted session, ROLLBACK. The helper exits/closes on errors. In fresh sessions run `--verify`, then (only if needed) `--preflight` and `--inspect`. Matching after state means committed: verify data and continue, never reapply. Matching before state plus unchanged data means rolled back/not applied: resolve the cause and retry the identical transaction only within the approval scope. Neither match means uncertain/partial/drift: stop and investigate; do not drop objects or invent history. A repeated apply deliberately fails before DDL.
- **Database verified but merge/deploy fails:** retain compatible additive schema. Report exact state and prefer fix-forward. Do not destructively roll back schema or restore old backup data.
- **Owner authenticated-read failure after deployment:** do not click Check now, repeat synchronization attempts or continue currency tests. Record which list failed, visible error and time (no secrets or Watch contents). Inspect deployment/runtime logs and the existing read-only SQL gates to distinguish Auth/configuration, PostgREST cache and application failures. Keep the additive schema and current data; prepare a targeted fix. Do not blindly reapply the migration, redeploy old code or send notifications. Any configuration/cache intervention, code fix/deployment, or schedule/email change beyond this approved release requires its own scoped authorization. Until resolved, report deployed but final validation failed/pending, not fully validated.
- **Application rollback:** never blindly promote old code once currency definitions may exist. Old code cannot evaluate them safely. Any recovery requiring disabling scheduled processing/email, preventing old-client edits, or reconciling currency Watches/outboxes needs separate authorization. Preserve revisions, records and the PT409 fix.

## Validation and limits

The full automated suite passes 1,117 tests with external network blocked; build and diff checks pass. Final-head CI results are recorded in the PR. The audit records successful restored PostgreSQL 17 and PGlite failure/upgrade/repeat/old-RPC tests. To reproduce the restored integration test, start only the documented private socket-only cluster from `RESTORE.md`, then run:

```sh
WATCH_RESTORE_SOCKET=/Users/davidlang/documents-local/watch-assistant-backups/production-20261001T121222Z \
PSQL_PATH=/opt/homebrew/opt/postgresql@17/bin/psql node scripts/validate-currency-release-postgres.mjs
```

It creates/deletes only a uniquely named local clone, rejects a TCP/incorrect-role target, and rolls back synthetic user operations. Stop the local cluster afterward. Hosted platform event triggers/cache behavior, production lock timing, and the original Watch's functional behavior remain limitations until authorized execution and owner validation.

## Rate freshness and remaining limits

[ECB reference-rate policy](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) publishes around 16:00 CET on working days excluding TARGET closure days. [ECB's calendar](https://www.ecb.europa.eu/ecb/contacts/working-hours/html/index.en.html) marks New Year, Good Friday, Easter Monday, May Day and December 25/26 as TARGET closures. Office-only holidays are not excluded. The code uses Europe/Berlin civil time, accepts the previous TARGET business date until 18:00, then requires today's publication on publication days; weekends/closures retain the last publication. Two hours is an application grace policy, not an ECB guarantee. Unexpected publication delays become explicit verification failures.

Observation date is the ECB daily date, not an intraday quote time. Check time is stored separately. Update `publishedAt` uses midnight as a date carrier and must not be interpreted as the ECB's actual publication timestamp. Daily 06:00 UTC scheduled checks usually see the preceding business day's rate and may detect a new reference rate the next morning. Only the supported GBP/EUR threshold language is covered; this is not a live trading-price service. Original production Watch behavior and actual delivery remain unverified; production schema was inspected read-only.
