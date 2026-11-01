# General V3 New Watch creation v1

1 November 2026, Europe/Paris. Implementation and local verification complete; Production verification pending below.

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

## Production verification and final result

Pending release/actual UI reproduction. No successful Watch 5 is claimed by this local gate. Original pilot observation window remains 1–7 November 2026 Europe/Paris (exclusive end `2026-11-08T00:00:00+01:00`). Final deployed commit, canary ID, source readiness, integrity comparison and ledger metadata will be recorded here after verification.
