# Recurring alerts — diagnosis and staging validation

## Diagnosis

Base: `057cabcc16c50dc251b30c281929bc5ae9fd079e` (merged #51), including #50 (`cae94bfa15108bccaf678d1ce530769ed6c72566`). Clean dedicated branch: `codex/recurring-alert-policies`.

Before this change, currency updates used one ID per `currencyRevision` and currency pair/target. Both `currencySatisfied` in JavaScript and `last_change_item_id` in PostgreSQL permanently suppressed that configuration after its first match. A later below-target rate **did not rearm** it. A material condition edit generated a new revision; cosmetic equivalent decimal spelling did not. Checks continued, updating `currency_evaluation`, without another event. “Once per condition” therefore meant once per configuration, not once per crossing.

The detail view combined the **latest evaluated rate** with the **original event detection timestamp**. That code path explains how a 2 October source date could appear beside a 1 October detection date without proving the source published in the future. The fix labels latest evaluation time separately and keeps immutable event-specific data in history. No original event timestamps are rewritten.

The reported market quote around 1.18 and delivery of the first production email have not been established. No production checks, Watch edits, baseline resets, email replays, browser-token extraction, environment changes or migrations were performed. Available historical production data was insufficient to establish those facts. Deterministic staging fixtures reproduce the old suppression behavior and verify the new policies. ECB daily reference observations are not live market quotes; display rounding cannot establish an exact 1.18 crossing.

## Policies and compatibility

| Policy | First valid check | Later alerts |
| --- | --- | --- |
| New matching items (supported news/feed Watches) | Retain initial context, no alert | Each previously unseen matching item; durable URL/ID identity ledger prevents repeats |
| Once per condition (legacy currency default) | Alert immediately if matching | None for that configuration, including after a dip |
| Each threshold crossing | Alert immediately if matching | A later valid nonmatching observation rearms; next later matching observation alerts |
| Each changed matching daily rate | Alert immediately if matching | A new publication date, changed exact provider rate, and satisfied threshold; unchanged rates remain silent |

An apartment search illustrates **new matching items**: two distinct suitable listings should produce two opportunities; repeatedly finding the same listing should not. This repository has generic property categorization/examples but no verified property-listing provider or apartment-specific matching implementation. This PR adds none and does not claim apartment monitoring is supported. The implemented recurring item path is news/feed monitoring.

Existing currency Watches with no policy field retain `once`. Natural-language requests are not reinterpreted. The explicit selector on the synchronized Watch detail has a Save button, descriptions, next-alert rule, source cadence and latest source publication date. New currency Watches also retain the legacy default until explicitly changed.

A policy edit activates when its owned definition is committed successfully. It advances `media_revision`, so older in-flight completions cannot commit. It preserves the previous successful observation, snapshot, revision-specific condition identity and alert history. The next valid check evaluates against that retained observation: changing policies cannot replay the current observed rate. An already-matching crossing policy waits for a later valid below-target rate. A failed save remains visibly pending. A material target/pair edit continues the pre-existing new-configuration behavior.

One immutable observation per source date is accepted. Same-date provider corrections with changed rates are rejected, not used to create an event or rearm. Older dates, older check timestamps, missing/invalid/stale data and provider failures preserve the last successful observation. Threshold decisions still compare exact rational values, including reciprocal pairs. A displayed 1.176 rate is not an exact 1.18 match.

## Persistence and notification path

`complete_currency_watch_check` locks the owned Watch, checks revision and snapshot CAS, recomputes the exact threshold decision in PostgreSQL, derives eligibility from persisted state, inserts an immutable event, optionally inserts the outbox record, and advances the successful snapshot in one transaction. Recurring IDs include the source publication date; both recurring policies share that per-date identity. The event primary key and existing outbox unique key make retries idempotent. Policy edits retain snapshots; feed initial-context behavior from #50 remains intact.

New `currency_watch_events` uses owner-select RLS and no authenticated insert/update/delete grants. Only the existing service-role completion path can create events. The API's user-owned list embeds the event history. Reload, another device, or cleared storage followed by sign-in restores policy, successful evaluation and event history independently of email availability. Existing recorded last events are backfilled without inventing historical evaluations. Earlier history that was never retained remotely cannot be reconstructed by this migration.

Authenticated manual currency checks now pass through the owned HTTP endpoint and same completion RPC. They preserve the existing manual-check convention: **no email enqueue**. Scheduled eligible events enqueue only when production-gated email configuration enables it. The existing notification worker retains claims, submission idempotency keys, failure classification and bounded retries. An enabled setting means eligibility, not delivery. No resend or replay is introduced on policy change.

The four times are distinct: source publication date (ECB date), successful check/evaluation time, immutable event detection time, and email submission/delivery evidence. No delivery time is inferred from an event or an enabled setting. Daily publication cadence also differs from the existing scheduler cadence; no schedule was changed.

## Migration and isolation

`20261004120000_currency_alert_policies.sql` was applied only to staging `tseexvbwhrtofcsrvcqc`. It adds the event table/RLS, extends the definition validator, retains currency snapshots on policy/language-only edits, and replaces currency completion. Production migration remains unapplied.

Staging SQL editor confirmed the ten prerequisite migrations, then applied the migration transaction with 3-second lock and 15-second statement timeouts. Before and immediately after: three existing Watch rows, MD5 aggregate `d5fb54b36f94c9245c27a730da523233`, zero notification rows. After: one new migration record, event RLS true. Existing Watches were unchanged. Tests subsequently added synthetic accounts/Watches; synthetic fixture detection times use a fixed September clock and are not real publication discoveries.

Branch-specific Vercel preview overrides were read back before deploying implementation: browser/server URLs and key project claims all match staging. Both email flags are `false`. The production environment, public demo, schedules and aliases were not changed. Staging provider fixtures do not contact ECB or Resend. The real-staging runner scopes scheduled Watch reads to a synthetic ID and bypasses global outbox maintenance; notification delivery remains disabled.

## Validation evidence

- Local: `NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' npm test`: 1,139 passed, zero failures/skips. `npm run build`: passed (existing Sass legacy API warning).
- Local PostgreSQL/PGlite: crossing below → above → above → below → above; daily matching → changed matching → repeated observation → new date unchanged → nonmatching → matching; policy switching, exact boundaries/reciprocals, misleading rounding, stale/out-of-order and contradictory same-date data, failure/recovery, event/outbox uniqueness, storage clearing, immutable timestamps, owner/foreign access and service-role RPC denial.
- Existing feed regression suites: first-check context, two distinct matching articles, repeated articles, canonical URL identity across changed provider IDs, irrelevant items, snapshot rotation and retries. #50 initial context and #51 silent synchronization tests remain passing.
- Notification tests use controlled local outbox rows and fake transports. **No mocked email is claimed as delivered.**
- Real staging Supabase: [sequence evidence](recurring-alert-evidence/staging-sequences.json). Crossing produced `[0,1,0,0,1]`, daily `[1,1,0,0,1]`, repeats zero. Policy changes retained history and did not replay. Provider failure/out-of-order checks retained state. Two real synthetic auth accounts: foreign Watch/event reads empty; foreign persistence write denied. Outbox remained empty.
- Browser, authenticated loopback preview against real staging: explicit crossing/daily saves, EN/FR descriptions, source/evaluation/detection labels, daily manual event creation and repeated-check dedupe, full local/session storage clearing and rebootstrap to the synthetic account restored all three original event timestamps. Background read observation: `silent=true`, `policyPanelStable=true`. Second account saw “Watch not found”. This harness uses real auth/API/RLS with deterministic provider responses; it is not a test of OTP delivery.
- Browser console: no application error observed on initial render. One asynchronous message-channel listener error appeared during reload/account switching; origin not established, consistent with the previously observed browser-extension symptom. No associated failed app operation was seen.

Reproduction: run `scripts/validate-recurring-staging.mjs <private-staging-env-file>` only after verifying isolation; it creates synthetic staging accounts and Watches, writes temporary sessions under `/tmp/watch-recurring-staging`, and never prints credentials. `scripts/recurring-staging-preview.mjs <private-staging-env-file>` serves the explicit loopback harness on port 5198. These scripts are not Vercel entrypoints and are not bundled into public pages.

## Later production adoption (not performed)

After a separately authorized migration and production release, open the existing GBP Watch, choose **Each changed matching daily rate**, and save. Wait for its synced confirmation. Its last successful observation and old event timestamps remain intact. The next new publication date with a changed exact matching rate can create a new update; re-reading the current rate cannot replay the old alert. Scheduled email still depends on the production notification settings and worker outcome. Do not reset a baseline or replay an outbox entry to switch policies.

PR remains open. No merge or production deployment is authorized or performed.
