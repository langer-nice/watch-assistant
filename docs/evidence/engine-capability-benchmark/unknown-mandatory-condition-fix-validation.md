# UNKNOWN mandatory-condition admission — validation and final review

## Problem and minimal correction

An ALERT with valid evidence references and CONFIRMED status could pass when its complete mandatory condition was explicitly UNKNOWN. The existing guard rejected false but omitted null. In `server/v3-brain-lab/condition-state/candidate.mjs`, one additional admission condition now throws for `condition_satisfied === null` plus ALERT. FALSE retains its existing distinct rejection. NO_ALERT is unchanged. There are no prompt, schema, UI, source, migration, scheduling, configuration or architectural changes.

The active evidence-reference admission calls this shared guard in `server/v3-brain-lab/evidence-ref-candidate/references.mjs:63`, before `server/v3-pilot.js` can construct or persist a notification. CONFIRMED status and valid references do not bypass it. Rejection uses the existing failure/diagnostic/retry path; it is not silently repaired to NO_ALERT.

The guard consumes the existing aggregate result of the complete applicable mandatory expression. TRUE OR UNKNOWN remains eligible when that aggregate is TRUE. TRUE AND UNKNOWN, FALSE OR UNKNOWN and NOT UNKNOWN remain UNKNOWN and cannot support ALERT. Optional UNKNOWN preferences remain nonblocking when mandatory eligibility is TRUE. TRUE does not force ALERT. A whole absent/null condition_check retains its legacy meaning of no separate material gate, distinct from a present object with condition_satisfied null.

## Final focused review — 27 November 2026

**A — APPROVED FOR PR.** Actual application diff, immediate callers, original SQL regression source and the added tests reviewed. No blocking finding or further application correction. Reviewed source branch: `codex/unknown-mandatory-condition`. Integration base: `0420c30df815c11d9377e4957d66f69ffa9e27e2` on `master`, whose name the user explicitly confirmed after checking that `main` does not exist. The initial review base `a4b79df1ea4e3fecf54bfd41bd135584224e4c42` has the exact same tree, `e852c85bdee918ff053546df4cfecf5392da0ea1`; no application integration difference is introduced by aligning ancestry.

Final execution on that source tree:

- Original regressions: **13 PASS, 0 FAIL, 0 SKIP**, previously 9 PASS / 4 FAIL. The original source and assertions are unchanged (SHA-256 `bf800a32fc511716ab58c6cd682d03827fc1c19518cf6e1d96f0806037a8d973`).
- Additional targeted selection: **392 PASS, 0 FAIL, 0 SKIP**, including 24 new guard tests. **405 total PASS.** New tests call the real guard; fixture aggregate values do not constitute a parser or truth evaluator.
- Local PostgreSQL/PGlite reproduction: **PASS**, included in the 13. The real acquisition/admission adapter is exercised with injected feeds/model replies; the actual SQL create, scheduler lease, finish and notification claim functions are used. The four former failures reject at admission, with no finish call or notification row; the valid TRUE, OR and optional-preference cases still persist a claimable notification. This proves the application boundary, not an extra SQL condition check. No sender is invoked.
- SQL fixture adaptations are unchanged: synthetic roles/account/consent, fixed business clock, omission of pgcrypto extension setup and the existing incompatible private-morning-report migration. This is not hosted Supabase/PostgREST validation.
- `npm run build`: **PASS**, with the existing >500 kB chunk warning. No separate type-check script is defined. Local runtime: Node v23.7.0.
- `git diff --check`: **PASS**. Network blocked for tests; provider/sender calls: **0**. No Production reads or writes, real Watches, cron, mail or history recovery.

The unchanged SQL reproduction is included as [qualification-regression.mjs](qualification-review/qualification-regression.mjs), alongside [offline-guard.mjs](offline-guard.mjs). From the repository root, reproduce with:

```sh
WA_ENGINE_ROOT="$PWD" NODE_ENV=test node --no-maglev --import ./docs/evidence/engine-capability-benchmark/offline-guard.mjs --test docs/evidence/engine-capability-benchmark/qualification-review/qualification-regression.mjs
```

Additional selection (same offline guard and NODE_ENV=test):

```sh
node --no-maglev --import ./docs/evidence/engine-capability-benchmark/offline-guard.mjs --test server/v3-brain-lab/condition-state/admission.test.mjs server/v3-intent/understand.test.mjs server/v3-intent/contract.test.mjs server/v3-intent/clarification-policy.test.mjs server/v3-intent/resource.test.mjs server/v3-intent/reference-typing.test.mjs server/v3-brain-lab/evidence-ref-candidate/references.test.mjs server/v3-brain/confirmation-semantics.test.mjs server/v3-brain/action-evidence.test.mjs server/v3-creation.test.js server/v3-pilot.test.js server/v3-manual-parity.test.js server/v3-scheduled-diagnostics.test.js server/bounded-notification-recovery.test.js server/media-watch-digest.test.js server/structured-digest-selection.test.js server/digest-user-journey.test.js src/js/currency-watch.test.js
npm run build
```

## Compatibility and benchmark integrity

**CONFIRMED BY CODE:** unchanged prompts and schemas, optional-field normalization, model/source integration, existing status/reference safeguards, downstream notification/recovery logic and SQL. No retroactive record update or replay is introduced; the seven historical recovery exclusions are untouched. No domain-specific condition or new connector/operator.

**CONFIRMED BY TEST:** selected V3 interpretation, clarification, resource/reference typing, confirmation/action safeguards, creation, manual/scheduled parity, durable diagnostics, immediate claim, digests, bounded recovery and currency behavior. TRUE does not force ALERT, UNKNOWN remains distinct from FALSE, and missing/whole-null checks retain legacy compatibility.

Frozen local corpus hashes match its existing manifest: 30 requests, 121 evidence cases, IDs, expectations and scoring unchanged. Structural validation PASS. S21-E5 remains under-specified and unmodified. These corpus files and historical results are not added or changed in this PR. The 121 cases have **not** been semantically evaluated against a live model.

**NOT EXERCISED:** live model/provider, hosted database, all product domains, unavailable connectors, real email, natural cron or Production behavior. **UNKNOWN:** whether a live model supplies the correct complete aggregate. A wrongly declared TRUE or omitted material check remains outside this patch; it does not independently establish author/source qualifications or evidence truth.

## Exact integration contents and release boundary

Five files only:

1. `server/v3-brain-lab/condition-state/candidate.mjs` — minimal guard change.
2. `server/v3-brain-lab/condition-state/admission.test.mjs` — focused 24 tests.
3. `docs/evidence/engine-capability-benchmark/qualification-review/qualification-regression.mjs` — preserved 13-test SQL reproduction.
4. `docs/evidence/engine-capability-benchmark/offline-guard.mjs` — existing local network blocker, unchanged.
5. This report.

Unrelated checkout edits, raw TAP/build logs, generated outputs, local paths, credentials and database artifacts are excluded. Raw execution evidence is retained locally. This report records the reviewed source and base; the PR metadata identifies the resulting commit and PR URL.

**NOT MERGED / NOT DEPLOYED.** PR preparation only. Merge requires explicit user authorization. Next step: review the dedicated PR.
