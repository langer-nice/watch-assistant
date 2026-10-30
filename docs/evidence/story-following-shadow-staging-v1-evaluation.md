# Initial Staging shadow observation report

Version `story-shadow.v1`; 26 October 2026. This initial report separates local
verification from live operational evidence. It does not replace corpus v1.4.

## Initial available sample at 19:57 UTC

No natural comparisons collected at report preparation: **0**.
Current MATCH, shadow MATCH, agreements, disagreements, current MATCH/shadow NO_MATCH,
current NO_MATCH/shadow MATCH, shadow INSUFFICIENT_EVIDENCE, per-category observations:
all **0 observed**. Shadow errors: **0 observed**, not proof of error-free execution.
No disagreement sample exists to inspect. No live human-reference labels are available;
live precision/recall are not measured.

Deployment-time read-only check, 2026-10-26 19:57:23 UTC: Preview
`dpl_3jHdVMTFETdrQULrJt7mA22Raqqj` is READY, target=null (Preview), branch
`codex/story-following-shadow-staging`, implementation commit
`c6d49afff93e7ac07c45568762f5babdf09aba92`.
URL: https://watch-assistant-qma9l2z3p-david-lang.vercel.app
Runtime log query for this deployment, Preview, event `story-following-shadow`,
19:47:23–19:57:23 UTC returned no records. Counts above remain zero observations.
This checks log availability, not invocation/evaluator success.
Production remains READY on unchanged deployment
`dpl_9epBsVLCGBY8GD3g3LtNbTdDFSkQ`, master
`fb8c9c0c1ad7d28574eed5c8d85500665a30e016`.
No monitoring, UI check action, notification or email was triggered for this report.

The new Preview has no existing cron traffic, no copied cron secret, and scheduled
execution/delivery disabled. Existing Staging routing is deliberately untouched.
Therefore zero samples do not demonstrate that recording or scheduled hooks work in
deployment. Read Preview runtime logs for event `story-following-shadow` after READY;
the handoff report records that deployment-time read-only check. Do not trigger jobs
or fetch extra content to fill a quota. Fifty candidates is a target, not fabricated
evidence or a condition to prolong this first report.

## What is established locally

16 focused tests and 63 directly affected existing tests pass; build passes.
Current persisted RPCs/results are identical with observation enabled/disabled in
the scheduler fixture, including observer-storage failure. No shadow dependency can
send an email or create a notification. Strict Preview/project/branch/database/owner
gates close observation in Production. No frontend change.

## Limits and recommendation

Operational success is **not established**: runtime recording, normal-run latency,
stability and disagreement quality need actual natural observations. RSS provenance
and missing typed contexts cause deliberate abstentions; this partial port makes no
claim of offline score parity. Existing log retention limits later inspection.

Recommendation: **revise shadow integration/activation plan before operational
evaluation**. Agree a safe way to observe existing Staging traffic without changing
primary behavior or delivery, then continue bounded shadow observation. Do not merge,
make shadow authoritative, alter consent or enable Production based on these tests.

## Clean Preview reuse and authorized natural sample — 20:26 UTC

Inspection preceded execution. Current remote master remains
`fb8c9c0c1ad7d28574eed5c8d85500665a30e016`; PR #70 base is that commit and head
before this documentation update is `b678f005694dc404549a2638f56d6654b1cf9ed6`.
No rebase is necessary. The READY Preview above has exactly the same application
code as the PR head; the intervening commit changes this report only. No redundant
deployment or configuration adjustment was necessary to reuse this clean Preview.

Old Staging ref `codex/structured-interpretation-v1` points to `1c04e0340e1550a8a7f75c0c09a92e7380572a02`.
Its tree differs from current master in 23 files, including approved notes, deletion,
Home and error-presentation corrections. No old branch commits/patches were imported.
Existing infrastructure alone is reused: Supabase `tseexvbwhrtofcsrvcqc`, its existing
account and OTP. The public auth settings return 200 with email OTP enabled; the
user completed OTP and authenticated media/company list requests returned 200.
Branch-only Staging database/auth/Structured gates and shadow flag were verified;
delivery, notification-intent and scheduled-execution flags remain OFF. Existing
old Staging configuration, scheduling and Production were not changed.

One existing Staging Watch, Jannik Sinner (`672a8533-c48f-4dd4-aab4-2064f0eb6702`),
was checked once through its existing authenticated Check now UI. No new Watch,
account, infrastructure, recurring job, extra article-body fetch or AI was used.
Request `srntp-1793046359608-2e3827133044` produced 20 shadow rows at
2026-10-26T20:26:01.603Z–20:26:01.610Z. Logs became searchable after a short indexing
delay; the first immediate empty query was not evidence of failed execution.

| Observation | Count |
|---|---:|
| Candidates | 20 |
| Current MATCH / NO_MATCH | 15 / 5 |
| Shadow MATCH / NO_MATCH / INSUFFICIENT_EVIDENCE | 0 / 0 / 20 |
| Exact three-label agreements / differences | 0 / 20 |
| Current MATCH / shadow NO_MATCH | 0 |
| Current NO_MATCH / shadow MATCH | 0 |
| Current MATCH / shadow INSUFFICIENT_EVIDENCE | 15 |
| Current NO_MATCH / shadow INSUFFICIENT_EVIDENCE | 5 |
| Shadow errors | 0 |
| Category person | 20 |

All abstentions used REQUIRED_LOCAL_PROOF_MISSING. No performance/accuracy victory
is inferred: no human-reference labels exist for this live sample. Bounded manual
review of three displayed accepted candidates (hires a coach; comeback date announced;
to return at Six Kings Slam) confirms the person rule's narrow phrase coverage leaves
these unclassified. This is a port-coverage limitation, not a proven lack of article
evidence and not proof the current matcher is correct. No rule was tuned here.

The current matcher alone persisted its ordinary check results: last_checked_at
advanced from 11:00:58.863 UTC to 20:26:00.802 UTC, revision stayed 2, and UI displayed
12 new updates. Shadow did not choose or modify them. Notification rows for this
Watch remained 23 before/after. Stored email consent remains unchanged (the UI may
show On); deployment delivery gates remain OFF. No notification delivery/email was
invoked, and no schedule was changed. No Production data/configuration was touched.

Focused shadow tests rerun once: 16/16; build PASS. No broad suite rerun.
Initial manual-path observation/recording now works; scheduled-path and cross-pattern
operational coverage remain untested. Recommendation: **revise integration** under
separate approval to address the partial person-rule port before claiming semantic
coverage; no new test Watch is needed and no Production rollout is justified.
