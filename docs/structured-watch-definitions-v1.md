# Versioned definitions: persistence foundations

Step 1 only. No creation UI, signed confirmation token, structured write RPC,
Watch conversion, or structured monitoring is enabled. The migration is prepared,
not applied to hosted environments. All database tests use isolated in-memory PGlite.

## Stored contract

`src/js/watch-definition.js` defines a strict `watch-definition.v1` JSONB object:

- `definitionVersion`, `inputType: text`, exact `request`, and display `category`.
- `interpretation`: validated InterpretationV1 with `originalRequest` omitted.
  `language`, the complete semantic graph, and exact UTF-16 evidence remain here.
- `plan`: the supported MonitoringPlanV1 header, adapter, criteria, limitations,
  and `interpretationRef`. Original request and inherited graph fields are omitted.
- `metadata`: fixed validator/compiler versions and full-plan SHA-256 fingerprint.

The request, graph, language, adapter and criteria each have one stored owner.
`monitoringPlanForDefinition` restores a full validated plan. The shared validator
revalidates evidence, recompiles, compares all stored plan fields and fingerprints,
and checks the exact generated monitoring source. It never calls a legacy original
request interpreter. Existing literal-component guards and numeric/identifier
grounding remain bounded safety checks; they do not generate intent from wording.
The existing Phase 3 server exports delegate to the shared compiler; their default
assessment behavior remains unchanged.

`MonitoringPlanV1.executable` remains **false**. Fingerprints and metadata prove
content coherence, not user approval, owner identity, or permission to persist.
Client-generated definitions are not trusted. Future server issuance must recreate
and verify the definition, and future confirmation must bind the exact reviewed
definition/source to an authenticated owner, operation, Watch ID and revision.

Absent `definitionVersion` identifies legacy data. Any explicit unknown, null,
malformed or incomplete version fails closed. Browser hydration retains explicit
versions as read-only and disabled, without regex normalization. Serializers
preserve the exact request and compact definition. Company hydration preserves
the same contract. Structured checks are blocked before providers or completion
RPCs; schedules skip explicit versions. Existing creation endpoints remain legacy
and reject structured writes. No legacy request, definition or execution behavior
is converted.

## Bounds and sources

Representative JSONB sizes from existing deterministic fixtures:

| Definition | Bytes |
|---|---:|
| Sinner EN / FR | 1,885 / 1,893 |
| Gucci EN / FR | 1,791 / 1,827 |
| GBP/EUR once | 2,056 |
| BODACC SIREN | 1,782 |

The explicit structured limit is **32,768 UTF-8 bytes of `jsonb::text`**, shared
with PostgreSQL accounting and tested for parity. Large evidence sets may exceed
this bound and are rejected; nothing is truncated. No raw provider response,
token usage, credential, authorization token, or redundant semantic graph is stored.
Legacy 8 KB validators and the current 12 KB persistence API limit are unchanged.
A separately bounded structured confirmation payload belongs to the next increment.

Sources are generated solely from approved criteria: Google News literal queries
with fixed `GB:en` edition, the fixed ECB reference-rate URL, or BODACC's validated
SIREN descriptor. Independent OR, groups, unsupported constraints and ambiguous
recurrence remain unsupported. This increment introduces no monitoring capability.

## Prepared database boundary

`20261012120000_structured_watch_definitions.sql`:

1. Adds bounded schema/evidence/graph/fingerprint/criteria/source checks. The embedded
   JSON schema is generated from the shared schema and verified by the database test.
2. Retains the installed legacy validator unchanged behind a version dispatcher.
3. Requires explicit structured rows to remain `paused` or `preparing` until a later
   execution increment changes the activation constraint.
4. Adds restrictive authenticated write policies alongside existing ownership RLS.
   Both old and new row versions are checked, blocking upgrades and downgrades.
5. Adds a trigger covering authenticated writes through SECURITY DEFINER functions.
6. Makes the existing legacy persistence RPC reject all explicit definition versions.

There is **no new structured persistence authorization path**. Only a trusted
database owner can seed inert test fixtures; a future service-only RPC and signed
owner-bound confirmation are still required for application writes. The migration
does not grant new write access or change existing completion functions, revisions,
history, baseline, identity ledgers, outbox functions or schedules. Existing data
is untouched. Database checks supplement, rather than replace, full shared server
verification. SQL source/query compilation and frozen adapter constraints must
remain aligned with their versioned shared counterparts.

Before any hosted application, validate the installed migration prerequisites and
run the isolated acceptance checks against the exact target schema. Do not apply
this file alone to enable structured creation. Rollback disables issuance first;
never remove validation/read support required by already-persisted versions.

## Next increment and eventual legacy retirement

The [Step 2 backend](structured-watch-authorization-v1.md) now implements owner-bound
signed confirmation, service-only atomic persistence, durable idempotency receipts
and revision/replay checks. It remains unmounted and disabled. Next: version-aware
execution and explicit opt-in review. Remove the activation block only after all
creation/reload/manual/scheduled/notification paths consume stored criteria safely.
Keep validator/compiler versions immutable; behavior changes require a new version
with compatible readers and a controlled rollout.

Legacy compatibility is temporary. The target is one structured definition and
deterministic validation architecture, shared version-aware execution and existing
domain adapters. Retirement requires:

1. Inventory stored versions, active Watches and supported client dependencies.
2. Deterministic conversion only when semantic equivalence is provable.
3. Explicit user confirmation where semantics could change.
4. Preservation of IDs, baselines, histories and notification/identity ledgers.
5. Verification of all manual and scheduled execution paths.
6. Measured proof that no active Watch or supported older client depends on legacy parsing.
7. A rollback strategy preserving already-persisted structured Watches.

No inventory, conversion or legacy removal is implemented in Step 1.

Step 3 adds authenticated structured Media checks and result-only completion; see
[structured-media-execution-v1.md](structured-media-execution-v1.md). Creation and
activation remain disabled; structured currency/company execution remains gated.
