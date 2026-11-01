# Create Watch post-submit transition v1

1 November 2026, Europe/Paris. **CHANGE BLOCKED — WOULD MODIFY CREATION FUNCTIONALITY** under the requested no-new-read/no-contract-change boundary. Report only; no runtime change or deployment.

## Workspace and verified version

- Branch: `codex/post-create-transition-diagnostic`.
- Worktree: `/Users/davidlang/.codex/worktrees/pilot-day1-brief/watch-assistant`.
- Previous HEAD: `de522c455b0581c2b4b91b04d7306e79c5d8b90e` (previous release report checkpoint).
- New implementation HEAD: none; final task commit contains this report only.
- Files changed: `docs/evidence/watch-assistant-create-watch-post-submit-transition-v1.md` only. Two pre-existing untracked diagnostics preserved.
- Production alias: `https://watch-assistant-omega.vercel.app`.
- Production deployment: `dpl_BgXGiFNkSvPYSKGZrgjPKr2cJmSN`, **READY**; URL `watch-assistant-coiqv6icz-david-lang.vercel.app`.
- Deployment commit / remote master: `90a4f2b614d62c0d25cda7f09595575e57a4acae`, unchanged by this task.

## Frontend transition traced before edits

| State/boundary | Component and actual behavior |
|---|---|
| IDLE / submit | `navigation.js` existing form submit calls `structuredCreation.runV3(originalRequest, language)` |
| CREATE_PENDING | `structured-watch-creation.js:94–99`: controller busy, presentation spinner/locked controls, await the single existing POST `/api/v3-pilot` with unchanged `{instruction,watchId,captureKind}` |
| CREATE_SUCCESS | Same file:100–101: original owner/epoch/text guards, then `result.status==='READY_TO_MONITOR' && result.id` |
| NAVIGATION | Same line 101: presentation marker, immediately followed by `window.location.href='watch-detail.html?id='+encodeURIComponent(result.id)` |
| DETAIL_LOAD | New document starts auth/store initialization in `main.js:55–65`; `configureMediaWatchServerStore` loads cache and starts existing list synchronization |
| DETAIL_RENDER | `navigation.js:1309`, `watch-storage.js:338`, media store:240: `getWatchById` reads the current frontend merged rows; it is not a database lookup |
| Missing local row | `navigation.js:1441–1466` chooses neutral/loading/not-found presentation using list availability and the recent-create marker |

**The page does not navigate before the create POST succeeds.** The transition is early relative to the destination's client data being available, not relative to proven database commit. Changing persistence timing or waiting longer in the backend is not justified by this evidence.

The existing create handler, inspected read-only in `server/v3-creation.js:75–77`, already waits for the atomic creation RPC and then returns:

`{status:'READY_TO_MONITOR', id: saved.data, engine: V3_ENGINE}`

The reuse response similarly returns identity/engine and `existing:true`. Neither includes a full Watch/list row, admitted Intent, monitoring source, baseline snapshot, created_at or current detail view model. Those fields exist server-side but are not available to this frontend success callback. The callback does not seed the media store, update its read cache, await a list refresh or emit a new-row completion signal.

The normal list request is made by `media-watch-server-store.js:369–384` during synchronization. It is separate from the create POST. On the Create page its startup read can finish before the user submits. The POST does not automatically update those previously loaded rows. Browser focus/online/storage/auth events may later refresh a list, but are not guaranteed completion signals for this newly created ID and cannot be used as a reliable no-request ready gate.

`main.js` awaits stores on the form page at initial startup, not a new-ID-specific post-create hydration. On the detail document, startup deliberately allows list rendering while stores are loading. Waiting for an old Create-page startup promise or a global `ready` flag would not prove the new ID has been loaded. A new document also initializes its own in-memory store after navigation.

## Why the previous neutral marker is insufficient

`watch-creation-presentation.js:7–17` stores only `{id,at}`. Its loading test is `!availability.active || availability.loading || availability.waiting`. It removes the marker when that test is false, even if the target Watch is absent.

The media store can set `rows` from its cache and `loaded=true`, with `waiting=false`, `loading=false`, then notify before starting synchronization (`media-watch-server-store.js:430–446`). Its status is based on `loaded`, not freshness of this created ID (`:49–51`). List availability treats a ready cached snapshot as globally not uncertain (`watch-load-notice.js:23–33`). Therefore a cached ready list missing the new Watch is a permitted presentation state; the marker can be cleared and the ordinary missing-Watch branch selected. This is a concrete gap in the previous presentation fix.

The exact user's latest Production flash was not captured in a new live attempt. The code path and missing-target/cached-ready state are proven locally; no unique historical network timing or backend lag is claimed. Legitimate missing/deleted/inaccessible/direct IDs still require the existing not-found path after a reliable target read.

## Ready-to-navigate decision and hard stop

Reliable create success signal: **YES**, existing successful POST with final ID. Reliable proof that the current detail can render that new ID before navigation: **NO** in the current response/Create-page state.

Frontend-only full fix possible under all current constraints: **NO**. Specifically, there is no already-running, guaranteed post-create read for this ID that the Create page can simply await. The successful ID is not the full detail model. Remaining on Create until an event that may never arrive risks infinite loading after a genuine success; a fixed delay proves no readiness; inventing a local Watch from input/ID would fabricate fields or hide actual access/deletion failures.

Hard stop: **YES**, required by Phase 2:

> If no frontend-only reliable boundary exists: STOP and report that this cannot be solved safely without backend changes.

Phase 9 also forbids adding a second readiness request, detail fetch loop or backend readiness endpoint. No implementation was attempted after this determination. The long-wait copy is independently possible as presentation, but the task explicitly stops at Phase 2 when the requested ready boundary is unavailable; no partial timer-only patch or deployment was made.

This does **not** establish that the backend creates too early or needs a new waiting protocol. Two separately scoped integration choices could supply the missing display data:

1. Explicitly allow reuse of the existing owner-scoped media list read after successful create, with target-specific completion and no retry/polling. This would add a read to the current Create-page sequence and still needs a safe handoff across document navigation.
2. Explicitly allow a complete server-authoritative display row/read model in the existing successful response, with an owner-scoped frontend handoff/cache. This changes the response contract.

Neither is applied or assumed authorized here. No change to V3 meaning, Brain, evidence, transaction/schedule timing or monitoring is needed to investigate these choices.

## Bounded verification

One temporary offline diagnostic: **PASS**, with three conclusions verified against the actual existing controller/helper:

- Held pending POST leaves the Create URL unchanged, spinner label active.
- Final READY+ID navigates exactly once; captured paths are only `/api/structured-watches` and `/api/v3-pilot`, with no post-create list read and no full Watch in the supplied response matching the inspected server contract.
- A matching recent-create marker with `found:false` and globally ready cached availability returns false, exposing the ordinary missing-Watch presentation branch.

Artifacts: `/private/tmp/wa-post-create-transition/trace.mjs`, `result.json`. All requests were injected offline; no Production application, provider or database request was made. The Vercel deployment metadata and Git ref were inspected read-only.

Acceptance tests for the requested new transition/long-wait behavior: **NOT RUN / not implemented**, not claimed PASS. Existing error and legitimate not-found logic remain byte-for-byte unchanged. No new frontend test file, stylesheet, fixture or runtime code was added. Existing modules imported/executed successfully in the diagnostic. Build and broad regressions: **NOT RUN**, report-only hard stop, no asset to rebuild. Previous release test counts are not reused as proof of this new request.

## Required-result matrix

| Field | Result |
|---|---|
| Stays on Create while POST pending | YES, existing behavior |
| Spinner / Creating Watch label / form lock / duplicate guard | YES, existing behavior, unchanged |
| Default pending copy | Creating your Watch… |
| Long-wait threshold and copy | NOT ADDED due hard stop; no 5–8 second timer introduced |
| Requested longer-wait copy | Not displayed: “This is taking a little longer than usual. Please keep this page open while your Watch is being created.” |
| Navigation only after create success | YES already; not proof of destination data readiness |
| Navigation deferred until target detail data is ready | NO; unavailable within current boundary |
| Transient not-found prevented reliably | NO; current marker gap documented |
| Legitimate not-found preserved | YES, unchanged |
| Claims Watch already exists while pending / safe / almost done / automatic opening | NO new claims or copy added |
| Busy/disabled/live region/keyboard/focus | Existing release retained; no new a11y behavior or verification claimed |
| Responsive 320/375/430/desktop | NOT RERUN; no UI change after hard stop |
| Long-wait timing / new no-early-navigation acceptance tests | NOT IMPLEMENTED |
| Diagnostic pending/success/marker assertions | PASS offline; not a complete UX fix |
| Syntax/import | Existing inspected frontend modules import successfully in diagnostic |
| Build | NOT RUN, report only |

## Scope and Production safety

Create API/payload/endpoint/backend: **unchanged**. V3/Brain/evidence refs/grounding/persistence/scheduling/monitoring/auth/RLS/email/Morning Brief: **unchanged**. No retry, polling, second create, new list read, detail-fetch loop, readiness endpoint, arbitrary navigation delay or unrelated UI change. No database check, mutation, credential read/change, source check, provider call or real Watch submission was made.

Manual disposable Watch: **NO**; deletion: **not applicable**. Live stayed-until-ready/long-wait/creation-success/transient-flash verification: **NOT ATTEMPTED**, hard stop. Five pilot Watches and their observation state were not modified by this task. Production remains the existing READY deployment above; no rollback required.

Final classification: **CHANGE BLOCKED — WOULD MODIFY CREATION FUNCTIONALITY** within the strictly prohibited request/response/read boundary.

Recommendation: **REVIEW BACKEND READINESS SIGNAL SEPARATELY** — more precisely, review how server-authoritative detail data reaches the client after successful creation. Do not confuse this with changing the already-successful creation transaction or adding backend waits. **DO NOT CHANGE CREATION FLOW** until that narrow integration scope is explicitly chosen.
