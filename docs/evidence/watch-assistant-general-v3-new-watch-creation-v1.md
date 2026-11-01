# General V3 New Watch creation v1

1 November 2026, Europe/Paris. **GENERAL V3 NEW-WATCH CREATION FIXED**. One authorized actual UI submission created the retained Watch 5 canary; local gate 389/389 PASS and Production integrity verified.

## Scope and architecture

Previous HEAD: `f965a4a8183ad824f92a6263c4f3a350d0b472a2`.
Branch: `codex/general-v3-new-watch`.
Worktree: `/Users/davidlang/.codex/worktrees/pilot-day1-brief/watch-assistant`.

Before: `navigation.js` planned/specialized inputs, then `structured-watch-creation.js` called `/api/v3-pilot` only for the pilot owner. Four exact strings selected `preparePilot`, SQL slots 1–4 and V3 evaluation. Other strings returned `pilot:false` and fell through to `interpretation.v1`, graph reconstruction and legacy structured compiler/issue/confirm. No arbitrary admitted V3 Intent could be persisted or scheduled through that adapter.

After: authenticated, eligible Production New Watch enters `runV3` **before** legacy planning, currency and URL dispatch. `/api/structured-watches` advertises `v3Create`, not an owner-specific pilot exception. Existing Production/test gates remain; the existing `V3_PILOT_ENABLED` flag gates this now-general adapter. Other environments, disabled rollout and edit dispatch retain their previous paths.

`/api/v3-pilot` is retained as the existing function URL to avoid adding a Vercel function. Its implementation is now the generic handler in `server/v3-creation.js`:

1. Server authentication and existing creation authorization.
2. Owner-scoped lookup for an existing original instruction; a matching original pilot Watch is reused, never reset/recreated. This is generic duplicate lookup, not semantic or engine selection by four strings.
3. Capture `FREE_TEXT` or `URL`; exact URL gets the existing server Capture resource envelope.
4. Exactly one validated `understandCapture` call, no retry/repair/critic. Intent policy, schema, normalizer, reference typing and validators unchanged.
5. Clarification or unsupported returns its own state, with no writes.
6. Supported READY selects an existing RSS/Atom or ECB connector and acquires a silent baseline **before persistence**, without a Brain call.
7. One atomic `create_v3_watch` RPC inserts Watch, admitted Intent sidecar, snapshot, baseline/prior state, active schedule and existing daily-digest policy.
8. UI success navigates to the Watch; other states preserve text. A technical failure never falls back to legacy review. A retained UUID and owner/instruction uniqueness fence duplicate writes after an uncertain network outcome.

New generic engine: `wa-v3-evidence-refs.v1`. Existing pilot engine remains `wa-v3-evidence-refs-pilot.v1`. Generic scheduled dispatch selects by server-owned persisted engine and source, with no exact-instruction matching. The four pilot identities retain their original compatibility evaluator. Legacy Watches have no V3 sidecar and retain their runtime. Generic manual checks cannot accidentally invoke legacy judgment; they safely return scheduled-only status.

## Migration justification — recorded before Production application

Migration: `supabase/migrations/20261101100000_general_v3_creation.sql`.

The ordinary client-writable Watch JSON is insufficient for authoritative private engine identity and admitted V3 state. The existing private sidecar is appropriate, but NOT NULL slot, four-slot CHECK, fixed-owner CHECK, fixed engine and SQL fixture arrays prevent general creation. No safe existing unrestricted field bypasses those constraints.

The migration generalizes this same sidecar, rather than creating another persistence system: slot may be null only for the new generic engine; old engine still requires slots 1–4 and the original owner. It adds capture kind, owner/original uniqueness for generic rows and service-only transactional creation. Existing claim carries source; existing completion recognizes generic currency rows. It does not update the four pilot rows, baselines, schedules, notifications or reports. It is inert where the Production pilot prerequisite is absent.

**RLS remains enabled, grants remain unchanged; the new RPC is service-role only.** Owner comes solely from verified authentication, never from client payload. Engine/Intent/source cannot be supplied by the client. Existing client identity guard also protects registered generic definitions. Existing owner joins/lease fencing remain authoritative at execution. No migration of historical Watches.

## Persistence, capability and execution contract

Stored: exact original instruction, owner/Watch ID, capture kind, canonical text, references, constraints, exact resource envelope where applicable, V3 engine, baseline evidence/prior state, evaluation when currency, and existing schedule/snapshot metadata. No hidden reasoning, scratch data, provider response or prompt is stored.

Supported acquisition: public RSS/Atom feeds, broad news via the existing Google News RSS source and existing ECB GBP/EUR connector conditions (`gt`/`gte`, exact decimal). A news query ORs admitted reference labels for broad acquisition; it is **not a predicate compiler**. The complete unchanged Intent, including scope, geography, OR/AND, exclusions and timing, reaches the existing Brain. First 20 feed items are used; this remains limited RSS coverage, not comprehensive monitoring.

Missing subject/source, unsupported currency conditions and unavailable booking/inventory/private-page/page-change capabilities are rejected safely. Exact URL support means a public RSS/Atom feed, not a newly added arbitrary webpage crawler. Invalid feed responses do not create a broken Watch. No connector added.

Baseline is silent, persisted atomically, and schedule starts at the existing next-day 06:00 UTC cadence. No global cron edit. Subsequent execution uses unchanged evidence normalization, server-owned evidence refs, condition-aware Brain, prior state, novelty/duplicate safeguards and existing outbox/notification policy. NO_ALERT creates no alert delivery. Existing Morning Brief consumes owner-filtered active V3 rows via the read compatibility adapter; its generation logic/history are unchanged.

## Local gate

**389/389 targeted tests PASS; 0 failures. Build PASS** (`vite build`, existing chunk-size warning only). `git diff --check` PASS. Modules imported/executed by tests; build validates browser imports.

Command corpus: V3 Intent tests; V3 Brain tests; evidence-ref candidate reference tests; `v3-creation`, `v3-pilot`, structured scheduler, Production compatibility, media cron, email outbox, Production morning delivery, Morning Brief, media notifications and structured frontend tests. Artifacts: `/private/tmp/wa-general-v3/regression-final.log`, `build-final.log`.

| Required boundary | Result |
|---|---|
| Social movements / City / Gucci / Microsoft / Apple / Metallica | API → controlled admitted V3 Intent → actual SQL persistence/schedule PASS |
| GBP/EUR >1.17 | Exact original/threshold/comparator and typed connector criteria preserved PASS |
| Exact URL | Exact resource query/fragment and capture kind preserved PASS |
| Missing referent | NEEDS_CLARIFICATION, no Watch/schedule PASS |
| Unavailable booking capability | Understandable READY fixture blocked by capability gate; no Watch/schedule PASS |
| Provider/source failure | No partial rows, safe UI, original text preserved PASS |
| Persistence | Original, canonical, references, constraints, engine, owner, baseline PASS |
| Idempotence | Repeated owner/original reuses ID; one schedule PASS |
| Runtime | Generic engine → same Brain; pilot compatibility, legacy isolation PASS |
| Delivery | Qualified STRONG_UNCONFIRMED ALERT → existing pending daily outbox; NO_ALERT adds none PASS |
| Report/account isolation | Existing Morning Brief accepts generic rows; foreign-account read/RPC rejected PASS |
| Pilot integrity | Existing four identities and schedules unchanged by generic creation PASS |

New test model outputs are controlled fixtures and do not constitute new real-model semantic measurements. V3 Intent modules match all 16 entries in the latest reference-typing freeze. Brain/ref/condition implementations are unchanged from previous HEAD. The outbox test had a stale selection mock on the previous HEAD (independently reproduced under `/private/tmp/wa-general-v3/baseline/`); only its mock was updated to the existing relationship selection/filter contract. No production outbox behavior changed.

## Release safety and rollback

Initial Production deployment: `dpl_DokshCJM1kpikL8YUxyZQDZGezF1`, READY, commit `f965a4a8183ad824f92a6263c4f3a350d0b472a2`. Project `prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF`, team `team_qnrjxa6AyWFRMSPnB3V1DZzb`, Supabase `cztpitujsnzhhenedwjn`.

Before-release read-only fingerprints: original four Watch/private-state/schedule aggregate `99d3497850f733f8a992780b32dcd0be`; historical reports `9a8276c493d92c048e0815942d1accfd`; exact canary instruction count **0** at `2026-11-01T08:09:08.814667Z`. Private state hash excludes the newly added default capture_kind field for comparison. No source acquisition, model call or creation was performed against Production at this point.

Rollback: restore previous deployment/commit. Keep backward-compatible schema in place. If generic rows exist, pause only those new generic rows/schedules before using the old evaluator, which does not support the new engine. Do not remove/recreate/reset original four pilot rows or historical data. No automatic destructive rollback migration.

## Production release and actual UI verification

Implementation/deployment commit: `3bc786cbc9142c1bb64ba07ab08288b385173ac2`. Branch `codex/general-v3-new-watch`; previous implementation HEAD `f965a4a8183ad824f92a6263c4f3a350d0b472a2`. Report-only checkpoint before final verification: `5607cd1595c046148c31f88ea92dadf071e85c77`. No runtime source changes followed the deployment.

Production deployment: `dpl_8A8U3KrQA7ZRsjThMtF81Z2MorJe`, **READY**, URL `watch-assistant-k92sw2o5s-david-lang.vercel.app`. Alias `https://watch-assistant-omega.vercel.app` independently verified against this exact commit; source `master`, Vite, Node 24. Existing Git deployment path used after local gate and migration, with no cron/environment edits.

Migration applied successfully. SHA-256 `b07e7032cb78b5dc7df13f622428b86566c9ab210c48e48aa86f284ed2c1aa5d`. Installed security verification: service-role RPC EXECUTE true; anon/authenticated EXECUTE false; authenticated sidecar SELECT false; RLS true. No credential/config changes. Original four state/schedule and report hashes remained identical after migration.

The user explicitly authorized refreshing Production and submitting this exact instruction **once**, keeping the result as canary 5. The actual signed-in Chrome UI was refreshed, the exact instruction filled and Create Watch clicked once. The UI first showed preparation, then navigated to the new Watch detail. No retry or second creation submission occurred. A transient DOM-read timeout during navigation was resolved by reading the resulting page; it did not cause another submission.

Exact instruction:

> Keep me updated on important new developments concerning protests, strikes and major social movements in France.

| Verification | Actual result |
|---|---|
| Accepted / Intent decision | **YES / READY_TO_MONITOR** |
| Watch ID | `85a6b264-dfde-40fc-bd26-caa455f5b3b0` |
| Created at | `2026-11-01T11:04:45.483010Z` = **1 November 12:04:45 Paris**, Day 1 |
| Visible in All Watches | **YES**, opened through navigation; one matching card |
| Original instruction preserved | **YES**, exact persisted and visible text |
| Canonical intent | Exact original text above |
| References | Ordinary `{label:"France",source_ref:"raw_input"}`; no exact_resource invented |
| Explicit constraints | `{kind:"condition",text:"important new developments",value:"important new developments",source_ref:"raw_input"}` |
| Unresolved ambiguities | `[]`; no clarification question |
| Engine / capture kind | `wa-v3-evidence-refs.v1` / `FREE_TEXT` |
| Owner | Original authenticated pilot owner `b4757e02-fc75-4984-b50e-8d933ae7ec04` |
| Active | **YES**, persisted `monitoring`; detail shows Monitoring active |
| Baseline | **YES**, `2026-11-01T11:04:45.494854Z`; snapshot baseline matches; 20 articles; one baseline history entry |
| Schedule | **YES**, exactly one; 86,400-second cadence; next due `2026-11-02T06:00:00Z` = **2 November 07:00 Paris**; no lease/failure |
| Notifications eligible | **YES**, existing daily_digest policy enabled, consent function true; eligible_after `2026-11-01T11:04:45.583661Z` |
| Morning Brief eligible | **YES**, current read-only `morning_report_context` includes this ID and owner is in `production_watch_owners` |
| Duplicate created | **NO**, exact original request count **1** |
| Immediate false alert | **NO**, notification count **0**; UI says initial reference, not new alerts |

Persisted decision reason: “The subject, geographic scope, and requested follow scope are sufficiently identified.” Capture ID `32440a9f-0688-4884-8175-c9bb7acfc6a1`. Canonical text retains protests, strikes, major social movements and France without requiring the model to produce domain predicates or a legacy graph. A separate raw provider body/usage and POST request ID were not captured; no provider status/usage is invented. Successful UI navigation and committed records prove the handler's successful create path; HTTP 200 follows from that handler contract, rather than a captured HAR.

### Monitoring readiness and limits

Source persisted: `https://news.google.com/rss/search?q=%22France%22&hl=en-GB&gl=GB&ceid=GB%3Aen` (existing Google News RSS). The admitted ordinary reference is France; therefore acquisition is deliberately broad and the full unchanged canonical intent is supplied to Brain for relevance/condition decisions.

The actual 20-item baseline includes reports about hundreds of thousands protesting in France, youth-led protests/social movements and cost-of-living protests, alongside unrelated France news. This proves that the existing public news acquisition path returns relevant material without a new connector. It does **not** prove comprehensive coverage or recall of every strike/local protest; no strike-specific baseline item or future-alert result is claimed. First-20 broad-feed coverage is a material observation limitation to assess separately during the pilot, not a reason to invent a subject-specific source rule.

Later checks are routed by the persisted generic engine to the unchanged V3 evidence-ref Brain. Baseline intentionally invokes no Brain judgment and produces no alert. No live scheduled judgment/email was forced for this verification; delivery eligibility and local ALERT/NO_ALERT/outbox regressions are verified, not actual future delivery.

### Pilot integrity and ledger

After canary creation, original core state/private-state/schedule fingerprint remains `99d3497850f733f8a992780b32dcd0be`; historical report fingerprint remains `9a8276c493d92c048e0815942d1accfd`. Both equal pre-migration values. Original four IDs, schedules, baselines and Home report records are unchanged. The successful canary is additional, not part of the original baseline cohort.

Updated only `additional_canaries` in the existing local ledger:
`/Users/davidlang/documents-local/design/watch-assistant/server/v3-brain-lab/real-watch-collection/observation-ledger.json`.

Entry labels it **Watch 5 — Canary / high-activity watch**, post-start, added during Day 1, analyze separately, with actual ID/owner/original/engine/created_at/baseline_at/next_due_at. All original ledger fields, original four `watch_ids`, events, metrics and observation boundaries retain their original values. Collection remains `2026-11-01T00:00:00+01:00` to exclusive `2026-11-08T00:00:00+01:00`. No fabricated usefulness/false-alert/observation events were added.

Evidence artifacts: `/private/tmp/wa-general-v3/canary.json`, `canary-eligibility.json`, `after-canary.json`, `ledger-update.json`. UI screenshot: [canary visible in All Watches](/private/tmp/wa-general-v3/canary-all-watches.jpg). The tab was kept open as the verified result. Runtime read scan showed successful authenticated list requests and no creation failure warning in the fetched window; this is bounded log evidence, not a claim of exhaustive observability.

## Final contract and scope

| Field | Result |
|---|---|
| General New Watch engine | V3 Intent → generic private persistence → active schedule → V3 evidence-ref runtime |
| Exact-instruction selection in general route/runtime | NO; original pilot compatibility evaluator retained |
| Engine/version authoritative | YES |
| Legacy runtime / four original Watches unchanged | YES / YES |
| Supported READY persists | YES, actual UI/Production canary verified |
| Clarification / unsupported persists | NO / NO, local SQL/API/UI gates verified |
| Technical failures | No partial transaction; pre-write failures leave no rows. Lost response after commit can be uncertain; same-owner original/UUID lookup prevents duplicates |
| Text preserved on non-create | YES, tests |
| Source/capability / scheduling / baseline | PASS, with broad-feed coverage limitation above |
| Global cron changed / new connector | NO / NO |
| V3 semantics / Brain / evidence refs / grounding / alert / condition policy modified | NO each |
| RLS weakened / auth integration modified / cross-user privilege introduced / secret exposure introduced | NO each |
| Home history / global email / global Morning Brief logic modified | NO each |
| Original four / observation window preserved | YES / YES |
| Watch 5 retained / marked post-start / ledger updated | YES / YES / YES |
| Hard stop triggered | NO |

Implementation commit files: `api/v3-pilot.js`; `server/v3-creation.js`, `server/v3-creation.test.js`, `server/v3-pilot.js`, `server/v3-pilot.test.js`, `server/structured-watch-api.js`, `server/media-watch-api.js`, `server/media-watch-check-api.js`, `server/watch-email-outbox-regression.test.js`; `src/js/currency-watch.js`, `src/js/navigation.js`, `src/js/structured-watch-creation.js`, `src/js/structured-watch-creation.test.js`; the single migration; this single report. Final verification changes only this report and the existing local observation ledger. Other pre-existing untracked reports were preserved. Tests/build were not rerun for report/ledger-only finalization.

Final classification: **GENERAL V3 NEW-WATCH CREATION FIXED**.

Recommendation: **CONTINUE 7-DAY OBSERVATION WITH WATCH 5 CANARY**. Evaluate the broad source's recall and the next genuine scheduled results separately; do not reset the cohort or retune semantics during this verification.
