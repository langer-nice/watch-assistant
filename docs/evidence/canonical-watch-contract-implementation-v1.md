# Canonical Watch contract — local implementation v1

27 October 2026. LOCAL ONLY. No commit/push, PR, Preview/Production deployment, hosted query, model call or Production retry.

## Implementation and isolation

Checkout: `/Users/davidlang/.codex/worktrees/structured-validation-diagnostic/watch-assistant`.
Local branch: `codex/local-canonical-watch-contract`; baseline `c4f5275272261ac37d28146bac3da9b318810d49`.

Exactly these implementation files were changed/created in this task:

1. `server/watch-interpretation-canonicalizer.js` — new pure canonicalizeWatchInterpretation helper.
2. `server/watch-interpreter.js` — import helper and pass it to reconstruction.
3. `src/js/watch-interpretation.js` — optional default-identity canonicalize hook; same final validator.
4. `server/watch-interpretation-canonicalizer.test.js` — 12 focused local tests.
5. `docs/evidence/canonical-watch-contract-implementation-v1.md` — this report.

The original primary checkout contains unrelated work and was not edited. Earlier untracked design/evidence reports and the pre-existing modified occurrence-diagnostic report in this checkout were left unchanged. No schema, compiler, persistence, prompt, model, UI, email, cron, legacy or shadow file was edited. No migrations/AGENTS instructions apply to these implementation paths.

## Exact boundary / input-output contract

interpretWatchRequest keeps its existing model request/parser/shape checks, then calls:

`reconstructInterpretation(output, request, { canonicalize: canonicalizeWatchInterpretation })`.

Reconstruction still performs strict output-schema checks, evidence-pointer resolution and exact unique quote/context lookup, followed by existing narrow lexical normalization. It invokes the optional hook immediately before the same validateInterpretation call. Other callers use the identity default. The hook cannot bypass final semantic validation; a focused test verifies rejection even if a supplied transform returns an invalid graph. No server import is added to the shared browser module.

The new helper receives an interpretation.v1-shaped reconstructed draft and immutable original request. It returns a same-schema draft without mutating its input. It has no network/database/configuration/persistence access and adds no class, adapter, capability approval, provider endpoint or delivery fields. Outside the bounded normalization vocabulary it returns the original draft unchanged.

Unsafe in-scope mappings throw the existing INTERPRETATION_FAILED / statusCode 502 error contract without arbitrary content; existing interpreter validation-phase handling supplies STRUCTURED_VALIDATION. Existing exact quote and semantic rejection diagnostics remain in their original modules. No new logging is introduced.

## Minimum viable normalization vocabulary

One source-supported publication rule recognizes the explicit construction “Tell me/Let me know/Notify me/Alert me when [organization] publishes/releases/announces its Q[1–4] [year] earnings results/report”, optionally followed by a nonrestrictive including-list. It is a bounded semantic rule within one interpreter pipeline, not a new top-level Watch class, company-name allowlist, route or persistence format.

The rule has no Microsoft string/UUID special case. A same-construction organization-label probe confirms this. Other news constructions remain unchanged, including those that merely mention earnings wording outside the explicit supported trigger form. Ambiguous or materially qualified in-scope constructions fail safely instead of dropping source/date/other requirements.

Normalized deterministic fields:

- domain=media_news; intent=event.
- s1 individual organization with exact source label, no group properties or invented aliases.
- c1 event(s1), value=earnings_results_publication; null operator/amount/unit; root=c1.
- Q3 2026 (or the exact supported quarter/year source string) retained as temporal.text, relation unspecified, null dates/timezone. No release date/fiscal-calendar interpretation.
- Including-list mapped in source order to coverage_focus topics, preserving “major AI/cloud commentary”. It is not an all-topics requirement.
- Stable source-supported evidence paths/spans and references.

Model-derived identity/linkage and semantic candidates must be supported by the original request. Valid recurrence is retained rather than guessed; unsupported once recurrence without an explicit cue still fails the unchanged validator. Extra entities, conditions, geography, exclusions, ambiguity/unresolved requirements, numeric fields, unrelated event categories, contradictory period values/dates or unsupported topic labels are not silently removed.

Supported candidate forms include news_about/null and a bounded set of equivalent earnings event labels, including the observed official_company_announcement classification. Domain variants media_news/official_company/other/unknown converge only with the unambiguous supported publication source and all safety preconditions. This does not alter legitimate official-source validation elsewhere.

## Evidence and official-source safety

Model schema, malformed pointers and missing/nonunique quotes reject **before** the hook. Within the hook all existing reconstructed spans and pointers are verified before redundant representations are replaced; subject and condition evidence must be present. Provided topics/temporal entries require their own evidence. A missing subject/condition path is not repaired by invented support.

Canonical event/period/focus support is deterministically extracted from actual contiguous source substrings. Every returned evidence.text equals originalRequest.slice(start,end); anchors must be unique. No concatenated quote, normalized source text, guessed alias, missing quote or arbitrary official cue is accepted. Source-derived support can restore a clearly requested period/detail omitted from the candidate without adding words absent from the source.

Explicit official-only/preferred-source or extra time qualifiers cannot match the bounded complete construction and are rejected rather than removed. Source-related unresolved requirements also reject. Other existing official-source requests outside this rule keep their prior path. Company identity alone never activates an official predicate: source-supported ordinary publication semantics normalize to a nonofficial event label, and existing official.source_grounding remains unchanged.

## Before / after comparison

| Case | Candidate / before | Local canonical result |
|---|---|---|
| Man City | audited request, s1 organization, c1 news_about, media_news/ongoing_news, three exact evidence entries | deep-equal interpretation, same evidence, plan/query/source and definition/fingerprint |
| Microsoft simple | synthetic event/news_about candidates and media_news/official_company tags corresponding to observed safe categories | media_news/event, Microsoft, earnings_results_publication, Q3 2026; no optional topics |
| Microsoft rich | same candidate families; optional details absent or represented as required topics with valid evidence | same semantic base; revenue/EPS/guidance/major AI-cloud commentary retained as source-exact coverage_focus |

Historical failed full model objects were not retained. Variant tests are explicitly **synthetic fixtures of observed categories**, not authentic payload replays or a claim that every future model representation is supported.

Man City fixture reproduces audited request, subject/condition IDs and three spans. The resulting plan fingerprint matches the retained Production fingerprint exactly:

`f22ae3b41e66f4e36d6acb5f46a533f4cc375a7911afc070b1838a7e87e6a2b2`.

The canonicalizer returns that already-valid draft by identity. Both before/after createWatchDefinition values are deep-equal, including provenance. No live Watch was read or written to perform this test.

## Capability separation

A mocked interpreter call returns Microsoft with status=interpreted, executable=false, capabilityStatus=not_assessed. It then passes validateInterpretation. Existing assessCapabilities returns unsupported with unsupported_event_detection and unsupported_temporal_constraint; plan is null. compileMonitoringPlan rejects with MONITORING_PLAN_NOT_SUPPORTED rather than claiming interpretation-invalid.

No execution support, earnings adapter, literal Microsoft-only fallback or official-first policy was added. The current browser already assesses capability before issue/confirm, so unsupported meaning is not persisted. Existing server definition/plan validation remains mandatory. No persistence API or RPC was invoked in new tests.

## Verification results

| Check | Result |
|---|---|
| Focused canonicalizer tests | **12/12 PASS** |
| Directly affected interpreter/reconstruction/API diagnostics | **134/135 PASS**, one independently reproduced baseline failure |
| Structured capability/definition/creation regressions | **73/75 PASS**, two independently reproduced baseline failures |
| Default reconstruction baseline comparison | **180/180 identical outcomes**, including **170 preserved rejections** |
| Build | **PASS**, Vite 168 modules |
| Diff whitespace | **PASS** |

Focused coverage: exact Man City identity/query/definition/known fingerprint; simple/rich semantic base; idempotence; domain/intent/event-tag variants; non-allowlisted organization label; source-supported topic-role/period normalization; explicit source/extra constraints not dropped; ambiguous subject, conflicting event/time, numeric fields and missing/fabricated evidence rejection; quote errors before hook; final validator after hook; one mocked interpreter call; unchanged other news constructions.

Commands were limited to the new test file, directly affected interpreter/reconstruction/API tests, server/watch-capabilities.test.js, server/watch-definition-foundations.test.js, src/js/watch-definition.test.js, src/js/structured-watch-creation.test.js, and npm run build. No unrelated broad suite was run. Temporary dependency symlink was removed; no dependency/lockfile change.

Three existing failures, reproduced on a clean archive of the unmodified c4f5275 baseline with the same dependencies:

1. server/watch-interpreter-shared-clause.test.js:96 — existing disabled/auth gate yields 404, fixture expects 502.
2. server/watch-definition-foundations.test.js:39 — existing gate yields STRUCTURED_FEATURE_UNAVAILABLE, fixture expects STRUCTURED_EXECUTION_DISABLED.
3. src/js/watch-definition.test.js:66 — existing company hydration adds whyFollowing:'' while expected definition omits it.

Baseline reproduction: 18/21 pass, the same three failures. These tests/product behaviors were not repaired. No new regression was observed. The default-hook comparison excludes only the intentionally opted-in normalization path; it proves existing two-argument reconstruction outcomes stay unchanged, not that intended Microsoft behavior stays unchanged.

Build warnings were existing Sass legacy API and chunk-size notices. Local log files: /tmp/canonical-focused-tests.log, /tmp/canonical-direct-tests.log, /tmp/canonical-structured-tests.log, /tmp/canonical-baseline-tests.log and /tmp/canonical-build.log.

## Limits and next review

The helper is a minimum viable, fail-closed semantic normalization rule, **not a universal natural-language parser**. It currently accepts explicit English quarter/year earnings-publication constructions and a single supported organization/condition shape. Multiple condition graphs, alternative period representations, unrecognized qualifiers, expanded topic labels and genuine source preferences may still fail safely. Future vocabulary requires evidence-preserving review, not additional top-level flows or automatic broad acceptance.

There is no captured rejected Production payload to prove coverage of all past Microsoft runs. Local synthetic convergence does not claim the Production issue is fixed. Preview review must assess the narrow vocabulary coverage and the three disclosed baseline failures; Preview deployment/traffic requires a separate task/authorization. Current Microsoft earnings execution remains unsupported by design.

Schema migration required: **NO**. Compiler changed: **NO**. Persistence changed: **NO**. Man City behavior changed: **NO**. Existing validation rules/safety weakened: **NO**; intended source-supported Microsoft representations are normalized before the unchanged gate, while malformed evidence still fails.

Implementation classification: **LOCAL IMPLEMENTATION READY FOR PREVIEW REVIEW**, with bounded-language and baseline-test limitations explicitly disclosed. Recommendation: **ready for Preview validation** after separate authorization. No additional local functional blocker was found within the authorized proof cases.

No deployment occurred, including Preview. No push/merge/PR occurred. No Production retry or Watch creation occurred. No Production data/config/schema/job/email state changed. No cron/monitoring/email operation was triggered. Only the five listed implementation files were changed in this task; earlier unrelated local work remains untouched.
