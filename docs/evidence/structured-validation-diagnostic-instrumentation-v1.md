# Temporary Structured validation diagnostic instrumentation

Prepared locally on 27 October 2026. Instrumentation only; no validation fix, live retry or deployment.

## Implementation and isolation

The patch is in the managed isolated checkout `/Users/davidlang/.codex/worktrees/structured-validation-diagnostic/watch-assistant`, based on verified Production commit `fb8c9c0c1ad7d28574eed5c8d85500665a30e016`. The original working checkout differs in server logging gates and contains unrelated work, so none of its files or existing evidence reports was changed.

Files changed/added in this checkout:

1. `src/js/watch-interpretation.js`: attach trusted metadata to the same existing rejection errors; add safe schema failure explanation executed only after the unchanged conformance check rejects.
2. `server/plan-watch-api.js`: include trusted validation metadata in the existing enabled Preview/Production warning log only. No new fields are added to the HTTP response.
3. `server/structured-validation-diagnostic.test.js`: 17 focused, fully mocked tests.
4. `docs/evidence/structured-validation-diagnostic-instrumentation-v1.md`: this report.

No interpreter prompt, model, transport, normalization operation, validation predicate, monitoring-plan validator, creation semantics, feature gate, account gate, UI copy, schema/migration, legacy/email/monitoring/cron behavior or Production configuration was changed.

## Exact instrumentation

`fail` retains its original message, code `INTERPRETATION_FAILED`, HTTP status 502 and existing reason. Optional metadata is attached as a non-enumerable `validationDiagnostic` property and registered in a private WeakMap. `safeValidationDiagnostic` accepts only metadata created by this validator, so arbitrary model/error properties cannot inject diagnostic payloads into logs.

`rejectFor` / `validationFailure` label all **48 existing rejection branches** across `pointer`, `reconstructInterpretation` and `validateInterpretation`. The two schema branches use `rejectSchema` / `schemaFailure`; the other 46 branch identifiers and expected conditions are listed below. The original boolean predicates, short-circuit behavior and rejection order are retained.

Schema diagnostics identify `schema.type`, `schema.enum`, `schema.object_keys`, `schema.array_length`, `schema.string_length`, `schema.string_pattern`, `schema.integer_range` or the schema constraint. For `schema.any_of`, safe explanations of the failing alternatives are included. Field paths contain only schema-owned keys and numeric array indexes. Missing fields are schema-owned names; unexpected model keys are represented by a count, never copied. Original request identity/type failure is labeled `request.identity`. Schema processing is diagnostic-only after the pre-existing schema check fails; it does not replace conformance or repair input.

| Rejection branch | Expected condition |
|---|---|
| `evidence.pointer_syntax` | valid evidence pointer syntax |
| `evidence.pointer_exists` | evidence pointer resolves |
| `evidence.unique_quote` | quote and context occur exactly once |
| `identity.unique_ids` | unique disjoint subject and condition IDs |
| `domain.predicate_consistency` | domain, intent and predicates agree |
| `evidence.exact_span` | positive span reproduces original text |
| `subject.label_grounding` | label matches grounded evidence |
| `subject.member_references` | unique existing individual member references |
| `subject.individual_shape` | individual has no group properties |
| `subject.group_shape` | group has required quantifier and membership |
| `subject.currency_label` | canonical currency matches type and lexical label |
| `membership.structure` | grounded unique values and correct eq cardinality |
| `membership.country_grounding` | country code supported by evidence |
| `membership.value_grounding` | membership value supported by evidence |
| `membership.unique_attributes` | membership attributes unique |
| `membership.other_unresolved` | other membership has unresolved requirement |
| `condition.graph_reference` | existing acyclic graph within depth limit |
| `condition.unique_args` | boolean arguments unique |
| `condition.direct_negation` | no direct condition and its negation |
| `condition.graph_coverage` | valid exclusions and all graph nodes reachable |
| `intent.required_context` | root and subject or explicit ambiguity/unresolved requirement |
| `recurrence.grounded_cue` | recurrence supported by its evidence cue |
| `recurrence.currency_ambiguity` | currency recurrence specified or ambiguity retained |
| `exclusion.negative_qualifier` | negative qualifier retained or explicitly unresolved |
| `condition.grounded` | condition has evidence |
| `condition.subject_references` | nonempty unique existing subject references |
| `news.subject_count` | news_about has one subject |
| `news.null_value` | news_about value is null |
| `condition.subject_grounding` | condition evidence includes subject labels |
| `official.source_grounding` | official event evidence includes official source cue |
| `official.organization_subject` | official event subjects are organizations |
| `numeric.required_fields` | numeric operator amount unit and positive currency amount |
| `numeric.amount_grounding` | amount occurs in evidence |
| `numeric.operator_grounding` | operator matches explicit comparison |
| `currency.pair_consistency` | distinct canonical currencies and quote unit agree |
| `currency.pair_order` | explicit base and quote are not inverted |
| `predicate.non_numeric_fields` | non-numeric operator amount and unit are null |
| `predicate.required_value` | predicate kind has required value |
| `predicate.relationship_count` | relationship or mention has at least two subjects |
| `detail.grounded` | each detail entry has evidence |
| `topic.non_generic` | topic is not generic news or updates |
| `topic.membership_overlap` | required topic does not duplicate membership filter |
| `detail.text_grounding` | detail text occurs in evidence |
| `temporal.range_order` | start does not exceed end |
| `condition.excluded_positive` | positive conjunction leaf not excluded |
| `numeric.satisfiable_bounds` | conjoined bounds satisfiable |

`validateMonitoringPlan` is outside scope and remains unchanged.

## Diagnostic schema and logging boundary

The existing `structured_interpretation_failed` log receives an optional `validation` object:

```json
{
  "code": "INTERPRETATION_FAILED",
  "failureCategory": "STRUCTURED_VALIDATION",
  "validation": {
    "category": "STRUCTURED_VALIDATION",
    "validator": "validateInterpretation",
    "stage": "validation",
    "predicate": "recurrence.grounded_cue",
    "expected": "recurrence supported by its evidence cue",
    "actual": { "recurrence": "once", "cueMatched": false }
  }
}
```

This example is a deliberately invalid **local fixture**, not a diagnosis of either missing Microsoft Production output.

Allowed emitted data: static predicate/expectation labels, reconstruction/validation stage, schema field paths and missing field names, types, lengths/counts/bounds, declared enum alternatives, validated domain/intent/recurrence enum values, array indexes and boolean failure summaries. For combined existing checks, the identifier names the existing compound branch rather than claiming which subexpression failed. Schema unions report each rejected alternative without pretending that one model branch was intended.

Explicitly excluded: raw request/prompt, full or partial arbitrary model text, full interpretation, provider body, quotation/context/subject labels, arbitrary model key names, arbitrary rejected scalar values, auth tokens, credentials, user/account IDs and article content. A deliberately malicious key and private scalar are covered by leakage tests.

No client header is copied for correlation. Vercel's existing runtime log envelope supplies its request/invocation ID, timestamp and deployment, as already observed for the two failures. This avoids trusting or logging client-supplied identifier contents.

The API adds metadata only when the existing diagnostic gate is open, error code is `INTERPRETATION_FAILED`, category is `STRUCTURED_VALIDATION`, and the private validator registry recognizes the error. The HTTP JSON construction is unchanged. Logger exceptions remain caught. The user-facing message remains exactly:

> The request could not be reviewed. Your text has been kept.

## Validation performed

All provider responses/authentication in tests are synthetic and mocked; no Microsoft request, model call, Watch creation or live service was invoked.

| Check | Result |
|---|---|
| Focused new instrumentation tests | **17/17 PASS** |
| Directly affected existing interpreter/API/creation tests | **141/142 PASS**; the single failure is reproduced on the unmodified baseline |
| Combined run | **158/159 PASS**, zero new failures |
| Baseline equivalence probe | **456/456 identical outcomes**; all **427** baseline rejections remain rejected |
| Build | **PASS**, `npm run build`, Vite built 168 modules |
| Whitespace/diff check | **PASS**, `git diff --check` |

Focused coverage: unchanged valid reconstruction and acceptance; malformed/missing schema fields; enum and union failures; evidence pointers and quotation grounding; domain mismatch with reason preserved; subject grounding; duplicate IDs; unsupported recurrence cue; missing event value; numeric-field rejection; safe server logging; no prompt/private-key leakage; forged metadata rejected; HTTP body/UI message unchanged; successful review does not log or persist; logger failure does not change rejection.

Existing test command:

```text
NODE_ENV=test node --no-maglev --test
  server/structured-validation-diagnostic.test.js
  server/watch-interpreter.test.js
  server/watch-interpreter-diagnostics.test.js
  server/watch-interpreter-corrections.test.js
  server/watch-interpreter-shared-clause.test.js
  server/watch-interpreter-role-reference.test.js
  server/plan-watch-api.test.js
  src/js/structured-watch-creation.test.js
```

Pre-existing failure: `server/watch-interpreter-shared-clause.test.js:96`, “opt-in HTTP reports only the safe domain-conflict reason; legacy response is untouched”. The test supplies neither an enabled environment nor an authenticated session, so the existing gate returns 404 before validation while the test expects 502. The exact same test fails `404 !== 502` in a clean temporary archive of unmodified Production HEAD. It was left unchanged; the new authorized Production handler tests validate the intended metadata path.

The equivalence probe compared original Production and patched modules on existing consumer fixtures, top-level deletion/type mutations and reconstruction results. It compares accepted values and original error message/code/status/reason, excluding only the new internal diagnostic. It supplements, rather than replaces, the existing rejection tests.

Build warnings were limited to the existing Sass legacy API notice and bundle-size advisory; no unrelated optimization was made. Installed dependencies were reused through a temporary local symlink; no package/lockfile change was made.

## Next failure and deployment decision

**After deployment**, the next `INTERPRETATION_FAILED / STRUCTURED_VALIDATION` rejection through these branches will identify the exact rejecting check/schema constraint, stage and safe summary, correlated through the normal Vercel request envelope. It will not reconstruct the two historical missing outputs and will not claim that the Microsoft validator bug is fixed. A schema union or compound predicate reports its exact compound check and safe alternative details, without logging the full model object.

**Production deployment occurred: NO. Production data/config/job/email changes: NO. Third Microsoft retry: NO.** Current Production cannot emit the new metadata until this patch is deployed.

Recommendation: ready for one authorized Production retry **after an explicitly approved Production deployment**. The instrumentation patch is prepared and locally verified; the pre-existing test failure is disclosed above. Explicit user approval is required before deployment and before one further live Microsoft review attempt. Neither action is included in this task. No automatic retry or new Watch creation is authorized.
