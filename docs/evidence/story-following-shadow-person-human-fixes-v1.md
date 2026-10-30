# Shadow person human fixes v1

27 October 2026. Classification: **A. SHADOW PERSON HUMAN-PARITY READY** for one separately approved bounded Staging check after a separately authorized Preview update. This is not 10/10 human agreement: **9/10**, with case 10 deliberately unresolved. No new traffic or deployment in this task.

## Scope and sequence

Branch codex/story-following-shadow-staging, PR #70 draft/unmerged, starting head cd8619f. First created isolated offline copy at design/story-following-prototype-person-shadow-human-fixes/ in the existing local workspace. Only after its focused tests and complete frozen v1.4 criteria passed were the same validated rule blocks ported to the existing shadow matcher. No authoritative matcher, non-person logic, observer/budget, UI, Watch data, database, schedules, email/notification logic or configuration changed. Existing Preview still serves c6a60f7.

The prior human-reference artifact and its ten labels are unchanged. The previous provisional assessment for case 6 does not replace the user NO_MATCH label. No frozen corpus/acceptance criterion or prior offline prototype was changed. The new evaluator records preservation of 59 pre-existing artifacts (protected inputs plus original v2 artifacts); preservation check PASS.

## Five error assessments before implementation

All had old shadow INSUFFICIENT_EVIDENCE. Each available RSS excerpt simply repeats its headline, so the analysis uses the title and fixed confirmed person context only. No additional facts, country/identity aliases or tournament registry were inferred.

| Human case | Human | Missing evidence/rule | Classification | Safety boundary |
|---|---|---|---|---|
| 3: Ben Shelton issues honest verdict | NO_MATCH | Explicit third-party verdict framing | SAFE, bounded | Named other speaker and watched identity; abstain rather than reject if title contains concrete-change cues. Protect H026 analysis and reported actual changes. |
| 4: Toni Nadal would ever consider coaching | NO_MATCH | Attributed consideration of hypothetical coaching | SAFE, bounded | Only says whether he/she/they would [ever] consider coaching with an explicit third-party speaker; no generic should/urged-to rewrite. Preserve H003/H004/H026 and real appointments/denials. |
| 6: Medvedev: Why We’re Not Snapping Sincaraz Stronghold | NO_MATCH | Attributed explanatory dominance commentary | SAFE, bounded | Named other speaker, explicit Why we/I framing and dominance/stronghold wording, no concrete-change cue. No Sincaraz alias invention; generic negation/identity rules remain. Preserve H013 precedence. |
| 8: sends clear message ... ranking debate | NO_MATCH | Explicit third-party ranking-debate message framing | SAFE, bounded | Require watched identity and ranking debate wording, with no concrete-change cue. Do not reject actual ranking, injury, return or team announcements. |
| 10: Sinner to defend Vienna title | MATCH | Both surname sporting context and participation evidence | RISKY for this exact title, left unresolved | Vienna is not an approved event identity in existing context; no tennis cue remains in the title. Do not invent an event mapping, infer a tournament from any place/title or weaken surname/homonym protection. |

## Safe rules implemented

The isolated person.mjs and runtime person core contain identical semantic additions:

1. Bounded third-party speaker recognition (ordinary capitalized names), including a short quoted heading prefix. Names are parameters, never candidate/title allowlists. Unsupported name forms simply retain prior handling.
2. Narrow hypothetical-coaching consideration rejection. Existing recommendation/speculation/analysis policies remain intact.
3. Explicit third-party verdict, ranking-debate message or explanatory dominance commentary rejection, only without a concrete-change cue. Supported actor-bound actual events are evaluated first; the conservative cue veto also protects unrecognized medical/decision wording from rejection.
4. Explicit sporting title-defence participation: e.g. Sinner to defend Vienna tournament title / Sinner to defend Wimbledon title, requiring the existing identity proof and title-local tennis/tournament/slam/ATP/Wimbledon wording. Does not accept the shorter human case 10.

Rejected expansions: blanket verdict/message/Why/negation rejection; turning all recommendations into NO_MATCH; guessing the meaning of Sincaraz; using unowned excerpts; assuming any surname/title/place is sufficient tennis evidence; candidate-ID/exact-title allowlists; publisher/event inference to force case 10 to MATCH.

## Offline verification

OS sandbox denies all network access and restricts writes to the new prototype directory. evaluate.py actively checks OS network denial before evaluation. Zero AI/provider/article calls. Existing four preserved same-document overlays only, unchanged; no cross-article repair.

Focused tests: **61/61 PASS** (37 original person tests plus 24 targeted controls). Added controls cover verdicts, coaching hypotheses, dominance/debate commentary, explicit tennis title defence, concrete-change veto, actual coaching/ranking/return, common-noun/religious usage, conflicting first names, speculation and negation. No PR runtime was edited until the full corpus gate passed.

Frozen WA-STORY-CORPUS-v1.4: **149 items**, synthetic **46/46**, historical recall **38/42 = 90.48%**, historical precision **38/38 = 100%**, critical false positives **0**, regressions **0**. Compared with person-parity-v2, all 149 labels are unchanged. Determinism, reverse-order independence, novelty, non-person output, frozen context and artifact preservation PASS. Acceptance thresholds unchanged; no Production performance guarantee.

Protected: **H013 NO_MATCH; H042/F08/J07 INSUFFICIENT_EVIDENCE**. H001/H004/H026 remain INSUFFICIENT_EVIDENCE, H002/H003 NO_MATCH.

Reproduction from the original workspace: sandbox-exec -f design/story-following-prototype-person-shadow-human-fixes/offline.sb python3 -B design/story-following-prototype-person-shadow-human-fixes/evaluate.py. Evidence results and 61-test transcript are stored inside that isolated directory.

## Exact ten-case comparison

Current human labels are fixed. New results below are offline results, reproduced exactly by runtime parity tests; they are not new Staging observations.

| Case | Candidate ID | Title | Human | Old shadow | New offline/runtime | Correct |
|---|---|---|---|---|---|
| 1 | `238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473` | Jannik Sinner receives injury boost as ‘decisive’ Darren Cahill talks emerge – report | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | YES |
| 2 | `c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350` | Sinner to return from injury with appearance at Six Kings Slam | MATCH | MATCH | MATCH | YES |
| 3 | `d546b5d19b1fdbe8fa44965af835539e42d65227da8d93cb3c91b8c1307e5d50` | ‘Sad for tennis’ – Ben Shelton issues honest verdict on Carlos Alcaraz and Jannik Sinner | NO_MATCH | INSUFFICIENT_EVIDENCE | NO_MATCH | YES |
| 4 | `ad77f06e0e464b93b4f99f8509bb3779635e7d8faefdf9ce6c8bfbce00a31bd8` | Toni Nadal says whether he would ever consider coaching Carlos Alcaraz or Jannik Sinner | NO_MATCH | INSUFFICIENT_EVIDENCE | NO_MATCH | YES |
| 5 | `88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917` | Jannik Sinner sends message to Kimi Antonelli with the Italian on the verge of history | NO_MATCH | NO_MATCH | NO_MATCH | YES |
| 6 | `8333cbeb02a5a71789170d79d111507a852dfe4e7b5bf0cc768240546737de2d` | Medvedev: Why We’re Not Snapping Sincaraz Stronghold | NO_MATCH | INSUFFICIENT_EVIDENCE | NO_MATCH | YES |
| 7 | `753d20c642cc6063859856d324e91603a11abbbcf9f88106a500928cfc00bab3` | Famous Italian Olympian has message for Jannik Sinner: I paid the consequences | NO_MATCH | NO_MATCH | NO_MATCH | YES |
| 8 | `3051e91d22492503345d833aea9ffda0fab88074f57a2b23b84985efb1ab5cd8` | Daniil Medvedev sends clear message over Alexander Zverev and Jannik Sinner in No 1 ranking debate | NO_MATCH | INSUFFICIENT_EVIDENCE | NO_MATCH | YES |
| 9 | `9b2949fc15b9ac531a4a42c8d3bdce1cb47f1d0049b0718916e248eee699bdd6` | Jannik Sinner’s surprise U-turn just cost a 20-year-old American a huge payday | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | YES |
| 10 | `98391a5fde0a1bfe51c0f4b1e3d39ff44b654b79f6097cbadafc625fe7c49901` | Sinner to defend Vienna title | MATCH | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | NO |

Score: **5/10 → 9/10**. Sole remaining incorrect ID: `98391a5fde0a1bfe51c0f4b1e3d39ff44b654b79f6097cbadafc625fe7c49901` (human MATCH, new INSUFFICIENT_EVIDENCE / PERSON_IDENTITY_UNRESOLVED). The risky context gap is recorded, not relabeled away. This selected human-disagreement sample is not representative: no live precision/recall claim.

## Runtime port and parity

Only semantic additions and person version metadata are ported into server/story-following-shadow-matcher.js; its already-validated Unicode-boundary implementation remains. Existing observer, 40 ms budget, gates, persistence hooks, non-person branches and current matcher are unchanged. New metadata: person-human-fixes.v1 / story-shadow.person-human-fixes.v1. No additional runtime file.

server/story-following-shadow.test.js: **83/83 PASS**. The frozen 20-title fixture compares full outputs and reasons to new offline results, in both orders: **20/20**, distribution still **11 MATCH / 5 NO_MATCH / 4 INSUFFICIENT_EVIDENCE**. The ten human cases compare complete core metadata and adapter labels/reasons: **10/10 offline↔runtime parity**, with human score 9/10 explicitly asserted. Existing authority, fail-safe, budget, immutable-input, no side-effect dependencies, redaction and protected-case tests pass.

Fixture changes are versioned new offline outputs plus the ten human cases, with user labels preserved. No offline expected label was derived from the authoritative matcher or tuned to force a 10/10 score. Build **PASS**, only existing Sass/chunk-size warnings. No package installed or configuration changed.

## Focused performance

Local Node v23.7.0 --no-maglev, OS network denied. Eight fresh processes and 60 warm batches per process for each dataset. The existing benchmark is unchanged; a prototype-only copy switches its input to the ten human cases so new commentary branches are exercised cold as well. Module/dependency imports are separate; the observer timing wraps context, hashing, copying, evaluation and in-memory recording. These are local measurements, not Vercel guarantees. Warm = median of process minima; p50/p95 = median of each process percentile.

| Real observer workload | Cold median / maximum ms | Warm ms | p50 ms | p95 ms | Cold completion |
|---|---:|---:|---:|---:|---|
| 20 frozen titles | 29.795 / 30.103 | 0.507 | 0.545 | 0.828 | 8/8 complete |
| 10 human cases | 32.314 / 36.677 | 0.300 | 0.336 | 0.690 | 8/8 complete |

All cold and final warm observer batches completed without truncation; all maxima below **40 ms** (highest 36.677 ms). The prior boundary optimization is unchanged; no extra optimization or budget increase. The observer remains a soft between-candidate check and cannot preempt synchronous work, so this is evidence of sufficiency for the tested local inputs, not a hard real-time guarantee. No deployed runtime observation in this task.

## Conclusion and delivery

**A. SHADOW PERSON HUMAN-PARITY READY**, with one explicitly unresolved human positive. Ready to request one new bounded Staging check after separate Preview deployment/traffic authorization. No deployment, Check now, cron, Watch creation, AI, email, notification or live-data action was performed. Current matcher remains authoritative; PR #70 remains draft/unmerged, Production/master unchanged.

Changed PR files only: shadow matcher, focused shadow tests, parity fixture, this report. The isolated new prototype is local under the original workspace and is not imported by runtime. Prior uncommitted human-adjudication report is preserved and not staged as part of this change.
