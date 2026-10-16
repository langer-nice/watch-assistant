# Read-only Watch title presentation

Ordinary viewing never generates a translation. The existing presentation chain
still uses deterministic generated Media titles, a valid saved `localizedCopy`
for the selected language, or the original saved title. Saved translations must
match the canonical source title and summary. Missing/stale copy falls back
immediately; it is not saved as a translation. Canonical titles, definitions,
preferences and stored translations are not changed by this fix.

## Removed automatic trigger

`navigation.js` previously called `scheduleWatchTranslations()` from `initApp`,
`WATCH_STORAGE_CHANGED_EVENT`, `ACCOUNT_STORAGE_CHANGED_EVENT`, and
`i18n:languageChanged`. After a 200 ms debounce it walked eligible text Watches
(excluding Currency), then invoked `translateStoredWatchCopy` for missing copy.
That helper POSTed `/api/watch-translation`; the server implementation can POST
OpenAI Responses, then the client persisted `localizedCopy` through `updateWatch`.
A successful update can emit another Watch-storage event. Pending and failed sets
only protect one module lifetime, not reloads; saved copy prevents repeat calls
only while it remains available and matches its source. Language/account changes
could schedule new work. Frequency RPCs do not directly translate; initial page
loading/reloading or incidental Watch-storage events exposed the pre-existing
queue during frequency testing. The trigger existed before the digest commit.

The automatic scheduler, its four callers and its transport import are removed.
Rendering and language switching retain their current stored-copy reads. No new
button, provider configuration, API gate, SQL or Serverless Function is introduced.
`translateStoredWatchCopy` and the translation API remain functional for deliberate
programmatic use; no existing explicit translation button was found. New-Watch
interpretation and explicit creation submissions are unchanged and covered by
mocked creation-flow regressions.

The earlier Staging report contains an observed translated title, not captured
provider transport, usage or billing evidence. Earlier actual paid calls remain
**UNVERIFIED**. No hosted reproduction or provider-status lookup is performed.

## Local verification

The focused test exercises actual `initApp`, Watch detail markup, account-scoped
stored records, real language-change events and the shared email-frequency
component, using Linkedom and mocked owner RPCs. Window timers are drained so the
old deferred queue would not escape the call counters. It covers legacy and
Structured rendering, cached/stale/missing copy, repeated hydration, Off/Daily/
Immediately, save success/failure, reload, language changes, owner switching and
logout. No translation endpoint, provider mock or other external request is made
by ordinary interactions. Stored source titles remain unchanged; another owner's
saved copy is not reused. Static page labels and SQL persistence reuse their
previous focused evidence; this test isolates data-driven viewing and preferences.
Explicit helper/provider translation tests still use only synthetic mocks.

## Remaining Staging validation — plan only

1. Approve publishing only this caller correction, its test and documentation.
2. Commit/push the existing feature branch; deploy an approved disabled Git-pinned
   Staging Preview. Keep Production and unrelated local diagnostics untouched.
3. In a separately bounded validation, enable only
   `VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED` on the exact Preview branch and create
   the temporary Preview. Keep backend digest, scheduler and email gates disabled.
4. Reuse the two retained PAUSED UI fixtures, consent OFF: legacy
   `f1ce5de6-d61f-48fb-acf1-7161de016ec0` and Structured
   `c47adb4f-03a5-4d91-a9ad-f1fcfffa9acb`. Do not use real tester Watches.
5. Finish Structured, English, mobile and keyboard scenarios; await a completed
   preference save before reloading, then compare the selected visible option and
   persisted owner preference. Reuse previous successful legacy Off evidence.
6. Verify no automatic translation endpoint request occurs. Provider billing
   absence must not be inferred merely from visible copy or a passing UI test.
7. Restore UI gate disabled, deploy final disabled Preview, contain the temporary
   UI-enabled deployment, and verify fixture isolation, protected Watches and
   Production unchanged. Budget cleanup before starting; no live emails required.

Nothing in this plan is executed by the local correction task.
