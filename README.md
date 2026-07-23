# Watch Assistant

A mobile-first prototype for a watch monitoring assistant built with Vite, vanilla HTML, SCSS, and JavaScript.

## Purpose

This project provides the initial frontend foundation for a prototype that can later match a Figma design. It includes example pages for a morning report, watch list, watch detail, new watch creation, and follow story flow.

## Prerequisites

- Node.js 18+ and npm

## Installation

```bash
npm install
```

## Scripts

- `npm run dev` — starts the local Vite development server
- `npm run build` — builds production assets into `dist/`
- `npm run preview` — previews the production build locally

## URL Watch prototype

URL-based Watch suggestions use two development-server endpoints: one reads only
the target page's `<head>` to extract `og:title` or `<title>`, and the other sends
only that title to the OpenAI Responses API. Copy `.env.example` to `.env` and set
`OPENAI_API_KEY` before running `npm run dev` or `npm run preview`. The optional
`OPENAI_MODEL` setting defaults to `gpt-5.6-luna`. Restart the Vite server after
adding or changing these values so the server-side middleware reloads them.

> The HTML files reference the stylesheet as `/src/scss/main.scss` so Vite can compile the SCSS automatically.

## Demo data behavior

The prototype always renders a fixed set of demo watches from `src/js/data/mock-watches.js` plus any watches created locally in the browser.

- Demo watches are always available in a fresh browser.
- User-created watches are stored in `localStorage` only and are private to that browser and origin.
- Duplicate demo watch IDs are filtered out so mock watches never render twice.

### Reset demo data

During development you can reset the local demo state in the browser console:

```js
localStorage.removeItem('watchAssistant.watches')
sessionStorage.clear()
location.reload()
```

The development build also exposes a convenience helper:

```js
window.watchAssistantResetDemo()
```

A visible “Reset demo data” button appears only in development mode, not in production.

## Folder structure

- `index.html` — home / morning report page
- `dashboard.html` — internal selector for audience-specific onboarding journeys
- `flow-*.html` — public onboarding flow entry pages
- `watches.html` — list of all watch items
- `watch-detail.html` — watch detail and action page
- `new-watch.html` — new watch submission page
- `follow-story.html` — follow story workflow page
- `src/js/` — small vanilla JavaScript modules
- `src/scss/` — SCSS partials and main stylesheet
- `src/scss/main.scss` — imports all SCSS modules
- `public/` — static assets served as-is

## Product analytics

The production deployment uses Vercel Web Analytics through the shared
`src/js/analytics.js` helper. Analytics is not loaded on localhost, Vercel preview
deployments, the internal `dashboard.html` route, browsers with Global Privacy
Control or Do Not Track enabled, or browsers that explicitly opt out.

Enable Web Analytics for the Vercel project from its Analytics dashboard before
deploying. Custom product events require a Vercel plan that includes Custom Events;
page-view analytics continues to work without that entitlement.

Open any public page with `?owner=1` once to exclude that browser and device. The
setting is stored as `watchAssistantAnalyticsExcluded=true` in local storage and the
query parameter is removed without a reload. Open a page with `?owner=0` to clear the
setting; analytics resumes on the next page load.

## Onboarding flow language gate

Public onboarding URLs require `?lang=en` or `?lang=fr`. Without a valid language, the shared gate in `src/js/flow-language-gate.js` displays the language-selection screen and does not start the flow.

To add the gate to a future persona flow:

1. Add `data-flow-language-gate` to the page's `<body>` so its onboarding shell stays hidden before JavaScript initializes.
2. Import and await `initializeFlowLanguage()` before attaching flow behavior or starting animations.
3. Add the journey's localized content object to `src/js/onboarding-journeys.js`; the internal selector renders it automatically.

## Design tokens

Design tokens live in `src/scss/tokens/` and are exposed as CSS custom properties in `src/scss/main.scss`.

## Change the primary colour

Open `src/scss/tokens/_colors.scss` and update `--color-primary` and `--color-primary-hover`.
