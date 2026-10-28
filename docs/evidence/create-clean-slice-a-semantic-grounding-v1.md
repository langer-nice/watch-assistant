# Clean Create Slice A — offline semantic boundary and grounding

28 October 2026. **CLEAN SLICE A PASS**. Recommendation: **proceed to clean Slice B**. This is an offline foundation result, not hosted reliability or save validation.

## Branch and diff hygiene

- Branch: `codex/create-clean-slice-a`.
- Fresh managed worktree: `/Users/davidlang/.codex/worktrees/create-clean-slice-a/watch-assistant`.
- Base: `6ba10bfaaf4d81b02594b506bc140dc14cc257a7`, the intended Slice 1–3 product foundation before all three temporary hosted trace/predicate/path-content commits. No cherry-pick of diagnostic code, PR #70, shadow/email changes or unrelated reports. Existing files/history in that baseline are not rewritten.
- Exactly four files added in the Slice A diff:
  1. `server/create-semantic-extraction.js`.
  2. `server/create-semantic-grounding.js`.
  3. `server/create-semantic-grounding.test.js`.
  4. This report.
- Old interpreter, bridge, normalizer, capability resolver, projection, compiler, SQL/persistence, API, frontend, configuration, diagnostics and other worktree remain unchanged. No integration, deployment or push.

## Small extraction contract

`createSemanticExtractionSchema` defines exactly six required keys, no additional properties. `validateCreateSemanticExtraction` validates and returns a detached clone. No transport/model implementation is introduced.

| Field | Shape and bounds |
|---|---|
| subject | Nonempty source-role string ≤500 chars, or null for unresolved meaning/exact URL; no type, graph ID or members |
| trigger | Semantic phrase string ≤500 chars or null for exact URL/unresolved meaning |
| constraints | ≤8 entries: `{kind:topic,value,role:required/focus/excluded}` or `{kind:numeric,comparator:gt/gte/lt/lte/eq,value:decimal-string}`; no model unit |
| time_scope | ≤4 explicit quarter strings `Q[1-4] YYYY`; other date vocabulary not admitted in this slice |
| source_preference | Null or nonempty source-policy/source URL string ≤500 chars; grounding must prove it |
| ambiguity | ≤4 nonempty semantic source spans; nonempty grounded uncertainty blocks handoff |

Numeric strings allow at most 12 integer and 12 fractional digits, decimal dot/comma; no exponent or float. Nullable subject does not permit a certain text extraction with no subject. Multiple conflicting subject values fail as ambiguity. Strings reject NUL/unpaired surrogate text and surrounding whitespace. Model output cannot supply input_source, unit, capability status, evidence, domain/intent/predicate, graph, recurrence, IDs, adapter/provider or persistence fields.

The validator establishes shape/required values; `groundCreateSemantics(request, extraction)` then establishes semantic consistency against the authoritative request. Shape alone never proves meaning. No schema migration is involved: this is a new in-memory extraction schema only.

## Deterministic grounding algorithm

1. Validate immutable original request (nonempty, ≤500 chars, valid text) and extraction shape. Do not mutate extraction or rewrite source text.
2. Exact http(s) URL with no whitespace/credentials takes deterministic intake. `createExactUrlSemanticExtraction` constructs a baseline with null subject/trigger, exact URL source, empty constraints/periods/ambiguity, zero model calls. Grounding rejects invented subject/topic, trigger, period or substituted source. URL bytes are retained, not URL-serialized back into a replacement string.
3. Text uses the already bounded semantic vocabulary: whole-clause development, quarter earnings publication, ordered GBP/EUR or EUR/GBP threshold, and literal `Monitor … about …` with explicit restriction/focus/exclusion/official-source clauses. Rules do not branch on person/company names or frozen entity identities. There is one extractor schema and one grounding/handoff pipeline, not separate case-specific flows.
4. Match extracted subject to its grammatical capture, not arbitrary substring membership. Unsupported coordination/extra-clause subject forms fail closed as ambiguity. No alias/identity substitution is introduced. Regex capture indices provide the exact source position even when the same word appears in subject and trigger roles.
5. Match trigger role. Earnings allows either the exact complete publication clause or the bounded semantic phrase `publishes earnings results` (similarly releases/announces/report), while evidence retains the full original clause and quarter. Threshold crossing allows the semantic phrase or exact source clause; comparator and exact decimal must independently agree with the source clause.
6. Derive candidate trigger kinds and numeric quote-currency unit from source grammar/ordered pair, never model technical hints. Decimal normalization uses string operations only, preserving exact numeric meaning. For example 1.17 stays 1.17 and high precision is not rounded; redundant zeros may normalize deterministically.
7. Verify every extraction constraint, period and source policy against the complete clause. No omitted explicit requirement or extra supplied requirement passes. News trigger wording offered as a required topic is rejected rather than turned into a filter. Official-only cannot arise from company identity. Only explicit supported source clauses or the existing exact-URL source-bound default are represented.
8. Produce server-owned evidence spans and a candidate for Slice B. No normalizer/resolver/projection/compiler/API function is called. Grounded nonempty ambiguity throws `CREATE_SEMANTIC_AMBIGUITY`; ungrounded uncertainty/claims throw `INVALID_CREATE_SEMANTICS`. No guessed contract is returned.

The closed vocabulary is deliberate. Unsupported constructions fail locally; this is not a universal semantic parser, fiscal-period resolver, fuzzy alias engine, or arbitrary date/recurrence expansion. The implementation does not claim to distinguish every possible real-world entity name: coordination/reserved clause forms outside this release's admitted vocabulary are rejected conservatively.

## Server evidence and Slice B handoff

Result shape:

```text
{
  candidate: {
    user_intent_text,
    subject: [{kind: entity|instrument|resource, value}],
    trigger: {kind, target, comparison: null|{comparator,value,unit}},
    constraints: [{kind:topic|exclude,value,role}],
    time_scope: [{kind:period,value,basis:unspecified}],
    source_preference: {policy:any|only,urls,official},
    input_source: {kind:text|url,submitted_url,metadata_ref:null},
    evidence: [{field,source_id:request,start,end,text}]
  },
  ambiguity: []
}
```

`field` is a deterministic **server** reference (`subject/0`, `trigger`, `trigger/comparison`, `constraints/i`, `time_scope/i`, `source_preference`, `input_source`), not model-authored graph evidence. Offsets are half-open UTF-16 string positions, and every evidence.text equals originalRequest.slice(start,end). Source claims and exact URL have explicit anchors. Canonical candidate values may be derived from source semantics; evidence always contains original source text, never a fabricated canonical quote.

The wrapper's `ambiguity` is outside candidate. Slice B may pass **result.candidate**, not the wrapper, into unchanged `normalizeWatchContract(candidate,{request})`. Candidate keys and scalar/array shapes match the existing function's allowlists; canonical identity/version, quarter representation and capability remain owned downstream. This is a shape/source handoff proof, not a claim that downstream integration ran. No Watch Contract, compiler, persistence or capability schema changes are needed.

## Five frozen results

| Case / exact request | Small semantic extraction | Grounded handoff result |
|---|---|---|
| Man City — `Tell me when there are important new developments about Manchester City.` | subject Manchester City; trigger important new developments; empty constraints/periods; null source; no ambiguity | PASS; entity Manchester City; development trigger; no required-topic filter; source any |
| Microsoft — `Tell me when Microsoft publishes its Q3 2026 earnings results.` | subject Microsoft; trigger publishes earnings results; time_scope Q3 2026; empty constraints; null source; no ambiguity | PASS; publication/earnings results; complete publication clause anchored; Q3 2026 retained; official=false |
| Jannik — `Tell me when there are important new developments about Jannik Sinner.` | subject Jannik Sinner; trigger important new developments; empty constraints/periods; null source; no ambiguity | PASS; identity retained exactly; development trigger; no invented topic filter |
| GBP/EUR — `Tell me when GBP/EUR goes above 1.17.` | subject GBP/EUR; trigger threshold crossing; numeric constraint gt/1.17; no model unit | PASS; instrument GBP/EUR; comparison gt/1.17/EUR, derived from source; numeric semantics reside in candidate.trigger.comparison, not duplicate generic candidate constraints |
| BBC — `https://www.bbc.com/news/topics/c6vgy427vxklt` | deterministic baseline, null subject/trigger, exact URL source; no topic/ambiguity | PASS; resource exact URL; resource_change source default; source only exact URL, official=false; 0 model calls |

No capability, executable plan, signed review or persisted Watch is produced by Slice A. Existing downstream unsupported/partial outcomes are not changed or asserted to have been revalidated here.

## Invalid/adversarial fixtures

**17/17 primary invalid fixtures rejected**:

1. Man City invented required topic.
2. Microsoft invented official-only source.
3. Microsoft Q3→Q4 mutation.
4. Jannik identity substitution.
5. GBP/EUR 1.17→1.18 mutation.
6. GBP/EUR above→below/comparator mutation.
7. URL fabricated topic/subject.
8. Multiple conflicting subjects (ambiguity error).
9. Malformed exponential numeric value.
10. Malformed Q5 quarter.
11. Missing required certain-text subject.
12. Missing required extraction key.
13. Explicit source-grounded ambiguity (blocks handoff).
14. Fabricated ambiguity span.
15. Source-backed generic trigger wording invented as required topic.
16. Substituted URL source preference.
17. Model-invented numeric unit field.

Additional targeted checks reject 12 forbidden graph/technical fields independently; detect disjunction hidden under certainty; reject omitted explicit literal constraints/source, negation and appended instructions. Positive literal fixtures prove actual required-constraint and source-preference evidence; repeated `news` roles prove offset selection by grammatical position. Earnings exact-clause and semantic-phrase variants converge. Numeric property order/redundant zeros converge without rounding; reversed pair/direction/high precision and URL percent/query/fragment bytes are tested.

## Determinism, independence and verification

- Focused offline suite: **32 tests, 32 PASS**, 0 failures; includes rejection of multiple literal role delimiters rather than first-match selection.
- Repeated grounding: 20 repetitions for each of 5 frozen pairs (100 repetitions), identical serialized complete outputs; semantic drift=0, evidence drift=0, offset drift=0.
- No input mutation; schema frozen; validator returns a clone.
- Extraction helper imports nothing; grounding imports only the new extraction helper. Tests inspect that dependency boundary and prove there is no call to fetch, normalizer, compiler or capability resolver.
- Old model subjects/conditions graph required: NO. unresolvedRequirements required: NO. Technical recurrence/domain/intent/predicate/model evidence paths/IDs required: NO.
- Intended future text extraction budget: one semantic model call; no repair chain. Calls made by Slice A helpers/tests: **0**. Exact URL baseline: **0** required.
- Watch Contract handoff compatible: **YES at candidate shape/grounding level**; integration intentionally deferred to Slice B.
- Directly affected existing pure-helper suites: **N/A**, no existing helper changed. No broad suites run.
- `npm run build`: **PASS**, existing bundle-size warning only. Build used a temporary symlink to existing installed dependencies; no install/lockfile change. Symlink removed after verification.
- `git diff --check`: PASS.

## Stop rules and next boundary

Stop rule triggered: **NO**. No schema migration, compiler/persistence/resolver rewrite, API/frontend integration, model call, live URL metadata, separate per-case extractor, old graph/evidence dependency, old bridge patch, Detect/Alert/email/adapter change or diagnostic expansion was necessary.

Classification: **CLEAN SLICE A PASS**. Recommendation: **proceed to clean Slice B**, which alone owns mounting this boundary and calling the existing normalizer/resolver/projection/review stack. Do not interpret this offline result as a hosted pass or expand the admitted language/semantic vocabulary without an explicit scope decision.

No hosted/Production application request, deployment, config/model/data change or Production change occurred. The only implementation is the three new offline Slice A source/test files and this report.
