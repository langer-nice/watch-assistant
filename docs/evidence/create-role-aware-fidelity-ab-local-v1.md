# Create A+B — bounded local implementation

**A+B LOCAL PASS — fixture/mocked-transport scope only. Recommendation: ready for hosted A+B validation as a separate authorized task.** No hosted/provider request, deployment or Production request/change occurred. No claim of measured live-model extraction/verifier accuracy.

Branch: `codex/create-role-aware-ab-local`.
Worktree: `/Users/davidlang/.codex/worktrees/create-clean-slice-a/watch-assistant`.
Base: `f1cf0f024c03883f16c6138669a7baad340bcfaf`.

## Files changed

New:
- `server/create-role-contract.js`: strict role schema, immutable-input source binding, normalization and structural role consistency.
- `server/create-fidelity-verifier.js`: independent audit instructions, bounded input summary, strict verdict validation.
- `server/create-role-planner.js`: local A+B orchestration, two-call ceiling, no repair/retry, blocked downstream on FAIL.
- `server/create-role-compatibility.js`: bounded mapping to existing semantic Watch Contract.
- `server/test-support/create-role-fixtures.js`: extraction/verifier fixtures, never a production recognizer.
- `server/create-role-contract.test.js` and `server/create-role-ab.test.js`: focused, adversarial, real loopback API and downstream boundary tests.
- This report, the only new report for this task.

Modified:
- `server/create-semantic-planner.js`: two-line server-only local dispatch/import; existing default path preserved.
- `server/clean-create-trace.js`: fidelity stage and bounded error reasons; no raw request or arbitrary model output logging.

## A — role-aware contract

**12 semantic top-level fields**, strict, bounded and non-recursive:

| Field | Representation |
|---|---|
| subjects | 1–8 independent literals, role=subject; named_entity / metric_pair / resource_url |
| monitoring_goal | ongoing_developments / event_occurrence / threshold_crossing / source_change |
| target | Optional selected literal + about/from/involving/affecting relation |
| event | Optional selected literal + publication/occurrence; actor context is the subject set |
| conditions | Selected prerequisites/after/before clauses qualifying the primary goal/event |
| exclusions | Selected negative scope, first-class exclusion role |
| constraints | Selected required/focus scope |
| comparison | Selected raw amount, fixed operator, selected direction literal |
| time_scope | Selected quarter/date; canonical period derived server-side |
| source_preference | Optional selected explicit source-policy clause, policy=only, official flag |
| ambiguity | Selected ambiguity proposal + bounded reason |
| unrepresented_requirements | Selected explicit requirement residuals |

Each literal has `role`, `value` and inclusive token `selection: {first,last}`. Extra semantic labels are fixed enums. The server tokenizes the original request, validates bounds and exact equality, then generates occurrence-specific character spans. No model-authored support quotes, graph IDs, technical domain/adapter/provider, capability or persistence decisions.

The normalized wrapper retains version, immutable request, semantic proposal, defaults, derived values, provenance and a bounded structural coverage summary. Four provenance types: USER_TEXT_EXACT spans; USER_TEXT_SEMANTIC proposals anchored to input; PRODUCT_DEFAULT with registry/version policy and no fake span; SERVER_DERIVED with deterministic rule/parent field references. EUR derives from the ordered GBP/EUR literal; Q3 2026 derives to 2026-Q3. Exact URL goal derives from the submitted resource. Field references in server provenance are not model-authored execution edges.

`validateCreateRoleStructure` validates the strict schema. `validateCreateSemanticRoles` checks slot/role tags, duplicate subjects, incompatible goal/event/comparison/subject types, contradictory positive/excluded subjects, cross-role reuse of the exact same selected range, comparator/direction equality and period multiplicity. `normalizeCreateRoleContract` binds all literals and checks decimal/pair/calendar/resource invariants.

**A does not certify arbitrary semantic roles or completeness.** A source-present invented filter can remain structurally valid; B must reject it. Coverage explicitly says `semantic_completeness: NOT_EVALUATED` and `semantic_role_fidelity: NOT_EVALUATED`. There is no lexical requirement inventory or phrase parser pretending to prove omissions.

## B — independent fidelity contract and no-repair behavior

Input:
- Immutable `request`.
- `proposed_contract`: semantic roles plus server defaults/derivations.
- `provenance_summary`: structural PASS, counts, provenance types, and bounded server-generated literal binding positions. No compiler plan, adapter/provider choice, persistence object or technical graph.

Instructions independently audit the original request first, then compare both directions for omissions, wrong roles/scope, inventions and genuine ambiguity. Separate invocation, no extraction reasoning/history. The candidate remains untrusted data. This is conceptual separation, not a guarantee that two real models will make independent errors.

Output: `{verdict: PASS|FAIL, reasons: [...]}` only. Reasons: **MISSING_REQUIREMENT, WRONG_ROLE, INVENTED_REQUIREMENT, UNRESOLVED_AMBIGUITY**. `validateCreateFidelity` rejects extra/rewrite fields, unknown/duplicate reasons, empty FAIL and PASS with reasons. PASS cannot modify the candidate. A faithfully represented ambiguity or residual still clarifies rather than becoming executable.

Exactly one completion per text extraction and one per verification, maximum **2**. Structural failure stops after call 1. FAIL or invalid verifier output stops before mapping/capability/projection/signing/persistence. Timeout/network errors stop; no automatic retry, re-extraction, third call or repair. Exact URL uses **0** completions and deterministic resource checks.

Transport is explicitly injected as `roleAwareLocalTransport.complete`; there is **no default hosted transport/fetch fallback**. `/api/plan-watch?mode=create-core.v1` selects it only through server options, retaining existing authentication/access/body gates. The new planner additionally requires development/test environment. Hosted provider integration and live verifier behavior are deliberately untested and deferred to the separately authorized stage.

## Downstream compatibility and boundaries

After B PASS, `handoffCreateRoleContract` maps compatible single-subject base forms into the existing semantic Watch Contract normalizer. Any old v1 `support` fields are generated from immutable source **by the server**, solely for compatibility, never supplied by the new model contract. Existing capability resolver, projection, compiler, signed-review authorization and persistence are unchanged.

Multi-subject targeted news, exclusions and event prerequisites remain fully present in `semanticContract`. The bounded adapter returns semantic-only/UNSUPPORTED with `CREATE_FORMAT_UNSUPPORTED`, `contract:null` and `saveEligible:false` when it cannot represent all roles downstream. It never drops a condition, target, exclusion or subject to obtain an old executable plan. This proves preservation and safe mapping limits, not new execution support for richer requests. Existing downstream deterministic technical projection is retained; it is not recognition authority.

Two new-path core cases (Manchester City and Jannik Sinner) passed through unchanged normalization, capability, projection/compiler, authorization issuance and confirmation to **two mocked paused persistence receipts**. A tampered definition was rejected before each persistence call. No real database write or monitoring activation. Existing lifecycle regression additionally passed its previous isolated tests.

## Local recognition gates

Real HTTP on 127.0.0.1; extraction and verifier completions are mocks. Latest successful core campaign: **39 requests, 39 HTTP 200, 72 mocked completions**. Tests can be rerun locally; these are campaign counts, not a claim that only 39 requests were made across development and regression reruns. One early run failed an incorrect test assertion about the existing receipt wrapper; the assertion was corrected without changing product code.

| Group / case | Runs | Goal | Capability |
|---|---:|---|---|
| Same syntax: Manchester City | 3 | ongoing_developments | SUPPORTED |
| Same syntax: Manchester United | 3 | ongoing_developments | SUPPORTED |
| Same syntax: PSG | 3 | ongoing_developments | SUPPORTED |
| Same syntax: SpaceX | 3 | ongoing_developments | SUPPORTED |
| Paraphrase: reference Manchester City | 3 | ongoing_developments | SUPPORTED |
| Paraphrase: Keep me informed about Man City | 3 | ongoing_developments | SUPPORTED |
| Paraphrase: I want news about Man City | 3 | ongoing_developments | SUPPORTED |
| Paraphrase: important news about Man City | 3 | ongoing_developments | SUPPORTED |
| Frozen: Manchester City | 3 | ongoing_developments | SUPPORTED |
| Frozen: Microsoft earnings, Q3 2026 | 3 | event_occurrence | UNSUPPORTED |
| Frozen: Jannik Sinner | 3 | ongoing_developments | SUPPORTED |
| Frozen: GBP/EUR above 1.17 | 3 | threshold_crossing | PARTIALLY_SUPPORTED |
| Frozen: exact BBC URL | 3 | source_change | UNSUPPORTED |

Totals: same syntax **12**, paraphrases **12**, frozen **15**. Same-syntax common goal YES. Four paraphrases converge to canonical fingerprint `02914f3ad4632ac3c7f2f4d1b3cea123d9c6a5de8d3a4a2825b9c376f4f17544` **using an injected server reference fixture for Man City/Manchester City**. This is not a production alias dictionary or verified real-world identity integration; without a trusted reference, source mentions remain distinct.

Microsoft preserves publication, 2026-Q3 and no official-only invention. GBP/EUR preserves ordered pair, **gt / 1.17 / EUR**. BBC preserves `https://www.bbc.com/news/topics/c6vgy427vxklt` byte-exactly without model or URL fetch.

Additional positive API cases: Gucci + Chanel both retained with target new products; Gucci retains exclusion perfumes; product X retains release event plus available-in-France condition. All **3 HTTP 200**, B fixture PASS, semantics retained, execution UNSUPPORTED as above.

## Controlled fidelity/adversarial matrix

**15 structurally valid bad candidates + mocked FAIL verdicts: 15/15 blocked HTTP 422 before downstream.** These test consumption of independent verdicts and their bounded reasons; they do **not** demonstrate that a live model can discover the errors. No fixture-based semantic classifier is used in production code.

| Bad candidate | Expected mocked reason | Result |
|---|---|---|
| Drops Chanel | MISSING_REQUIREMENT | Blocked |
| Drops perfumes exclusion | MISSING_REQUIREMENT | Blocked |
| Drops France condition | MISSING_REQUIREMENT | Blocked |
| Drops Q3 2026 | MISSING_REQUIREMENT | Blocked |
| Drops publication event | MISSING_REQUIREMENT | Blocked |
| Subject becomes target | WRONG_ROLE | Blocked |
| Event becomes condition | WRONG_ROLE | Blocked |
| Invents official-only policy | INVENTED_REQUIREMENT | Blocked |
| Invents focus from ordinary relevance wording | INVENTED_REQUIREMENT | Blocked |
| Invents user ambiguity from model uncertainty | INVENTED_REQUIREMENT | Blocked |
| Omits genuine Alpha-or-Beta ambiguity | UNRESOLVED_AMBIGUITY | Blocked |
| Prior wrong-role “rather than Beta” contrast | WRONG_ROLE | Blocked |
| Prior omitted “omit mergers” contrast | MISSING_REQUIREMENT | Blocked |
| Prior omitted publication contrast | MISSING_REQUIREMENT | Blocked |
| Prior omitted “provided …” condition contrast | MISSING_REQUIREMENT | Blocked |

A additionally rejects **14/14 structural mutations**: wrong literal, amount, direction, quarter, fabricated source literal, malformed role, event-in-comparison, condition-in-exclusion, exclusion-in-event, unsupported extra assertion, duplicate subject, invalid enum, invalid selector and conflicting role binding. Three API mutations prove no verifier call occurs after an A failure.

Verifier rewrite/malformed outputs, transport failure, verifier timeout/abort, mutation of a verifier input copy, represented ambiguity/residual despite fixture PASS, and unsafe log contents are also covered. No timeout or failure causes a third completion or a downstream call.

Within the controlled core/role campaign: generic interpretation failures **0**; syntax-bound failures **0**; good-paraphrase false rejections **0**; explicit requirements silently lost after verifier **0**; invented requirements accepted **0**; semantic/goal/capability drift **0**. These metrics assume the supplied verdict fixtures; live-model equivalents remain **unmeasured**.

Offline determinism: **25 repetitions × 8 fixtures = 200 equality checks**, no mutation or drift in semantic output, provenance, defaults, derived values or selectors.

## Tests/build and final scope

- New focused suites: **27/27 PASS** (`create-role-contract.test.js`, `create-role-ab.test.js`). Includes the 39-request gate and 18-case role matrix.
- Direct Create/compatibility regressions: **107/107 PASS** across semantic planner/frame, contract API, existing Slice 2B gate, semantic Watch Contract, Watch Contract, navigation, lifecycle and signed authorization tests.
- Capability/observability regressions: **54/54 PASS** across `watch-capabilities.test.js`, `clean-create-trace.test.js`, `semantic-frame-structure.test.js`.
- Total targeted tests: **188/188 PASS**. No unrelated full-suite run.
- `npm run build`: **PASS**; existing Vite chunk-size advisory, no build error. No dependency installation; temporary link to already-installed dependencies removed.
- Standard trace retains extraction, validation, grounding, identity, contract, normalizer, capability, projection and review, adding `fidelity_verification` with bounded verdict/reasons. Logging cannot change behavior and excludes raw request/model prose.

**Minimality:** 12 semantic fields; no recursive graph, model-authored graph IDs, phrase-specific architecture, subject-specific runtime exceptions, manual primary synonym table or domain-specific Create flows. No new model dependency. No SQL/schema migration, compiler/persistence/capability resolver rewrite or frontend change. No repair loop. Stop rule triggered: **NO**.

**A+B LOCAL PASS**, ready for the separate hosted A+B validation task, including explicit provider hookup/enablement and empirical verification of both positive paraphrases and corrupted candidates. This task does not deploy or claim that mocked verdicts establish real-model fidelity. Existing hosted/default paths remain unchanged. No Production request/change, hosted provider request, Preview deployment, merge/push, real Supabase write, email or monitoring trigger occurred.
