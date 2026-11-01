# Create Watch loading UI v1

1 November 2026, Europe/Paris. **UI-only implementation; creation functionality unchanged.**

Branch: `codex/create-watch-loading-ui`. Worktree: `/Users/davidlang/.codex/worktrees/pilot-day1-brief/watch-assistant`. Previous HEAD: `8c3dc4df357c99888e4f29ade3b942c77650ba05`. Initial Production commit: `3bc786cbc9142c1bb64ba07ab08288b385173ac2`, deployment `dpl_8A8U3KrQA7ZRsjThMtF81Z2MorJe`, READY.

## Current UI map, inspected before edits

- Button: `new-watch.html`, `#newWatchSubmit` / `#newWatchSubmitLabel`.
- Submit: `navigation.js` → existing `structuredCreation.runV3` → `structured-watch-creation.js`.
- IDLE: Create Watch label, original meaning-based disabled state.
- SUBMIT → IN_PROGRESS: existing controller `busy=true` prevents a second request, but no spinner/disabled controls are rendered. The button keeps Create Watch. Generic Preparing your review text is written to `#watchError` at the end of the form, away from the button.
- SUCCESS: unchanged READY+ID condition assigns `window.location.href='watch-detail.html?id='+encodeURIComponent(result.id)`.
- ERROR / clarification / unsupported: existing messages retain the input; busy clears in finally.
- Detail: `renderWatchDetail` reads the local Watch list. If missing and `getWatchListAvailability().uncertain` is false, it displays Watch not found. Before server-store activation, both sources can be idle and filtered out, so availability is not uncertain despite the new Watch not yet being hydrated. Existing storage/account events later render the loaded Watch.

The last condition was reproduced deterministically in a controlled frontend test. The user's Production transient was not reproduced by another real creation; no HAR/trace of that user's Blackburn Rovers attempt was available. The fix addresses this presentation gap, not an inferred backend timing failure.

## UI decision and changes

Added `src/js/watch-creation-presentation.js`, called only at existing V3 pending/success/finally presentation points. No request, response, ID, success predicate, endpoint, payload or navigation URL changed.

Pending button: spinner + **Creating Watch…** (French: Création de la Watch…). Button/form expose `aria-busy`; button and form action controls are disabled. Text fields are read-only so original text remains visible and keyboard focus is retained where possible. A capture-phase pending submit guard blocks duplicate Enter/Space/programmatic submit interactions in addition to the existing controller guard.

The same existing status node is placed directly after the button when creation starts, with stronger readable styling, normal contrast, spacing and wrapping. It says **Creating your Watch…**, not fabricated backend stages. Existing error/clarification/unsupported wording remains unchanged and stays near the action. On non-success completion, original labels, read-only/disabled states and suitable focus are restored. Previously disabled controls remain disabled. An invalidated editor cannot restore scrubbed controls. Optional presentation rendering/storage errors cannot throw into the create controller.

After the existing success decision, the UI stores only the created ID and timestamp as a session presentation marker and keeps the pending button visible until normal navigation unloads it. The destination shows **Loading your Watch…** only for that matching newly created ID while existing list activation/hydration is pending. It consumes the marker when the Watch loads, lists settle or a load error is reported. Confirmed absence still shows the original not-found UI. A passive two-minute age check bounds stale markers; it schedules no timer, polling, request or retry. Blocked session storage simply leaves the original transition presentation available. No Watch data, auth state or persistence record is changed by this marker.

Overlay: **NO**. No page redesign, new routes, backend wait or delay before successful navigation. Existing pilot/legacy edit and monitoring logic untouched. CSS is scoped to the creation form/status/spinner and respects reduced-motion preference.

## Verification

Story verified: existing Create Watch action → identical injected request → held pending response → spinner/disabled form/status → unchanged success navigation or unchanged error/clarification/unsupported handling; neutral detail hydration → ordinary Watch detail. No external service or database was needed to test this UI story.

**94/94 targeted tests PASS; 0 failures. Build PASS; syntax/import and git diff --check PASS.**

Tests: `watch-creation-presentation.test.js`, existing `structured-watch-creation.test.js`, `watch-detail-layout.test.js`, `editor-account-isolation.test.js`, and existing `server/v3-creation.test.js`. The server test is unchanged and verifies the established creation/persistence/schedule contract with synthetic models/SQL. No paid provider request or real Watch is created by these tests.

Covered: idle label; spinner/creating label; disabled/busy state; text preserved; status beside button/live region; duplicate submit guard; exact method/path/body; existing success URL/criteria; existing error/clarification/unsupported; no automatic retry; keyboard guard; focus restoration; pre-disabled controls; account invalidation; matching/new-ID transition; genuine missing Watch and load failure; optional storage/rendering failures; reduced motion. No added timer, polling or fetch exists in the presentation module.

Artifacts: `/private/tmp/wa-loading-ui/regression-final.log`, `build-final.log`, `responsive.json`. Browser fixture at `/private/tmp/wa-loading-ui/preview.mjs` bundles the real controller/presentation module and built application CSS, uses the actual form markup and injected responses, and visibly labels itself local/no backend writes. It is not deployed or included in the application.

### Browser responsive and keyboard checks

| Width | Spinner/label fit | Status visible under button, in viewport | Horizontal overflow |
|---|---|---|---|
| 320 | PASS | PASS | NO |
| 375 | PASS | PASS | NO |
| 430 | PASS | PASS | NO |
| 1280 desktop | PASS | PASS | NO |

All four browser measurements also confirmed disabled button/read-only original input and exactly one held request. French at 320 px passes (153.5 px label within a 257 px button). Enter while pending leaves the injected request count at one. On error, the original text remains, controls unlock and existing failure copy appears directly below the action. Success goes to the exact original detail URL, initially renders neutral Loading your Watch, then renders Watching on the existing hydration completion event. No repeated network call was introduced. Browser viewport override was reset afterward.

Screenshots: [320 px](/private/tmp/wa-loading-ui/loading-320.jpg), [desktop](/private/tmp/wa-loading-ui/loading-desktop.jpg). Screenshots are local fixture evidence, not a new Production Watch or an actual pending backend request. Full application auth/navigation/source logic is not simulated as a claim of live Production execution.

## Scope gate and release plan

Runtime/UI files: `src/js/watch-creation-presentation.js`, `src/js/structured-watch-creation.js`, `src/js/navigation.js`, `src/scss/pages/_new-watch.scss`. Direct frontend test: `src/js/watch-creation-presentation.test.js`. This single report is the only new report. Two pre-existing untracked diagnostics were preserved.

| Scope check | Changed? |
|---|---|
| Create request payload / endpoint / success response semantics / success URL | NO each |
| Backend handler / V3 Intent / persistence / schedule / runtime routing | NO each |
| Monitoring / Brain / evidence refs / grounding | NO each |
| Auth / database / RLS / cron / email / Morning Brief | NO each |
| Retry / polling / backend wait loop / success delay | NO each |
| Unrelated functionality | NO |

`git diff 3bc786c -- api server supabase` is empty. No environment variables, credentials or database operation is required or performed. Only presentation calls surround the existing create flow. No disposable Production Watch is needed: exact-request/response instrumentation and the unchanged creation regression test cover the wait and transition.

Deploy only this tested UI commit to the existing project/alias. Rollback: restore previous Production deployment `dpl_8A8U3KrQA7ZRsjThMtF81Z2MorJe` / commit `3bc786c`; there is no schema/config/data rollback. Production asset/version verification will be recorded below. No pilot Watch, baseline, schedule or ledger is modified.

## Production verification

Pending deployment/version and served asset verification. No test Watch created; none needs deletion. No create/mutation request was sent to the five pilot Watches or any real Watch in this task.

Hard stop triggered: **NO**. All changes remain presentation-only.

Final classification: **CREATE WATCH LOADING UX IMPROVED — CREATION LOGIC UNCHANGED** (local gate passed; release verification pending below).

Recommendation: **CONTINUE 7-DAY OBSERVATION**. This change does not assert anything about future monitoring quality or other sources of a not-found state beyond the matching creation/hydration presentation gap.
