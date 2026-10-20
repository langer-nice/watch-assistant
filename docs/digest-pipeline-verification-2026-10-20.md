# Staging digest integration — October 20

Two defects were reproduced before correction:

1. After a digest was deferred past 08:30, account-wide selection could return both an older and a newer envelope for one Watch. Sending the oldest exhausted the daily submission slot; rejecting the newer boundary then marked its unsent members failed. The integration test observed zero pending articles instead of one.
2. A transient recipient Auth lookup failure before any provider call marked pending members failed. The test observed `failed` instead of `pending`. The worker now uses the existing token-bound deferral before any provider invocation; uncertain provider submissions keep the existing terminal boundary.

Structured selection now returns one oldest envelope per Watch, excluding active claims and Watches with a submission on the current UTC day. Expired pre-submission claims remain recoverable. Legacy selection is unchanged. The Staging migration changes no Watch, preference, member, template, frequency, scheduler or window.

## Actual local evidence

```
NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' node --no-maglev --test server/digest-user-journey.test.js server/media-digest-morning.test.js
```

16 passed, zero failed. The test executes the real report service, shared Watch controller, manual API, scheduled runner, authenticated cron handler (both scopes), notification processor, digest worker and all repository SQL migrations. Only clocks, Auth and provider dependencies are controlled; external networking is blocked. Assertions inspect actual database members, Home classification, recipient and provider keys, rather than HTTP status alone.

Covered: silent baseline; Home report capture; independent automatic capture of the same article; consent OFF; Home acknowledgement/refresh and later empty checks preserving pending members; UTC midnight; frozen-envelope deferral and next-morning priority; both cron scopes/retries without duplicates; lost completion response after commit; future Watches without ID allowlist edits; foreign account and recipient exclusion; immediate-frequency exclusion; transient Auth outage followed by safe retry; expired pre-send lease recovery across the October CET transition. Focused window checks cover CET/CEST, early/late calls, empty batches, before/after-begin deferral, tokens and terminal uncertainty.

## Evidence limits and hosted release

The authorized release is one Git-pinned Staging Preview and this selector migration. The post-release hosted check is read-only: effective Staging branch configuration/alias, installed function bodies and privileges, and existing approved-account notification/digest counts. It must never invoke monitoring, cron, prepare, claim, begin, or Resend. No hosted fixtures, baseline reset, old-article replay or settings changes are permitted.

Previous Royal Caribbean/Sinner sent records, provider identifiers and user-confirmed receipt are historical actual-delivery evidence. Today's complete application path uses a fake provider; it does not establish a new live Resend submission or future inbox receipt. Future automatic email still requires genuine eligible new content before a permitted window. Production remains unchanged.
