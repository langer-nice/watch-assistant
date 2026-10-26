# Shadow person parity runtime v1

Current classification: **A. SHADOW RUNTIME READY** under the subsequently approved 40 ms budget. The original 8 ms evaluation and the later single authorized control are recorded separately below.

## Mapping and scope

Behavioral reference: offline person-parity-v2/person.mjs, SHA-256 `d2bb5b63b152ab694c4bffa1bb7b99e49327c712a5ada1196e12110b729879f6`. Its pure core is namespaced inside the existing shadow matcher; no additional runtime module or runtime fixture dependency. Rule order, event patterns, status, reasons and abstentions are preserved.

`storyShadowContext()` enables the validated fixed Jannik Sinner/tennis scope only for a confirmed individual person interpretation without required topics or exclusions. Surname permission and the two existing frozen professional-scope exclusion expressions are copied unchanged. They are rule constants, not candidate-title/ID lists. Other person Watches retain their prior observer rules; no tennis profession is inferred for them. Non-person rules are unchanged.

`evaluateStoryShadow()` maps offline label → result, reason → reasonCodes, identity/development/status → safe evidence. Title and existing same-document-owned excerpt are the only evidence. Unknown RSS excerpts remain quarantined. The existing observer copies the bounded publisher source string so exact publisher-suffix stripping has identical input; it never logs that string. Existing input bounds and all gates remain unchanged. Shadow metadata version is story-shadow.person-parity.v2.

## Exact frozen title parity

The 20 original title/source pairs and offline full outputs are a test fixture only. Expected labels come exclusively from offline v2, never the authoritative matcher. Tests compare full core metadata and adapter labels/reasons individually, including reverse order.

| Candidate ID | Offline | Runtime | Parity |
|---|---|---|---|
| `7762f1bad738fc32175fc307732ba797ce616be9cdec306df6b30e0711c86388` | MATCH | MATCH | PASS |
| `238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473` | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | PASS |
| `eb297642044b573e367c16782a6cc15c20378b5bd8ceb88d76ed9da335c7dff2` | MATCH | MATCH | PASS |
| `a594066c914fc92d446ae8476b34921f2977df22846c27105bace29492a79f3c` | MATCH | MATCH | PASS |
| `c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350` | MATCH | MATCH | PASS |
| `da60a628b94f9c1a0685801c282134ee84f3f0791d25c804fca8898e79f7c045` | NO_MATCH | NO_MATCH | PASS |
| `319128bb70a5e4e498174e9ecbeb8e82ad4746fa49357d9a1cb20027c9ff00ac` | MATCH | MATCH | PASS |
| `753d20c642cc6063859856d324e91603a11abbbcf9f88106a500928cfc00bab3` | NO_MATCH | NO_MATCH | PASS |
| `88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917` | NO_MATCH | NO_MATCH | PASS |
| `710f9a1298c648665a0372e668ea670dfc91064c267e70f4b04db2836f9f3e4d` | NO_MATCH | NO_MATCH | PASS |
| `11e23d966d4f0a135b5be6b8278999e792d70ad09b41d918ed789ae731368171` | MATCH | MATCH | PASS |
| `4b4f79150a96814ebf9a7d74e09e7636675311bead66c5a5310d3b32f396eec6` | MATCH | MATCH | PASS |
| `f09ecf150994c72f2f28e333d4208cf36343223191584bec7aba3bcef8ca60b9` | NO_MATCH | NO_MATCH | PASS |
| `3d9f90affb62939c3d7f48e9b73f7594411c797c880441a5eb00d173c1806b7b` | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | PASS |
| `d67940d076bde1bfd9861d1a3d60f55f7e80ae7a1f92715a1c716123780c5e30` | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | PASS |
| `67a73fd74ec5ffbc6f46efd4cae0fc1077a5a41eb543bbbd20aefe27fd7b9bf9` | MATCH | MATCH | PASS |
| `8a5321f2a6161b85168ecb0d16f0218fc6bbbc951f7482f419fd9b1dde7f645b` | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | PASS |
| `40ab336efbee5b5dbac265cec83ae52508664ec0e2021fd7449e2a519b5de396` | MATCH | MATCH | PASS |
| `006bc90f72f652307ee6b4b98e3ecb87dff5b096f336aad071fa71817afb8ad1` | MATCH | MATCH | PASS |
| `81889c4660bd8c90b5b5b867620f8058eb2c582665b23d6371a187cdfeea5679` | MATCH | MATCH | PASS |

Distribution: **11 MATCH / 5 NO_MATCH / 4 INSUFFICIENT_EVIDENCE**.

## Focused verification

57/57 focused tests PASS: original 16 shadow tests, all 37 offline person tests ported unchanged in assertions, exact 20-title parity, observer adapter, Unicode boundary preservation, exact protected packets. H013 NO_MATCH; H042/F08/J07 INSUFFICIENT_EVIDENCE. Zero observed decision regressions. No corpus labels changed. The offline synthetic/historical corpus is not reinterpreted or rerun; its previously validated metrics are not claimed as fresh runtime metrics.

Authority and failure isolation: existing mocked scheduler test proves identical current persisted matches/RPCs with shadow OFF/ON even if diagnostic recording throws. Gate/owner isolation, input immutability, redaction, evaluator failure, recorder failure and budget failure pass. Shadow has no email/notification/database/provider dependency. The 8 ms gate and all persistence hooks are unchanged. No real scheduler job was invoked.

Build: PASS (`npm run build`), existing Sass legacy API and chunk-size warnings only. No dependencies installed.

## Performance

Local Node v23.7.0, `--no-maglev`; not a Vercel Node 24 runtime measurement. Reproduce with `node --no-maglev server/test-support/story-shadow-person-performance.mjs`. Frozen local fixtures only; no AI, retrieval, application endpoint or other network request is used. Eight fresh processes per mode; 60 warmed 20-candidate batches per process. Timer wraps context creation and the whole batch; module/dependency import latency is reported separately. Warm = median of each process minimum; p50/p95 = median of each process batch percentile. These are local measurements, not guaranteed production limits.

| Mode (20 candidates) | Cold median / range ms | Warm ms | p50 ms | p95 ms |
|---|---:|---:|---:|---:|
| Direct adapter | 23.895 / 23.146–24.514 | 0.290 | 0.321 | 0.509 |
| Observer, real 8 ms gate | 14.116 / 13.673–15.640 | 0.473 | 0.510 | 0.924 |
| Full observer diagnostic timing | 26.421 / 25.613–26.721 | 0.468 | 0.505 | 0.855 |

Module/dependency imports: median 9.942 ms, separate from evaluation. Full observer diagnostic mode injects a frozen budget clock solely in the local benchmark to measure all 20 candidates; outer wall-clock timing remains real. It does not modify the runtime budget. The real-gate observer completed only 2/20 cold, then emitted SHADOW_BUDGET_EXCEEDED; warmed batches completed 20/20. Its shorter cold duration is truncation, not full-batch performance.

Unoptimized direct cold median: 34.878 ms. Optimized full adapter cold median: 23.895 ms. Lowest measured full observer cold: 25.613 ms.

Implementation-only optimization: reuse a Unicode letter predicate and scan exact name/action boundaries instead of embedding Unicode character tables into every dynamic expression. Includes astral-letter and overlapping-match checks. No safety/event/status rule removed, no cached candidate result, no title allowlist. Exact parity rerun after optimization. Further optimization stopped after this bounded change because cold cost still exceeds the approved budget.

**8 ms is insufficient at cold start. It remains unchanged.** Suggested next budget for explicit approval: **40 ms per observer batch**, allowing headroom above the measured full-batch cold range; module initialization is an additional one-time cost. This is a local recommendation, not a guaranteed ceiling or an applied configuration. Before any live shadow check, explicit budget approval and a focused offline verification of the approved change are required.

The current timer is a soft check between candidates, not preemptive cancellation of synchronous regex work. An expensive candidate can overrun before the next check. Timeout/errors remain isolated from authoritative results and notifications, but synchronous shadow work still adds request latency. Increasing the budget would permit more optional synchronous work; it would not change current matching, persistence or delivery.

## Preservation and next step

Only the existing two runtime presentation-free shadow files, focused test file, parity fixture, local benchmark and this report changed. Current matcher, non-person rules, hooks, notifications/emails, UI, schema, Watch data, cron and configuration unchanged. Existing offline prototypes/corpora untouched. No Check now, monitoring, cron, AI, retrieval, email or new Staging traffic. No deployment; existing Preview still runs its previous code. PR #70 remains draft/unmerged; master/Production untouched.

Next step: request explicit approval for the proposed 40 ms budget, or further narrowly scoped performance work. **Not ready for a live Staging check under the current 8 ms budget.**

## Authorized 40 ms budget and controlled-check preparation

The user explicitly authorized increasing only observeStoryShadow() from 8 to 40 ms, one Preview deployment, and exactly one existing Jannik Sinner Staging check. No rule, other timeout, gate or delivery setting changed. Commit c6a60f7.

58/58 focused tests PASS; exact 20-title parity remains 11 MATCH / 5 NO_MATCH / 4 INSUFFICIENT_EVIDENCE. H013 NO_MATCH; H042/F08/J07 unchanged. The updated fail-safe test uses 41 ms to prove safe truncation; exactly 40 ms remains permitted. Build PASS. No further optimization.

Real 40 ms observer, 8 fresh processes × 60 warm batches: cold median 26.179 ms (maximum 26.520), warm 0.470 ms, p50 0.505, p95 0.838. Every cold and warm batch completed 20/20. The 40 ms budget is sufficient for this local sample; the soft between-candidate limitation remains.

Preview deployment dpl_Gn8UPYVoiwjWJdqv2mfzavBrqzCt is READY, explicit API target staging, exact branch/commit c6a60f706a6bf929c67885b45d03fcd0f4166e0b, URL https://watch-assistant-31avwxpml-david-lang.vercel.app. Existing project and branch-specific Staging database reused. Read-only flag inspection confirms all Watch/media/Structured email gates, notification intents and scheduled execution OFF; shadow ON. No configuration changed.

The new origin requires the user's existing OTP login before the authorized check. No Check now has yet been run. Notification-count verification is not yet available: the managed Node fetch failed; automatic review rejected temporary credential-file persistence and credential transfer into an unsandboxed terminal. No secret was written/transmitted by those rejected operations. No credential rotation or security bypass attempted.

Read-only fallback succeeded through the existing authenticated Supabase dashboard, project watch-assistant-staging (tseexvbwhrtofcsrvcqc), using a SELECT scoped to the authorized Watch only: notification_count=23, sent_count=18 before the controlled check. No Watch/notification row changed. No credential was needed in the SQL editor. OTP login on the new Preview origin remains pending; zero controlled checks performed so far.

## Single authorized Staging control — 2026-10-26 21:56 UTC

Final classification: **A. SHADOW RUNTIME READY** for continued bounded Staging observation only. This supersedes the earlier 8 ms classification and pending-OTP status above. No Production accuracy or rollout claim.

After the user completed OTP on the new origin, exactly one Check now was submitted for existing Watch 672a8533-c48f-4dd4-aab4-2064f0eb6702. POST /api/media-watches request `kz69w-1793051761078-21540d946b1a` ran on deployment dpl_Gn8UPYVoiwjWJdqv2mfzavBrqzCt, runtime commit c6a60f7, Node 24, Preview, region cdg1. All 20 comparison records use story-shadow.person-parity.v2. No second check, cron, new Watch, manual email or extra article-body retrieval.

| Observation | Result |
|---|---:|
| Candidates | 20 |
| Current MATCH / NO_MATCH | 17 / 3 |
| Shadow MATCH / NO_MATCH / INSUFFICIENT_EVIDENCE | 9 / 5 / 6 |
| Exact three-label agreements / disagreements | 9 / 11 |
| Shadow errors / budget timeouts | 0 / 0 |
| Notifications before / after | 23 / 23 |
| Previously sent notification rows before / after | 18 / 18 |

The candidate set changed: 14 candidate hashes overlap the frozen 20-title fixture, with **14/14 exact shadow-label parity**; 6 candidates are different. The actual 9/5/6 distribution is therefore not forced to 11/5/4. The current matcher is a comparison, not human truth. Live accuracy remains unmeasured.

Records span 21:56:03.187Z–21:56:03.220Z (33 ms). This is a wall-clock diagnostic timestamp span, **not a precise observer duration**; no duration instrumentation exists. All candidates completed with no budget error under the unchanged approved 40 ms gate. No assertion about Vercel cold-start latency beyond this first observation is made. Local cold/warm/p50/p95 results remain those above.

The existing authoritative check persisted its ordinary result and the UI displayed “3 new updates found” with LAST SUCCESSFUL CHECK “Just now”. This expected check effect is distinct from shadow observation: no UI behavior was added or selected by shadow. Current matcher remains authoritative. Read-only SELECT counts in the existing Staging dashboard show unchanged notification and sent counts. Delivery/scheduling gates remain OFF, consent unchanged; no email was sent by this test.

| Candidate hash | Current | Shadow |
|---|---|---|
| `67a73fd74ec5ffbc6f46efd4cae0fc1077a5a41eb543bbbd20aefe27fd7b9bf9` | MATCH | MATCH |
| `d67940d076bde1bfd9861d1a3d60f55f7e80ae7a1f92715a1c716123780c5e30` | MATCH | INSUFFICIENT_EVIDENCE |
| `be68544facc9120edcbe6360516697ed6bcfc0b0985561647b4c3880606152b3` | MATCH | NO_MATCH |
| `4b4f79150a96814ebf9a7d74e09e7636675311bead66c5a5310d3b32f396eec6` | MATCH | MATCH |
| `59d2fb85e2d346e153a82b5918b88ebaaa50de067b5660157a4ee11d43a1a8b7` | MATCH | MATCH |
| `11e23d966d4f0a135b5be6b8278999e792d70ad09b41d918ed789ae731368171` | MATCH | MATCH |
| `c8c4883f7d10b356cc4c96a020ae04799ccb547d15d85634fbca663969b0b7a2` | MATCH | INSUFFICIENT_EVIDENCE |
| `da60a628b94f9c1a0685801c282134ee84f3f0791d25c804fca8898e79f7c045` | NO_MATCH | NO_MATCH |
| `3051e91d22492503345d833aea9ffda0fab88074f57a2b23b84985efb1ab5cd8` | MATCH | INSUFFICIENT_EVIDENCE |
| `88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917` | MATCH | NO_MATCH |
| `753d20c642cc6063859856d324e91603a11abbbcf9f88106a500928cfc00bab3` | MATCH | NO_MATCH |
| `f09ecf150994c72f2f28e333d4208cf36343223191584bec7aba3bcef8ca60b9` | MATCH | NO_MATCH |
| `e3b7b1e2310edcbad94b66997f45a490fffc5f0eb560ae4c4094cc496438ab67` | NO_MATCH | INSUFFICIENT_EVIDENCE |
| `18f01e88a1bcab5e69115a915e728a4e55ac08e596d57fa5bd5e4be8365e240b` | MATCH | INSUFFICIENT_EVIDENCE |
| `c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350` | NO_MATCH | MATCH |
| `a594066c914fc92d446ae8476b34921f2977df22846c27105bace29492a79f3c` | MATCH | MATCH |
| `eb297642044b573e367c16782a6cc15c20378b5bd8ceb88d76ed9da335c7dff2` | MATCH | MATCH |
| `319128bb70a5e4e498174e9ecbeb8e82ad4746fa49357d9a1cb20027c9ff00ac` | MATCH | MATCH |
| `238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473` | MATCH | INSUFFICIENT_EVIDENCE |
| `7762f1bad738fc32175fc307732ba797ce616be9cdec306df6b30e0711c86388` | MATCH | MATCH |

Only this evidence document changed after the controlled check. No further runtime/rule/configuration changes. PR #70 remains draft/unmerged; Production/master unchanged. Recommendation: continue bounded shadow observation only with separately authorized traffic; do not make shadow authoritative or merge based on this single sample.
