# Step 2: signed confirmation and inactive persistence

Step 4 now mounts this endpoint behind a disabled server flag and verified test-user
allowlist. The unmounted scope below describes Step 2 historically; see
[structured-watch-creation-v1.md](structured-watch-creation-v1.md) for current access.

Backend implementation only. `server/structured-watch-api.js` is intentionally
**unmounted** in Vercel API and Vite routes, and also requires an explicit server
enable flag. No public creation UI, activation, execution, migration of existing
Watches, provider retrieval or AI call is introduced.

## Protocol

Future server-only configuration:

- `STRUCTURED_WATCH_BACKEND_ENABLED`: default unset/disabled; keep disabled.
- `STRUCTURED_WATCH_SIGNING_SECRET`: a dedicated random secret with at least
  32 bytes of entropy, stored server-side. No fallback to other credentials.
  Never use a `VITE_` prefix; Vite explicitly rejects that exposure.
- `STRUCTURED_WATCH_AUTH_TTL_SECONDS`: default 300, permitted range 30–600.

The unmounted `/api/structured-watches` handler accepts POST JSON bodies only.
Requests with query parameters are rejected. All responses use `no-store, private`.

`action: issue` accepts `watchId`, `operation` (`create` or `update`), `mutationId`,
`expectedRevision`, `title`, InterpretationV1, MonitoringPlanV1, and optional
display category. Creation expects revision 0; updates expect a positive revision.
Authentication uses the existing Supabase `getUser` verification. The server
revalidates evidence, reassesses capabilities, recompiles and exact-compares the
plan, builds WatchDefinitionV1 and computes authoritative fingerprints. Update
issuance also checks an owned, undeleted, inactive structured Watch with the same
adapter. Company identity/SIREN must remain stable. Issuance creates no records.

The response contains the exact definition/source for future review, an expiry,
and an HMAC-SHA-256 confirmation token. Version, audience and purpose are explicit.
Claims bind owner, Watch ID, operation, mutation, expected revision, definition
fingerprint, schema/compiler/validator versions, issued-at and expiry. A separate
payload fingerprint binds definition **plus generated source and exact title**.
The token contains no original request or plan, and is never stored in a Watch.

`action: confirm` accepts the same operation identifiers/title, the issued
definition and token. It authenticates independently, revalidates/recompiles,
regenerates the source, verifies the signature, all bindings and lifetime, then
calls the service-only RPC with verified ownership. No client fingerprints or
provider URLs are treated as authoritative. No automatic mutation retries occur.
Failures return allowlisted codes without SQL details, credentials or tokens.
Missing configuration fails closed. Both responses retain `executable: false`.

Expired authorizations require fresh issuance, not another AI interpretation.
Issuance may bind a prior update revision for an identical retry; only the RPC
can distinguish an already committed mutation from an unapplied stale update.

## Atomic database boundary

The new additive migration is
`20261012140000_structured_watch_confirmation.sql`, following unchanged Step 1
`20261012120000_structured_watch_definitions.sql`. Neither is applied remotely.
No assumption about hosted migration status is needed because no previous file
is amended. Before eventual deployment, compare installed prerequisites locally
and on the approved target, without altering or automatically converting data.

`persist_structured_watch_v1` has an empty search path, explicit service-role
verification and EXECUTE granted only to `service_role`. It verifies definition,
source and both hashes again. Owner is taken from the authenticated server context,
never a client-provided owner field. Existing rows and receipts must match that owner.
The service credential remains a trusted server boundary; browser credentials
cannot invoke the RPC or alter the private receipt table.

Restrictive ownership RLS and the authenticated/anonymous trigger guard remain.
The trigger additionally requires a transaction-local RPC marker for structured
writes, including service writes. The RPC restores the previous marker before
returning. Existing legacy RPCs and completion functions are unchanged. No new
anonymous/authenticated database privileges are granted.

Durable receipts bind a globally unique mutation UUID to owner, Watch, operation,
expected revision, definition and full payload. Advisory locks serialize mutation
reuse and same-Watch operations, followed by row locks and atomic revision checks.
An identical retry returns the original receipt without another revision increment.
A changed payload/context fails even after valid server reauthorization. Receipts
retain historical identity; creation cannot reuse a previously recorded Watch ID.
Deleted/tombstoned Watches are never resurrected. Watch and receipt writes share
one transaction; errors roll back both, including trigger side effects.

Receipts are historical acknowledgements. A future client must reload the latest
owned Watch before replacing its local state after an older acknowledgement.
The receipt table is private, RLS-enabled and has no client or service table grants.
It intentionally stores no duplicate definition, original request, authorization
token or signing secret.

## Safe state and next increment

All successful creates/updates store `monitoring_state: paused` and
`current_status: paused`. The RPC accepts no activation/state argument. Step 1's
activation constraint still prohibits `monitoring` for explicit structured rows.
Existing cron and notification claims require `monitoring`; Step 1's explicit
version guards additionally prevent manual checks and legacy fallback. No baseline,
seen-item or notification event is created by this RPC.

Step 3 can now implement version-aware Media/News execution, with approval.
Its trusted completion RPCs will need a narrowly approved structured-write boundary;
do not simply remove the marker guard. Keep initial creation paused and the backend
unmounted/disabled while validating manual/cron/reload/history/deduplication paths.
Route mounting, review UI, controlled activation and hosted migrations require
separate approval. Deployment order remains protections/readers → authorization/
persistence → execution → opt-in UI → activation. Rollback disables issuance first
and retains readers/validators/receipts for persisted versions.

## Focused verification

Tests cover signature/header/version/audience/expiry/ownership and binding failures,
independent authentication, unsupported/evidence/criteria rejection, no-authority
creates/updates, safe errors, EN/FR criteria equivalence, and unmounted routing.
Isolated PGlite checks cover privileges, direct-write/downgrade guards, complete
rollback, inactive creation/update, durable retry receipts, conflicts and legacy
baseline/function preservation. The opt-in native PostgreSQL test starts a fresh
private temporary cluster with TCP disabled and no inherited credentials, exercises
independent concurrent sessions, then stops and removes it. No hosted connections,
AI calls, real monitoring or notification delivery are used.

Step 3 preserves confirmation authority while adding a separate result-only
monitoring boundary; see [structured-media-execution-v1.md](structured-media-execution-v1.md).
