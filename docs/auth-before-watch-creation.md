# Authentication before Watch creation

## Scope and audit

Starting master: `fd9298f62216e0dea9e8fd41bf64bb14281cfb30` (fetched September 18, 2026).

Previously, a resolved anonymous/unconfigured session selected a guest local-storage
namespace and satisfied the editor session guard. Visitors could create private
requests, notes and derived Watch state before signing in. The account menu also
used an icon alone and displayed a prominent recovery button after email submission.

All real creation links (header, mobile New Watch, Home empty state, and public onboarding) converge on `new-watch.html`. Editing uses the same route, including
its modal iframe. Public `flow-2.html`, `flow-3.html?flow=1..4`, and `dashboard.html`
remain independent of the editor gate. The follow-story prototype has no persistence
handler; its shared New Watch navigation also leads to the gated route. Existing API authentication and account-scoped
server stores are unchanged.

The editor now starts hidden and inert in the HTML. The shared authentication UI
renders a localized gate, and startup only initializes/reveals the editor for a
resolved account. Rejected entry clears the hidden editor markup. Editor sessions
also independently require an account and retain the PR #22 epoch, detached-control,
async-response and page-cache protections. Guest Watch storage keys are no longer
read or written, and addWatch rejects requests without a resolved owner. Legacy
guest data is ignored and never adopted. Reports continue to require owned provenance.

## Sign-in and return

The same email form/session powers the account menu and creation gate. Successful
submission displays “Check your email” / “Consultez votre messagerie” and the escaped
submitted address. Recovery is an unfilled text button with a 44px minimum target,
visible keyboard focus, and a cleared, focused email field. Pending submissions are
deduplicated, and stale OTP responses cannot overwrite a newer auth state. Errors
use localized rate-limit, expired-link, invalid-link or provider-failure copy.

Magic links use the existing `/index.html` callback, adding only the language and
an exact allowlisted return destination: `new-watch.html`,
`new-watch.html?onboarding=first-watch`, or that first-Watch URL with one of the four
public `flow=1..4` audience IDs. This retains the approved Legal Professionals
editor guidance after sign-in. The callback rejects arbitrary URLs,
noncanonical encoding, duplicate return parameters and extra/private editor fields.
A signed-out edit link returns to blank creation after login; its edit ID is not
carried through authentication. Already-authenticated owned editing proceeds directly.

## Reproducing validation

- `npm test`
- `npm run build`
- `NODE_ENV=test node --test src/js/auth-gate.test.js src/js/auth-session.test.js src/js/editor-account-isolation.test.js src/js/account-report-isolation.test.js src/js/top-navigation*.test.js src/js/watch-storage.test.js`
- `node src/js/test-support/account-isolation-preview.mjs` (local synthetic server;
  optional `SYNTHETIC_PORT`)
- `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs SYNTHETIC_ORIGIN=http://127.0.0.1:4178 node src/js/test-support/auth-gate-browser.mjs`

The synthetic server replaces the auth client only in its local Vite transform;
there is no production bypass. OTP delivery is simulated, server API writes are
blocked, and the browser suite blocks requests to every non-local origin.
Screenshots go to `/tmp`, not the repository.

## Validation results

- Focused authentication/navigation/storage/editor tests: **60 passed**.
- Complete suite: **940 passed**, zero failures/skips, using
  `npm test -- --test-reporter=tap --test-concurrency=2`.
- An earlier full run stalled in the existing PostgreSQL media-persistence worker;
  its isolated run passed all 31 tests, and the final full run passed.
- Production build passed. Vite reports the existing Sass legacy-JS-API deprecation.
- JavaScript syntax and whitespace/diff checks passed.
- Credential/personal-data scan: no credentials or personal addresses. Address
  matches are example placeholders and synthetic fixtures. Console logging is
  limited to the local synthetic test runners; no screenshots/debug artifacts
  are committed.
- Chromium browser matrix passed in English/French at 1280×900 and 390×844:
  initial hidden/inert editor, New Watch, direct create/edit URLs, no anonymous
  persistence, confirmation/recovery, keyboard focus and touch size, header
  overlap, safe callback return, owned editing, reload/history, and A→sign-out→B.
- Separate final public/creation run passed all eight localized onboarding journeys,
  Legal Professionals guidance after sign-in, all four Demo Dashboard cards, and
  form→review→synthetic authorized POST→hydrated Watch Detail. No uncaught browser
  errors. External network access was blocked in the browser suite.
- No production email, cron, data or environment changes were made.

## Preview checklist for David

1. Signed out, try New Watch, the first-Watch onboarding action, and direct create/edit
   URLs. Expect the gate, with no editor flash. Public explanations, examples,
   language switching and Demo Dashboard should remain available.
2. Review the gate and email confirmation in English/French on desktop/mobile.
   Check that the address is correct, recovery is secondary, and keyboard recovery
   clears/focuses the input. There is no immediate resend control.
3. With an existing Preview session, create a Watch, edit its note and save. Sign
   out with an editor open, then use reload and Back/Forward. Sign in as a different
   Preview account and confirm that the first account's content is absent.
4. Verify the configured Supabase redirect allowlist accepts `/index.html` with the
   return/language query parameters on the Preview origin. Real magic-link delivery,
   device-specific mail-app handoff and a manual screen-reader pass remain manual;
   automated validation deliberately sends no email or production requests.

## Exact changed files

- `docs/auth-before-watch-creation.md`
- `new-watch.html`
- `src/js/account-storage.js`
- `src/js/auth-gate.test.js`
- `src/js/auth-return.js`
- `src/js/auth-session.js`
- `src/js/auth-ui.js`
- `src/js/company-watch-duplicate-edit-regression.test.js`
- `src/js/editor-session.js`
- `src/js/main.js`
- `src/js/navigation-cross-analysis-race.test.js`
- `src/js/non-story-browser-path.test.js`
- `src/js/test-support/account-isolation-preview.mjs`
- `src/js/test-support/auth-gate-browser.mjs`
- `src/js/test-support/synthetic-auth-client.js`
- `src/js/top-navigation.js`
- `src/js/watch-storage.js`
- `src/locales/en.json`
- `src/locales/fr.json`
- `src/scss/components/_top-navigation.scss`
