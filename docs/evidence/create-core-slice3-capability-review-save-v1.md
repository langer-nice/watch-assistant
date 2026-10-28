# Create core replacement — Slice 3 capability, review and secure paused save

28 October 2026. **SLICE 3 PASS for the local lifecycle, with mocked provider/authentication and the persistence qualifications below.** Recommendation: **proceed to Slice 4 isolated hosted Preview preparation and frozen 5×3 validation**, only under its separate authorization. No Preview deployment was performed; hosted/model reliability remains unproven.

## Authorization and isolation

This report supersedes the earlier blocked Slice 3 audit at this path. The user explicitly authorized minimal opt-in frontend wiring in **only `src/js/navigation.js` and `src/js/structured-watch-creation.js`**, preserving styles, wording, edit flow, security and old paths. That resolves the previously reported Phase 4 scope blocker. The original backend capability/review/save scope remains unchanged.

- Branch: `codex/create-core-slice3`.
- Worktree: `/Users/davidlang/.codex/worktrees/create-core-slice1/watch-assistant`.
- HEAD baseline: `89d2cb175024297016470b019d3a9ae0919477d6`; inherited uncommitted Slice 1/2 work was retained. No commit, push, merge or deployment.
- Exactly eight Slice 3 files changed:
  1. NEW `server/create-contract-capability.js`.
  2. UPDATE `server/create-contract-bridge.js`.
  3. UPDATE `server/structured-watch-api.js`.
  4. UPDATE `src/js/navigation.js`.
  5. UPDATE `src/js/structured-watch-creation.js`.
  6. NEW `server/create-core-lifecycle.test.js`.
  7. NEW `server/create-core-navigation.test.js`.
  8. UPDATE this report, `docs/evidence/create-core-slice3-capability-review-save-v1.md`.

The Slice 1 contract/normalizer/projection and tests are unchanged. No additional frontend file, HTML, stylesheet, locale/copy, compiler, adapter, migration, persistence SQL/RPC, signing module or existing edit/read implementation was modified. No unrelated work was included.

## Capability resolver

`resolveWatchContractCapability(input)` revalidates through `normalizeWatchContract`, projects using `projectWatchContractToLegacyPlan`, and classifies the unchanged existing assessment:

- Existing supported assessment → **SUPPORTED**.
- Existing clarification-required assessment → **PARTIALLY_SUPPORTED**.
- Existing unsupported/format-limited assessment → **UNSUPPORTED**.

It returns status, existing adapter only when supported, unmet requirements, save eligibility and the compatible projection/execution metadata. It does not mutate the input, reinterpret intent, add adapters, drop requirements or claim support from the model's status annotation. Save eligibility is limited to a compatible Google News literal plan through the existing mounted media-only creation path.

`reviewCreateExtraction` retains its existing Slice 2 fields and adds the deterministic `capability` result. Microsoft remains a valid earnings-publication contract plus unsupported event/period assessment. Currency retains gt/1.17 and exposes recurrence clarification as partial support. The BBC exact-source contract remains valid and explicitly unsupported for the existing save format.

## Minimal opt-in frontend wiring

The existing authenticated/allowlisted `GET /api/structured-watches` advertises `createCoreEnabled:true` only when the replacement flag is enabled in local/test environments. Outside that cohort, the response and old paths retain existing behavior. Current guards still deny new-core Preview/Production use.

In `navigation.js`, one new-create-only interception invokes `runCreateCore` before specialized currency/URL routing. The helper waits for the existing access lookup and returns false when the opt-in is absent, allowing the original paths to continue. The interception is guarded by `!isEditMode`; edits do not enter the replacement flow.

In `structured-watch-creation.js`:

- Opted-in requests call `/api/plan-watch?mode=create-core.v1` with `operation:create`.
- Valid unsupported/partial capability is handled **before** nullable legacy-interpretation validation, solving the URL failure and currency fallback blocker.
- Existing `show`, `button`, labels and limitation strings render the exact original request and existing unsupported/clarification messages. No wording or styling changed. Unsupported/partial panels offer edit/cancel, not save.
- Supported results continue through existing `validateInterpretation`, `assessCapabilities`, review, issuance, definition comparison, explicit confirmation and receipt handling.
- A supported opt-in review sends `createContract` alongside the existing interpretation/plan at issuance.
- New-core saves remain paused: the opt-in flow does not offer or invoke monitoring activation, even if the pre-existing test fixture enables scheduled monitoring. Old opt-out activation behavior remains unchanged.
- Cancellation, stale input/language/owner invalidation, same-mutation retries and confirmation locking remain the existing mechanisms.

Only the two approved client files changed. Actual New Watch form tests confirm opted-in URL/currency requests reach capability panels before legacy URL analysis/currency creation. Existing opt-out form tests confirm the prior news/URL paths still behave as before.

## Signed confirmation and server-owned compatibility checks

Reused unchanged:

- `validateInterpretation`, `validateCompiledMonitoringPlan`.
- `createWatchDefinition`, `validateWatchDefinition`, `structuredMonitoringSource`.
- `authorizationBindings`, `issuePlanAuthorization`, `verifyPlanAuthorization`.
- Existing authenticated `createStructuredWatchMiddleware` issue/confirm flow.
- Existing atomic `persist_structured_watch_v1` and its owner/revision/mutation/paused-receipt checks.

The issue handler accepts the new optional `createContract` field only on issuance. When supplied, it requires the local opt-in and a create operation, independently normalizes/resolves the contract, refuses unsupported/partial saves, and compares the submitted interpretation and plan **exactly** with the deterministic compatible projection before existing validation and signing. Changing a client capability annotation cannot grant support. A client-authored technical plan does not override the contract.

No new confirmation system, key, token type, token field, signature algorithm, expiry rule or persistence format was introduced. For the admitted supported news subset, every meaningful contract requirement is represented by the exact original request and deterministic legacy projection. Existing definition/payload fingerprints therefore bind the reviewed original request, supported criteria, source, title and note. The transient contract is not separately stored/signed as a new database object. Contracts with meaning not representable in that payload are ineligible for signing/save.

Confirmation receives the existing immutable definition/token payload. Server recompilation, HMAC verification, owner/Watch/mutation/operation/revision/version bindings and expiry checks remain authoritative. Tests reject changed title/token, wrong owner, mismatched contract/plan, invented source restrictions and stale review authorization before any persistence call.

The existing issue route without `createContract` remains the existing legacy/Structured API contract; this task does not remove or redesign it. New-core UI issuance always includes the contract. No unsupported contract can gain a new-core authorization by pretending its capability is supported.

## Frozen reference results

| Case | Semantic result | Capability | Review | Signed confirmation | Save eligibility | 3-run stability |
|---|---|---|---|---|---|---|
| Manchester City | Correct identity/developments, no required topic | SUPPORTED, google_news_literal_v1 | Existing news review | Verified 3/3 | Paused save 3/3 | Stable |
| Microsoft earnings | Microsoft, publication/earnings_results_publication, 2026-Q3, source any | UNSUPPORTED event/period | Existing unsupported panel, original request retained | Not issued | Ineligible 3/3 | Stable |
| Jannik Sinner | Exact identity/developments, no required topic | SUPPORTED, google_news_literal_v1 | Existing news review | Verified 3/3 | Paused save 3/3 | Stable |
| GBP/EUR | Exact ordered pair, gt, decimal string 1.17 | PARTIALLY_SUPPORTED, ambiguous_recurrence | Existing clarification panel, exact request retained | Not issued | Ineligible pending supported policy | Stable |
| BBC URL | Exact resource/source URL, no invented topic | UNSUPPORTED, CREATE_FORMAT_UNSUPPORTED | Existing unsupported panel, exact URL retained | Not issued | Ineligible 3/3 | Stable |

No Microsoft downgrade to generic news, URL source substitution, fabricated currency recurrence or unsupported executable plan was introduced. Numeric/URL preservation is proved through review and the rejected-save boundary; those cases are **not** claimed signed or saved, because they are ineligible.

## All 15 local full-create attempts

These are **15 measured local DOM-client lifecycle attempts**, using actual `initStructuredWatchCreation`, actual planning middleware/interpreter parser/bridge/normalizer/resolver, actual signed issue/confirm middleware and a mocked RPC persistence boundary. Authentication and provider transport are injected fixtures; no live model, Supabase authentication or external API is called. URL meaning needs no model/fetch.

Each case uses the exact frozen request; synthetic extraction variants change technical domain/intent/event hints or add the observed generic-topic constraint. Assertions compare semantic fingerprints, capability and save eligibility across repetitions, inspect the actual panel, and require correct exact numeric/source values. Supported reviews require a distinct confirmation click, real token verification, paused receipt and a single coalesced save. Unsupported/partial outcomes stop at the capability panel without issuance or persistence.

The six measured supported saves use per-attempt in-memory receipts, cleared explicitly; no durable duplicate records were created. Separate SQL/security/routing probes below are not additional measured 5×3 attempts. UTC timestamps below correspond to 15:04 Europe/Monaco.

| Case/run | Timestamp UTC | Exact request | Semantic | Capability | Review | Signed confirmation | Save eligible | Save result | Generic failure | Semantic drift | Capability drift | Persistence error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1/1 | 2026-10-28T14:04:14.105Z | `Tell me when there are important new developments about Manchester City.` | VALID | SUPPORTED | REVIEW | VERIFIED | YES | PAUSED_MOCK_RECEIPT | NO | NO | NO | NO |
| 1/2 | 2026-10-28T14:04:14.177Z | `Tell me when there are important new developments about Manchester City.` | VALID | SUPPORTED | REVIEW | VERIFIED | YES | PAUSED_MOCK_RECEIPT | NO | NO | NO | NO |
| 1/3 | 2026-10-28T14:04:14.193Z | `Tell me when there are important new developments about Manchester City.` | VALID | SUPPORTED | REVIEW | VERIFIED | YES | PAUSED_MOCK_RECEIPT | NO | NO | NO | NO |
| 2/1 | 2026-10-28T14:04:14.203Z | `Tell me when Microsoft publishes its Q3 2026 earnings results.` | VALID | UNSUPPORTED | UNSUPPORTED | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |
| 2/2 | 2026-10-28T14:04:14.205Z | `Tell me when Microsoft publishes its Q3 2026 earnings results.` | VALID | UNSUPPORTED | UNSUPPORTED | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |
| 2/3 | 2026-10-28T14:04:14.206Z | `Tell me when Microsoft publishes its Q3 2026 earnings results.` | VALID | UNSUPPORTED | UNSUPPORTED | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |
| 3/1 | 2026-10-28T14:04:14.208Z | `Tell me when there are important new developments about Jannik Sinner.` | VALID | SUPPORTED | REVIEW | VERIFIED | YES | PAUSED_MOCK_RECEIPT | NO | NO | NO | NO |
| 3/2 | 2026-10-28T14:04:14.218Z | `Tell me when there are important new developments about Jannik Sinner.` | VALID | SUPPORTED | REVIEW | VERIFIED | YES | PAUSED_MOCK_RECEIPT | NO | NO | NO | NO |
| 3/3 | 2026-10-28T14:04:14.227Z | `Tell me when there are important new developments about Jannik Sinner.` | VALID | SUPPORTED | REVIEW | VERIFIED | YES | PAUSED_MOCK_RECEIPT | NO | NO | NO | NO |
| 4/1 | 2026-10-28T14:04:14.236Z | `Tell me when GBP/EUR goes above 1.17.` | VALID | PARTIALLY_SUPPORTED | CLARIFICATION | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |
| 4/2 | 2026-10-28T14:04:14.240Z | `Tell me when GBP/EUR goes above 1.17.` | VALID | PARTIALLY_SUPPORTED | CLARIFICATION | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |
| 4/3 | 2026-10-28T14:04:14.241Z | `Tell me when GBP/EUR goes above 1.17.` | VALID | PARTIALLY_SUPPORTED | CLARIFICATION | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |
| 5/1 | 2026-10-28T14:04:14.242Z | `https://www.bbc.com/news/topics/c6vgy427vxklt` | VALID | UNSUPPORTED | UNSUPPORTED | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |
| 5/2 | 2026-10-28T14:04:14.243Z | `https://www.bbc.com/news/topics/c6vgy427vxklt` | VALID | UNSUPPORTED | UNSUPPORTED | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |
| 5/3 | 2026-10-28T14:04:14.243Z | `https://www.bbc.com/news/topics/c6vgy427vxklt` | VALID | UNSUPPORTED | UNSUPPORTED | NOT_ELIGIBLE | NO | NOT_ELIGIBLE | NO | NO | NO | NO |

| Metric | Result |
|---|---:|
| Measured full-create local attempts | 15 |
| Valid stable semantic outcomes | 15/15 |
| Supported signed/paused-save outcomes | 6 |
| Unsupported outcomes, without issuance/save | 6 |
| Partial/clarification outcomes, without issuance/save | 3 |
| Stable cases | 5/5 |
| Generic interpretation failures | 0 |
| Semantic drift | 0 |
| Capability drift | 0 |
| Invented constraints surviving | 0 |
| Measured persistence errors | 0 |
| Monitoring/cron/email calls | 0 |

## Local SQL persistence and isolation

The 15-run client gate uses a mocked RPC boundary, as explicitly allowed by the request. It proves the client→planning→review→signed-confirmation integration, not deployed Supabase behavior.

A separate focused test additionally uses the repository's established **in-memory PGlite mechanism** and unmodified existing migrations through `20261012140000_structured_watch_confirmation.sql`. It sends both supported new-contract cases through actual issuance, HMAC confirmation and the existing SQL RPC under service-role context. Repeated confirmation returns the same receipt. Assertions establish exactly two paused rows and two mutation receipts, correct owner IDs, no source check, no notification rows and no duplicate inserts. The in-memory database is closed in `finally`; it has no hosted connection or persistent data directory. No migration file or SQL function was changed.

Security coverage also verifies:
- Unsupported/partial contract plus forged SUPPORTED annotation cannot obtain a token.
- Wrong owner, token/title tampering, stale authorization and contract/plan mismatch reject before RPC.
- Modified UI input/account invalidates confirmation.
- Lost-response retry reuses the same signed mutation and does not duplicate records.
- Existing atomicity/rollback/RLS protections remain unchanged; the pre-existing SQL regression subtests for those protections pass.

Hosted persistence, real authentication and live-model behavior remain unproven.

## Tests and build

| Check | Result |
|---|---|
| New lifecycle/security tests | 8/8 PASS across focused invocations (seven initial lifecycle tests + isolated SQL test) |
| New actual-form routing tests | 2/2 PASS |
| Focused Slice 3 total | 10/10 PASS |
| Slice 1 regression | 19/19 PASS |
| Slice 2 regression | 9/9 PASS |
| Existing capability tests | 28/28 PASS |
| Existing directly affected review/form/signing/API/persistence tests | 70/72 PASS; one independently reproduced baseline failure counts as failed SQL subtest + parent |
| Build | PASS, Vite 168 modules |

Commands executed:
- `node --no-maglev --test server/create-core-lifecycle.test.js` (initial seven tests, including measured 15-run gate).
- `node --no-maglev --test --test-name-pattern='isolated SQL' server/create-core-lifecycle.test.js` (added SQL proof).
- `node --no-maglev --test --test-name-pattern='opt-in remains disabled' server/create-core-lifecycle.test.js` (final default-gate check).
- `node --no-maglev --test server/create-core-navigation.test.js`.
- `node --no-maglev --test src/js/structured-watch-creation.test.js src/js/structured-creation-form.test.js server/structured-watch-api.test.js server/structured-watch-authorization.test.js server/structured-watch-persistence.test.js server/watch-capabilities.test.js server/watch-contract.test.js`.
- `node --no-maglev --test server/create-contract-api.test.js`.
- `npm run build`.

### Existing regression failure, not repaired

The selected existing regression invocation reports **119 tests: 117 pass, 2 fail**. The underlying failure is `server/structured-watch-persistence.test.js:118`, “actual confirmation middleware reaches only the service RPC and remains idempotent”: its local `env` omits `SUPABASE_URL`, so the existing staging guard returns 404 where the fixture expects 200. Node also marks the parent SQL test failed, giving the two failure counts.

An unmodified archive of baseline HEAD, with existing installed dependencies, reproduces the **same failure and 404 !== 200** independently (11 tests, 9 pass, 2 fail). No baseline test or guard was changed to hide it. The new isolated SQL test supplies the required local fixture URL and passes through the changed handler and unchanged real RPC. No new functional failure was found in the Slice 3 implementation.

Logs are retained locally in `/private/tmp/watch-create-slice3-tests.log`, `watch-create-slice3-navigation.log`, `watch-create-slice3-sql.log`, `watch-create-slice3-regressions.log`, `watch-create-slice3-baseline.log` and `watch-create-slice3-slice2.log`. This report embeds all measured attempt outcomes.

Build warnings remain the existing Sass legacy API and large-chunk warnings. A temporary symlink reused installed dependencies; no install/package/lockfile change or network dependency resolution was performed. The symlink was removed after validation. Generated ignored dist output is local only.

## Scope, stop rules and next step

- Prior frontend stop condition: resolved by the user's explicit authorization for the two-file opt-in wiring.
- Remaining stop rule triggered: **NO**.
- Schema migration / compiler rewrite / persistence rewrite / adapter redesign: **NO**.
- Frontend changed: **YES, only the two authorized files**, with unchanged styles/copy.
- Signing algorithm/claims/security semantics changed: **NO**; server-side contract validation was added before existing issuance.
- Existing persisted Watch read/edit/execution behavior changed: **NO**. No record migration, baseline reset or activation.
- No Detect/Alert, story-following, shadow/PR #70, legacy, notification/email or cron change.

Recommendation: **proceed to Slice 4 isolated hosted Preview preparation and the frozen 5×3 gate**, with the known baseline-test exception disclosed. Current new-core gates are still local/test-only and deny Preview; the next task must explicitly authorize narrowly gated Preview enablement/deployment before freezing that hosted measurement. This task does not make that change or authorize any Production rollout. No further architecture alternative is proposed.

No Preview/Production deployment, Production request/change, hosted Staging data access, live model call, email, monitoring/check, cron, push or merge occurred. Only isolated local fixture records were created and discarded. Existing unrelated working changes remain untouched. Local PASS does not claim hosted CREATE reliability is fixed.
