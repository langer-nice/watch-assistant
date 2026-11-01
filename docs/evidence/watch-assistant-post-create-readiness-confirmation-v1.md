# Post-create readiness confirmation v1

1 November 2026, Europe/Paris. Exactly one post-create confirmation read; no creation retry, polling or backend change.

## Workspace and baseline

Branch: `codex/post-create-readiness`.
Worktree: `/Users/davidlang/.codex/worktrees/pilot-day1-brief/watch-assistant`.
Previous HEAD: `c322bf6ede81206fada7dda5bca82972f012d06e`.
Initial Production: commit `90a4f2b614d62c0d25cda7f09595575e57a4acae`, deployment `dpl_BgXGiFNkSvPYSKGZrgjPKr2cJmSN`, READY, alias `https://watch-assistant-omega.vercel.app`.

## Readiness design

Existing create success signal is unchanged: `result.status==='READY_TO_MONITOR' && result.id`, after the existing owner/editor/request guards. The POST `/api/v3-pilot`, payload `{instruction,watchId,captureKind}`, handler and response contract are unchanged.

The detail data comes from the existing authenticated list reader `request(token)` in `src/js/media-watch-server-store.js`: **GET `/api/media-watches`**, Bearer session header. Its unchanged backend authenticates the user, filters rows to that owner and returns `{watches,emailEnabled}`. There is no separate ID-detail read endpoint in this path; the frontend finds the exact returned create ID among the existing list rows. Missing/deleted ID, HTTP error or invalid list does not confirm readiness. This is one HTTP read; the existing server-side list pagination/query semantics are unchanged.

Added `confirmCreatedMediaWatchRead` around that same reader, with one `await read()`. It does not call the automatic synchronization gate: that gate could defer/coalesce an earlier pre-create request or trigger auth-related refresh behavior. The confirmation itself never refreshes auth, retries, polls, loops reads, flushes pending writes or schedules a recheck. It inherits the existing reader's single-request frontend abort timeout; no new timeout policy or backend timer is added.

After the one response, it uses the existing row validator and detail row mapper, verifies owner and exact non-deleted ID, then writes the confirmed server list to the **existing owner-scoped frontend read cache**. It verifies that the target is available in that cache. This is essential: a boolean success followed by a full-page navigation with an old cache would preserve the previous transient absence. A read-generation fence prevents older in-flight list results in the current document from replacing the fresher cache snapshot. No Watch record or persistence contract is changed. A blocked/unusable cache safely counts as unconfirmed navigation, not a failed creation.

The existing detail startup already reads this cache before rendering the Watch list. Thus the confirmed target row is available on arrival while the detail page's normal existing background load remains unchanged. Its ordinary startup GET is not a second confirmation/retry and was not added or modified here. A real deletion/access change after confirmation can still legitimately show missing data; global not-found behavior is untouched.

## Success and failure flows

`Create → existing POST → successful receipt → ONE confirmation GET → confirmed/cache-ready → original detail URL`.

While confirming, the existing spinner, Creating Watch label, read-only input, disabled form actions, live status and duplicate-submit protection remain active. There is no early navigation while either POST or confirmation is pending. The existing success navigation URL and created ID are unchanged; pending presentation remains until that navigation unloads the page.

The successful result is retained in frontend memory. If the one read does not confirm readiness, there is **no navigation**, no second read and no second POST, including forced subsequent calls to the controller. The page stays locked with its existing spinner and this exact status:

> Your Watch was created, but it is taking a little longer to open. Please return to All Watches in a moment.

French equivalent is provided. This copy is used only after the original POST confirmed success. It does not say Watch not found, Creation failed, create again or promise automatic opening. Genuine create failure still uses the existing real failure copy, restores controls and preserves input, with **zero** readiness reads. Account/editor changes cannot cache another owner's row or navigate. A language change during confirmation preserves the successful receipt and truthful waiting state without another submit.

The prior requested 5–8 second pending-message timer had not been implemented because the preceding task stopped at its readiness boundary. This patch preserves the actually deployed pending UI/copy; it does not add a timer, invented progress stage or unrelated long-wait feature. The only new message is the expressly authorized confirmed-creation/read-failure copy above.

## Tests and browser evidence

**112/112 targeted tests PASS**, plus **9/9 selected existing transport/cache tests PASS**: **121 relevant checks PASS, 0 failures**. Build PASS; syntax/import and git diff --check PASS.

Targeted files: new `post-create-readiness.test.js`; existing creation-presentation, structured-creation, detail-layout, editor-account-isolation, Watch hydration compatibility, structured hydration and unchanged server V3 creation tests. Existing UI-only success fixtures now inject successful confirmation; the new tests exercise the real default authenticated reader with held mocked HTTP responses and the actual cache/mapper.

| Boundary | Verified |
|---|---|
| POST success → exactly one GET | PASS; method/path/auth header and unchanged create body checked |
| Both requests pending | PASS; Create URL retained, spinner visible, form locked, duplicate blocked |
| Read succeeds | PASS; server row cached/mappable, original ID/URL, one navigation |
| Read fails/missing/deleted/foreign/malformed | PASS; no navigation, truthful known-success message |
| HTTP 401 / network / cache blocked | PASS; no auth refresh, read/create retry or polling |
| Forced resubmit after failed confirmation | PASS; POST count 1, readiness count 1 even if input is changed programmatically |
| Genuine create error | PASS; no readiness read, original failure message/text restoration |
| Account/editor invalidation | PASS; no cache/no navigation |
| Language change | PASS; known creation retained, localized waiting copy, no resubmit |
| Direct missing detail | Existing semantics preserved; no navigation/detail renderer change |
| Creation/persistence/schedule regression | Existing synthetic API/SQL tests PASS; backend unchanged |

An exploratory broader run also found the pre-existing `Retry Sync reports failure and success in FR/EN and coalesces double activation` assertion expecting the old “is synced” copy. The same failure was independently reproduced on the untouched initial HEAD (9/10 pass in that file). It concerns unrelated Sync-success wording and is not modified. The four directly relevant transport/cache test groups from that file were selected separately and pass 9/9. The 121-pass gate is not a claim that the whole repository suite has no historical failures.

Logs: `/private/tmp/wa-readiness/targeted-gate.log`, `transport-tests.log`, `baseline-resilience.log`, `build-final.log`.

Local browser fixture bundles the actual controller, confirmation helper and built CSS, with injected create/read responses and no backend writes. It confirmed:

- after simulated successful POST, still on Create with POST count 1/read count 1 and spinner;
- while the one read is held, no navigation;
- readable response → existing detail URL, new document immediately renders the confirmed cached Watch, no not-found intermediate;
- missing response → remains on Create, exact known-success waiting copy, counters remain 1/1;
- widths **320, 375, 430 and 1280**: label fits, message visible under button, no horizontal overflow; French waiting copy at 320 also wraps without overflow;
- existing aria-busy/disabled/read-only/live-region and keyboard/focus checks pass; no stylesheet or form redesign.

Artifacts: `/private/tmp/wa-readiness/preview.mjs`, `responsive.json`, [local confirmed-waiting screenshot](/private/tmp/wa-readiness/confirmed-waiting.jpg). Browser viewport override reset. These are synthetic frontend observations, not a disposable Production Watch.

## Scope and release gate

Files changed: `src/js/media-watch-server-store.js`, `src/js/structured-watch-creation.js`, `src/js/watch-creation-presentation.js`, new `src/js/post-create-readiness.test.js`, directly related fixtures in `src/js/structured-watch-creation.test.js` and `src/js/watch-creation-presentation.test.js`, and this single report. No other runtime/UI file changed; pre-existing untracked reports preserved.

All **231 tracked API/server/SQL files** are byte-identical to previous Production (`/private/tmp/wa-readiness/scope.json`). The existing list request/validator/mapper/cache functions retain their original semantics; the added function reuses them once after confirmed create. Existing automatic sync, detail loading and not-found renderer are not rewritten.

| Scope field | Changed? |
|---|---|
| Create POST / payload / endpoint / backend / success response contract | NO each |
| Persistence / schedule creation / V3 Intent / Brain / evidence refs / grounding | NO each |
| Monitoring / notifications / email / Morning Brief | NO each |
| Auth / RLS / schema / cron | NO each |
| Global detail not-found semantics / unrelated UI/styles | NO each |
| Creation retry / readiness retry / polling / repeated read loop / backoff | NO each |
| Backend waiting / readiness endpoint / new database check outside existing read | NO each |

Readiness confirmations per current valid successful create: **1**. Failure does not cause a repeat. Normal lifecycle reads that already occur on the destination page remain as before; no new loop is claimed or introduced.

Rollback: restore previous Production deployment `dpl_BgXGiFNkSvPYSKGZrgjPKr2cJmSN` / commit `90a4f2b`. No schema, secret, environment, Watch, schedule or ledger rollback is needed.

## Production verification

Release/version/served frontend asset verification pending below. A disposable Watch is unnecessary given the real-reader/controller instrumentation and unchanged backend regression; no real create POST, readiness GET, source check or Watch mutation has been executed by this task. Five pilot Watches and their ledger/window are not modified. No Production database operation or credential/config change.

Hard stop triggered: **NO**, this request explicitly authorizes the one read that was prohibited in the preceding task.

Final classification: **POST-CREATE READINESS CONFIRMATION FIXED** (local gate passed; release verification to follow).

Recommendation: **CONTINUE 7-DAY OBSERVATION**. If the single read cannot confirm, use the existing All Watches navigation later; do not restart creation automatically.
