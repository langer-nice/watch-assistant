# Create core replacement — Slice 2 local API integration

28 October 2026. **SLICE 2 PASS for the local API bridge using the established mocked-provider test mechanism.** Recommendation: **proceed to Slice 3**. This is not a live-model reliability result, frontend integration result, or hosted CREATE fix.

## Branch, files and scope

- Branch: `codex/create-core-slice2`.
- Worktree: `/Users/davidlang/.codex/worktrees/create-core-slice1/watch-assistant`.
- Baseline HEAD remains `89d2cb175024297016470b019d3a9ae0919477d6`; completed Slice 1 files were already uncommitted in this worktree and remain byte-for-byte unchanged. No commit/push/merge occurred.
- New Slice 2 files: `server/create-contract-bridge.js`, `server/create-contract-api.test.js`, this report.
- Modified existing files: `server/plan-watch-api.js`, `server/watch-planner.js`, `server/watch-interpreter.js`.
- Exactly six files belong to the Slice 2 delta. The four inherited Slice 1 files are not new Slice 2 changes.

No frontend, compiler, capability implementation/registry, adapter, schema, persistence, signed-confirmation, edit, Detect/Alert or notification implementation changed. No environment file or hosted configuration changed. The new opt-in flag is used in test-local in-memory options only.

## Exact integration point and compatibility boundary

Existing sequence: `api/plan-watch.js` mounts `createPlanWatchMiddleware`; current `interpretation.v1` dispatches through `planWatch` to `interpretWatchRequest`. The interpreter calls the existing provider/parser, then ordinarily runs `reconstructInterpretation` (including canonicalization and semantic validation). Existing frontend Structured creation assesses capability, constructs review/issuance requests, and proceeds to signed confirmation. The compiler and definition validators are deterministic downstream boundaries.

Replacement sequence in this slice:

`POST /api/plan-watch?mode=create-core.v1`
→ existing authentication/allowlist gates + explicit new-create/local gate
→ `planWatch`
→ existing extractor transport and unchanged prompt/output schema
→ raw JSON shape boundary in `interpretWatchRequest`
→ `reviewCreateExtraction`
→ `createWatchContractFromInterpretation`
→ `normalizeWatchContract`
→ `projectWatchContractToLegacyPlan`
→ unchanged downstream validation/assessment/compiler when compatible
→ JSON planning/review response.

The optional server-side `rawOutputHandler` is called after provider parsing/top-level shape checks and immediately before old reconstruction. Default interpreter callers do not supply it and retain the complete existing path. No broad prompt/schema rewrite or global validation relaxation was made.

### Deliberate opt-in and new-create isolation

The new mode requires `CREATE_CORE_REPLACEMENT_ENABLED=true`, `VERCEL_ENV=test` or `development`, the existing Structured enablement/staging URL/account gates, and body `operation:create`. Only request/language/operation body fields are admitted. Updates, Watch IDs, invalid language, unauthenticated/disallowed users and disabled mode are rejected before extraction. Preview and Production are explicitly denied even if the new flag is true.

The existing `interpretation.v1`, default/migrated-route modes and current frontend selection are unchanged. The frontend does not yet select the new mode: these are direct local requests to the real mounted middleware, not browser submissions. This prevents accidental changes to shared edit callers. Future review integration must explicitly select this new-create mode; no old Watch is silently reinterpreted.

### Response and review limits

Successful responses preserve the familiar `status:interpreted`, `executable:false`, `interpretation` and capability annotation, and add the authoritative `contract`, `projectionStatus` and unchanged `assessment`. Supported news responses contain a legacy-valid interpretation and assessment plan. Unsupported Microsoft retains a valid interpretation and capability issues rather than an interpretation exception. Currency retains the numeric interpretation and recurrence clarification. URL carries a valid contract, null legacy interpretation and explicit format limitation.

This is a planning/review **API** response. It does not invoke the browser review renderer, issue a confirmation token or save. In particular, the old browser renderer's expectation of a nonnull legacy interpretation is not claimed compatible for URL; it is unaffected because it does not call this mode. UI consumption, if later requested, must respect the contract/capability response without changing meaning.

## Extractor-to-contract adapter and safety

`createWatchContractFromInterpretation(output, request)` maps current raw extraction into the Slice 1 candidate shape and then calls the existing normalizer. The normalizer and projection are unchanged.

- Current strict extraction output-schema conformance remains required. The bridge does not reuse model-authored technical domain/intent as execution authority.
- Only a bounded single-predicate/individual-subject shape is admitted. Duplicate/colliding IDs, dangling references, ambiguity, group semantics and unrepresented geography/exclusions/unresolved requirements reject safely rather than disappear.
- All raw evidence paths must bind admitted subject/condition/topic/time fields, and quotes/context must occur exactly in the immutable request. The adapter calculates spans; repeated quote uniqueness is not required. It deterministically selects the first matching source occurrence, retaining exact lexical evidence rather than fabricating support.
- News/earnings variants use source-grounded trigger clauses. Official-company event tags can converge to nonofficial earnings publication only when the original source clause supports it. Technical domain/intent/predicate-family variants cannot choose final domain/intent/event family.
- Raw topics map to constraints, temporal text to period candidates, numeric operands to exact comparison strings, and names to grounded subjects. Slice 1 remains authoritative for conflict checks and generic-topic removal.
- An invented official-only semantic requirement rejects. Explicit preference handling is limited to Slice 1's admitted vocabulary; this slice does not silently broaden its supported language or source rules. Unrepresented requirements fail with a typed error.
- Malformed/conflicting candidate: `INVALID_CREATE_CONTRACT`, HTTP 422. Ambiguity: `CREATE_CLARIFICATION_REQUIRED`, HTTP 422. Provider/service errors remain separate. No provider body, secret or arbitrary exception text is exposed.
- URL-only semantic extraction is deterministic: exact input resource, explicit source constraint, unresolved topic, no model call/page fetch/legacy URL suggestion or source discovery. No topic is inferred from the slug.

The existing full legacy validators still validate every projected downstream interpretation, and compatible plans use the unchanged compiler/definition validator. Invalid new-mode candidates cannot bypass those boundaries to obtain an executable plan. Old callers retain old reconstruction and validators untouched.

## Capability separation

| Case | Contract result | Existing downstream assessment |
|---|---|---|
| Manchester City | Valid development, no required-topic filter | supported; existing Google News literal criteria |
| Microsoft | Valid earnings publication, Q3 2026, source any | unsupported_temporal_constraint + unsupported_event_detection; no executable plan |
| Jannik Sinner | Valid development, exact identity, no required-topic filter | supported; existing Google News literal criteria |
| GBP/EUR | Valid threshold-crossing meaning, ordered pair, gt, exact decimal string 1.17 | clarification_required / ambiguous_recurrence; no fabricated recurrence cue |
| BBC URL | Valid exact resource/source contract, no invented topic | CREATE_FORMAT_UNSUPPORTED; no substituted source or executable plan |

The Slice 1 offline annotation remains UNKNOWN for currency/URL; the projection assessment separately explains clarification/format limitations. UNKNOWN is not interpreted as supported. No full capability resolver was added or rewritten.

## Local 5×3 method and all attempt results

Exactly **15 measured loopback HTTP planning attempts**, using an ephemeral `127.0.0.1` server mounting the real `createPlanWatchMiddleware`, real JSON request streaming, planner, interpreter parser, bridge, normalizer, projection and existing capability/compiler code. This is the same middleware mounted by `api/plan-watch.js`; no substitute test endpoint was implemented.

Authentication and provider transport were injected through the repository's established test seams (`authenticate`, `fetchImpl`, synthetic API key), as already used by existing interpreter/API tests. There were **12 mocked provider calls**, not live model calls; URL's three requests need neither extraction transport nor source fetch. No Supabase authentication/data call occurred. No API key or Production data was read.

Run variants deliberately change raw technical domain/intent, Microsoft official-event/news representations, and the third news runs' invented required-topic constraint. Assertions require complete returned JSON equality within each case, not merely HTTP 200 or equal labels. The test also compares normalized semantic fingerprints. This proves bridge stability for these synthetic extraction variants; it does not measure the probability of a live extractor returning a supported candidate. Additional direct unit/security probes are separate from the 15 measured frozen submissions.

UTC timestamps below correspond to 14:37 Europe/Monaco.

| Case/run | Timestamp UTC | Exact request | HTTP/category | Contract summary | Projection | Capability/reason | Generic interpretation failure | Drift |
|---|---|---|---|---|---|---|---|---|
| 1/1 | 2026-10-28T13:37:03.912Z | `Tell me when there are important new developments about Manchester City.` | 200 / interpreted | Manchester City; development/important_new_developments; constraints []; source any | COMPATIBLE | supported | NO | NO |
| 1/2 | 2026-10-28T13:37:03.986Z | `Tell me when there are important new developments about Manchester City.` | 200 / interpreted | Manchester City; development/important_new_developments; constraints []; source any | COMPATIBLE | supported | NO | NO |
| 1/3 | 2026-10-28T13:37:03.999Z | `Tell me when there are important new developments about Manchester City.` | 200 / interpreted | Manchester City; development/important_new_developments; constraints []; source any | COMPATIBLE | supported | NO | NO |
| 2/1 | 2026-10-28T13:37:04.010Z | `Tell me when Microsoft publishes its Q3 2026 earnings results.` | 200 / interpreted | Microsoft; publication/earnings_results_publication; 2026-Q3 (basis unspecified); constraints []; source any | SEMANTIC_ONLY | unsupported / unsupported_temporal_constraint, unsupported_event_detection | NO | NO |
| 2/2 | 2026-10-28T13:37:04.012Z | `Tell me when Microsoft publishes its Q3 2026 earnings results.` | 200 / interpreted | Microsoft; publication/earnings_results_publication; 2026-Q3 (basis unspecified); constraints []; source any | SEMANTIC_ONLY | unsupported / unsupported_temporal_constraint, unsupported_event_detection | NO | NO |
| 2/3 | 2026-10-28T13:37:04.016Z | `Tell me when Microsoft publishes its Q3 2026 earnings results.` | 200 / interpreted | Microsoft; publication/earnings_results_publication; 2026-Q3 (basis unspecified); constraints []; source any | SEMANTIC_ONLY | unsupported / unsupported_temporal_constraint, unsupported_event_detection | NO | NO |
| 3/1 | 2026-10-28T13:37:04.018Z | `Tell me when there are important new developments about Jannik Sinner.` | 200 / interpreted | Jannik Sinner; development/important_new_developments; constraints []; source any | COMPATIBLE | supported | NO | NO |
| 3/2 | 2026-10-28T13:37:04.027Z | `Tell me when there are important new developments about Jannik Sinner.` | 200 / interpreted | Jannik Sinner; development/important_new_developments; constraints []; source any | COMPATIBLE | supported | NO | NO |
| 3/3 | 2026-10-28T13:37:04.031Z | `Tell me when there are important new developments about Jannik Sinner.` | 200 / interpreted | Jannik Sinner; development/important_new_developments; constraints []; source any | COMPATIBLE | supported | NO | NO |
| 4/1 | 2026-10-28T13:37:04.037Z | `Tell me when GBP/EUR goes above 1.17.` | 200 / interpreted | GBP/EUR; threshold_crossing/exchange_rate; gt 1.17 EUR; constraints []; source any | SEMANTIC_ONLY | clarification_required / ambiguous_recurrence | NO | NO |
| 4/2 | 2026-10-28T13:37:04.042Z | `Tell me when GBP/EUR goes above 1.17.` | 200 / interpreted | GBP/EUR; threshold_crossing/exchange_rate; gt 1.17 EUR; constraints []; source any | SEMANTIC_ONLY | clarification_required / ambiguous_recurrence | NO | NO |
| 4/3 | 2026-10-28T13:37:04.044Z | `Tell me when GBP/EUR goes above 1.17.` | 200 / interpreted | GBP/EUR; threshold_crossing/exchange_rate; gt 1.17 EUR; constraints []; source any | SEMANTIC_ONLY | clarification_required / ambiguous_recurrence | NO | NO |
| 5/1 | 2026-10-28T13:37:04.046Z | `https://www.bbc.com/news/topics/c6vgy427vxklt` | 200 / interpreted | https://www.bbc.com/news/topics/c6vgy427vxklt; resource_change/https://www.bbc.com/news/topics/c6vgy427vxklt; constraints []; source only | UNSUPPORTED | unsupported / CREATE_FORMAT_UNSUPPORTED | NO | NO |
| 5/2 | 2026-10-28T13:37:04.047Z | `https://www.bbc.com/news/topics/c6vgy427vxklt` | 200 / interpreted | https://www.bbc.com/news/topics/c6vgy427vxklt; resource_change/https://www.bbc.com/news/topics/c6vgy427vxklt; constraints []; source only | UNSUPPORTED | unsupported / CREATE_FORMAT_UNSUPPORTED | NO | NO |
| 5/3 | 2026-10-28T13:37:04.048Z | `https://www.bbc.com/news/topics/c6vgy427vxklt` | 200 / interpreted | https://www.bbc.com/news/topics/c6vgy427vxklt; resource_change/https://www.bbc.com/news/topics/c6vgy427vxklt; constraints []; source only | UNSUPPORTED | unsupported / CREATE_FORMAT_UNSUPPORTED | NO | NO |

### Per-case consistency and old/new comparison

| Case | Old observed hosted behavior | New local API behavior (fixture transport) | Semantic stability | Capability outcome |
|---|---|---|---|---|
| Manchester City | correct/correct/invented required topic | 3/3 same contract, no required topic | stable | supported 3/3 |
| Microsoft | generic review failure ×3 | 3/3 same valid publication + 2026-Q3 + any source | stable | unsupported event/period 3/3 |
| Jannik Sinner | correct/correct/invented required topic | 3/3 same identity/development contract, no required topic | stable | supported 3/3 |
| GBP/EUR | generic review failure ×3 | 3/3 exact GBP/EUR, gt, string 1.17 | stable | recurrence clarification 3/3 |
| BBC URL | local-only clarification ×3, topic unresolved | 3/3 exact source-bound resource contract, topic unresolved | stable | explicit format unsupported 3/3 |

Historical hosted results are comparison evidence from the preceding task, not new requests or reproduced model outputs. No claim is made that hosted failures are fixed.

| Measure | Result |
|---|---:|
| Measured local HTTP attempts | 15 |
| HTTP 200 interpreted semantic results | 15 |
| Stable cases | 5/5 |
| Generic interpretation failures | 0 |
| Semantic drift | 0 |
| Invented constraints surviving | 0 |
| Executable-capability assessment results | 6 |
| Unsupported-capability assessment results | 6 (earnings + URL) |
| Recurrence-clarification results | 3 |
| Live model / external API / database calls | 0 |
| Persisted Watches / tokens issued | 0 |

Semantic fingerprint was identical across all three runs for each case; all five fingerprints were distinct:

- Case 1: `f19cfe439cb8a5d344266125db13e1883486504f954ce9f20c511c7a2f981b13`
- Case 2: `ca9a2961d1d90e8492829a1507b1ffdfc7e73d69c081cc672de046739c3eedbd`
- Case 3: `670f30e2679723950789da5e14819d200ef041196ebacff7b74a8c51e6c6d74b`
- Case 4: `de7fdeaeceb76e51a64365877180725ac01a44c1b6783cc820bb9ef3e3c45c14`
- Case 5: `413a47286fccdde60a69112d7b662dee70777d77c5b065a79c6e378c88e2db93`

## Tests, build and stop rules

| Check | Result |
|---|---|
| Slice 2 focused integration tests | 9/9 PASS, including the 15 loopback HTTP attempts |
| Slice 1 regression tests | 19/19 PASS |
| Directly affected planner/API/interpreter tests | 59/59 PASS |
| Existing capability tests | 28/28 PASS |
| Combined selected regressions | 106/106 PASS |
| Build | PASS, Vite 168 modules |
| Malformed/ambiguous/source/constraint safety | PASS |
| Man City existing compiler criteria equivalence | PASS |
| Original Slice 1 file hashes | Unchanged |

Commands:
- `node --no-maglev --test server/create-contract-api.test.js`
- `node --no-maglev --test server/watch-contract.test.js server/plan-watch-api.test.js server/watch-interpreter.test.js server/watch-planner.test.js server/watch-capabilities.test.js`
- `npm run build`

The focused integration test log is locally retained at `/private/tmp/watch-create-slice2-tests.log`; regression output at `/private/tmp/watch-create-slice2-regressions.log`. The evidence table above embeds the measured results, so these temporary logs are not required to read the report.

Build reports the existing Sass legacy API and large-chunk warnings. Installed dependencies were reused with a temporary symlink and no install/network resolution; the symlink was removed after checks. Generated ignored dist output remains local. No broad unrelated test suite was run.

Stop rule triggered: **NO**. Schema migration, compiler rewrite, persistence rewrite, frontend change, adapter redesign and validator weakening: **NO**. Existing persisted Watch behavior changed: **NO**. Existing interpreter prompt/schema and signed confirmation changed: **NO**.

The next authorized slice can consume this explicit server-owned contract/capability response for review integration while retaining current confirmation protections. Do not enable Preview or claim live/hosted reliability from these tests. The later frozen hosted gate still requires its own authorization and evidence.

## Integrity confirmation

No Preview or Production deployment, Production request/change, external model call, saved Watch, database row, monitoring run, cron, email, token issuance, stored-plan migration, push or merge occurred. No persisted Watch/edit behavior or unrelated feature was changed. No Production credentials, data or environment values were accessed. Exactly one Slice 2 report was created; Slice 1 evidence remains unchanged.
