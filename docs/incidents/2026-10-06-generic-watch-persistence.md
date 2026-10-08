# Topic Watch persistence and explicit local recovery (PR #53)

## Evidence and scope

Production `057cabcc16c50dc251b30c281929bc5ae9fd079e` accepted some unrecognized text requests as browser-only feeds. The status classifier did not require persistence. The exact production ID `5a14d491-2ab7-453b-80dd-efdb3c20ebbf` was absent in an unrestricted RLS-bypassing lookup on 5 October. Its local record/journal and historic submission path remain unverified. No production recovery was executed.

PR #53's previous head `f23b78a` still left `Monitoring …` outside both the parser and the conversational discovery rejection regex. This directly overlaps its planner, confirmation and persistence code. This extension uses the existing media RPC, revision/CAS, owner scoping, and synchronization journal rather than adding a generic persistence architecture.

## Behavior

- Bounded EN/FR news/topic requests, including the exact instruction, reach query confirmation with the original wording retained. Short event topics are recognized; bare entities, operational thresholds and unsupported constraints require clarification. Display category is not persistence eligibility.
- Text creation no longer falls back to a full-sentence Google query. Supported definitions must validate before local saving. Local retention precedes confirmed server persistence; activation/checking follows persistence. Failed persistence retains the same ID and mutation, with an explicit idempotent retry. Unsupported URL/non-story and generic requests cannot activate a local-only monitoring route.
- Synced background reads remain silent. Pending/failed/unsupported/local-only states surface in detail and as attention on Home. The live Home view excludes those IDs from quiet/count presentation without rewriting saved reports. Report refresh no longer invents successful attempts without check evidence. Existing new-Watch retention is unchanged; the reported Watch's historical report membership remains unknown.
- Existing account-scoped local records are not auto-uploaded. An explicit two-step recovery shows the planned query and baseline consequences, then verifies current scoped storage, ownership, loaded server absence, and journal absence again. Unsupported requests stay local and editable. Conflicts are not overwritten.
- Recovery preserves the UUID, request, category, original creation time, and local results. `localRecoveryHistory` retains the old snapshot, initial context, seen IDs/keys, updates/timestamps and timeline on the original device. These are not uploaded as an authoritative server baseline. Normal hydration uses server monitoring state while retaining that local archive.
- First server retrieval establishes a fresh baseline and generates no alerts for that initial set. Later unseen matching items follow normal eligibility; email settings still control delivery. Old local history is not newly synchronized to other devices. No email replay or backfill is performed.

## Migration/isolation

`20261006100000_local_media_recovery.sql` wraps only the feed validator with bounded optional `localCreatedAt` metadata and an insert/update trigger that preserves creation time and prevents later changes to that metadata. It does not modify existing Watch rows, snapshots, events, outboxes, currency dispatch or completion functions. PR #52 currency function bodies remain unchanged. Apply after the existing PR #53 query-history migration.

Applied only to `tseexvbwhrtofcsrvcqc` using a transaction guarded by the installed currency-function hash `e14410d1c0a07bee8b3cbb917f79c7dc`; before/after counts were 12 Watches and zero media notifications. Browser/server preview environment and key project references are staging, both monitoring email flags false. Production and PR #52 are unchanged.

## Validation

- Local suite and build; topic/constraint/ambiguity tests, Home availability, failed creation retention, actual queue→API→PostgreSQL RLS recovery, idempotency and foreign-account denial.
- Existing query/history recovery and media persistence tests passed with PR #52 migrations loaded; existing currency function definitions compared unchanged.
- Real staging script `scripts/validate-generic-media-staging.mjs`: synthetic accounts, exact request, offline retention, retry, baseline without alerts, legacy recovery, original creation timestamp, retained local history, foreign read/write denial, empty-storage hydration, zero notification rows. Provider observations are deterministic fixtures, not live coverage.
- Hosted/second-session evidence is recorded in the final PR description. No physical iPhone validation or OTP email delivery is implied.

## Reviewable production recovery proposal — NOT EXECUTED

After a separately authorized migration/release, inspect only the affected ID in the original desktop account-scoped storage and its journal. Preserve a private backup of that record/report; establish ownership from the authenticated account ID and scoped key, not the display name. Recheck server absence without RLS ambiguity and ensure no conflicting journal entry exists. Do not guess the account or recreate the Watch.

If the original request and history match expectations, use the explicit recovery review in the original desktop session. Confirm the focused `French students protests` query and chosen edition before activation. Preserve the ID and original creation date. Do not import the local snapshot as a server baseline or force a check. Verify exactly one owned server row, a synchronized confirmation, and same-account hydration on the other device. Initial server retrieval suppresses existing articles; later articles may become notification-eligible under then-current production settings. Unsupported or conflicting records remain local for review. No production action is authorized by this document.
