# Home example Watch gallery

## Baseline and scope

Implementation starts from clean `master` / fetched `origin/master` at
`3a203af324f5ab0e8edfd3b570c292704cc57b7b`. Vercel's latest READY production
deployment `dpl_FRXftThYjVap82WCQh4kv7p9sCNS` reports that same SHA.
Branch: `feature/example-watch-gallery`. Delivery is a PR and Preview only.

## UX decisions

- Home shows six active examples below its real content and before the secondary
  introduction link. With no Watches, the existing empty-state CTA is followed
  by the gallery. With real Watches, cards use transparent backgrounds, smaller
  padding and no shadow; a divider separates inspiration from real results.
- Existing onboarding redirects and authentication timing are preserved. Returning
  guests who reach Home can choose an example and use the existing guest editor.
- Two columns on desktop, one below 40rem. Existing color, typography, spacing,
  radius and button tokens are reused.
- Active cards use native links with the exact requested CTA and an accessible
  description identifying their example. Expansion uses a native button with
  `aria-expanded` and `aria-controls`; it retains focus when toggled.
- Upcoming cards appear only after expansion. They are articles with a visible
  unavailable badge, `aria-disabled="true"`, an accessible name including that
  badge, and `tabindex="0"`. They have no action, link or activation handler.
- Language changes translate existing gallery nodes, preserving focus and expanded
  state. Existing user edits in the editor are never translated or overwritten.
- Selection passes only a public allowlisted example ID in the creation URL.
  The editor consumes and removes it once, prefills the active-language request,
  focuses the input, adds an associated customization instruction and Cancel link.
  Upcoming IDs, unknown IDs and edit routes cannot prefill. Existing nonempty
  drafts take precedence. Cancel clears the draft and returns to Home; existing
  pagehide/account-epoch cleanup still applies.
- Catalog entries are presentation data, not Watch model objects. The gallery has
  no storage, network, monitoring, authentication or notification dependency.
  Existing auth and persistence code still controls normal explicit submission.

## Files

| File | Change |
| --- | --- |
| `index.html` | Home-only gallery host, after real content |
| `src/js/example-gallery.js` | Read-only catalog IDs, accessible rendering, one-time prefill |
| `src/js/navigation.js` | Render gallery using existing real-Watch presence calculation |
| `src/js/main.js` | Prefill before authenticated form initialization; focus after reveal |
| `src/js/guest-editor.js` | Apply prefill to the existing in-memory guest editor before capturing its route |
| `src/locales/en.json`, `src/locales/fr.json` | Exact requests/UI copy and translated titles |
| `src/scss/pages/_home.scss` | Responsive gallery and quieter populated variant |
| `src/js/example-gallery.test.js` | DOM, exact text, focus, discard, isolation and no-side-effect regressions |
| `src/js/test-support/example-gallery-browser.mjs` | EN/FR × desktop/mobile synthetic browser matrix |
| `docs/example-watch-gallery.md` | Implementation and verification notes |

## Verification

- Targeted gallery/auth/OTP/editor-account/report-account tests: 79 passed.
- Complete `npm test`: 987 passed, zero skipped.
- Production-mode Vite build: `npm run build`.
- JavaScript syntax, `git diff --check`, and added-content secret/PII pattern scans.
- Browser matrix uses the existing local synthetic auth adapter and intercepts
  external traffic and Watch APIs. It checks empty/populated Home, all six
  prefills, EN/FR, 1280px/390px, keyboard focus, expansion, inactive cards, cancel,
  guest auth/back draft preservation, no examples on All Watches, zero API
  mutations/monitoring/email calls, and no page/console errors.
- Existing startup/onboarding and OTP browser scenarios supplement the gallery
  matrix. These use synthetic accounts; no real OTP email is sent.

Reproduce the gallery browser matrix with the existing local harness:

```sh
node src/js/test-support/account-isolation-preview.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BROWSER_EXECUTABLE=/path/to/chromium node src/js/test-support/example-gallery-browser.mjs
```

No backend, Supabase, email, cron, production configuration or business-data files
are changed. Browser checks deliberately do not create a real Watch.

## David's short manual checklist

- Open Preview in FR and EN, on mobile and desktop; inspect Home with zero and
  existing Watches and confirm real content stays first.
- Choose an active example: check exact request, focus and bracket instruction;
  edit then Cancel and confirm no Watch was created.
- As a guest, continue to the usual authentication prompt, then return to editing;
  verify the personalized draft is preserved (no need to send an email).
- Expand examples using the keyboard: confirm the unavailable cards announce their
  badge, do nothing on Enter/Space/click, and leave real counters/All Watches unchanged.
