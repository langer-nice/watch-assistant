# Updated person-shadow live check v1

27 October 2026. Classification: **A. UPDATED SHADOW CHECK PASS**, limited to this authorized operational/parity check. No general live accuracy claim.

## Deployment and preflight

User authorized exactly PR #70 head **51589290d889993e532a2844e7a8b91cb6f9a4ce**, one existing Staging Preview update and one existing Jannik Sinner Check now. Pre-deployment inspection confirmed that exact head, draft/open/unmerged state, only approved person matcher/tests/fixture/evidence files since cd8619f, and unchanged observeStoryShadow() 40 ms budget. The pre-existing untracked human-adjudication document was preserved and excluded from deployment.

Deployment **dpl_3g9Jv9c6hgZRZWbBKhWaku8GD5ck** is **READY**, explicit API target staging, existing project prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF, branch codex/story-following-shadow-staging, exact commit 5158929. Preview: https://watch-assistant-954rwzzyh-david-lang.vercel.app. Git deployment used the reviewed commit, not the dirty local worktree. No infrastructure or configuration was created/changed.

Read-only branch configuration confirmed existing Staging Supabase **tseexvbwhrtofcsrvcqc** for backend/frontend, shadow enabled, schedule disabled, all Watch/media/Structured email gates disabled, Structured staging email test disabled and notification intents disabled. Email/notification/digest delivery remains OFF for this shadow setup. Existing consent can display On in the UI; it was not modified or treated as permission to deliver. Existing OTP successfully authenticated the user on the new Preview origin and the existing Watch loaded. No auth bypass or copied session token.

Current matcher remains authoritative. Shadow version **story-shadow.person-human-fixes.v1** appeared in this deployment’s Preview Node 24 runtime logs. Non-person logic, rules, budget, hooks, emails/notifications, cron, Watch definition and Production/master were not edited in this task. No new tests/build/corpus evaluation were needed or run; the authorized commit already had its passing validation.

## One authorized control

Watch: **Jannik Sinner**, ID **672a8533-c48f-4dd4-aab4-2064f0eb6702**. Exactly one Check now click after successful login and pre-count. No second check, cron, new Watch, article-body fetch, AI call or email invocation. Request **djwdh-1793092143413-7f7c454093e7**, POST /api/media-watches, Preview, cdg1.

| Measure | Observed |
|---|---:|
| Candidates | 20 |
| Current MATCH / NO_MATCH | 16 / 4 |
| Shadow MATCH / NO_MATCH / INSUFFICIENT_EVIDENCE | 7 / 7 / 6 |
| Exact three-label agreements / disagreements | 8 / 12 |
| Shadow errors / timeouts | 0 / 0 |
| Notifications before → after | 23 → 23 |
| Sent notification rows before → after | 23 → 23 |

Both counts were SELECT-only reads in the existing authenticated Staging Supabase dashboard, scoped to this Watch. No notification or sent-count difference during the control; no manual email sent. No notification/history rows were changed by this task outside the normal authorized current check. No shadow-caused Watch/report/UI change or monitoring interruption observed.

The ordinary UI completed with LAST SUCCESSFUL CHECK “Just now” and “New articles were retrieved, but none matched this Watch.” The logged current 16 MATCH values are semantic comparisons before durable novelty filtering, not sixteen new updates or email decisions. The existing latest development remained visible. No unrelated UI issue was investigated or repaired.

## Runtime evidence and limitation

Twenty comparison timestamps span **2026-10-27T09:09:05.453Z–09:09:05.493Z**, **40 ms**. All twenty decisions completed with no SHADOW_BUDGET_EXCEEDED, malformed result or evaluation failure. This reaches the nominal budget span; it is not an instrumented observer duration. The existing timer checks between candidates and does not preempt a synchronous candidate, so exact total duration and a hard 40 ms CPU ceiling are not proven. No material overrun is established by these records, and no budget/rule/optimization change was made. Prior local performance remains separately documented, not substituted for measured Vercel latency.

## Overlap and expected version changes

Compared against the union of the prior two recorded samples: **19 overlapping candidate hashes**, one new candidate. Hashes identify candidates rather than complete packets; a title/body input-byte hash is not available.

- **15/15** observed labels agree with the newly validated offline fixture expectations (20-title fixture plus ten human cases).
- The other **4/4** repeated candidates lack a new frozen reference in those fixtures and retain their previously observed decisions.
- Across all 19 repeats: 15 unchanged decisions, **4 intentionally changed INSUFFICIENT_EVIDENCE → NO_MATCH**, exactly matching the approved offline fixes. No unexpected decision change or known-reference parity break.

| Intentionally changed candidate | Old shadow | New shadow | New offline reference |
|---|---|---|---|
| 3051e91d22492503345d833aea9ffda0fab88074f57a2b23b84985efb1ab5cd8 | INSUFFICIENT_EVIDENCE | NO_MATCH | NO_MATCH |
| d546b5d19b1fdbe8fa44965af835539e42d65227da8d93cb3c91b8c1307e5d50 | INSUFFICIENT_EVIDENCE | NO_MATCH | NO_MATCH |
| 8333cbeb02a5a71789170d79d111507a852dfe4e7b5bf0cc768240546737de2d | INSUFFICIENT_EVIDENCE | NO_MATCH | NO_MATCH |
| ad77f06e0e464b93b4f99f8509bb3779635e7d8faefdf9ce6c8bfbce00a31bd8 | INSUFFICIENT_EVIDENCE | NO_MATCH | NO_MATCH |

## Reappearing human-reference cases

The user labels remain frozen; neither matcher is assumed to be truth. Eight of the ten previously adjudicated candidates reappeared, with **8/8 shadow agreements with their existing human reference**. This selected repeated subset does not establish general live precision/recall.

| Case | Candidate ID | Title | Human | Current | Shadow | Shadow agrees |
|---|---|---|---|---|---|
| 1 | 238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473 | Jannik Sinner receives injury boost as ‘decisive’ Darren Cahill talks emerge – report | INSUFFICIENT_EVIDENCE | MATCH | INSUFFICIENT_EVIDENCE | YES |
| 2 | c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350 | Sinner to return from injury with appearance at Six Kings Slam | MATCH | NO_MATCH | MATCH | YES |
| 3 | d546b5d19b1fdbe8fa44965af835539e42d65227da8d93cb3c91b8c1307e5d50 | ‘Sad for tennis’ – Ben Shelton issues honest verdict on Carlos Alcaraz and Jannik Sinner | NO_MATCH | MATCH | NO_MATCH | YES |
| 4 | ad77f06e0e464b93b4f99f8509bb3779635e7d8faefdf9ce6c8bfbce00a31bd8 | Toni Nadal says whether he would ever consider coaching Carlos Alcaraz or Jannik Sinner | NO_MATCH | MATCH | NO_MATCH | YES |
| 5 | 88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917 | Jannik Sinner sends message to Kimi Antonelli with the Italian on the verge of history | NO_MATCH | MATCH | NO_MATCH | YES |
| 6 | 8333cbeb02a5a71789170d79d111507a852dfe4e7b5bf0cc768240546737de2d | Medvedev: Why We’re Not Snapping Sincaraz Stronghold | NO_MATCH | NO_MATCH | NO_MATCH | YES |
| 8 | 3051e91d22492503345d833aea9ffda0fab88074f57a2b23b84985efb1ab5cd8 | Daniil Medvedev sends clear message over Alexander Zverev and Jannik Sinner in No 1 ranking debate | NO_MATCH | MATCH | NO_MATCH | YES |
| 9 | 9b2949fc15b9ac531a4a42c8d3bdce1cb47f1d0049b0718916e248eee699bdd6 | Jannik Sinner’s surprise U-turn just cost a 20-year-old American a huge payday | INSUFFICIENT_EVIDENCE | MATCH | INSUFFICIENT_EVIDENCE | YES |

Cases 7 and 10 did not appear. In particular **98391a5fde0a1bfe51c0f4b1e3d39ff44b654b79f6097cbadafc625fe7c49901 — Sinner to defend Vienna title** remains the intentionally unresolved human MATCH / offline shadow INSUFFICIENT_EVIDENCE case; its absence is not a fix or new validation.

## Safe comparison records

All records have the target Watch ID and the same hashed owner as the previous authorized samples. No cross-account record/leakage was observed in this scoped read; no broader account audit performed.

| Candidate hash | Current | Shadow |
|---|---|---|
| 81889c4660bd8c90b5b5b867620f8058eb2c582665b23d6371a187cdfeea5679 | MATCH | MATCH |
| 9b2949fc15b9ac531a4a42c8d3bdce1cb47f1d0049b0718916e248eee699bdd6 | MATCH | INSUFFICIENT_EVIDENCE |
| 514e937f85a28c344847dbbd527f766002aaee1f52908ae51f123d7c311f44a2 | NO_MATCH | INSUFFICIENT_EVIDENCE |
| f09ecf150994c72f2f28e333d4208cf36343223191584bec7aba3bcef8ca60b9 | MATCH | NO_MATCH |
| 4b4f79150a96814ebf9a7d74e09e7636675311bead66c5a5310d3b32f396eec6 | MATCH | MATCH |
| 11e23d966d4f0a135b5be6b8278999e792d70ad09b41d918ed789ae731368171 | MATCH | MATCH |
| da60a628b94f9c1a0685801c282134ee84f3f0791d25c804fca8898e79f7c045 | NO_MATCH | NO_MATCH |
| 3051e91d22492503345d833aea9ffda0fab88074f57a2b23b84985efb1ab5cd8 | MATCH | NO_MATCH |
| d546b5d19b1fdbe8fa44965af835539e42d65227da8d93cb3c91b8c1307e5d50 | MATCH | NO_MATCH |
| 59d2fb85e2d346e153a82b5918b88ebaaa50de067b5660157a4ee11d43a1a8b7 | MATCH | MATCH |
| 8333cbeb02a5a71789170d79d111507a852dfe4e7b5bf0cc768240546737de2d | NO_MATCH | NO_MATCH |
| 88e2b33c454bcee7fc626441de8d6972b1212ac780dd629495f4945f2fd74917 | MATCH | NO_MATCH |
| ad77f06e0e464b93b4f99f8509bb3779635e7d8faefdf9ce6c8bfbce00a31bd8 | MATCH | NO_MATCH |
| 3c43340bda55fde9ab3d041004c25801ce1930004b7315dab0203d926ad76377 | MATCH | INSUFFICIENT_EVIDENCE |
| fde9d4567c66f3263aae2a5c7f9605def5d95664255d1a43a626a44b34e81612 | MATCH | INSUFFICIENT_EVIDENCE |
| c945f87d34ea47f345848ff26d05a92cb887f15b07a60e33e10a7a318092a350 | NO_MATCH | MATCH |
| 2a29f307cf4da29980e3a2162c7866a781a1f4d47c2b74a22155336f534f58f9 | MATCH | INSUFFICIENT_EVIDENCE |
| 319128bb70a5e4e498174e9ecbeb8e82ad4746fa49357d9a1cb20027c9ff00ac | MATCH | MATCH |
| 238d0ea35a95fcea78e0d89bea548213ea44861710be38bd6e0d1ad322e02473 | MATCH | INSUFFICIENT_EVIDENCE |
| 7762f1bad738fc32175fc307732ba797ce616be9cdec306df6b30e0711c86388 | MATCH | MATCH |

## Conclusion

Updated Preview deployment and exactly one control succeeded. New person logic executes with expected bounded parity and no observed delivery/state side effect. Current matcher remains the only authority. PR #70 remains draft/open/unmerged; Production/master unchanged. Only this follow-up evidence document is changed after deployment. No automatic fixes, label changes, corpus changes or further traffic.

Recommendation: **continue bounded shadow observation only under separate authorization**; retain scrutiny of the near-budget log span and the unimplemented case 10. New disagreements may be presented for human review later; do not infer an accuracy score for unlabeled candidates or merge/promote from this single check.
