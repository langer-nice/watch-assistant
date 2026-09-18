# Progressive drafting and staged email OTP rollout (PR #24)

Previous PR source: `f4404572efc5ca6c301395bd03885c3539dfe74e`.

## UX and security boundary

Signed-out new-Watch links now open only a request textarea and submit action, using
the existing editor styles. There is no guest/login choice. The real analysis,
notes, concepts, voice and persistence controls remain hidden/inert and uninitialized.
Typing or pasting a URL has no analysis, upload, fetch, Watch API or persistence side
effect. The draft exists only in that page's textarea and an in-memory pending action.
The shared email panel opens on submission; Return to my Watch cancels the challenge
and returns to the unchanged text.

OTP mode uses Supabase `signInWithOtp` with the existing `shouldCreateUser: true`
behavior, then `verifyOtp({ email, token, type: 'email' })`, supported by the installed
supabase-js 2.112.3 client. Six ASCII digits are required after trimming only surrounding
whitespace. No OTP enters storage, URLs, logs or custom tokens. The SDK alone creates
and persists authenticated sessions. A verified session must include an account ID,
access token and the submitted email before the pending creation action can resume.

Draft transfer is single-use and tied to the active challenge, original route and
account epoch. The textarea is cleared after transfer. Header sign-in, unrelated
account changes, pagehide, browser history changes, sign-out, unresolved identity,
and cancelled/delayed verification cannot adopt the draft. A late cancelled SDK
session is signed out locally if it is still the current SDK session. The real
editor retains PR #22's owner/epoch protection after authentication. Owned edit URLs
never expose the guest composer or saved content until authentication and ownership
validation. Anonymous Watch/report storage remains disabled.

## Audit and mode switch

The repository has Supabase migrations and RLS tests, but **no hosted Auth email
template, config.toml, SMTP or provider configuration**. Existing documentation assumes
hosted Magic Link delivery. The dashboard has not been inspected or modified; its
current custom template and effective resend interval require an authorized operator
check. No production settings were changed.

- `VITE_AUTH_MODE=magic-link` is the default, including unset/unrecognized values.
- `VITE_AUTH_MODE=otp` enables the same-page code step. This is a Vite build-time
  setting: rebuild after changing it. Do not enable against an unprepared provider.
- `VITE_AUTH_OTP_RESEND_SECONDS` must be at least the hosted project's effective
  request interval. The UI enforces a **60-second minimum**, even for smaller values.
  Verify the provider setting before enabling OTP. Supabase remains authoritative;
  the UI does not bypass server limits. A visible countdown covers resends and
  changed-email retries, duplicate clicks are ignored, and nothing resends automatically.
  An explicit rejected send clears the local cooldown (including GoTrue's SMTP
  delivery error surfaced by supabase-js as HTTP 500). Rate limits, transport
  failures and ambiguous server/gateway failures retain it because acceptance may
  be uncertain. Releasing the local timer never retries automatically or bypasses
  Supabase's own rate limits.
- Supabase may report incorrect, expired and consumed codes with the same
  `otp_expired` response. That response uses honest combined recovery copy; distinct
  codes receive specific localized text. Raw provider errors are not rendered.

Magic Link compatibility remains available with the existing redirect allowlist.
Only public, exactly allowlisted destinations are carried in the callback. The request
is never encoded in a redirect. If a matching verified Magic Link sign-in reaches the
original page while its explicit submission is still pending, it can resume that
in-memory request. A newly opened callback page has no draft to restore. Closing,
reloading or cancelling the original page may lose the draft. Use OTP mode for the
complete same-page journey.

## Proposed dashboard template (not applied)

In the authorized **non-production project first**, open Authentication → Email
Templates → Magic Link. Save an exact backup of the existing subject/body. Use this
dual-compatible body, retaining both the OTP token and confirmation URL:

Subject: `Your Watch Assistant sign-in / Votre connexion Watch Assistant`

```html
<h2>Sign in to Watch Assistant / Connexion à Watch Assistant</h2>
<p>Enter this code on the page where you requested it:</p>
<p>Saisissez ce code sur la page où vous l’avez demandé :</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:bold">{{ .Token }}</p>
<p>If your page asks you to open a sign-in link, use this link:</p>
<p>Si votre page vous demande d’ouvrir un lien de connexion, utilisez ce lien :</p>
<p><a href="{{ .ConfirmationURL }}">Sign in / Se connecter</a></p>
<p>If you did not request this email, you can ignore it.</p>
<p>Si vous n’avez pas demandé cet email, vous pouvez l’ignorer.</p>
```

Inspect the Confirm Signup template for the hosted project's new-user path too. If
that path uses a separate template, apply the same dual-compatible content there in
the authorized test project and validate both new and existing users. Do not assume
that checking only an existing user covers signup. Verify email OTP length is six,
record expiry and the effective minimum request interval, and retain existing SMTP,
rate-limit, redirect and provider policies. Do not paste service-role credentials
into browser configuration. No secrets are required in the template.

Official references:
- [Passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [JavaScript verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Email template variables](https://supabase.com/docs/guides/auth/auth-email-templates)

## Safe deployment order

1. Keep production on its current app/settings. This PR stays open and unmerged.
2. With authorization, prepare the dual-compatible template in an isolated Supabase
   project. Check six-digit codes and the effective request interval. Set that
   project's public URL/anon key and `VITE_AUTH_MODE=otp` only on an isolated Preview;
   set its resend seconds to at least the checked minimum. No production credentials.
3. Test new and existing user delivery and same-page verification there, plus the
   Magic Link path against the dual template. Real delivery has **not** been tested
   by this change; automated verification is synthetic only.
4. For an independently approved production release, either deploy this app first
   with the default Magic Link mode, or install the dual-compatible template first.
   Both orders preserve the existing link path. Back up the production template;
   installing it and changing production configuration require separate approval.
5. Only after the template and authorized delivery checks pass, explicitly enable
   `VITE_AUTH_MODE=otp`, set the checked resend interval and rebuild/deploy in the
   separately authorized production release. Keep ConfirmationURL during transition.

## Rollback

Set `VITE_AUTH_MODE=magic-link` (or remove it) and rebuild/redeploy the last approved
application. Leave the dual-compatible template installed until all OTP-capable
clients have refreshed; then restore the backed-up template if necessary. Keep the
confirmation URL in the template during rollback so existing deployed Magic Link
clients remain functional. No migrations, data restoration or notification replay
are involved. Reverting directly to the previous commit is also compatible with the
dual template's link. Do not change production settings as part of this PR task.

## Reproduce synthetic validation

Start `SYNTHETIC_PORT=4181 node src/js/test-support/account-isolation-preview.mjs`.
Its default mode is OTP; use `SYNTHETIC_AUTH_MODE=magic-link` to test compatibility.
The local-only synthetic adapter accepts fixture code `246810` for `a@example.test`;
it is never bundled into a production entry point. It does not send email or store
submitted codes. All API writes are blocked unless the browser test explicitly mocks
its local response.

Run `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs SYNTHETIC_ORIGIN=http://127.0.0.1:4181 node src/js/test-support/auth-gate-browser.mjs`.
The browser suite blocks external network requests and writes screenshots only to
`/tmp`. Unit/integration suites run with `NODE_ENV=test` and cannot send real emails.

## David's manual checklist

- In Preview's default mode, confirm guest drafting works and the existing Magic
  Link method remains available; no premature authentication gate.
- In an authorized OTP-configured isolated Preview, enter a distinctive request,
  submit, return to the unchanged draft, then send one code and verify on that page.
- Check a wrong/expired/used code, paste, keyboard focus, cooldown and email recovery
  in EN/FR on desktop/mobile. Verify new-user and existing-user delivery separately.
- Confirm that verification resumes the intended action and that cancellation,
  reload, sign-out, direct edit links and account switching never expose stale text.
- Check Legal Professionals guidance, all four public onboarding flows and Dashboard.
- Perform a manual screen-reader pass; automated DOM/keyboard checks are not a
  screen-reader or physical mail-app test.

## Staging SMTP incident (2026-09-18)

The first manual staging OTP request failed at 13:09:59 UTC. Staging Auth logs
recorded `POST /otp`, HTTP 500, `unexpected_failure`, and the upstream response
`535 "Authentication credentials invalid"`. This is an SMTP authentication
rejection, before email acceptance; it is not evidence of a template or delivery
failure after acceptance. Resend showed no activity for the dedicated staging
key and no accepted email corresponding to the request. Its dashboard does not
expose SMTP server logs.

The configured host and port were `smtp.resend.com:465` (implicit TLS). The
dedicated key had Sending access restricted to the verified sender domain.
The persisted password cannot be viewed, so the exact incorrect credential was
not established. The operator must re-enter the staging-only SMTP username
`resend` and the complete dedicated API key, and verify the staging sender.
Do not replace or reuse the Production key. No additional email may be sent
without renewed operator approval.

The local cooldown regression is covered using the installed SDK's actual
`AuthRetryableFetchError` for SMTP rejection, alongside explicit 4xx rejection,
429, transport errors, and ambiguous 500/504 responses. Validation: 971 tests
passed, including 50 focused OTP/auth-gate tests; production build, changed-file
syntax checks and whitespace checks passed. Delivery remains unverified.

## Correction validation results

- 969/969 complete automated tests passed (`npm test -- --test-reporter=tap`).
- 48/48 focused OTP and guest/auth-gate tests passed; 108/108 tests selected by
  authentication, navigation, editor, storage and isolation filenames passed.
- Production build passed. Existing Sass legacy-JS-API deprecation remains.
- Changed JavaScript syntax, `git diff --check`, credential/personal-data/debug
  review passed. Only documented synthetic email/code fixtures were present;
  production bundles contain no synthetic adapter, fixture email or accepted code.
- Chromium synthetic flow passed in EN/FR at 1280×900 and 390×844: public onboarding,
  guest draft, cancel/return, incorrect code, same-page verification, exact request
  transfer, authenticated creation and owned editing, sign-out/account changes,
  reload/history, direct edit protection, email recovery, keyboard focus and sizing.
  Generic header OTP remains on Watches; all four onboarding flows in both languages
  and Demo Dashboard passed without uncaught browser errors.
- The initial full run exposed a headless Company-editor UI assumption; corrected
  it and retained the behavioral session-initialization regression. Some sandboxed
  runs stalled in the existing PGlite media worker. The final full run outside the
  sandbox completed successfully. No database behavior was changed.
- Supabase verification/delivery was mocked. PostgreSQL RLS and persistence tests
  use local PGlite. No isolated hosted Supabase project was available/configured for
  delivery testing; no real OTP, notification, production data or cron was used.

## Exact correction file manifest

Relative to `f4404572efc5ca6c301395bd03885c3539dfe74e` (16 files):

- `.env.example`
- `docs/auth-before-watch-creation.md`
- `docs/email-otp-rollout.md` (new)
- `src/js/auth-gate.test.js`
- `src/js/auth-otp.test.js` (new)
- `src/js/auth-session.js`
- `src/js/auth-ui.js`
- `src/js/company-watch-duplicate-edit-regression.test.js`
- `src/js/guest-editor.js` (new)
- `src/js/main.js`
- `src/js/test-support/account-isolation-preview.mjs`
- `src/js/test-support/auth-gate-browser.mjs`
- `src/js/test-support/synthetic-auth-client.js`
- `src/locales/en.json`
- `src/locales/fr.json`
- `src/scss/components/_top-navigation.scss`

The final source hash, Preview URL and remote-check status are recorded in PR #24's
updated description, avoiding a self-referential commit hash in this document.
