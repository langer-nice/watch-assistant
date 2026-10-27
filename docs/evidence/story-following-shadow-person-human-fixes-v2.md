# Shadow person human fixes v2

27 October 2026. **A. SHADOW PERSON MICRO-PATCH READY.** Recommendation: ready for one final bounded Staging check, subject to separate authorization. No check or deployment performed here. The cold timing margin is narrow; these local measurements do not guarantee live latency or Production performance.

## Strict scope

Two deterministic person micro rules only; existing observer and current authoritative matcher unchanged. PR #70 stays draft/unmerged. No UI, non-person rule, Watch, schema, baseline, notification, email, cron, configuration or Production/master changes. No AI calls, article fetch, new Staging traffic or live data operations. Git preview auto-deployment remains disabled for this branch in unchanged vercel.json.

New isolated prototype: `design/story-following-prototype-person-human-fixes-v2/` (original workspace, local only). Prior validated prototype and corpus files preserved: 76 hash comparisons PASS. The isolated prototype is not imported by the application.

## Two bounded rules

1. Active watched-actor announces/confirms/sets/reveals comeback/return [date], tied to its own injury/absence or tournament/tennis-return context. Positive assertion only. The exact affirmative surname construction `Sinner sets comeback date` supplies a narrow professional-return cue, as explicitly requested; it does not enable generic surname/comeback speculation. Wrong first names, other actors' returns, rumors, hopes, discussion, prediction, conditional wording, negation and questions remain guarded. Existing attributed denials retain their statement semantics.
2. A closed title question `Who will/could/might/may coach [watched person] after [named person]'s [confirmed] exit/departure?` binds a factual coaching departure locally. Also recognize `[watched person]'s coach [named person] [has] left/leaves/departed/departs/quit/quits [his/her/their/the] [coaching] team`. Capitalized coach names come only from the candidate; no Darren Cahill identity map. Accept the departure, never invent a successor appointment. Possible/rumored/conditional exits, another player's team and coaching recommendations do not satisfy the closed construction. No generic reordering of all event rules ahead of speculation.

Target A and B both change INSUFFICIENT_EVIDENCE → MATCH. Other 13 human decisions remain unchanged. Diagnosis correction retained: the exact `Who Will` target previously missed nominal-exit/role binding; it did not hit the old could/might/may speculation filter.

## Focused validation

- Offline: 91/91 person tests (61 unchanged + 30 focused micro-rule assertions).
- Runtime: 113/113 focused shadow tests (83 existing + the identical 30 micro-rule assertions).
- Counterexamples cover could return, rumor, fans' hope, possible/discussed comeback, predicting coach, explicit opinion, other-player return ownership, negation, wrong first name, hypothetical exit, conditional replacement, would coach, recommendation, possible exit, rumor-prefixed successor question, wrong team and wrong watched person.
- Frozen v1.4: 149 items; synthetic 46/46, historical 99/103 exact labels, recall 38/42 = 90.476%, precision 38/38 = 100%; critical false positives 0; regressions 0.
- All 149 labels identical to latest validated person-human-fixes.v1, as well as passing the frozen evaluator. The two new human titles are a separate diagnostic fixture; frozen corpus untouched.
- H001/H004/H026 = INSUFFICIENT_EVIDENCE; H003/H013 = NO_MATCH; H042/F08/J07 = INSUFFICIENT_EVIDENCE. All unchanged.
- Determinism, reversed-order evaluation, novelty/old-duplicate behavior, fixed context and non-person preservation PASS. Acceptance criteria unchanged. AI calls 0. Evaluations used OS-enforced network denial; the corpus evaluator checks denied socket access before running.
- Build PASS; existing Vite chunk-size advisory only. No broad suite or live evaluation.

## Human sample: clearly versioned comparison

The historical observation ledger remains **8/15, mixed runtime versions** (original ten 5/10 at person-parity.v2; new five 3/5 at person-human-fixes.v1). It is not overwritten or described as a homogeneous latest-runtime score. Current-authoritative historical observations remain 3/15; not re-evaluated here.

Homogeneous local re-evaluation on the same 15 human labels: **person-human-fixes.v1 = 12/15; person-human-fixes.v2 = 14/15**. The original-ten v1 offline result was 9/10. These bounded disagreement-selected samples do not estimate population accuracy.

M = MATCH; N = NO_MATCH; IE = INSUFFICIENT_EVIDENCE. Every runtime cell below was checked against the entire offline decision object (identity, development, status, reason, version), plus adapter label/reason.

| Case | Candidate ID | Title | Human | Offline v1 | Offline v2 | Runtime v2 | Parity |
|---|---|---|---|---|---|---|---|
| 1 | `238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473` | Jannik Sinner receives injury boost as ‘decisive’ Darren Cahill talks emerge – report | IE | IE | IE | IE | PASS |
| 2 | `c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350` | Sinner to return from injury with appearance at Six Kings Slam | M | M | M | M | PASS |
| 3 | `d546b5d19b1fdbe8fa44965af835539e42d65227da8d93cb3c91b8c1307e5d50` | ‘Sad for tennis’ – Ben Shelton issues honest verdict on Carlos Alcaraz and Jannik Sinner | N | N | N | N | PASS |
| 4 | `ad77f06e0e464b93b4f99f8509bb3779635e7d8faefdf9ce6c8bfbce00a31bd8` | Toni Nadal says whether he would ever consider coaching Carlos Alcaraz or Jannik Sinner | N | N | N | N | PASS |
| 5 | `88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917` | Jannik Sinner sends message to Kimi Antonelli with the Italian on the verge of history | N | N | N | N | PASS |
| 6 | `8333cbeb02a5a71789170d79d111507a852dfe4e7b5bf0cc768240546737de2d` | Medvedev: Why We’re Not Snapping Sincaraz Stronghold | N | N | N | N | PASS |
| 7 | `753d20c642cc6063859856d324e91603a11abbbcf9f88106a500928cfc00bab3` | Famous Italian Olympian has message for Jannik Sinner: I paid the consequences | N | N | N | N | PASS |
| 8 | `3051e91d22492503345d833aea9ffda0fab88074f57a2b23b84985efb1ab5cd8` | Daniil Medvedev sends clear message over Alexander Zverev and Jannik Sinner in No 1 ranking debate | N | N | N | N | PASS |
| 9 | `9b2949fc15b9ac531a4a42c8d3bdce1cb47f1d0049b0718916e248eee699bdd6` | Jannik Sinner’s surprise U-turn just cost a 20-year-old American a huge payday | IE | IE | IE | IE | PASS |
| 10 | `98391a5fde0a1bfe51c0f4b1e3d39ff44b654b79f6097cbadafc625fe7c49901` | Sinner to defend Vienna title | M | IE | IE | IE | PASS |
| 11 | `514e937f85a28c344847dbbd527f766002aaee1f52908ae51f123d7c311f44a2` | Injury, Alcaraz rivalry, sacrifices: Sinner opens up | IE | IE | IE | IE | PASS |
| 12 | `f09ecf150994c72f2f28e333d4208cf36343223191584bec7aba3bcef8ca60b9` | Ben Shelton disagrees with the claim that Carlos Alcaraz and Jannik Sinner’s dominance is fading, ‘that’s unfair’ | N | N | N | N | PASS |
| 13 | `3c43340bda55fde9ab3d041004c25801ce1930004b7315dab0203d926ad76377` | Jannik Sinner announces comeback date after lengthy knee injury | M | IE | M | M | PASS |
| 14 | `fde9d4567c66f3263aae2a5c7f9605def5d95664255d1a43a626a44b34e81612` | Jannik Sinner reacts to Six Kings Slam news as ATP star set to miss out on £1.2m payday | IE | IE | IE | IE | PASS |
| 15 | `2a29f307cf4da29980e3a2162c7866a781a1f4d47c2b74a22155336f534f58f9` | Who Will Coach Jannik Sinner After Darren Cahill’s Exit? | M | IE | M | M | PASS |

Remaining error: case 10, `98391a5fde0a1bfe51c0f4b1e3d39ff44b654b79f6097cbadafc625fe7c49901`, “Sinner to defend Vienna title”: human MATCH, offline/runtime INSUFFICIENT_EVIDENCE because surname lacks the currently required professional cue. Intentionally unchanged; no title-defence/identity redesign.

## Exact runtime port and 20-title parity

Ported only the two validated semantic blocks, the narrow requested comeback-date identity cue, version tag, focused tests and fixture. Existing Unicode-boundary runtime optimization preserved. Shadow version `story-shadow.person-human-fixes.v2`; pure person version `person-human-fixes.v2`. Observer budget remains 40 ms; observer code unchanged; current matcher authoritative. Parent PR head before this task: `a3fc52f4c2f8b7c3e9b57ff207cb459da99c2443`.

20 frozen titles: labels/metadata unchanged except version tag; distribution 11 M / 5 N / 4 IE. Exact core and runtime adapter parity PASS; order independence PASS.

| Frozen candidate ID | Title | Offline v2 | Runtime v2 | Parity |
|---|---|---|---|---|
| `7762f1bad738fc32175fc307732ba797ce616be9cdec306df6b30e0711c86388` | Jannik Sinner hires coach who guided Stan Wawrinka to three grand-slams - The Times | M | M | PASS |
| `238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473` | Jannik Sinner receives injury boost as ‘decisive’ Darren Cahill talks emerge – report - Tennis365 | IE | IE | PASS |
| `eb297642044b573e367c16782a6cc15c20378b5bd8ceb88d76ed9da335c7dff2` | Jannik Sinner comeback date announced after lengthy injury layoff - Yahoo Sports | M | M | PASS |
| `a594066c914fc92d446ae8476b34921f2977df22846c27105bace29492a79f3c` | World No. 1 Jannik Sinner to Return At Six Kings Slam In December - Yahoo Sports | M | M | PASS |
| `c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350` | Sinner to return from injury with appearance at Six Kings Slam - TNT Sports | M | M | PASS |
| `da60a628b94f9c1a0685801c282134ee84f3f0791d25c804fca8898e79f7c045` | Carlos Alcaraz says he’s ‘really happy’ that Alexander Zverev is world number one now - Tennishead | N | N | PASS |
| `319128bb70a5e4e498174e9ecbeb8e82ad4746fa49357d9a1cb20027c9ff00ac` | Jannik Sinner Completely Overhauls His Medical Team as Darren Cahill’s Future Takes a Decisive Turn - EssentiallySports | M | M | PASS |
| `753d20c642cc6063859856d324e91603a11abbbcf9f88106a500928cfc00bab3` | Famous Italian Olympian has message for Jannik Sinner: I paid the consequences - Tennis World USA | N | N | PASS |
| `88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917` | Jannik Sinner sends message to Kimi Antonelli with the Italian on the verge of history - Daily Express | N | N | PASS |
| `710f9a1298c648665a0372e668ea670dfc91064c267e70f4b04db2836f9f3e4d` | Antonelli: world title days away. Sinner praises him: ‘Absolutely brilliant’ - la Repubblica | N | N | PASS |
| `11e23d966d4f0a135b5be6b8278999e792d70ad09b41d918ed789ae731368171` | REPORT: Jannik Sinner Appoints Sweden’s Norman As New Coach - ubitennis | M | M | PASS |
| `4b4f79150a96814ebf9a7d74e09e7636675311bead66c5a5310d3b32f396eec6` | World No. 1 Jannik Sinner to Return At Six Kings Slam In December - Forbes | M | M | PASS |
| `f09ecf150994c72f2f28e333d4208cf36343223191584bec7aba3bcef8ca60b9` | Ben Shelton disagrees with the claim that Carlos Alcaraz and Jannik Sinner’s dominance is fading, ‘that’s unfair’ - Tennishead | N | N | PASS |
| `3d9f90affb62939c3d7f48e9b73f7594411c797c880441a5eb00d173c1806b7b` | Sinner to play rescheduled Saudi Six Kings in December - France 24 | IE | IE | PASS |
| `d67940d076bde1bfd9861d1a3d60f55f7e80ae7a1f92715a1c716123780c5e30` | Jannik Sinner's 2027 could start from an old certainty - Tennis World USA | IE | IE | PASS |
| `67a73fd74ec5ffbc6f46efd4cae0fc1077a5a41eb543bbbd20aefe27fd7b9bf9` | Jannik Sinner returns to Six Kings Slam after all following season-ending announcement - TennisTemple | M | M | PASS |
| `8a5321f2a6161b85168ecb0d16f0218fc6bbbc951f7482f419fd9b1dde7f645b` | Sinner to play rescheduled Saudi Six Kings in December - RFI | IE | IE | PASS |
| `40ab336efbee5b5dbac265cec83ae52508664ec0e2021fd7449e2a519b5de396` | Jannik Sinner To Start Comeback At Saudi Arabia’s Six Kings Slam - ubitennis | M | M | PASS |
| `006bc90f72f652307ee6b4b98e3ecb87dff5b096f336aad071fa71817afb8ad1` | Jannik Sinner to return at Six Kings Slam in December - Field Level Media | M | M | PASS |
| `81889c4660bd8c90b5b5b867620f8058eb2c582665b23d6371a187cdfeea5679` | Jannik Sinner: World number one ends season early with knee injury - BBC | M | M | PASS |

## Performance, unchanged 40 ms budget

Node v23.7.0, --no-maglev; same focused benchmark method, 8 fresh processes per mode, 60 warm batches per process, entirely local with network denied. Cold is the first **invocation after module import**, matching the observer's budget boundary; process startup/module import is separately measured. Warm is the fastest batch per process, p50/p95 are within-process percentiles. Table reports the maximum across the eight processes for each statistic; not an aggregate traffic percentile.

| Batch/mode | Cold max ms | Warm max ms | p50 max ms | p95 max ms | Completed cold/warm |
|---|---:|---:|---:|---:|---|
| 20 / direct | 33.207 | 0.433 | 0.466 | 0.780 | N/A (pure evaluator) |
| 20 / observer | 35.622 | 0.621 | 0.665 | 1.115 | 20/20 in every process |
| 20 / observerFull | 36.825 | 0.616 | 0.671 | 1.246 | 20/20 in every process |
| 15 / direct | 35.270 | 0.380 | 0.416 | 0.680 | N/A (pure evaluator) |
| 15 / observer | 39.569 | 0.533 | 0.575 | 0.961 | 15/15 in every process |
| 15 / observerFull | 38.094 | 0.519 | 0.561 | 0.934 | 15/15 in every process |

The actual-budget observer completes both batches with zero timeout. Worst measured cold 39.569 ms, margin 0.431 ms. Budget sufficient in this bounded local run only; no increase made. observerFull is solely a full-completion measurement using a frozen injected clock; readiness is based on actual-budget observer results. Module-import maxima: 10.578 ms (20-title observer), 11.275 ms (15-human observer); excluded from the per-invocation observer budget as before.

## Artifacts and next step

Local isolated folder retains focused/runtime test logs, human-cases/results, frozen-corpus results, diagnostic 20-title outputs, latest-version regression proof, preservation hashes and both raw benchmark JSONs. PR changes only `server/story-following-shadow-matcher.js`, its focused test, `server/test-support/story-shadow-person-parity.json` and this report. Previous untracked adjudication reports are preserved separately, not staged by this task.

**A. SHADOW PERSON MICRO-PATCH READY** — ready for one final bounded Staging check if separately authorized, paying attention to the narrow cold margin. PR #70 draft/unmerged; no deployment, Check now, cron, Watch creation, monitoring/email/notification activity, master change or Production change.
