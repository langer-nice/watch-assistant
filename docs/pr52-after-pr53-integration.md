# PR #52 integration after PR #53 — 8 October 2026

This is branch integration evidence, not release approval. Neither PR is merged. No remote database, existing Watch, shared schedule or notification was changed by this pass.

## Heads and conflict decisions

Original #52: `57723288e894a1ad242b157cc8036b7dff323778` on `codex/recurring-alert-policies`. Reviewed #53: `d4c184b0b39ffc12b12dc86a2fa6f29e995171e5`, unchanged. Both bases were master `057cabcc16c50dc251b30c281929bc5ae9fd079e`. Integration was performed in a separate checkout; the original working tree and #53 branch were untouched.

The conflict set remained exactly five files:

- `server/media-watch-check-api.js`: retain currency retrieval and durable completion/CAS from #52; apply #53 media query validation to the feed path before retrieval. Manual currency completion still does not enqueue emails.
- `server/monitoring-source-api.test.js`: use a recognized media request from #53 while retaining #52's 503 classification for provider unavailability.
- `src/js/media-watch-persistence-notice.js`: retain explicit recovery and read-only explanations; currency copy describes the selected policy rather than implying every currency Watch is one-shot.
- `src/js/media-watch-server-store.js`: owned compatible currency Watches use authenticated checks; #53's persistence barrier, account boundary, recoverable failures and read-only guards remain.
- `src/js/navigation.js`: retain explicit currency policy review, then media query review; route confirmed currency and media sources separately. Both use persistence before activation. Preserve Home's historical result labels, no-report state and report readiness feedback.

The eight automatically merged overlapping files were reviewed too: media cron, media API, media persistence tests, source discovery, media definition, Watch monitoring, and both locale files. Currency prior evaluation/history/policy identity remain; feed query validation and recovery metadata remain. No implementation was selected wholesale over the other.

The hydration regression now includes three records: a supported feed, supported recurring GBP/EUR (`gt`, `daily`), and an unknown future currency policy. The latter stays read-only and cannot be checked, rewritten or deleted. A policy supported by #52 is no longer incorrectly used as #53's incompatible fixture.

## Migration findings and targeted release plan

The private production restoration represents the audited pre-#53 schema: the base currency functions already exist, both #53 wrappers and `currency_watch_events` are absent, and no Supabase migration registry exists. This snapshot is evidence, not a substitute for fresh read-only catalog inspection at release time.

Proposed separate releases, each requiring authorization:

1. Release #53 first: verify the exact existing base functions, constraints, triggers, ACL/RLS and migration history; apply `20261005160000_media_query_history.sql`, then `20261006100000_local_media_recovery.sql`. Verify and deploy #53 through its separately approved release procedure.
2. Before #52, require that verified post-#53 catalog, the original base currency completion signature, and absence of `currency_watch_events`. Apply the **revised** `20261004120000_currency_alert_policies.sql`, then `20261004150000_currency_strict_comparison.sql`. Their older filenames do not determine the live application order. Never use global db push/include-all or replay already applied SQL.
3. Verify wrapper chain (`valid_feed_definition` → `valid_feed_definition_before_local_recovery` → `valid_feed_definition_v1`), media-query revision trigger and local recovery triggers, final currency validator/completion, event RLS/owner-select policy, and exact grants. Preserve existing Auth/application rows, baselines, seen ledgers, revisions and notification state; the expected additional data is a backfill of already recorded latest currency events with original timestamps.
4. Only after verification, authorize the #52 code release. Its list API embeds `currency_watch_events`, so the table must precede code. Refresh PostgREST's schema cache through the separately approved release procedure and verify that relationship before deployment.

If any expected object is partially present, stop and compare its definition/ACL to the intended stage. Reconnect after any lost acknowledgement and inspect committed state before retrying. Each file is transactional; failure of the second file leaves the first committed. Resume only the missing verified stage. No fabricated migration-history entries or blanket historical replay.

### Permission defect found on the actual restoration

Supabase's inherited table privileges gave `anon` and `authenticated` `TRUNCATE` (plus REFERENCES/TRIGGER) on the new event table. RLS does not protect TRUNCATE. The #52 migration now explicitly revokes all table privileges from PUBLIC, anon, authenticated and service_role before granting authenticated SELECT and service_role SELECT/INSERT. The owner retains administration. A regression test reproduces broad defaults and verifies every relevant privilege.

Staging already received an earlier version of this migration. Do **not** replay CREATE TABLE/backfill there. A separately authorized, targeted correction must first verify its existing table, owner-select RLS and completion function, then transactionally execute only:

```sql
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
revoke all on public.currency_watch_events from public, anon, authenticated, service_role;
grant select on public.currency_watch_events to authenticated, service_role;
grant insert on public.currency_watch_events to service_role;
commit;
```

No staging correction was applied in this pass. Production's audited snapshot has no such table; it receives the corrected permissions when the new table is created. If live inspection finds it already present, use the same inspect-first decision instead of assuming the snapshot is current.

## Local validation

- Full combined suite: 1,177 tests passed, no failures or skips. Focused integration coverage additionally exercises currency policies/review, mixed-version hydration, presentation, generic persistence, query recovery and both migration orders.
- Build passed; only the existing Sass legacy API deprecation warning.
- Local PostgreSQL 17, socket-only clones of the existing private populated restoration: #53 → #52 succeeded. All 35 original application/Auth tables retained identical row fingerprints. One historical currency event was backfilled. No Watch, snapshot, seen ledger or outbox row was changed.
- The final functions, function ACLs, Watch triggers, policies and table grants match chronological #52 → #53 application, normalizing only the local database name in catalog comparisons.
- Injected errors immediately before each #52 COMMIT rolled back that file exactly; subsequent verified application succeeded. The pristine restored database was unchanged. The local cluster was stopped afterward. Application execution, cron and email transport remained disabled.
- A fresh-schema PGlite regression checks both orders, effective least-privilege history permissions, acceptance of the strict daily GBP/EUR definition and recovered media metadata, and rejection of unknown future policy.

No new hosted session, actual provider check, physical iPhone test or email-delivery test was performed. Prior #53 iPhone evidence belongs to its reviewed preview, not this combined build. New default-grant coverage justified repeating the full suite after the first integration run.

## Preview and merge handling

Before push, Vercel's Git link identified `master` as the production branch. The existing #52 deployment was Git-generated and non-production. Branch-specific preview values were read privately: browser/server Supabase URLs and key project claims matched staging `tseexvbwhrtofcsrvcqc`; both monitoring email flags were exactly `false`. No configuration was changed. Pushing this existing PR branch can create an automatic staging preview; no manual deployment is authorized.

Keep #52 based on master for now; its combined diff temporarily includes #53. Review the #52-specific delta against `d4c184b` until #53 merges. Recommended order: separately authorize and release #53, then reassess #52 against the resulting master and authorize its targeted migrations/release. If #53 is merged preserving ancestry, its files naturally disappear from #52's master diff. If #53 is squash/rebase merged, explicitly reconcile the new master ancestry in the #52 branch and verify the final tree/diff before merging; do not blindly drop shared changes or force-push during this pass. Retest only if that reconciliation changes code or exposes unresolved concerns.

Remaining release prerequisites include #53's unresolved production configuration verification, fresh catalog/backup review at each release, and separately authorized staging permission correction/hosted combined validation. No automatic Ed Sheeran query repair or browser-only Watch recovery is introduced. No existing currency policy is switched automatically. Rollback after new recurring writes must retain event history and use a reviewed forward fix; older clients can remove new definition fields and cannot safely represent all new policies.
