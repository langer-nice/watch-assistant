# Bounded shadow Staging observation v1

27 October 2026. Classification: **A. SHADOW OBSERVATION STABLE**, limited to this person Watch and these two samples. Recommendation: human-label the bounded disagreement sample before any semantic changes or broader rollout.

## Scope and safeguards

PR #70, codex/story-following-shadow-staging, starting head 312e10b. READY Preview https://watch-assistant-31avwxpml-david-lang.vercel.app; deployment dpl_Gn8UPYVoiwjWJdqv2mfzavBrqzCt, runtime commit c6a60f7. No redeployment, rules, budget, application code, settings, configuration, schema, cron or Production/master changes. Only this report added. Draft/open/unmerged remains required.

One additional controlled Check now on the existing Jannik Sinner Watch 672a8533-c48f-4dd4-aab4-2064f0eb6702. Stopped after this first additional batch: 20 comparisons and ten inspectable disagreements were sufficient. No second check, new Watch or long-running campaign. Current matcher remains authoritative; observer runs after current successful persistence and cannot choose real results.

Read-only preflight confirmed the same branch/deployment and Staging database tseexvbwhrtofcsrvcqc; shadow ON, schedule/email/notification-intent flags OFF. Existing Watch consent was not changed. Test owner and Watch ID in all observed comparison records match the baseline. No other account was observed; this bounded sample is not a global leakage audit. No tests/build rerun because runtime code was not changed.

## Baseline and additional result

| Measure | Baseline: 26 Oct 21:56 UTC | Additional: 27 Oct 07:53 UTC | Combined observations |
|---|---:|---:|---:|
| Controlled checks | 1 | 1 | 2 |
| Candidates | 20 | 20 | 40 |
| Current MATCH / NO_MATCH | 17 / 3 | 17 / 3 | 34 / 6 |
| Shadow MATCH / NO_MATCH / INSUFFICIENT_EVIDENCE | 9 / 5 / 6 | 8 / 2 / 10 | 17 / 7 / 16 |
| Exact three-label agreements / disagreements | 9 / 11 | 7 / 13 | 16 / 24 |
| Shadow errors / timeouts | 0 / 0 | 0 / 0 | 0 / 0 |
| Notifications before → after | 23 → 23 | 23 → 23 | Unchanged during each check |
| Sent rows before → after | 18 → 18 | 23 → 23 | Unchanged during each check |

Baseline evidence: story-following-shadow-person-parity-runtime-v1.md; request kz69w-1793051761078-21540d946b1a. Additional request: **rcdqx-1793087615030-2025b4d549f5**, POST /api/media-watches, Preview Node 24, cdg1. Exactly 20 comparison rows at 2026-10-27T07:53:37.358Z–07:53:37.392Z. Logs were read for this deployment only; no Production request issued.

The combined 40 observations contain **29 distinct candidate hashes**: 11 repeat between the two samples. For all 11 repeats, shadow labels are exactly unchanged (**11/11 PASS**). Hashes identify candidates, not the complete input packet; full baseline packets were not retained for every candidate, so this is decision consistency by candidate identity rather than a byte-for-byte input equivalence claim. The frozen 20-title parity and previous 14/14 fixture-overlap result remain previously verified, not rerun here.

## Notification, email and state safety

SELECT-only dashboard counts immediately before/after the additional check returned 23 notifications and 23 sent rows both times. These reads were scoped only to the target Watch. Zero additional notifications or sends during this control; no email endpoint or cron was invoked. No historical records were altered/deleted.

**Separate pre-existing change:** sent count rose from 18 at the baseline to 23 before the new control. All five additional sends predate this action. Their origin is not established by this observation; do not attribute them to shadow or claim zero email activity across the entire overnight interval. This task did not expand into email/cron diagnosis or change configuration.

The ordinary authoritative check updated its normal snapshot and UI to “6 new updates found” / “Just now”. These are authorized current-check effects, not shadow-selected state or a UI feature change. No shadow-caused notification/email/report/Watch-state/UI effect or monitoring interruption was observed. No live OFF/ON causal experiment was run; authority/failure isolation remain supported by the unchanged architecture and already-passing focused tests.

## Runtime

Approved budget remains **40 ms**, checked between candidates. Additional diagnostic timestamps span **34 ms**, versus **33 ms** in the baseline. All 20 decisions completed in both samples, with zero budget errors or malformed/failed decisions. This span is not instrumented evaluator duration and does not prove a hard CPU ceiling: synchronous work is not preempted. No material instability is visible in these two spans. Prior local observer cold/warm/p50/p95: 26.18 / 0.47 / 0.51 / 0.84 ms; not remeasured here and not substituted for Vercel latency.

## Bounded disagreement review — exactly 10

Only ten selected candidate titles and their already stored RSS excerpts were read from the target snapshot. No full articles, web research, AI interpretation or other retrieval. Each stored excerpt below repeats the headline and supplies no additional facts. It was not promoted to same-document evidence by this review. These are **provisional evidence assessments for human review**, not frozen human labels and not accuracy measurements. Current or shadow output is not presumed correct.

### 1. Jannik Sinner receives injury boost as ‘decisive’ Darren Cahill talks emerge – report - Tennis365

Candidate: 238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473

Available stored excerpt: Jannik Sinner receives injury boost as ‘decisive’ Darren Cahill talks emerge – report Tennis365

Current: **MATCH**; shadow: **INSUFFICIENT_EVIDENCE**; evidence appears sufficient for: **INSUFFICIENT_EVIDENCE**.

Injury boost is vague: no concrete medical change is described; coaching talks are not an appointment.

### 2. Sinner to return from injury with appearance at Six Kings Slam - TNT Sports

Candidate: c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350

Available stored excerpt: Sinner to return from injury with appearance at Six Kings Slam TNT Sports

Current: **NO_MATCH**; shadow: **MATCH**; evidence appears sufficient for: **MATCH**.

The title explicitly describes return from injury and participation at Six Kings Slam.

### 3. ‘Sad for tennis’ – Ben Shelton issues honest verdict on Carlos Alcaraz and Jannik Sinner - Tennis365

Candidate: d546b5d19b1fdbe8fa44965af835539e42d65227da8d93cb3c91b8c1307e5d50

Available stored excerpt: ‘Sad for tennis’ – Ben Shelton issues honest verdict on Carlos Alcaraz and Jannik Sinner Tennis365

Current: **MATCH**; shadow: **INSUFFICIENT_EVIDENCE**; evidence appears sufficient for: **NO_MATCH**.

A verdict by Shelton is commentary; no actual change for Sinner is specified.

### 4. Toni Nadal says whether he would ever consider coaching Carlos Alcaraz or Jannik Sinner - Tennishead

Candidate: ad77f06e0e464b93b4f99f8509bb3779635e7d8faefdf9ce6c8bfbce00a31bd8

Available stored excerpt: Toni Nadal says whether he would ever consider coaching Carlos Alcaraz or Jannik Sinner Tennishead

Current: **MATCH**; shadow: **INSUFFICIENT_EVIDENCE**; evidence appears sufficient for: **NO_MATCH**.

Considering whether he would coach someone is hypothetical, not an appointment. The current shadow wording rule abstains on this formulation.

### 5. Jannik Sinner sends message to Kimi Antonelli with the Italian on the verge of history - Daily Express

Candidate: 88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917

Available stored excerpt: Jannik Sinner sends message to Kimi Antonelli with the Italian on the verge of history Daily Express

Current: **MATCH**; shadow: **NO_MATCH**; evidence appears sufficient for: **NO_MATCH**.

The development described concerns Antonelli; Sinner is sending a message.

### 6. Medvedev: Why We’re Not Snapping Sincaraz Stronghold - Tennis Now

Candidate: 8333cbeb02a5a71789170d79d111507a852dfe4e7b5bf0cc768240546737de2d

Available stored excerpt: Medvedev: Why We’re Not Snapping Sincaraz Stronghold Tennis Now

Current: **NO_MATCH**; shadow: **INSUFFICIENT_EVIDENCE**; evidence appears sufficient for: **INSUFFICIENT_EVIDENCE**.

The combined nickname and explanation do not establish the named subject and a concrete development. No alias expansion is invented.

### 7. Famous Italian Olympian has message for Jannik Sinner: I paid the consequences - Tennis World USA

Candidate: 753d20c642cc6063859856d324e91603a11abbbcf9f88106a500928cfc00bab3

Available stored excerpt: Famous Italian Olympian has message for Jannik Sinner: I paid the consequences Tennis World USA

Current: **MATCH**; shadow: **NO_MATCH**; evidence appears sufficient for: **NO_MATCH**.

An Olympian addresses Sinner; the preserved title does not establish a personal sporting development.

### 8. Daniil Medvedev sends clear message over Alexander Zverev and Jannik Sinner in No 1 ranking debate - Tennis365

Candidate: 3051e91d22492503345d833aea9ffda0fab88074f57a2b23b84985efb1ab5cd8

Available stored excerpt: Daniil Medvedev sends clear message over Alexander Zverev and Jannik Sinner in No 1 ranking debate Tennis365

Current: **MATCH**; shadow: **INSUFFICIENT_EVIDENCE**; evidence appears sufficient for: **NO_MATCH**.

A third-party message in a ranking debate does not establish a change for Sinner.

### 9. Jannik Sinner’s surprise U-turn just cost a 20-year-old American a huge payday - www.tenniswatcher.com

Candidate: 9b2949fc15b9ac531a4a42c8d3bdce1cb47f1d0049b0718916e248eee699bdd6

Available stored excerpt: Jannik Sinner’s surprise U-turn just cost a 20-year-old American a huge payday www.tenniswatcher.com

Current: **MATCH**; shadow: **INSUFFICIENT_EVIDENCE**; evidence appears sufficient for: **INSUFFICIENT_EVIDENCE**.

A reversal is suggested, but neither the decision nor its circumstances are explained. Do not infer the missing event.

### 10. Sinner to defend Vienna title - ATP Tour

Candidate: 98391a5fde0a1bfe51c0f4b1e3d39ff44b654b79f6097cbadafc625fe7c49901

Available stored excerpt: Sinner to defend Vienna title ATP Tour

Current: **NO_MATCH**; shadow: **INSUFFICIENT_EVIDENCE**; evidence appears sufficient for: **MATCH**.

Defending the Vienna title describes scheduled participation for the monitored player. Likely a wording-coverage gap; a human should confirm the identity/participation reading.

## Pattern and operational conclusion

Among the ten reviewed cases, the provisional readings are 2 MATCH, 5 NO_MATCH and 3 INSUFFICIENT_EVIDENCE; these counts are not precision/recall. Patterns: (1) commentary/messages can be accepted by the current matcher while shadow rejects or abstains; (2) vague injury/reversal headlines lack the actual change; (3) explicit return/participation can be rejected by the current matcher, while some non-literal participation wording still makes shadow abstain; (4) hypothetical coaching can fall between literal shadow patterns. No rule was tuned to these cases.

Operationally, one additional safe bounded batch, consistent repeat decisions and inspectable disagreement evidence meet this campaign’s limited goal. General multi-pattern/other-owner coverage, long-run reliability, precise Vercel cold/warm timing, live accuracy and the origin of the five overnight sends remain unproven. No live candidate automatically has a frozen human-reference label. Observation measures operational behavior, disagreement/evidence shape and consistency only; **live precision/recall are not established**.

Next step: ask the user to adjudicate these ten cases as a bounded human reference; no automatic label/corpus/model/rule change. Do not merge, make shadow authoritative or trigger more traffic from this conclusion.

## Additional comparison records

| Candidate hash | Current | Shadow | Repeats baseline |
|---|---|---|---|
| 81889c4660bd8c90b5b5b867620f8058eb2c582665b23d6371a187cdfeea5679 | MATCH | MATCH | NO |
| 67a73fd74ec5ffbc6f46efd4cae0fc1077a5a41eb543bbbd20aefe27fd7b9bf9 | MATCH | MATCH | YES |
| 98391a5fde0a1bfe51c0f4b1e3d39ff44b654b79f6097cbadafc625fe7c49901 | NO_MATCH | INSUFFICIENT_EVIDENCE | NO |
| 9b2949fc15b9ac531a4a42c8d3bdce1cb47f1d0049b0718916e248eee699bdd6 | MATCH | INSUFFICIENT_EVIDENCE | NO |
| 4b4f79150a96814ebf9a7d74e09e7636675311bead66c5a5310d3b32f396eec6 | MATCH | MATCH | YES |
| 11e23d966d4f0a135b5be6b8278999e792d70ad09b41d918ed789ae731368171 | MATCH | MATCH | YES |
| 3051e91d22492503345d833aea9ffda0fab88074f57a2b23b84985efb1ab5cd8 | MATCH | INSUFFICIENT_EVIDENCE | YES |
| 753d20c642cc6063859856d324e91603a11abbbcf9f88106a500928cfc00bab3 | MATCH | NO_MATCH | YES |
| 59d2fb85e2d346e153a82b5918b88ebaaa50de067b5660157a4ee11d43a1a8b7 | MATCH | MATCH | YES |
| 8333cbeb02a5a71789170d79d111507a852dfe4e7b5bf0cc768240546737de2d | NO_MATCH | INSUFFICIENT_EVIDENCE | NO |
| 88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917 | MATCH | NO_MATCH | YES |
| ad77f06e0e464b93b4f99f8509bb3779635e7d8faefdf9ce6c8bfbce00a31bd8 | MATCH | INSUFFICIENT_EVIDENCE | NO |
| d546b5d19b1fdbe8fa44965af835539e42d65227da8d93cb3c91b8c1307e5d50 | MATCH | INSUFFICIENT_EVIDENCE | NO |
| 3c43340bda55fde9ab3d041004c25801ce1930004b7315dab0203d926ad76377 | MATCH | INSUFFICIENT_EVIDENCE | NO |
| fde9d4567c66f3263aae2a5c7f9605def5d95664255d1a43a626a44b34e81612 | MATCH | INSUFFICIENT_EVIDENCE | NO |
| c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350 | NO_MATCH | MATCH | YES |
| 2a29f307cf4da29980e3a2162c7866a781a1f4d47c2b74a22155336f534f58f9 | MATCH | INSUFFICIENT_EVIDENCE | NO |
| 319128bb70a5e4e498174e9ecbeb8e82ad4746fa49357d9a1cb20027c9ff00ac | MATCH | MATCH | YES |
| 238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473 | MATCH | INSUFFICIENT_EVIDENCE | YES |
| 7762f1bad738fc32175fc307732ba797ce616be9cdec306df6b30e0711c86388 | MATCH | MATCH | YES |
