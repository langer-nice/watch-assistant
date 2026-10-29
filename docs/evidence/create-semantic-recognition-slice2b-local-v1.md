# Semantic recognition Slice 2B — real local API integration

## Scope and decision

**SEMANTIC RECOGNITION SLICE 2B PASS — local mocked-extraction/identity-reference gate.** Requested gate: **39/39 HTTP200**, zero generic/unsupported_clause errors or measured semantic/goal/capability drift. Alias reference verification is **PARTIAL**: deterministic trusted-reference injection is tested, but no independently verified real-world alias catalog/provider is installed. No hosted reliability/identity PASS is claimed.

Branch `codex/create-semantic-frame-slice1`; worktree `/Users/davidlang/.codex/worktrees/create-clean-slice-a/watch-assistant`; HEAD remains `9da52836cede716f5a8cc0e0782880eb8cb95312`. Changes are local, uncommitted/unpushed. No Preview, Production, hosted Supabase, live model request, email, monitoring, cron, Detect/Alert, frontend or legacy/shadow/PR #70 modification.

Slice 1's three additions remain prerequisites; its earlier report/module/tests were not rewritten in this task. Previous stopped-Slice-2 report remains unchanged. Only this new Slice 2B report is created.

## Task files changed

Production:
- `server/create-semantic-planner.js`: exported `extractCreateSemanticFrame`, one constrained frame extraction; new semantic normalization for create-core.v1.
- `server/create-subject-identity.js` (new): generic exact/verified-reference identity resolution.
- `server/semantic-watch-contract.js` (new): `normalizeSemanticWatchContract`, deterministic frame→Watch Contract mapping and revalidation.
- `server/watch-contract.js`: explicit recognition-envelope dispatch and optional semantic fingerprint context; old normalization body unchanged.
- `server/create-contract-capability.js`, `server/create-contract-projection.js`: verified identity context forwarding only; decisions/mapping/compiler calls unchanged.
- `server/structured-watch-api.js`: same server reference dependency forwarded during client-returned Create-contract revalidation at issuance. Existing authorization/confirmation/persistence algorithm unchanged.
- `server/clean-create-trace.js`: identity_resolution stage and bounded frame code/summary recognition.

Tests:
- new `server/semantic-watch-contract.test.js`, `server/create-semantic-slice2b.test.js`, `server/test-support/create-frame-fixtures.js`.
- updated `server/create-semantic-planner.test.js`, `server/create-contract-api.test.js`, `server/create-core-lifecycle.test.js`, `server/create-semantic-ambiguity.test.js`, `server/clean-create-trace.test.js` for the authorized new schema, source-validation reasons and stage order. Unsupported contracts still cannot obtain tokens; changed canonical capability annotations now reject as tampering before capability assessment. Historical graph/grounding tests remain intact.
- this report.

## Old/new normalization authority

Historical syntax gates remain in `server/watch-contract.js`: the closed development/publication/rate grammar branches and literal Monitor fallback (`vocabulary_not_supported` / `unrepresented_meaning`). No original sentence or original evidence is rewritten to satisfy them.

`normalizeWatchContract` dispatches only objects with the new recognition envelope to `normalizeSemanticWatchContract`; ordinary historical candidates still execute the unchanged old body. The new module reconstructs every contract field from `{version:create-frame.v1, request, frame}` using Slice 1 validation/grounding, defaults, provenance and the server's identity dependency. It never calls the old sentence classifier. Serialized contracts are fully reconstructed and compared, including derived fields/defaults/provenance; no client `alreadyValidated` flag or asserted identity is trusted. Unknown or modified top-level/derived metadata rejects. Normalization remains idempotent.

`/api/plan-watch?mode=create-core.v1` uses the existing request/auth/allowlist/gates and `planCreateSemantics`, which now calls `extractCreateSemanticFrame` → `validateCreateSemanticFrame` → new frame grounding/identity/semantic normalization → existing capability/projection → review. Old interpretation/default routes remain unchanged. This removes the previously blocked downstream syntax authority for new contracts, including repeated normalization in capability, projection and fingerprinting.

The new transient recognition envelope is semantic input/provenance, not execution authority. A client-returned contract is reconstructed with the server dependency at review issuance, and existing interpretation/plan equality, compiler validators, owner/mutation/revision/token checks and paused persistence remain enforced. No new token, receipt service or database schema was introduced. Full source semantic frame is returned to its requesting client for deterministic revalidation; it is not emitted to logs. Recognized goal semantics are a bounded classification, not a claim of deterministic proof of arbitrary natural-language entailment.

## Frame mapping, defaults and identity

| Frame goal | Existing downstream meaning |
|---|---|
| ongoing_developments | development / important_new_developments |
| event_occurrence + source-bound earnings publication | publication / earnings_results_publication |
| other source-bound event | other / exact event description, explicit unsupported capability |
| threshold_crossing | threshold_crossing / exchange_rate, exact comparator/value, pair-derived unit |
| source_change | resource_change / exact submitted URL |

This is semantic-vocabulary mapping, not a request-sentence regex. The existing earnings event family mapping does not parse sentence scaffolding. Server defaults stay monitor_over_time, surface meaningful changes, relevant policy and any/explicit/exact-resource source policy. No cadence, activation, notification channel, topic or official-source requirement is invented. Explicit constraints/period/source data remain source-grounded; contradictory positive/excluded topic roles reject. Currency reuses the existing decimal invariant, including rejecting zero; URL identity preserves case/encoding/query/fragment bytes.

`resolveCreateSubjectIdentity` statuses: **EXACT, RESOLVED, UNRESOLVED, AMBIGUOUS**. No lookup: exact source-name identity passes without expansion. A configured lookup with no evidence returns UNRESOLVED and preserves the literal name; no guessed alias. Multiple canonical IDs/labels return AMBIGUOUS and clarify. A supplied verified-reference record must bind the requested mention, key/label, reference version and HTTPS source URL. The dependency is server-owned; a URL alone is not proof, and the caller must provide independently verified records. Lookup results are deterministic, with stable reference ordering. No network, subject-specific production dictionary or model-provided canonical ID is used.

The gate injects an explicit **test-only verified-reference fixture** for Manchester City/Man City, source `https://identity-fixture.invalid/1`; other names remain exact/unresolved. This simulates a trusted source, not real-world verification. Production/default API configuration currently supplies no such catalog, so Man City remains distinct instead of silently expanding. Evidence must be provided by a trusted generic source to obtain real alias convergence. Tests additionally prove generic synthetic aliases, unresolved aliases, competing records, malformed references and loss-of-reference rejection after serialization. Semantic fingerprints use canonical identity and exclude wording/provenance, while projected source labels remain exact. Identical semantics do not imply identical news query/feed coverage.

## One-call contract and observability

Text: **one** constrained structured-output call, fixed eight-field Slice 1 schema/enums/instructions; existing model selection/default, low reasoning effort, timeout, 1600-token/16000-byte bounds and no-retry transport retained. Exact URL: **zero** model/discovery calls. Gate provider transport and authentication/reference inputs are mocked locally. No live model call.

Standard trace: request, semantic_extraction, semantic_validation, grounding, identity_resolution, watch_contract, normalizer, capability, projection, review. Boundaries may nest; identity follows exact source grounding. First failure/code/last PASS remains captured; identity ambiguity fails at identity_resolution. Safe summaries contain structural fields/status only, no subject names, raw requests, model frames, reference URLs/IDs, secrets or credentials. Existing privacy/logger-failure tests pass. No micro-predicate instrumentation.

New recognition uses no model-authored subjects/conditions graph or graph evidence paths. The **existing deterministic compatibility projection** still constructs the compiler's existing interpretation/evidence structure, as before; this is downstream compatibility, not semantic recognition authority. No compiler rewrite or old graph interpretation/reconstruction was introduced.

## Final local gate: all 39 records

Exactly 12 same-syntax + 12 paraphrase + 15 frozen-case planning requests in the recorded gate, through a real HTTP server bound to `127.0.0.1` and `/api/plan-watch?mode=create-core.v1`. All 39 authenticate, traverse the actual middleware/planner/normalizer/capability/projection/review and return HTTP200. Text provider calls **36**, exact URL calls **0** for its three attempts. No save/issuance is performed by this gate.

Development runs and pre-existing API/lifecycle regression tests are separate from this recorded 39-case gate; local tests were rerun during implementation. This is not a claim that only 39 HTTP requests occurred across every development/regression run. No extra hosted requests occurred. Source log: `/private/tmp/semantic-slice2b-new-tests.log` (`SLICE2B_LOCAL_ATTEMPTS`); all rows below come from the final recorded 39-case dataset.

Syntax cases: A1 Manchester City, A2 Manchester United, A3 PSG, A4 SpaceX, each in `Tell me when there are important new developments about SUBJECT.`
Paraphrase cases: B1 same Manchester City reference; B2 `Keep me informed about Man City.`; B3 `I want news about Man City.`; B4 `Let me know when there is important news about Man City.`
Frozen cases: F1 Man City reference, F2 Microsoft Q3 2026 earnings, F3 Jannik Sinner developments, F4 GBP/EUR above 1.17, F5 exact `https://www.bbc.com/news/topics/c6vgy427vxklt`, using the unchanged frozen strings in test fixtures.

| Group/case/run | UTC response timestamp | Correlation ID | HTTP | Goal | Identity status | Capability |
|---|---|---|---:|---|---|---|
| syntax/1/1 | 2026-10-29T10:24:32.224Z | `db31eb3d-39e8-4ed1-96fe-6ff6a3408aca` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| syntax/1/2 | 2026-10-29T10:24:32.237Z | `2720a13d-5016-48e1-a5cb-0d119815ed48` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| syntax/1/3 | 2026-10-29T10:24:32.247Z | `d25a85df-a5dc-4943-b58b-49fadc9de96b` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| syntax/2/1 | 2026-10-29T10:24:32.257Z | `0cfb80de-fcf8-4667-b34d-759f45a6605c` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| syntax/2/2 | 2026-10-29T10:24:32.266Z | `43546e84-aa53-4765-8304-8c52215d57d9` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| syntax/2/3 | 2026-10-29T10:24:32.270Z | `2114372c-2f88-4028-a4ea-06576b4692db` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| syntax/3/1 | 2026-10-29T10:24:32.273Z | `63891060-a881-4697-bf70-a907bf72df4f` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| syntax/3/2 | 2026-10-29T10:24:32.276Z | `ae71219b-eb42-410c-bd8d-fb555ecd00db` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| syntax/3/3 | 2026-10-29T10:24:32.282Z | `f587b892-28d5-4d76-84d1-d57157e8feb3` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| syntax/4/1 | 2026-10-29T10:24:32.286Z | `f5c9026a-5fd9-4266-8a09-e34c06066899` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| syntax/4/2 | 2026-10-29T10:24:32.289Z | `61914fbc-f4e6-4282-b9af-3763b82b59e0` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| syntax/4/3 | 2026-10-29T10:24:32.292Z | `6f3452cb-c9ba-469c-b2e7-e3c9209ee394` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| paraphrase/1/1 | 2026-10-29T10:24:32.295Z | `e9ce48e3-40fd-4ffc-8cb2-047ddeb5816c` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/1/2 | 2026-10-29T10:24:32.298Z | `cd3747aa-6a3d-4a3a-9478-df3d7fd746c0` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/1/3 | 2026-10-29T10:24:32.301Z | `2158b059-00bf-4f01-82e2-f385ecf5af97` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/2/1 | 2026-10-29T10:24:32.303Z | `c26796de-6bfa-48cb-a363-1aa73044b07e` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/2/2 | 2026-10-29T10:24:32.306Z | `0d0fdb9b-3009-46e3-b076-8edaffb83393` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/2/3 | 2026-10-29T10:24:32.309Z | `827a13d4-abba-45c5-ab18-f48a828bdfd6` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/3/1 | 2026-10-29T10:24:32.311Z | `b484214f-eef7-4e9c-b623-6bf9d5105f93` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/3/2 | 2026-10-29T10:24:32.314Z | `fb102977-6903-464a-a48e-2fd2760d97bb` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/3/3 | 2026-10-29T10:24:32.316Z | `a4932c85-9a4b-4c29-8854-88fd20556d86` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/4/1 | 2026-10-29T10:24:32.319Z | `fbe00f4b-a70f-4375-a446-6e6e33004e44` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/4/2 | 2026-10-29T10:24:32.321Z | `584c44ea-0348-45bf-b319-83de1eeca58a` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| paraphrase/4/3 | 2026-10-29T10:24:32.323Z | `3313ce9d-1ffa-42c4-9851-d1bf66e73ff3` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| frozen/1/1 | 2026-10-29T10:24:32.326Z | `2a03d506-eb07-4f52-93d1-543edcad48e1` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| frozen/1/2 | 2026-10-29T10:24:32.328Z | `c50f8bcd-8f7b-4361-93ae-6db77efe21fd` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| frozen/1/3 | 2026-10-29T10:24:32.331Z | `7a3f5732-00d3-411e-a868-ba90a6f80cf7` | 200 | ongoing_developments | RESOLVED | SUPPORTED |
| frozen/2/1 | 2026-10-29T10:24:32.333Z | `1f1f1c02-abcf-4ba7-804b-d48ac6c00b16` | 200 | event_occurrence | UNRESOLVED | UNSUPPORTED |
| frozen/2/2 | 2026-10-29T10:24:32.334Z | `464653b8-6cb1-46c6-9d8b-2f980484fa18` | 200 | event_occurrence | UNRESOLVED | UNSUPPORTED |
| frozen/2/3 | 2026-10-29T10:24:32.336Z | `b69f979b-21f8-41f9-80db-2b2f657a99a3` | 200 | event_occurrence | UNRESOLVED | UNSUPPORTED |
| frozen/3/1 | 2026-10-29T10:24:32.339Z | `b1a7ff04-142e-4c44-a5ba-4ff2ec6e14d0` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| frozen/3/2 | 2026-10-29T10:24:32.341Z | `72d7beaa-9e06-455b-bf0d-4022c1972e62` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| frozen/3/3 | 2026-10-29T10:24:32.343Z | `d6145107-f077-42e7-9a3a-c004338a11b7` | 200 | ongoing_developments | UNRESOLVED | SUPPORTED |
| frozen/4/1 | 2026-10-29T10:24:32.348Z | `5ac0b349-3e58-4aa8-b82f-b2698b119c3a` | 200 | threshold_crossing | EXACT | PARTIALLY_SUPPORTED |
| frozen/4/2 | 2026-10-29T10:24:32.350Z | `c99d8eed-860f-43d1-a165-6e111e14121e` | 200 | threshold_crossing | EXACT | PARTIALLY_SUPPORTED |
| frozen/4/3 | 2026-10-29T10:24:32.352Z | `9bb22639-b60e-4ebd-9e33-2170ffd65e5d` | 200 | threshold_crossing | EXACT | PARTIALLY_SUPPORTED |
| frozen/5/1 | 2026-10-29T10:24:32.353Z | `02823111-eef1-468a-a6bf-43565219c3b9` | 200 | source_change | EXACT | UNSUPPORTED |
| frozen/5/2 | 2026-10-29T10:24:32.354Z | `d4532327-4514-491f-b7d6-9413652a79ea` | 200 | source_change | EXACT | UNSUPPORTED |
| frozen/5/3 | 2026-10-29T10:24:32.355Z | `830414c4-a5b0-40c8-b67e-56f2a10c509c` | 200 | source_change | EXACT | UNSUPPORTED |

## Gate results and stability

- A1/A2/A3/A4: SUPPORTED review / SUPPORTED review / SUPPORTED review each; total **12/12**. Common monitoring_goal ongoing_developments YES; literal subject preserved; canonical identity expands only under the explicit test reference.
- B1/B2/B3/B4: SUPPORTED review ×3 each; total **12/12**. All 12 semantic fingerprints equal under the injected verified-reference fixture: four-paraphrase convergence **YES locally with that reference**. Without a trusted reference, the supported fallback preserves distinct names; real alias convergence is not claimed. Alias resolution verified **PARTIAL**.
- F1 Man City: SUPPORTED ×3; F2 Microsoft: semantic VALID/event_occurrence/2026-Q3, UNSUPPORTED ×3, no official-only; F3 Jannik: SUPPORTED ×3; F4 GBP/EUR: PARTIALLY_SUPPORTED ×3 with gt/1.17/EUR; F5 BBC URL: VALID/source_change/UNSUPPORTED ×3 with exact URL and no fabricated topic. Total **15/15**.
- Requested final gate **39/39**; generic failures **0**, unsupported_clause **0**, semantic fingerprint drift **0**, identity drift under fixed reference **0**, monitoring_goal drift **0**, capability drift within equivalent requests **0**, invented constraints **0**.
- Currency exact preservation **3/3 PASS**; URL exact preservation **3/3 PASS**. All equivalent repetitions have identical semantic fingerprints; all extraction constraints are empty except the explicit numeric comparison, represented separately.

These counts describe mocked correct semantic extraction/reference inputs. They prove local integration/deterministic normalization and preserve known capability results; they do not measure real model recognition reliability or an installed real alias provider.

## Safety, regression and build

- Slice 1 regression: **29/29 PASS**.
- New semantic normalizer/identity safety: **15/15 PASS** in final focused run. Includes old-path behavior, arbitrary sentence form, five mappings, malformed enums, incompatible comparison/event, hidden requirements, invented source/entity, raw-contract identity/default/capability/trigger tampering, real ambiguity, URL identity bytes, repeated verification at untrusted boundaries and contradictory topic roles.
- Identity-resolution tests: **PASS** (EXACT/RESOLVED/UNRESOLVED/AMBIGUOUS, deterministic fixture bindings, invalid evidence, serialization boundary). Actual external verification remains the explicitly uninstalled dependency.
- Real local API gate test: **PASS, 39 rows**.
- Directly affected planner/API/lifecycle/navigation/contract/ambiguity/issuance suites: **89/89 PASS**. Existing signed-confirmation and authorization tamper/owner/expiry/idempotency protections pass. Isolated mocks/PGlite test receipts are not saved application/hosted Watches.
- Capability regression: **PASS**, unchanged old contract suite and new five-case mapping outcomes. Capability/projection business decisions are unchanged; context forwarding only.
- Standard observability: **14/14 PASS**, also included in the 89-suite total. Latest combined normalizer+observability run **29/29 PASS**. Do not sum overlapping reruns as distinct coverage.
- Build **PASS**, existing bundle-size warning only. Test logs: `/private/tmp/semantic-slice2b-affected.log`, `/private/tmp/semantic-slice2b-final-safety.log`; build log `/private/tmp/semantic-slice2b-build.log`. `git diff --check` PASS; dependency symlink removed before delivery.

## Stop rules and next step

Stop rule triggered **NO**. New contracts do not use literal sentence/trigger-clause grammar. No phrase-specific language handling, manual alias/synonym architecture, per-domain language parser, extra model call, old graph authority, migration or compiler/persistence/capability redesign was needed. Historical normalization body is unchanged; new semantic contracts are explicitly dispatched. Frontend changed NO; SQL schema migration required NO; compiler rewrite NO; persistence rewrite NO.

Recommendation: **ready for hosted recognition gate**, as a separate authorized task. That gate must report the actual identity-reference availability/status; do not assume the test-only alias reference exists in hosted configuration or claim real canonical convergence without it. No Preview was deployed, and no hosted, live provider or Production request/change, application Watch creation, email, monitoring, cron or Detect/Alert work occurred in this task.
