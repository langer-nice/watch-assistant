# Create core replacement — Slice 1 offline foundation

28 October 2026. **SLICE 1 PASS** for the bounded offline contract/normalizer/projection foundation. Recommendation: **proceed to Slice 2**. This does **not** prove hosted CREATE is fixed; no hosted 5×3 run occurred.

## Isolation and files

- Branch: `codex/create-core-slice1`.
- Worktree: `/Users/davidlang/.codex/worktrees/create-core-slice1/watch-assistant`.
- Baseline: `89d2cb175024297016470b019d3a9ae0919477d6`, `codex/local-canonical-watch-contract`.
- The baseline includes the existing canonicalizer prototype. It is neither edited nor imported by Slice 1. No diagnostics, PR #70, legacy or notification patch was mixed into the new diff.
- The original dirty checkout and its untracked design/measurement reports were left unchanged. The replacement-plan report from the preceding task was read as the design input; it was not copied/modified in this branch.

Exactly four new files comprise the Slice 1 change:

1. `server/watch-contract.js` — contract, deterministic normalizer and semantic fingerprint helper.
2. `server/create-contract-projection.js` — pure compatibility projection.
3. `server/watch-contract.test.js` — focused offline fixtures, variants, grounding and compatibility tests.
4. `docs/evidence/create-core-slice1-contract-normalizer-v1.md` — this single evidence report.

No existing source file, package/lockfile, configuration, migration, compiler, persistence module, adapter, API or frontend was modified. Work is uncommitted; no push/PR/deployment occurred.

## Contract and responsibilities

`normalizeWatchContract(candidate, context = {})` accepts a semantic candidate and optional authoritative `context.request`. It returns plain, versioned JSON; does not mutate input; performs no network, model, database or storage operations. The same function accepts its normalized output for idempotence. Invalid evidence/conflicts throw `INVALID_WATCH_CONTRACT` with a bounded reason code rather than invent meaning.

| Field | Representation / ownership |
|---|---|
| `version` | `watch-contract.v1` |
| `user_intent_text` | Exact original request; must match authoritative context if supplied |
| `subject` | Array of `{kind: entity/resource/instrument, value, identity}`; source-exact value, deterministic comparison identity |
| `trigger` | `{kind, target, comparison}`; comparison null or `{comparator, value, unit}` with exact decimal string |
| `constraints` | `{kind, value, role}` entries for explicit required/excluded/focus semantics; no general-news filters |
| `time_scope` | `{kind: period, value: 2026-Q3, basis: unspecified}` for the supported explicit quarter grammar |
| `source_preference` | `{policy: any/prefer/only, urls, official}`; only grounded policies admitted by this bounded implementation |
| `input_source` | `{kind: text/url, submitted_url, metadata_ref: null}`; no offline metadata invention |
| `evidence` | `{field, source_id: request, start, end, text, rule}`; half-open exact request spans, deterministic derivation rules where applicable |
| `capability_status` | UNKNOWN/SUPPORTED/UNSUPPORTED/PARTIALLY_SUPPORTED vocabulary; offline outputs recomputed from bounded supported shapes, not trusted from candidate |

For the implemented reference vocabulary, news is known supported by the unchanged compiler; earnings publication is known unsupported; currency recurrence and URL execution remain UNKNOWN. This is a small offline status model, not a full capability resolver or save authorization.

Normalization owns exact input/source retention, source-grounded subject identity, bounded trigger synonyms, exact decimal/comparator normalization, quarter normalization without a fiscal/calendar assumption, explicit-source checks, optional constraint preservation, conflict rejection and canonical evidence. Generic “important new developments” is trigger wording, so an evidence-grounded candidate that labels it as a required topic converges to an empty topic-filter list. Arbitrary invented restrictions are rejected, not silently discarded.

Technical candidate hints are accepted only in the small optional `technical` object (`domain`, `intent`, `predicate`) and are never copied into the contract or used to select execution. Microsoft's model-style technical variants converge from the complete unambiguous source clause. An invented official-only semantic policy is rejected. No technical hint grants capability.

`watchContractSemanticFingerprint` compares normalized meaning while excluding original wording/evidence/capability annotation. It supports the tested news/development paraphrase equivalence and distinguishes different subjects. It is not an ownership, authorization or cross-account duplicate key.

### Deliberate vocabulary limits

This is not a universal natural-language parser. It uses whole-clause rules for general news developments, quarter earnings publication and ordered GBP/EUR or EUR/GBP thresholds, plus exact URL input. A small literal `other` fallback supports grounded unknown meaning with explicit restriction/focus/exclusion/source clauses. Whole-clause matching prevents silently discarding trailing qualifiers. Unknown constructions outside those rules are rejected locally; model integration and wider language coverage are not implemented.

Names retain their source spelling; identity uses Unicode/whitespace/case normalization. No new alias database, officeholder resolution, metadata lookup or equivalence between different unverified names is invented. Evidence is currently request-only. Different raw requests retain different original text/evidence; semantic equivalence is compared with the fingerprint, not byte equality of provenance-bearing objects.

## Frozen inputs and before/after results

These exact five inputs are represented in the offline fixtures:

1. `Tell me when there are important new developments about Manchester City.`
2. `Tell me when Microsoft publishes its Q3 2026 earnings results.`
3. `Tell me when there are important new developments about Jannik Sinner.`
4. `Tell me when GBP/EUR goes above 1.17.`
5. `https://www.bbc.com/news/topics/c6vgy427vxklt`

| Case | Raw semantic variant(s) | Normalized Watch Contract | Projection status | Offline capability |
|---|---|---|---|---|
| Manchester City | General developments; same plus required-topic phrase | Manchester City; development / important_new_developments; constraints []; source any | COMPATIBLE: existing news plan/definition/source validators pass | SUPPORTED, without save authorization |
| Microsoft | Publication; media_news/official_company/other technical tags; event/official announcement/news representations | Microsoft; publication / earnings_results_publication; 2026-Q3 basis unspecified; source any | SEMANTIC_ONLY: valid `interpretation.v1`, unchanged assessment rejects event detection and temporal execution | UNSUPPORTED |
| Jannik Sinner | General developments; same plus required-topic phrase | Exact Jannik Sinner identity; development; constraints []; source any | COMPATIBLE: existing news plan/definition/source validators pass | SUPPORTED, without save authorization |
| GBP/EUR | Above/gt decimal semantic input; decimal lexical normalization separately tested | GBP/EUR; threshold_crossing / exchange_rate; comparator gt; exact string 1.17; unit EUR | SEMANTIC_ONLY: valid currency interpretation; compiler requires recurrence clarification | UNKNOWN |
| BBC URL | Exact supplied URL | Resource at that exact URL; resource_change; `only` exact URL; no invented topic; metadata null | UNSUPPORTED projection: no lossless current format mapped; no substitute feed | UNKNOWN |

## Compatibility projection

`projectWatchContractToLegacyPlan(input)` re-normalizes/validates input, then deterministically creates the minimum existing downstream shape. Returns status, capability status, interpretation, assessment, optional plan/definition/source, and `persistence_authorized: false`.

- **COMPATIBLE:** calls unchanged `validateInterpretation`, `compileMonitoringPlan`, `createWatchDefinition`, `structuredMonitoringSource` and `validateWatchDefinition`. Man City and Jannik pass. Existing approved aliases, edition, query generation and limits remain compiler-owned.
- **SEMANTIC_ONLY:** Microsoft and currency produce validator-compatible interpretations without a fabricated executable plan or stored definition. Microsoft carries the exact original quarter and no official-company predicate. Currency carries two ordered canonical currencies, `gt`, and decimal string `1.17`.
- **UNSUPPORTED:** URL or an unsupported contract format remains intact as a semantic contract; returns explicit `CREATE_FORMAT_UNSUPPORTED`, no interpretation/plan/source substitution and no definition.

Compatibility is tested against the unchanged pure definition-validation boundary; no RPC or database is invoked. This is not proof of a hosted save, deployed SQL configuration, account eligibility or activation readiness.

For news subjects the projection uses the compiler-supported neutral `topic` type, avoiding an ungrounded person/company taxonomy decision from a name alone. Names and execution criteria remain identical. Tests compare projected criteria, generated source, adapter and limits against independently built existing organization/person fixtures. Full legacy interpretation/fingerprint byte identity is not claimed: the neutral descriptive type and evidence layout differ. Existing persisted definitions/fingerprints are never rewritten.

### Currency recurrence limitation

The new semantic contract preserves the requested threshold-crossing meaning. The unchanged old validator only accepts `crossing` recurrence with explicit lexical cues such as “crosses”; the frozen “goes above” request does not meet that old evidence rule. Projection therefore does **not** invent a recurrence cue, weaken validation, rewrite the request or choose a notification policy. It emits `recurrence: unspecified`; assessment returns `clarification_required` / `ambiguous_recurrence`. Numeric semantics remain exact, but no executable currency plan is claimed. A future integration must expose this limitation separately; changing currency execution is outside Slice 1.

No compiler/persistence redesign is needed to produce these semantic projections and the two supported news definitions. No attempt was made to force unsupported cases into old executable formats.

## Variant convergence and evidence safety

The explicitly counted synthetic corpus contains **16** variants:

- 5 canonical reference candidates.
- 2 general-development candidates with the observed invented required-topic constraint.
- 3 Microsoft technical domain/predicate variants.
- 1 Microsoft news-oriented representation.
- 5 invalid variants: invented official-only policy, invented transfers topic, wrong quarter, wrong comparator, substituted URL source.

**11 converge correctly; 5 reject safely. Semantic drift among accepted corpus outputs: 0. Invented unsupported constraints surviving: 0.** This counts the explicit corpus only; additional negative probes/paraphrases below are focused test coverage, not hidden hosted attempts or additions to the frozen input set. All Microsoft variants are synthetic category fixtures, not recovered historical model outputs.

Additional checks prove:

- Every output evidence span reproduces original text. Subject/trigger/period/numeric evidence is mandatory. Missing/shifted/out-of-bounds spans, model-memory sources and technical paths fail.
- Subject, period, comparator, amount, pair unit and exact source conflicts cannot silently pass. Numeric inputs must be decimal strings, not floats; an exact 12-place decimal remains exact; exponent/NaN/different-value probes fail.
- Explicit official-source policy and optional focus/restriction clauses survive only with source evidence. Removing an explicit constraint or altering its restrictive role fails.
- Generic development wording is safely removed from candidate topic filters; unrelated invented topics reject.
- Repeated identical words can use different exact spans; no unique-quote precondition is reintroduced.
- Exact URL spelling, percent encoding, case, query order and fragment survive unchanged; no canonical redirect/substitute source is invented.
- All five normalized reference contracts are fully idempotent, including evidence; the grounded unknown fallback is also idempotent.
- All five projections are deterministic, reject tampered semantic input, and make no fetch calls. Definition tampering remains rejected by the unchanged validator.

## Verification

| Check | Command / result |
|---|---|
| New focused offline tests | `node --no-maglev --test server/watch-contract.test.js` — **19/19 PASS** |
| Existing pure capability/compiler tests | `node --no-maglev --test server/watch-capabilities.test.js` — **28/28 PASS** |
| Build | `npm run build` — **PASS**, Vite 168 modules |
| Numeric preservation | **PASS** — gt and exact decimal 1.17, plus 12-place precision probe |
| URL preservation | **PASS** — frozen BBC URL and encoding/query/fragment probe |
| Reference idempotence | **PASS**, 5/5 |
| Downstream changes | None; original compiler, definition validator, SQL/RPC, adapters and persistence unchanged |

Build reports Sass legacy-JS-API and >500 kB chunk warnings. No styling, bundling configuration or unrelated optimization was changed. Existing installed dependencies were reused via a temporary local symlink; no install or network/package resolution was performed. The symlink was removed after validation. Generated ignored `dist/` is local build output, not a deployment or source change. The new modules are not imported by the application, consistent with the no-integration scope.

No broad test suite, browser test, live model call, API request, Preview/Production request, Watch save, migration or deployment was performed.

## Stop rules and next step

Stop rule triggered: **NO**. Schema migration required: **NO**. Compiler rewrite: **NO**. Persistence rewrite: **NO**. API/frontend changes: **NO**.

Unsupported URL projection and currency recurrence are reported boundaries, not reasons to alter downstream behavior. If later work requires weakening those boundaries or redesigning downstream formats, stop/review under the approved plan.

Recommendation: **proceed to Slice 2** with the small semantic extractor boundary, preserving the disclosed bounded vocabulary and explicit unsupported/clarification outcomes. No Slice 2 implementation or model access was started. Hosted CREATE reliability remains unproven until the unchanged 5×3 gate passes in its separately authorized phase.

No code outside the three new offline implementation/test modules changed. No API integration, frontend change, model/prompt change, Preview deployment, Production request/change, data/config/job/email change or downstream feature investigation occurred. Existing Auth/RLS, signed confirmation, atomic persistence, Detect/Alert, adapters, story-following, shadow/PR #70, legacy and notification behavior remain untouched.
