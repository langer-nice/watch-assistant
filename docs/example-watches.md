# Static examples in All Watches — PR #26

## Baseline

Before this correction the worktree was clean and local HEAD, fetched
`origin/feature/example-watch-gallery`, and the open PR #26 head all matched
`4fcf4e80ed28bd0bece0bd79be8dd1c8ee42dbc4`. The existing branch and PR are reused.

## UX and separation

- Home contains no gallery or example data. All Watches shows real account rows
  first and then nine static example rows, including when there are zero real
  Watches. The misleading empty-Watch message is removed from that page.
- The examples section explains that these rows do not monitor anything and are
  not the user's Watches. Examples remain after a first Watch, account changes
  and sign-out. The six active labels are EXEMPLE / EXAMPLE, before the title;
  the other three say BIENTÔT DISPONIBLE / COMING SOON. All nine are visible.
- `watch-summary-card.js` extracts the existing real summary markup. Real Home
  cards, real All Watches rows and static examples use this same renderer and
  the existing `briefing-item` / `watch-list` styles. Real Watch timestamps,
  statuses, links and content filtering retain their previous behavior.
- Only the example section boundary adds layout rules. No new card design,
  gallery grid, expansion control, fictitious dates or monitoring statuses.
- Active rows are native links to `watch-detail.html?example=<public-key>`.
  The example route is handled before any real detail lookup, acknowledgment,
  monitoring or mutation. It uses the existing detail header/card/panel styles,
  identifies itself as an example, displays the exact request, and offers the
  exact localized “Create a Watch from this example” action.
- Inactive rows are non-actionable groups with `aria-disabled`, keyboard focus
  and an accessible name containing the unavailable label. They have no link or
  activation handler. Even direct URLs to unavailable/unknown examples have no
  creation action or real-Watch controls.
- A public allowlisted key seeds the normal editor once, then is removed from
  the URL. Existing text wins over a prefill. The editor retains normal
  validation and account guards; Cancel returns to All Watches. Guest drafting
  remains in memory and authentication begins only on normal submission.
- Keys use the explicit example route and `data-example-key`, never a Watch ID,
  owner, date, persistence record or title-based classification. The catalog
  never enters reports, counts, statistics, notifications or monitoring.

## Exact correction files (relative to the previous PR head)

- `index.html`: remove the Home gallery host.
- `watches.html`: add the examples list after real rows.
- `src/js/navigation.js`: shared row renderer; All Watches integration;
  early static detail-route handling; remove Home gallery rendering.
- `src/js/watch-summary-card.js`: extracted presentation shared with real rows.
- `src/js/example-gallery.js` → `src/js/example-watches.js`: replace gallery
  presentation with static rows/detail; retain editor prefill; Cancel to list.
- `src/js/main.js`, `src/js/guest-editor.js`: import the renamed example module.
- `src/locales/en.json`, `src/locales/fr.json`: replace gallery-only labels with
  list explanation, detail labels and exact creation CTA; keep request texts.
- `src/scss/pages/_home.scss`: remove gallery styling.
- `src/scss/pages/_watches.scss`: list section separation and inactive hover rule.
- `src/js/example-gallery.test.js` → `src/js/example-watches.test.js`: update
  placement, detail, shared structure, no-side-effects and prefill regressions.
- `src/js/home-summary-navigation.test.js`: follow the extracted real-card
  template while preserving the original layout/navigation assertions.
- `src/js/test-support/example-gallery-browser.mjs` →
  `src/js/test-support/example-watches-browser.mjs`: new browser matrix.
- `docs/example-watch-gallery.md` → `docs/example-watches.md`: current design
  and verification notes.

## Validation

- Targeted examples/auth/OTP/account-isolation/real-navigation tests: 96 passed.
- Full `npm test`: 990 passed, zero failed or skipped.
- `npm run build`: successful Production build.
- Changed JavaScript syntax and `git diff --check` validated.
- Added-content pattern scans for secrets, private keys, tokens, email/phone
  identifiers, debug calls and temporary artifacts; manually reviewed synthetic
  fixture IDs and repository/deployment references.
- Browser: EN/FR × 1280px/390px × guest/empty account/populated account, plus
  account A→B→sign-out. Checks include matching real/example row geometry and
  DOM structure, nine persistent examples, six exact active prefills, detail CTA,
  keyboard/focus, cancel, guest auth/back draft retention, unchanged Home counts,
  inactive keyboard/forced clicks/direct URLs, no API mutation/monitoring calls,
  no real emails, and no browser errors.
- Existing synthetic OTP and startup/onboarding/Magic Link browser suites are
  rerun. Backend requests are intercepted; no business data is used or modified.

Reproduce locally:

```sh
node src/js/test-support/account-isolation-preview.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BROWSER_EXECUTABLE=/path/to/chromium node src/js/test-support/example-watches-browser.mjs
```

No Supabase, SMTP/Resend, OTP configuration, cron, existing Watch data or
production configuration is changed. Delivery is a Preview and an update to
open PR #26 only; no merge or Production deployment.

## David's manual checklist

1. Open All Watches in FR/EN, desktop/mobile, signed out and signed in.
2. Confirm nine example rows; with real Watches, confirm real rows come first.
3. Open an active example, check its detail label and exact CTA; edit the
   prefilled request then Cancel. Confirm nothing was created.
4. Tab through unavailable rows; click or press Enter/Space. Confirm no action.
5. Check Home: no examples and unchanged real-Watch counts/report content.
