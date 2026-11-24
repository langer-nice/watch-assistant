# Reliability integration validation — 24 November 2026

Integration branch: `codex/reliability-recovery-v3-diagnostics`.
Fetched base: `e7ba077d1c7d70dfec6f7df8f501cafb149a4a21` (current origin/master at integration). The validated patch applied without conflicts. No runtime or migration changes were needed during integration.

## Final checks

- **PASS: 156 tests, zero failures**, rerun in the integration worktree.
- **PASS: application build**, with the existing >500 kB bundle-size warning.
- **PASS: SQL recovery/diagnostic contracts**, included in the isolated PostgreSQL/PGlite tests, covering roles, owner isolation, eligibility, activation bounds, claims, submission uncertainty, diagnostic fencing and sanitization.
- **PASS: previous native PostgreSQL concurrency evidence reused**: PostgreSQL 17.11, two physical backend sessions, five synchronized claim races, exactly one winner per race, zero duplicate claims, fourteen additional safety scenarios. Both proposed SQL migration files are byte-identical to their source hashes in [concurrency.json](concurrency.json). No repeat infrastructure setup was necessary.
- No secrets, credential/environment files, backups, real user records, generated build products or logs are included. Native evidence contains only synthetic IDs and metadata; the temporary local directory path is redacted.

Command rerun:

```sh
node --no-maglev --test server/bounded-notification-recovery.test.js server/v3-scheduled-diagnostics.test.js server/media-watch-digest.test.js server/structured-digest-selection.test.js server/digest-user-journey.test.js server/v3-pilot.test.js server/v3-manual-parity.test.js server/structured-production-access.test.js server/structured-production-compatibility.test.js
npm run build
```

The [native harness](../../../scripts/native-notification-recovery-concurrency.py) uses the actual patch SQL with only a controlled business-clock substitution, not a substitute claim algorithm. It requires installed PostgreSQL 17 binaries, a fresh disposable local database named reliability_concurrency_test, a private Unix socket under /private/tmp/watch-reliability-pg.*, and --source pointing to the checkout. It must never target a shared/hosted database. It exercises real READ COMMITTED transactions and observes both backend sessions waiting at a PostgreSQL row-lock barrier before release.

## Release boundaries

Recovery is OFF unless both explicit recovery settings are supplied in the existing gated Production environment. No activation values are set by this PR. The immutable migration-installation floor and separately required activation timestamp exclude all seven historical pending notifications. No historical notification IDs or Production records are used here.

Normal digest age selection and schedule are unchanged. Recovery uses separate SQL entry points, preserves consent/owner/freshness checks and original dates, and labels delayed emails. Sent/uncertain submissions cannot automatically retry. Existing V3 success behavior and Brain/source acquisition are unchanged.

Two additive migrations, in filename order:

1. `20261124090958_durable_v3_failure_diagnostics.sql`: add fenced service-only diagnostic RPC; old failure RPC remains available for older apps/fallback.
2. `20261124091004_bounded_digest_recovery.sql`: nullable digest column, immutable installation floor, service-only recovery helpers and guarded legacy claim wrapper. No existing notification is rewritten.

Preferred rollout after separate authorization: validate the target integration, apply the additive SQL migrations, deploy the application with recovery still OFF, verify normal operation. Recovery activation requires another explicit authorization and a UTC activation instant no earlier than migration installation. Historical review/replay is separate and not implemented. Roll back application/flag without destructively rolling back SQL or resetting uncertain submission states.

## Limitations

The native concurrency proof is PostgreSQL 17.11 local versus Production 17.12; it does not validate hosted Supabase JWT signatures, the PostgREST gateway, or real email delivery. Those remain target-integration concerns, not claims made by this evidence. No live provider calls, hosted migrations, Production DB access, recovery activation or manual Watch/cron runs were used during integration.

See [implementation and deployment details](../../notification-recovery-and-diagnostics.md).
