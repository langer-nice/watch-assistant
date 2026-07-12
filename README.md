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
- `watches.html` — list of all watch items
- `watch-detail.html` — watch detail and action page
- `new-watch.html` — new watch submission page
- `follow-story.html` — follow story workflow page
- `src/js/` — small vanilla JavaScript modules
- `src/scss/` — SCSS partials and main stylesheet
- `src/scss/main.scss` — imports all SCSS modules
- `public/` — static assets served as-is

## Design tokens

Design tokens live in `src/scss/tokens/` and are exposed as CSS custom properties in `src/scss/main.scss`.

## Change the primary colour

Open `src/scss/tokens/_colors.scss` and update `--color-primary` and `--color-primary-hover`.
