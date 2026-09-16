# Account-scoped local report isolation

## Baseline and scope

Repository: `langer-nice/watch-assistant`. Clean baseline, local `master`, and fetched
`origin/master`: `dc29a2618fa254432d95f8fac28482fb3ba0f3cb`.
Branch: `fix/account-scoped-local-reports`.
PR #6 was inspected for status-lifecycle overlap only; no changes were imported from it.

The confirmed code defect allowed unowned report snapshots in a shared localStorage
key to outlive a session. Home could render their titles, summaries, classifications
and counts without a matching live Watch. No production cross-user exposure was
observed. Implementation and validation used no production accounts or records.

## Ownership and timing

- Reports use `watchAssistant.reports.v2.account.<Supabase user ID>`.
  The shared helper accepts only a nonempty bounded identifier (letters, digits,
  underscore, hyphen), does not trim/coerce identities, and never uses email.
  Appending the complete validated ID is injective for accepted IDs.
- Each report requires schema version 2 and an exact `ownerId` match to the
  currently resolved authenticated session. Missing/malformed/mismatched owners,
  unsupported versions, invalid required arrays/entries and invalid dates fail closed.
- Auth is unresolved by default. Reports have no anonymous fallback. Reads always
  validate ownership; there is no retained active report cache.
- The auth listener is installed before session restoration. A newer auth event
  supersedes an older getSession result. Same-user token refresh preserves the scope.
- Sign-out clears the active session before awaiting Supabase. Account transitions
  synchronously rerender Home and clear confirmation/progress UI. Owned scoped
  reports are preserved for that same account's next visit.
- Report generation and local check writes are bound to an auth epoch, preventing
  late work from saving into another account. Company cache reads validate the
  current identity, and late responses from obsolete sessions are rejected.
- Pagehide suspends auth and clears rendered reports before back/forward caching;
  a persisted pageshow resolves the session again.

## Legacy policy and adjacent-store audit

| Store | Result |
| --- | --- |
| `watchAssistant.reports.v1` | Never read or migrated; removed after auth resolution and on sign-out. If removal is unavailable, it remains permanently ignored. |
| `watchAssistant.watches` | Confirmed adjacent shared-content risk: titles, article summaries, report provenance, statuses and acknowledgement records. Old shared snapshots are discarded, never adopted. New data uses `watchAssistant.watches.v2.account.<ID>`. |
| Deleted Watch IDs and Watch migration markers | Partitioned with the same helper so one account cannot suppress another's Watch or alter its normalization. Old shared values are discarded. |
| Anonymous local Watches | Existing local mode retained in separate `.guest.v2` keys. Unknown auth has no key; authenticated sessions cannot read guest data. |
| `watchAssistant.mediaSync.<ID>.<Watch ID>` | Existing account-scoped sync journal retained. Contains definitions and pending edits; existing identity/generation checks preserved. Local recovery now reads the scoped Watch key. |
| Company server cache | Existing generation/request guards retained; reads now also gate immediately against current auth. Late mutation responses cannot repopulate another account's cache. |
| Media server cache | Existing identity checks and stale-response guards retained; full persistence/hydration/RLS tests pass. |
| First-Watch confirmation and new-Watch session pointers | Cleared on identity/scope changes. They contain IDs, not report copies. |
| Home sort, language, intro selection/completion and analytics exclusion preferences | No account report/Watch content; unchanged. |

Compatibility consequence: legacy unowned local-only Watches and their old local
acknowledgements are not recoverable through automatic adoption. Server-owned
Watches continue to hydrate. Acknowledgement behavior for new scoped Watches is
unchanged and is covered by existing and new tests. Historical unowned reports
are intentionally unavailable. No Supabase migrations, RLS, persistence APIs,
monitoring algorithms, notification code, cron, onboarding code or production routes
were changed.

Excluded: report count reconciliation (including 14 versus 15), Bitcoin baseline
copy, Elon Musk relevance matching, email sender configuration, failed-notification
retry, and status-lifecycle redesign.

## Validation

- New security file: 11 tests, including actual Home DOM rendering with Linkedom.
  Covers A/B storage and return-to-A continuity, synchronous sign-out removal,
  unknown auth, same-owner refresh, legacy disposal, malformed ownership/schema,
  normalization, storage corruption/unavailability, distinct keys, scoped local
  acknowledgements, guest isolation, stale report work, restoration races and late
  company responses. All new test data is unmistakably synthetic.
- Focused security/auth/report/Home/company hydration/Watch storage/RLS selection:
  48 passed. Existing media persistence integration: 31 passed in isolation, including
  simulated PostgreSQL RLS and company/media hydration coverage in the full suite.
- Final `npm test`: **842 passed, 0 failed, 0 skipped**.
- `npm run build`: passed. JavaScript syntax checks across `src`, `server`, `api`
  and Vite config: passed. `git diff --check`: passed.
- No lint or type-check scripts/configuration are configured in this repository.
- Added-line/new-file scans: no private keys, credential-token patterns or
  non-fixture email addresses. Reviewed the only new log: the local fixture's
  localhost startup URL. No owner IDs are logged or rendered by the new code.
- Production bundle checked: no synthetic auth adapter, test identity selector or
  synthetic credential string included.
- Isolated Chromium via agent-browser: actual Home displayed A's report; clicking
  sign-out removed it synchronously; B was empty and then displayed B's report;
  same-owner refresh, reload and back/forward retained only B's content. The
  one-second mocked restoration interval displayed no prior report. Watch list,
  New Watch form and onboarding language gate loaded. Browser errors were empty;
  console inspection showed only development messages and safe transition codes,
  no account identifiers, report content or secrets.
- A transient embedded PostgreSQL startup stall occurred in some background test
  runs, before assertions. Diagnostic reruns and the final complete suite passed.
  No application workaround or test assertion was removed to address it.

Limitations: auth was mocked in browser validation; no real Supabase or production
account switching was attempted. The preview fixture blocks API mutations, so
browser validation checks route loading rather than real Watch creation or checks.
Existing automated suites cover creation, hydration and the four onboarding journeys.
This correction ships only after the open PR is reviewed and merged separately.

## Exact safe manual steps for David

1. Check out `fix/account-scoped-local-reports`, run `npm ci`, then
   `node src/js/test-support/account-isolation-preview.mjs`.
   Use a fresh browser profile and open `http://127.0.0.1:4178/index.html`.
   This local-only server substitutes synthetic auth, serves empty mock Watch
   responses and rejects all API mutations. Do not perform these steps on production.
2. After the one-second initialization delay, run in DevTools:
   `syntheticAuth.signIn('A'); syntheticAuth.save();`
   Confirm `PRIVATE REPORT FOR SYNTHETIC USER A` and its summary appear.
3. Open the profile menu and click **Sign out**. Confirm the report disappears
   immediately. After sign-out completes, run `syntheticAuth.signIn('B')`.
   Confirm Home is empty and no A title, summary, updated status or count remains.
4. Run `syntheticAuth.save()`. Confirm only `REPORT FOR SYNTHETIC USER B` appears.
   Run `syntheticAuth.refresh()` and confirm it remains.
5. Reload. During initialization no report should appear; afterward only B appears.
   Visit All Watches, then browser Back and Forward. A must never return.
6. Run `syntheticAuth.signIn('A')`. Only A's preserved report should appear.
7. To check legacy rejection, sign out; in DevTools store an unowned synthetic
   array under `watchAssistant.reports.v1`, then sign in as B. The legacy key is
   removed and its content never appears. Do not copy any real data into the fixture.
8. Inspect the browser console: no account IDs, synthetic credential strings or
   report text should be logged. Open New Watch and the introduction link to
   verify those screens load. Do not run Check now, Generate report or send email.
9. Stop the local server with Ctrl-C and close the isolated profile.

## Exact changed files

```text
docs/account-scoped-local-reports.md
server/media-watch-persistence.test.js
src/js/account-report-isolation.test.js
src/js/account-storage.js
src/js/auth-session.js
src/js/auth-ui.js
src/js/company-watch-authenticated-routing.test.js
src/js/company-watch-reload-regression.test.js
src/js/company-watch-server-store.js
src/js/cross-analysis-runtime-trace.test.js
src/js/home-report.test.js
src/js/legal-onboarding.test.js
src/js/main.js
src/js/media-watch-server-store.js
src/js/navigation-media-story-review.test.js
src/js/navigation.js
src/js/non-story-browser-path.test.js
src/js/planner-routing-clarification-browser.test.js
src/js/preview-test-watches.js
src/js/preview-test-watches.test.js
src/js/report-migration.test.js
src/js/report-service.js
src/js/report-service.test.js
src/js/report-storage.js
src/js/report-ui-contract.test.js
src/js/test-support/account-isolation-preview.mjs
src/js/test-support/synthetic-auth-client.js
src/js/watch-status-lifecycle.test.js
src/js/watch-storage.js
src/js/watch-storage.test.js
```

## Editor correction after the merge review (PR #22 remains open)

The merge review at `d2ba033c5aa6f87909bf54f9b831caa79754086d`
reproduced an additional blocker with synthetic accounts: the standalone editor
retained A's request and private note after sign-out and B sign-in. The scoped
store was empty for B, but `initForm` still held A's Watch object, edit ID, form
values, review/clarification configuration, initial edit snapshot and callbacks.
The account-change handler refreshed collection/detail views without invalidating
this separate editor lifetime. Four new DOM regressions failed before the fix.

The correction binds each editor to one resolved account-storage epoch:

- On auth loss, unknown auth, owner/scope change or pagehide, it synchronously
  disables and scrubs controls (including detached/default values), removes
  review/error/link content, closes dialogs, clears editor variables and URL edit
  references, detaches listeners, aborts URL analysis and destroys dictation.
- The document restarts at a blank New Watch page after auth resolves. It waits
  through signing-out so navigation cannot interrupt completion of logout.
  Same-owner token refresh preserves the current draft. Anonymous creation remains
  available in the existing isolated guest scope.
- All submit/review/navigation handlers and async continuation boundaries require
  the original editor epoch. Planner, clarification, source analysis/enhancement,
  concept regeneration, company saves and local activation cannot publish a stale
  response or save the old form into the next account. Requests already sent are
  not retroactively undone; their responses are ignored after invalidation.
- Pagehide removes sensitive state before freezing. Persisted pageshow requires
  a blank restart and auth re-resolution. Browser form autocomplete/restoration is
  disabled for this form. Reload and fresh history documents use the existing
  ownership-gated stores before form initialization.
- The Watch Detail edit sheet uses the same form in an iframe. Its parent now
  immediately removes the iframe source and closes the sheet on account changes;
  delayed close/hydration callbacks and iframe save messages are epoch-gated.

Adjacent form audit: the only Watch create/edit form is `newWatchForm`, used both
standalone and in the detail iframe. No separate autosave/draft storage was found.
The known new-Watch session pointers were already cleared by the account-storage
boundary. Auth-menu email entry rerenders with auth state and does not contain
Watch content. Broader onboarding and unrelated UI behavior remain outside scope.

Correction files:

- `src/js/editor-session.js`: reusable editor lifetime and synchronous DOM scrub.
- `src/js/account-storage.js`: expose whether the scope is resolved.
- `src/js/navigation.js`: clear retained editor state, guard callbacks/async work,
  and close/invalidate the parent edit sheet.
- `new-watch.html`: disable browser restoration of account-specific form drafts.
- `src/js/editor-account-isolation.test.js`: nine real-DOM regressions covering
  immediate sign-out, A/B and return to A, unresolved auth, detached submissions,
  delayed planner and server hydration, restoration, create drafts and same-owner save.
- Ten existing test files: adapt source assertions to the guarded listener API;
  the cross-analysis fixture now explicitly resolves anonymous auth. Their original
  product assertions remain intact.
- This document: root cause, boundary audit and validation evidence.

Correction validation:

- Editor suite: **9 passed, 0 failed, 0 skipped**.
- Combined editor/account/auth/report/Home/company-store/Watch-storage selection:
  **52 passed, 0 failed, 0 skipped**.
- Complete suite: **851 passed, 0 failed, 0 skipped**.
- Production build, JavaScript syntax checks and `git diff --check`: passed.
- Synthetic Chromium: immediate sign-out, direct A → B, same-user token refresh,
  reload, Back/Forward, pagehide + persisted pageshow, returning A, delayed A server
  hydration and detached B submission all passed. Same-owner note saving and new
  text Watch creation passed with synthetic API responses. Home, All Watches and
  Watch Detail loaded. Embedded editor cleared on A → B, and a stale iframe save
  message was ignored. No browser runtime errors were recorded.
- Browser cache restoration was exercised with explicit persisted lifecycle events
  plus real Back/Forward; this does not claim every browser chose a physical bfcache
  hit. Real Supabase auth and Safari remain David's manual preview checks.
- No production data or APIs were mutated. No migrations/RLS, notification/Resend,
  cron, monitoring algorithms, media matching, report counts, onboarding content,
  credentials or debug artifacts were changed. Local fixture responses and browser
  instrumentation were synthetic; temporary browser scripts were not committed.

David's additional Preview checklist (use two controlled test accounts):

1. In A, open an existing Watch editor and enter a distinct private note. Leave it
   open while signing out or switching to B in another tab. It must blank immediately
   when that tab receives the auth transition; B must never see or submit A's values.
2. Repeat using the Watch Detail edit sheet. It should close on the transition.
3. Under B, reload and use Back/Forward; reopen A's former edit URL. No A content
   should appear, including during loading. Repeat in Safari if available.
4. Switch accounts while analysis/save is pending. Old results must not reappear.
5. Return to A and reopen the owned Watch. Verify normal editing/saving and then
   Home, All Watches and account-scoped reports. Same-user refresh should retain
   unsaved edits while the editor remains open.
6. Do not merge until this corrected Preview passes the manual editor checks.
