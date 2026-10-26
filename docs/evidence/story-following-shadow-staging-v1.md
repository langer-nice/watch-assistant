# Staging story shadow v1

26 October 2026. Base: approved master `fb8c9c0c1ad7d28574eed5c8d85500665a30e016`.
Branch: `codex/story-following-shadow-staging`. Version: `story-shadow.v1`.
Observation only; no master merge or Production rollout authorized by this document.

## Boundary

The existing `matchFeedItemToWatch` remains authoritative. Existing candidates,
matching arrays, completion RPC arguments, response bodies and notification decisions
are unchanged. Each observer runs **after successful current persistence**; its return
value is ignored. No additional feed/article fetch, AI, database write, notification
processor or email transport is available to the observer.

Hooks: structured scheduler completion, legacy media completion (excluding currency
and first baseline), and authenticated manual media completion. Observations use the
already computed semantic matching array before durable novelty filtering; MATCH here
does not mean a new notification. Failed/skipped completions are not observations.

## Deterministic adaptation

The candidate-local identity/relation/development/polarity rules, unattributable-excerpt
quarantine and bounded collaboration continuation follow the validated offline v3
and relation/collaboration patches. Names are parameters from stored, confirmed
Structured interpretation, never corpus names, item IDs, title allowlists or fixtures.
No offline evaluator or corpus is imported into the application.

This is a conservative, partial runtime port, **not measured parity with the 149-item
offline benchmark**. Live schema lacks some offline typed roles, approved identifiers
and source provenance. Unsupported/legacy contexts abstain as CONTEXT_NOT_SUPPORTED.
Explicitly directed acquisition roles are required; subject order is not a role.
No raw request/query interpretation or invented historical context is performed.
Only title plus an already attributable same-document excerpt may supply evidence.
Normal RSS excerpts lack that provenance and remain quarantined. The four enriched
offline documents are not fetched or injected. Coverage/recall can consequently be
lower; corpus v1.4 and its offline PASS remain separate and untouched.

## Isolation and comparison storage

Enablement requires all of: Preview environment, existing project ID, this exact branch,
exact existing Staging Supabase URL, STORY_FOLLOWING_SHADOW_ENABLED=true, and an owner
in the existing Staging test-owner allowlist. Production is always closed.

Storage uses existing Vercel Preview runtime diagnostic logs, event
`story-following-shadow`, separate from Watch/result/notification tables. No SQL/schema
or new table. Fields: version, timestamp, Watch ID, hashed owner and candidate key,
current/shadow decisions, category, reason codes, evidence-status fields and error flag.
No raw title, excerpt, URL, body, secret or exception message. Existing log retention
and operator access apply; this is not a durable comparison archive. Account logs
remain operator-only; the allowlist prevents observations for other accounts.

At most 20 bounded candidates per completion, with an 8ms soft budget checked between
candidates. This is not hard CPU preemption. Evaluation and synchronous writer failures
are caught. Writer failure can lose diagnostics; no logging system can prove absence
of errors when its own writes fail. No operational latency claim precedes real samples.

## Deployment and rollback

Git auto-deployment is disabled only for this new branch so its first push cannot
deploy with unspecified Preview configuration. Explicit Preview deployment follows
branch-scoped Staging database/auth configuration. No Production settings or existing
Staging branch/alias/cron are changed. New Preview scheduled execution, notification
intents and email delivery flags are OFF. Existing Staging email settings are untouched.
Sensitive cron credentials are unavailable and are neither copied nor rotated.

There is no automatic traffic migration. Existing scheduled Staging traffic continues
to its original deployment and does not execute this observer. Thus this isolated
Preview cannot yet establish scheduled operational compatibility. No job/manual check
is triggered to manufacture samples. Further safe traffic routing needs a separate
decision; do not enable schedules, delivery or retarget existing cron automatically.

Rollback: set only this branch's STORY_FOLLOWING_SHADOW_ENABLED to false for a later
Preview deployment, or stop using the isolated Preview. Never promote to Production.

## Focused verification

16 new focused tests pass: decision precedence in both directions; immutable inputs;
error/storage isolation; redaction; account isolation; bounded work; H042/F08/J07 safety;
provenance; deterministic/no-network evaluation; unsupported context; collaboration
scope; and actual scheduler primary RPC/output equality with a failing observer.
63 directly affected existing scheduler/execution/cron/current-matcher tests pass
unchanged. Build passes (existing Sass/chunk-size warnings only).

No live monitoring, AI, email, Watch creation/edit/deletion or corpus modification.
