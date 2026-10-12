# Solution B Step 3 — version-aware Media/News execution

Local implementation only. No hosted migration, deployment, AI call, real Watch
check, activation, notification delivery, or public creation UI is enabled here.

## Shared execution boundary

Missing `definitionVersion` retains the legacy path. Every explicit version enters
strict WatchDefinitionV1/source validation before retrieval or matching; invalid,
unknown, unsupported adapters fail without legacy fallback. Currency and BODACC
structured execution remain disabled.

`src/js/structured-media-execution.js` projects validated `plan.criteria` into the
existing literal matcher. The approved compiler deterministically regenerates the
query and verifies the full compact plan, fingerprints and source. The exact
original request remains display/audit and evidence data, never execution intent.
Component literal safety checks in the compiler remain shared with earlier phases.

Supported semantics are all-subject same-article title/excerpt matching, approved
identity aliases, required literal topics and literal exclusions. OR between
independent subjects, groups and semantic events fail at capability validation.
Alias OR means alternative names of one identity, not independent brand watches.
English/French equivalents use the same **GB:en** edition. Coverage remains bounded
to the first 20 feed items, literal title/excerpt evidence and non-exhaustive sources;
edition is a source preference, not a guarantee of geography.

## Manual, reload and scheduled paths

The existing authenticated `/api/media-watches?action=check` loads the owned,
undeleted stored definition and checks its revision; request-body criteria carry no
authority. Valid structured Media uses the existing retrieval, article identity,
formatter and manual completion pipeline. Paused manual checks do not activate a
Watch or enqueue mail. The compatible result retains paused presentation.

Definitions remain read-only to legacy persistence/edit/delete code. Hydration,
serialization and reconciliation retain the complete definition, exact request,
language, hashes, source, identity, mutation and revision. Supported Media is
readable/checkable without being editable. Browser checks require the authenticated
stored path; no local provider fallback. Local caching accepts only result/read
fields, never definition or activation fields. Reconciliation discards newer local
check state when its structured revision differs from the server revision. Existing
read/unread/history behavior and durable article identity rules remain shared.

The scheduled engine recognizes validated V1 Media, but
`STRUCTURED_MEDIA_SCHEDULED_ENABLED` defaults off and must not be enabled against
real users in this increment. Selection still requires undeleted `monitoring`
state; paused rows are excluded even in injected fixtures. Database V1 creation
and updates still force paused state and the existing constraint rejects active
structured rows. There is no activation endpoint or SQL constraint relaxation.
Future activation needs separate approval and a reviewed database change.
Batch sizes, concurrency, deadlines and legacy notification processing are unchanged.

## Result-only SQL boundary

Prepare, do not remotely apply:
`supabase/migrations/20261012160000_structured_media_completion.sql`.
It retains the preceding migrations unchanged and creates no tables.

The manual/scheduled completion and feed failure functions keep their public
signatures and service-only grants. Private renamed engines retain their existing
snapshot CAS, revision checks, first baseline/context, identity ledger, unread
latest change and outbox rules. A private validator locks the authoritative row
and validates its version/adapter/source before delegating. Its execute privilege,
and that of the private engines, is revoked from public/anon/authenticated/service.
All definer functions retain empty search paths and explicit service-role checks.

Wrappers set a transaction-local `monitor.v1` marker and restore it on success or
failure. The write trigger permits only result columns and update timestamps under
this marker. Whole-row comparison excludes that explicit result allowlist, so it
rejects changes to approved definition, source, owner, identity, title, revision,
mutation, deletion, or monitoring activation. The separate `persist.v1` authority
and restrictive authenticated RLS remain unchanged. Direct service writes still
fail without an authorized marker; authenticated roles cannot use either marker
to bypass the role guard. No completion operation accepts replacement criteria.

Initial baselines enqueue no mail; manual completion never enqueues mail. Scheduled
completion keeps active-state checks, publication cutoff, identity deduplication
and existing outbox uniqueness. Failures retain the last successful snapshot;
stale completions/failures cannot overwrite newer results. No email sender is
introduced or invoked by the tests.

## Verification and rollout

Focused tests use deterministic provider responses, disposable PGlite PostgreSQL,
and an opt-in native PostgreSQL cluster with TCP disabled and independent sessions.
The scheduled SQL fixture alone temporarily removes the inactive constraint and
disables the write trigger to model a future approved activation in its disposable
local database. The deployment migration never performs either operation.

Eventual rollout order:

1. Apply database protections and structured-definition support.
2. Deploy compatible readers/executors with creation and activation disabled.
3. Validate the complete lifecycle in isolated staging after separate authorization.
4. Enable opt-in creation UI/confirmation only after separate approval.
5. Enable structured monitoring only after full lifecycle validation and separately
   approved activation infrastructure; validate outbox behavior without delivery first.
6. Release to Production only after explicit approval.

Rollback disables new issuance/creation/activation while retaining compatible
readers, validators and completion functions for already stored definitions. Once
scheduled V1 monitoring is approved and active, retain that executor support during
UI rollback; do not switch off execution for existing active Watches or roll back
the database to a schema that cannot read/complete them.

Legacy retirement still depends on currency/company V1 execution, supported
opt-in UI, reviewed activation, supported-client/version inventory, semantically
safe conversion with confirmation where necessary, durable baseline/history
preservation, lifecycle validation and proof that no active client/Watch relies on
legacy parsing. No conversion or legacy parser expansion is part of Step 3.

## Step 3 changed files

- Adapter/query/matching: `src/js/structured-media-execution.js`,
  `src/js/media-provider-query.js`, `src/js/watch-monitoring.js`.
- Reload/result/read caching: `src/js/watch-model.js`,
  `src/js/media-watch-server-store.js`, `src/js/watch-storage.js`.
- Server manual/scheduled paths: `server/media-watch-check-api.js`,
  `server/media-monitoring-cron.js`.
- New SQL migration: `supabase/migrations/20261012160000_structured_media_completion.sql`.
- New tests: `server/structured-media-execution.test.js`,
  `server/structured-media-completion.test.js`, `server/structured-media-concurrency.test.js`,
  `src/js/structured-media-hydration.test.js`.
- Updated focused contracts: `server/watch-definition-foundations.test.js`,
  `server/currency-media-integration.test.js`, `src/js/watch-definition.test.js`.
- Documentation: this file, `docs/structured-watch-definitions-v1.md`,
  `docs/structured-watch-authorization-v1.md`.

Verification: 68 focused tests pass plus one native independent-session completion
concurrency test. The final result/read-cache change also passes its 16 affected
focused tests. The full suite was not run.
