# Initial Staging shadow observation report

Version `story-shadow.v1`; 26 October 2026. This initial report separates local
verification from live operational evidence. It does not replace corpus v1.4.

## Initial available sample

No natural comparisons collected at report preparation: **0**.
Current MATCH, shadow MATCH, agreements, disagreements, current MATCH/shadow NO_MATCH,
current NO_MATCH/shadow MATCH, shadow INSUFFICIENT_EVIDENCE, per-category observations:
all **0 observed**. Shadow errors: **0 observed**, not proof of error-free execution.
No disagreement sample exists to inspect. No live human-reference labels are available;
live precision/recall are not measured.

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
