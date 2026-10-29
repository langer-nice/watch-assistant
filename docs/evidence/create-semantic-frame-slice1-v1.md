# Semantic recognition — Slice 1 offline

## Scope and files

Branch `codex/create-semantic-frame-slice1`, worktree `/Users/davidlang/.codex/worktrees/create-clean-slice-a/watch-assistant`, baseline HEAD `9da52836cede716f5a8cc0e0782880eb8cb95312`. Local only; no commit/push/deploy required or performed. Existing untracked evidence reports preserved.

Exactly three new files for this task:

- `server/create-semantic-frame.js`: isolated schema, instructions, validation, defaults, provenance, normalization, injected offline extraction contract and future identity interface.
- `server/create-semantic-frame.test.js`: focused fixture tests.
- This report: `docs/evidence/create-semantic-frame-slice1-v1.md`.

No existing source file changed. No imports of this module into application/API code. No current prompt, model, config, planner, old grounding, normalizer, capability resolver, projection, compiler, signed review, persistence, frontend, Detect, Alert, email, cron, legacy/shadow or PR #70 change. The new exported instructions/schema are an offline proposed contract, not a change to the hosted extractor.

## Schema and helpers

Model-facing `createSemanticFrameSchema` is deeply frozen, strict (`additionalProperties:false`), all properties required, bounded nullable objects/arrays/text. The same schema drives local recursive validation; there is no separate permissive shape contract.

| Field | Contents |
|---|---|
| subject | nullable `{kind,value}` using exact source mention |
| monitoring_goal | `{kind,support,event}`; event is null or source-bound publication/occurrence description |
| comparison | null or `{operator,value,support}`; decimal string, no model unit |
| constraints | explicit `{role,value,support}`, role required/focus/excluded |
| time_scope | explicit `{kind,value,support}`, quarter or ISO date initially |
| source_preference | null or explicit only policy, exact source values, official flag, support |
| ambiguity | bounded semantic field, reason, support, alternatives |
| unrepresented_requirements | exact source quotes for required meaning outside the initial frame |

Goal enum: ongoing_developments, event_occurrence, threshold_crossing, source_change.
Subject enum: named_entity, metric_pair, resource_url.
Comparison enum: gt, lt, gte, lte, eq.
No sports/person/company types, technical intent/domain/predicates, graph IDs/paths, adapter/provider, capability, recurrence, compiled query or persistence authority is accepted. Unknown keys and malformed enums reject.

Functions:

- `validateCreateSemanticFrame`: strict schema plus goal/comparison/event/subject compatibility; cloned input.
- `normalizeCreateSemanticFrame`: deterministic grounding, values, defaults/provenance and explicit-requirement coverage. Returns frame, source/resolved identity status, defaults, provenance and discarded ambiguity count. Never mutates fixture output.
- `canonicalCreateSemanticMeaning`: semantic comparison view; removes source-only wording/support by construction and uses the server identity binding when supplied.
- `createExactUrlSemanticFrame`: deterministic exact-resource/source-change frame.
- `recognizeCreateSemanticFrameOffline`: inject exactly one fixture extractor for text; URL bypasses it entirely. No default transport, network, API, repair loop or second interpretation call.

## Defaults and provenance

`create_defaults.v1`: monitor_over_time=true, surface_meaningful_changes=true, relevance=relevant, source policy any unless explicit or exact submitted resource. These describe product meaning only. No cadence, active state, delivery permission/channel, official-only requirement or topic constraint is invented. Explicit no-notification/channel/cadence instructions are currently unrepresented and clarify, rather than being overwritten.

- USER_TEXT_EXACT: exact token-boundary source anchors for subject, values, period, source and URL.
- USER_TEXT_SEMANTIC: known intent/relationship classification plus verified support quote; normalized intent label need not appear in the request.
- PRODUCT_DEFAULT: versioned server policy; no fabricated text span.
- SERVER_DERIVED: source-mention identity normalization, externally supplied identity resolution reference, exact decimal/quarter/date normalization, pair-derived unit and exact resource semantics/source binding. No arbitrary model-derived unit/identity is accepted.

Provenance records are server-created semantic field labels, not old graph paths. Original spans/text remain distinct from canonical derived values. Exact URL bytes, including query/fragment/encoding, are retained; this slice does not fetch URL metadata or pages.

## Grounding and safety boundary

There is **no whole-sentence grammar or natural-language phrase whitelist**. Goal classification comes from the injected constrained semantic frame. Server checks source anchors, required typed values, goal compatibility, supported restriction roles, exact dates/amounts/source policies, contradictory directions and residual requirements. Short lexical comparator/restriction/value markers are safety checks, not the primary intent recognizer or a growing news synonym architecture.

Constraints require an actual restriction/focus/exclusion cue in their source support; merely copying general developments wording cannot turn it into a topic filter. Official-only requires explicit official/source evidence. Numeric/period values cannot be changed even under a broad support quote. Independent cue/value coverage rejects omitted numeric/date/restriction information; unsupported cadence, temporal/conditional, negation or delivery-channel requirements surface as `unrepresented_requirements` rather than disappear. A model-declared residual is anchored and blocks/clarifies. Initial unsupported temporal ranges are not guessed.

Ambiguity is structured, not an arbitrary blocking string. Source-supported competing alternatives, unresolved references and conflicting directions clarify. Ordinary clear-subject uncertainty without such support is discarded while all other checks remain required. Invalid ambiguity shape still rejects. Error codes distinguish INVALID_CREATE_SEMANTIC_FRAME and CREATE_FRAME_CLARIFICATION_REQUIRED with bounded reasons. Errors carrying residual source quotes are internal results for future clarification, not logging; no hosted/raw-output diagnostics are added.

Limit: source quotes and schema do not prove arbitrary semantic entailment or exhaustive understanding of all natural-language requirements. The semantic classifier remains a probabilistic dependency to validate in Slice 2/hosted gates. This slice proves deterministic server handling of correct extraction fixtures and the tested adversarial deviations; it does not claim universal omission detection or live model reliability. Unexpected supported-looking but incorrect goal classification is not made infallible by exact anchors.

## Four paraphrases and identity limitation

| Exact input | Default source subject | Goal | Offline result |
|---|---|---|---|
| Tell me when there are important new developments about Manchester City. | Manchester City | ongoing_developments | PASS |
| Keep me informed about Man City. | Man City | ongoing_developments | PASS |
| I want news about Man City. | Man City | ongoing_developments | PASS |
| Let me know when there is important news about Man City. | Man City | ongoing_developments | PASS |

All four share the same goal, comparison=null, constraints=[], time_scope=[], source_preference=null, ambiguity=[], unrepresented_requirements=[] and product defaults. **4/4 base intent convergence PASS.** Source mentions/provenance intentionally differ.

There is no currently trusted generic alias resolver in this repository. Per the task's explicit alias exception, production/default behavior keeps source mentions and source-folded identity distinct. No Man City alias table or canonicalization special case is introduced. `resolveIdentity` is an injected server dependency for Slice 2; a test-only verified-reference stub proves all four can yield the same canonical comparison view. The same interface is also tested on a synthetic unrelated entity. This proves interface convergence conditional on a trusted reference, **not the real Man City alias relation**. Actual canonical identity resolution remains a Slice 2 prerequisite. Four full subject-inclusive frames are not claimed equal with the default unresolved identity mode.

## Same syntax, different subjects and frozen five

Manchester City, Manchester United, PSG and SpaceX each pass with `Tell me when there are important new developments about SUBJECT.` All four have goal=ongoing_developments and empty added requirements; only the subject changes. **4/4 PASS**, no subject-specific recognition code.

| Frozen case | Semantic result |
|---|---|
| Man City | named_entity / ongoing_developments |
| Microsoft | named_entity / event_occurrence / publication of earnings results; 2026-Q3; no official-only |
| Jannik Sinner | named_entity / ongoing_developments |
| GBP/EUR | metric_pair / threshold_crossing; gt, exact decimal 1.17, derived EUR |
| BBC URL | resource_url / source_change; exact URL retained; no fabricated topic |

**5/5 represented.** Capability is deliberately absent from this offline module. Existing expectations remain supported news, unsupported earnings, partial currency and unsupported URL; none is recalculated or changed here. No Watch Contract, compiler or persistence integration is exercised in this slice.

## Adversarial coverage

All 10 required safety categories pass: changed entity, invented topic, invented official-only source, changed quarter, changed amount, reversed direction, unsupported ordinary ambiguity claim, hidden unsupported requirement, malformed enum, incompatible goal/comparison.

The named negative-fixture matrix has **15/15 correctly rejected**: adds source-present invented topic, technical authority, malformed ambiguity object, fabricated residual, substring entity, missing amount and incompatible subject kind. Separate tests cover both false-ambiguity claims being dropped, genuine competing subjects/pronoun ambiguity, direction conflict, extra hidden values under broad support, no-notification residual, explicit constraints/source/date preservation and missing requirement detection. Strict schema also rejects 10 extra model authority/old-graph keys. No model confidence score, guessed identity, graph or repair call is used.

## Determinism and one-call contract

Eight fixtures cover the four paraphrases and remaining frozen cases. **25 normalizations each = 200 repeated normalizations**, deep-equal complete results and unchanged inputs: semantic drift **0**, provenance drift **0**, product-default drift **0**. This repetition tests deterministic code, not stochastic extraction quality.

Fixture-provider interface receives the strict JSON schema and new instructions once per text input. Tests count exactly **1 text call**, **0 URL calls**, and **1 maximum before rejection** for malformed extractor output/provider exceptions. No real model was called. Validation, defaults, identity-reference binding and normalization make no model calls. Future contract/capability mapping remains deterministic and outside this slice.

## Tests, build and disposition

Focused test command: `node --no-maglev --test server/create-semantic-frame.test.js`: **29/29 PASS**, no skipped/failed tests. Directly affected existing tests: **N/A**, no existing helper was modified or imported; unrelated suites/API tests were not run. `npm run build`: **PASS**, existing bundle-size warning only. Temporary dependency symlink removed. `git diff --check`: PASS. Existing source diff empty.

KEEP: existing Watch Contract vocabulary, capability/projection/compiler, signed review, persistence, observability. MODIFY LATER in Slice 2: extraction call site, grounding integration, identity/provenance/normalizer handoff and verified issuance boundary described by the design. REPLACE LATER only for new Create: clause-preserving prompt/schema and syntax-bound recognition. RETIRE LATER from that route: closed grammar whitelist. Nothing is removed or wired here.

## Acceptance and stop

**SEMANTIC FRAME SLICE 1 PASS — offline boundary, with the task-authorized identity deferral.** Base paraphrase semantics, same-syntax subject consistency, frozen representation, source-value safety, focused adversarial cases, deterministic defaults/provenance and one/zero-call contract pass. Real alias identity convergence and live model recognition remain unproven; no hosted or full Create gate PASS is claimed.

Stop rule triggered **NO**. No sentence-template recognition, primary synonym architecture, subject-specific code, separate extractor per type, old graph/evidence paths, multiple calls, migration, capability/compiler/persistence rewrite is needed for this offline boundary. SQL migration required NO; model output schema is newly defined locally, without changing current API/DB schemas. API/frontend changed NO.

Recommendation: **proceed to semantic-recognition Slice 2**, with trusted identity resolution and complete provenance/normalizer/issuance integration as explicit gates. Do not treat the identity stub or fixture tests as evidence of a deployed resolver. No Slice 2 work has started here.

No hosted request, live model call, Preview/Production request/change, Watch save, downstream/legacy modification, push or deployment occurred.
