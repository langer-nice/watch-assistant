# Clean Create Slice B — local API integration

28 October 2026. **CLEAN SLICE B PASS — local integration with simulated model transport.** Recommendation: next, separately authorize isolated Preview plus frozen hosted 5×3 validation. No deployment or hosted reliability claim.

## Branch and bounded change

- Branch: `codex/create-clean-slice-b`.
- Worktree: `/Users/davidlang/.codex/worktrees/create-clean-slice-a/watch-assistant`.
- Base: clean Slice A commit `6aeff01` on the pre-hosted-diagnostic product foundation. No hosted trace/predicate/path-content patches incorporated.
- New production module: `server/create-semantic-planner.js` / `planCreateSemantics`.
- Changed production entry: `server/watch-planner.js`, only the new-Create branch/import.
- New tests/fixtures: `server/create-semantic-planner.test.js`, `server/test-support/create-semantic-fixtures.js`.
- Updated tests: `server/create-contract-api.test.js` and `server/create-core-lifecycle.test.js` now supply small semantic fixtures for opt-in planning; old bridge and interpretation-mode fixtures remain for their own regressions.
- This is the only new report. Slice A helpers, old bridge/interpreter/reconstruction/canonicalizer, API auth/gates, normalizer, resolver, projection, compiler, signed confirmation, persistence, frontend, configuration and migrations unchanged.

## Actual mounted path

`POST /api/plan-watch?mode=create-core.v1`

→ existing method/body/authentication/allowlist/new-create/feature gates

→ `planWatch` new-Create branch → `planCreateSemantics`

→ one `requestStructuredOutput` call with `create_semantic_v1` six-field schema for text, or deterministic exact-URL intake with zero calls

→ `groundCreateSemantics(request, extraction).candidate`

→ unchanged `normalizeWatchContract(candidate,{request})`

→ unchanged `resolveWatchContractCapability` / projection / capability assessment / compatible plan generation

→ existing Create-core review response envelope.

Both the Vite middleware and `api/plan-watch.js` use this shared planning middleware; neither entry needs rewriting. Local verification mounts the real middleware on a real loopback HTTP server, not a mocked final API response. Authentication and external provider transport are injected local fixtures; grounding and every downstream planning function are real repository code.

The new module supplies dedicated semantic instructions and strict schema, reusing the existing transport/default model and model override mechanism. It never uses `interpretWatchRequest`, reconstruction or `createWatchContractFromInterpretation`. Instructions treat request text as untrusted, keep source/time/constraints explicit, derive no official-only policy from company identity, forbid technical/model graph authority, and preserve semantic uncertainty. No automatic repair/retry chain. Timeout abort and output-size limits are bounded; no prompts/model output are logged.

Old interpretation.v1/default planner routes still use their existing behavior. New Create returns the same valid-response shape used by existing supported, unsupported and partial frontend/review flows. No new save endpoint or persistence format.

## Final local five-by-three matrix

These are final-run HTTP results from `server/create-contract-api.test.js`. Model output fixtures vary property order, publication source-clause versus semantic wording, numeric source-clause versus threshold wording, and redundant decimal zeros. They do not include old model subjects/conditions graphs or technical fields.

| Case | Runs 1 / 2 / 3 | Capability | Preservation |
|---|---|---|---|
| Manchester City | 200 / 200 / 200 | SUPPORTED | Exact subject; important_new_developments; constraints=[] |
| Microsoft | 200 / 200 / 200 | UNSUPPORTED | Earnings publication; 2026-Q3; source any, official=false |
| Jannik Sinner | 200 / 200 / 200 | SUPPORTED | Exact identity; important_new_developments; constraints=[] |
| GBP/EUR | 200 / 200 / 200 | PARTIALLY_SUPPORTED | GBP/EUR; gt; exact 1.17; unit EUR derived from pair; existing recurrence clarification |
| BBC URL | 200 / 200 / 200 | UNSUPPORTED | Exact URL resource/source retained; no fabricated topic; no model or discovery fetch |

Per reference matrix: **15/15 HTTP200**, **0 generic planning failures**, **0 semantic drift**, **0 evidence/offset drift**, **0 capability drift**, **0 invented constraints**. Complete response objects are deep-equal across each case's repetitions, not merely selected status fields. Every returned contract is independently revalidated in the API test with the existing normalizer. Capability status is asserted per run.

Provider transport calls: exactly one for each of 12 text attempts, zero for each of 3 URL attempts; authentication runs for all 15. Local variants of the decimal all converge to the same exact semantic value without floating-point rounding. Microsoft remains unsupported and currency remains partial; successful interpretation does not invent executable capability.

The 15-row matrix was also exercised during scoped regressions; tests were rerun after adding explicit per-request call-count/capability assertions. These are repeatable local tests, not additional hosted attempts or a frozen hosted campaign. No live model request was made. Consequently this proves mounted-path integration for the fixtures, **not real-model extraction stability**.

## Downstream and safety checks

- Existing UI lifecycle tests now exercise the clean route for enabled Create and retain old outputs when opt-out. Supported review, issuance, signature verification, mutation/revision checks, token expiry/conflicts, idempotent paused persistence and existing unsupported/partial panels pass. SQL fixture runs only against an ephemeral in-memory PGlite database; no user/Staging/Production data written.
- Existing opt-out/default/interpretation modes, auth/allowlist, disabled flags and new-create-only rejection tested. Gates remain unchanged; no Preview preparation or Production enablement.
- Old graph output, model technical authority and null output are rejected; no reconstruction fallback or retry occurs.
- Grounded ambiguity maps to the existing typed `CREATE_CLARIFICATION_REQUIRED` HTTP422 code; fabricated/invalid semantic claims map to `INVALID_CREATE_CONTRACT` HTTP422. Provider/network/parse/timeout errors remain safe typed errors. This task does not add a new frontend pre-contract ambiguity panel; existing error presentation remains unchanged. The zero-generic-error exit metric applies to the five valid reference cases, not to making invalid requests acceptable.
- No old model graph is the semantic authority. A deterministic compatibility graph is still generated downstream and stored by existing definitions, as intentionally required to preserve compiler/signing/persistence. Removing that generated representation is outside scope.

## Tests and build

- New clean-planner tests: **7/7 PASS** (strict six-field transport schema, default model/store=false, single call, URL bypass, old-graph/technical rejection, ambiguity, provider/network/parse/output-size/timeout handling, no legacy semantic entry).
- Slice A + directly affected API/lifecycle/navigation/planner regressions: **74/74 PASS**.
- Combined distinct tests: **81/81 PASS**.
- Final API suite rerun with explicit call-count/status assertions: **10/10 PASS**, including the final 15 HTTP attempts. No broad unrelated suites run.
- Build: **PASS**, existing bundle-size warning only.
- `git diff --check`: PASS. Existing installed dependencies reused via temporary symlink, removed before finalization; no install or lockfile modification.

## Exit and stop

Five cases pass through the mounted local API, three repetitions each, without generic errors or drift. Grounding/normalizer/downstream are real; external model/auth are fixtures. No API authentication/security rules, compiler, capability, persistence schema, frontend or old bridge changes were necessary. No migration or downstream rewrite.

No push, deployment, hosted request, live provider request, Production application/backend request/change, Detect, Alert, email or cron work occurred. Stop here. Next boundary is separately authorized isolated Preview and real-provider frozen hosted 5×3; the local result must not be substituted for that measurement.
