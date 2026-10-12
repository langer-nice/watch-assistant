# Phase 3: isolated deterministic capability assessment

`server/watch-capabilities.js` exports the immutable `capabilityRegistry`, pure
`assessCapabilities`, `compileMonitoringPlan`, and `validateCompiledMonitoringPlan`.
No endpoint, UI, Watch persistence or execution calls them automatically. They
do not call AI, providers, source discovery, databases, schedules or notifications.

Assessment validates InterpretationV1 first and returns `supported`,
`unsupported`, `clarification_required`, or `invalid_interpretation`, plus stable
reason codes, field references and targeted clarification options. Every typed
mandatory requirement is evaluated; unsupported requirements are not discarded.
AI/provider failures remain a separate interpreter concern. An alternative is
only a proposal requiring confirmation and fresh interpretation, never a plan.

## Confirmed registry

| Adapter | Approved behavior | Important boundaries |
|---|---|---|
| `google_news_literal_v1` | Individual literal subject phrases; same-article AND/co-occurrence; bounded literal topics/exclusions | Titles/excerpts only; approved existing aliases; first 20 retrieved items; no independent OR, groups or semantic event detection |
| `ecb_reference_v1` | GBP/EUR unit-base thresholds, exact `gt`/`gte`, explicit once/crossing or changed-reference observations | Published reference rates, not continuous markets; existing daily policy requires a changed rate and a new publication date |
| `bodacc_siren_v1` | New BODACC notices for one valid request-supplied SIREN | Explicit BODACC scope, France, first 100 notices; no arbitrary issuer announcements, countries or event subtypes |

Unspecified news/company recurrence remains unspecified in the plan; existing
new-item behavior is described rather than invented as a requested policy.
Unspecified currency recurrence requires clarification. General per-observation
FX recurrence is unsupported: mapping it to existing `daily` would drop satisfied
publications with unchanged rates. Only explicit changed-published-rate wording
recognized by the existing policy helper can compile to `daily`.

Media coverage-focus topics are preserved as metadata, not query filters.
Required topics and exclusions use the existing literal matching/query semantics;
semantic clauses that cannot map to these remain unsupported. Hard geography,
exact article-language requirements and temporal filters are not approximated by
a Google News edition. `GB:en` is a fixed provider edition preference for these
isolated plans; it is independent of interface/input language, not a geographic
guarantee. Edition preference/coverage must be shown explicitly in Phase 4 review.

An open group never becomes a literal query or invented roster. Closed groups
also remain unsupported. Independent OR is never compiled to all-subject
matching. Plain co-occurrence does not detect collaborations. Article/story URL
monitoring retains its legacy route: this interpretation format cannot yet carry
its trusted URL/story profile, so no structured story capability is advertised.
Tickets, stock, general prices and other events have no approved compiler here.

## Plan boundary and compatibility

MonitoringPlanV1 now permits a strictly bounded `supported` variant while retaining
the earlier `not_assessed` placeholder. All plans remain `executable:false`.
Plans include the registry/interpretation versions, original request, SHA-256
fingerprint, approved adapter, logical graph, normalized subjects, constraints,
requested recurrence, deterministic adapter criteria and limitations.
Criteria contain no arbitrary URL, SQL or AI-generated execution instructions.

The fingerprint binds the entire validated interpretation, including evidence.
It is provenance, not authentication or authorization. EN/FR equivalents have
equivalent criteria/outcomes; original wording and fingerprints intentionally
differ. `validateMonitoringPlan` checks the contract; before future persistence,
`validateCompiledMonitoringPlan` must recompute and compare the entire plan from
the original validated interpretation. Ownership/authentication and server-bound
review/confirmation remain separate Phase 4 work.

Legacy request parsing and PR #52/#53 validations remain unchanged. These plans
cannot be submitted directly through legacy Watch persistence: that still
reparses original text and requires existing definition formats. There is no
implicit translation to a fabricated legacy request, query repair, rebaseline,
ledger rewrite, migration or activation. Component safety checks reuse the
existing media grammar only to reject unsupported query syntax in literal fields.

Pure assessment cannot verify provider availability, factual entity identity,
full source coverage or AI semantic fidelity. BODACC company-name/identifier
identity needs source verification later. Registry support denotes bounded
adapter semantics, not a guarantee that every article/event is retrieved.

Focused tests: `server/watch-capabilities.test.js`, existing interpreter/planner
and media-query tests, and `src/js/currency-policies.test.js`. All fixtures are
deterministic; no paid AI calls, browser checks or remote data changes are needed.
