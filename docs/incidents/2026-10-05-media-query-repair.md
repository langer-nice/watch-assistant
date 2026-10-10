# Media provider query correction — review only

## Confirmed scope and cause

Production was verified at `057cabcc16c50dc251b30c281929bc5ae9fd079e` on `master`. This branch starts there, independently of PR #52. The affected Watch is `dbd025d0-1e73-432b-9baf-650f5f0fe62c`, created 29 September 2026 at 10:21 Europe/Monaco. Its original French instruction and structured subject are correct, but the saved Google News query is the conversational sentence (singular “le média”). A live subject-only search returns recent news that the saved sentence misses. Historical provider responses are not retained, so the original write cannot be reconstructed.

Two current paths are reproducible: source discovery falls back to the full instruction when parsing fails; editing recalculates subjects while retaining the previous provider URL/query. The fix plans source, query and structured matching criteria together, validates them before persistence/checks, and confirms recognized media requests without generative reformulation of the original instruction. Unrecognized instructions require review. Bare article-title discovery for URL stories remains supported.

Supported constraints are bounded explicit suffixes: concerning/regarding/concernant/au sujet de; excluding/except/sauf/hors; French/English; France/UK/US. Explicit plural co-occurrence retains two subjects with `all` matching. Unsupported or conflicting clauses require review, rather than being discarded. Existing Google News editions are preserved on edits unless explicitly overridden. Topics/exclusions also filter retrieved titles/excerpts; edition selection is the provider's locale preference, not a guarantee of a publisher's language or country.

## Compatibility and staging

Migration `20261005160000_media_query_history.sql` extends only the feed validator and splits the baseline-invalidation trigger so text-to-text feed edits preserve snapshots, initial context, seen identities and existing event timestamps. It keeps the installed currency dispatcher and invalidation function bodies intact, including PR #52's versions. Existing cancellation of **unsubmitted pending** notifications on configuration changes remains unchanged. Already submitted/sent records remain intact.

Manual and scheduled Google News text checks reject incoherent configuration before fetching. Existing legacy rows may still synchronize unchanged query criteria (including title/pause/delete changes); only a new or changed query configuration must pass planning validation. This avoids blocking unrelated creation behind a stale legacy synchronization job. Failures reuse the existing guarded failure RPC and retain the last successful retrieval timestamp/snapshot. No pagination changes, queue processing changes, currency logic changes, or automatic query repair.

The migration was applied only to staging `tseexvbwhrtofcsrvcqc`. A guarded transaction compared all existing Watches, snapshots, ledger rows and media notifications before/after and verified the installed currency functions were unchanged. The first wrapper attempt had a syntax error and did not apply; the corrected transaction succeeded. No production migration or Watch modification was performed. Branch-only preview variables target staging for both browser and server; both monitoring-email flags are false. Other Vercel environment records were compared and unchanged.

## Proposed production repair — NOT executed

This is a configuration correction, not a rebaseline or replay. Do not run until the code and migration have separately been approved for production. Keep PR #52 independent.

1. Read the Watch using the inspection SQL below. Confirm ownership through authorized access without copying account data. Confirm exact request, Ed Sheeran/all definition, active text/feed type, old sentence query, French edition, baseline and revision. Re-read immediately before applying; the observed revision `3` and latest-check time are historical evidence, not unconditional execution assumptions.
2. Review/roll out the fix and history-preserving migration under separate authorization. Confirm no manual check, synchronization mutation, scheduler task or pending/submitted notification is in flight for this Watch. Stop if any notification requires recovery decisions; this procedure must not cancel, replay or send it.
3. Save a private configuration-only backup (`id`, `monitoring_source`, `media_revision`, `media_mutation_id`, `updated_at`) from the read-only inspection. Record baseline/snapshot, ledger count/digest and event timestamp fingerprints separately for verification.
4. In one short transaction, lock this Watch and its snapshot; require the inspected revision/source still match and the history-preserving trigger is installed. Update **only** `monitoring_source.query` to `Ed Sheeran`, `monitoring_source.url` to `https://news.google.com/rss/search?q=Ed+Sheeran&hl=fr&gl=FR&ceid=FR%3Afr`, and `media_mutation_id` to a new UUID. The trigger advances `media_revision` by one; the existing timestamp trigger changes `updated_at`. Leave `watch_definition` (including original request), title, state/status, successful check/outcome, errors, baseline, initial context, ledger and event fields untouched. Require exactly one changed row. Compare history fingerprints before committing; rollback on any difference.
5. Reload the affected account's application so it hydrates the new source/revision. A stale client mutation must receive the normal revision conflict, not overwrite the repair. Do not run a check or backfill as part of the correction. Verify only configuration and preserved history with reads.

### Read-only inspection

```sql
begin transaction read only;
select id,created_at,type,title,watch_definition,monitoring_source,
       monitoring_state,media_revision,media_mutation_id,updated_at,
       last_checked_at,last_check_outcome,last_check_error_code,
       media_last_change_detected_at,last_change_item_id,last_change_published_at
from public.watches
where id='dbd025d0-1e73-432b-9baf-650f5f0fe62c';
select baseline_at,checked_at,initial_items is null as legacy_context,
       md5(to_jsonb(s)::text) as snapshot_digest
from public.media_watch_snapshots s
where watch_id='dbd025d0-1e73-432b-9baf-650f5f0fe62c';
select count(*) as identity_count,
       md5(coalesce(string_agg(article_key,',' order by article_key),'')) as identity_digest
from public.media_watch_seen_articles
where watch_id='dbd025d0-1e73-432b-9baf-650f5f0fe62c';
select status,count(*)
from public.media_watch_notifications
where watch_id='dbd025d0-1e73-432b-9baf-650f5f0fe62c'
group by status;
select tgname,pg_get_triggerdef(oid)
from pg_trigger where tgrelid='public.watches'::regclass
and tgname in ('watches_invalidate_media_baseline','watches_revise_media_query');
rollback;
```

### Eligibility and notification consequences

The original baseline remains 30 September 2026 at 06:35:34.421 UTC (08:35 Monaco). The next **scheduled** check can accept previously unseen matching articles published after that baseline, plus undated articles under existing rules. The next **manual** check has no publication cutoff and can accept older unseen matches. Only the first 20 entries are processed. Every observed identity is recorded by the existing check rules, including excluded items; changing criteria does not replay previously seen items.

A distinct article can therefore become an update immediately after repair, even if it predates the repair itself. Scheduled checks can enqueue/send notifications under the then-current production settings; manual checks do not enqueue mail. This proposal does not change those settings, force a check, or mark corrected-query results seen in advance. Suppressing recovery updates would be a different policy requiring explicit authorization.

The People and EW candidates were published and last modified on 1 October 2026 (People 13:09:24−04:00; EW 14:42:50−04:00), after the baseline. They are potentially date-eligible if returned, matched and unseen. Google coverage alone does not establish that the configured French provider edition returned them.

### Configuration-only rollback

Use the private backup, require the current source/revision still equal the repair's committed values, and require no pending/in-flight check or notification. In a short transaction restore only the prior `monitoring_source` and assign a **new** mutation UUID; let revision advance again and `updated_at` change normally. Never restore an old revision or synchronization token. Retain all articles/events observed since repair, their timestamps, baseline and seen ledger. Reload the client again. Restoring the bad query will cause the new validation to display a review-required error; it is not a way to resume successful monitoring. Rolling back app code or schema is outside this narrowly scoped configuration rollback.

## Validation evidence (5 October 2026)

- Local: `npm test` — 1,139 passing; `npm run build` — passed. Includes Royal Caribbean aliases, initial-context behavior, silent synchronization, immutable event times and RLS. `MEDIA_TEST_PR52_MIGRATIONS=/path/to/PR52/supabase/migrations NODE_ENV=test node --no-maglev --test server/media-query-recovery.test.js` also passed with installed currency function definitions identical before/after this migration.
- Real staging: synthetic Watch `71ef80a1-65d5-4cf0-9b3b-c5cbd11d3e0c` retained baseline `2026-09-30T06:35:00Z`, legacy null initial context, seen history and the existing event while repairing the source. Deterministic distinct updates, equivalent-URL repeats, scheduled cutoff, manual no-cutoff, manual/scheduled provider failures, reload and second-account read/write rejection passed. Zero notification rows or emails. The service role cannot read the ledger table directly; the SQL editor verified the baseline's two identity keys, and repeated baseline retrieval after repair remained silent. Local PostgreSQL tests additionally compare the exact ledger contents before/after repair.
- Hosted browser (real Google News, not fixtures): a fresh synthetic staging account authenticated through the app's standard session callback, using a test session obtained from staging authentication. No email was sent or claimed delivered. Exact French request → confirmation (`Ed Sheeran`, `FR:fr`) → creation → persisted configuration → successful initial check → detail → manual repeat (`no-new-items`) → reload. Watch `d52b595a-3af3-4feb-be61-52a598ecaff1`, later explicitly named SYNTHETIC. A hosted edit added Ukraine, excluded rumeurs, and retained French/France. SQL/API reads confirmed `Ed Sheeran "Ukraine" -"rumeurs"`, original baseline `2026-10-05T14:46:54.681Z`, all 20 initial-context entries, and no artificial update.
- Hosted discovery succeeded; an earlier test account had a stale legacy fixture queued for synchronization, exposing the metadata-only legacy allowance now covered by regression tests. The failure-screen transition was also corrected and tested. No claim of a successful journey is based on that failed attempt.
- Standalone live query at `2026-10-05T14:46:20Z`: Google News `Ed Sheeran`, `hl=fr&gl=FR&ceid=FR:fr`, 100 raw entries, first 20 processed by the unchanged implementation. Included October 4–5 news and October 2 BFM Bono coverage. Neither candidate People/EW article was in this response (publisher/title checks across all 100 entries). This is current retrieval, not historical evidence or exhaustive coverage.
- Production remains at `057cabcc16c50dc251b30c281929bc5ae9fd079e`; PR #52 remains open at `57723288e894a1ad242b157cc8036b7dff323778`. No production check, write, migration, notification, merge or deployment was performed.
