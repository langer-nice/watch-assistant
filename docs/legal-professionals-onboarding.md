# Legal Professionals onboarding

## Base and scope

Work began on clean `master` at `c061995`. After fetching, the feature branch was
created from `origin/master` at `2d019df9bc4523c2e65b770a00c588d821124bec`.
Open PRs #3 and #6 were unrelated. Branch: `feature/legal-professionals-onboarding`.

The fourth demo uses `flow-3.html?flow=4`. It adds audience copy to the existing
editorial introduction, not a questionnaire. No profiling controls, monitoring
engine, authentication changes, database changes or example Watches are added.

## Audit before editing

General (`flow=1`), Sales & Marketing (`flow=2`) and Coworking Owner (Monaco)
(`flow=3`) all use `flow-3.html`, `src/js/flow-3.js` and `_flow-3.scss`.
All three were rendered through every screen at 1440 × 900 and 390 × 844 before
editing. The shared first-Watch composer was also inspected.

| Order | Existing screen and exact copy | Purpose and interaction |
| --- | --- | --- |
| Gate | “Choose your language”; “English”; “Français” | Appears without valid `lang=en` / `lang=fr`. Selection writes the language into the URL and saved preference. |
| 1 | “Tell us what matters...” / “We’ll watch it for you.”; “See how it works”; “Skip intro” | Dark promise screen. Words animate, then the CTA appears. CTA advances; Skip completes onboarding and opens Home. |
| 2 | “What do you keep checking?”; “Continue” | Light editorial screen. Seven examples reveal in sequence and auto-scroll. Examples are informational, not selected preferences. Continue advances. |
| 3 | “That’s a lot to keep track of.” / “We’ll watch it for you.” / “And let you know when it matters.”; “Create my first Watch”; “Skip for now” | Dark solution screen with progressive reveal. Create marks the first-Watch session and opens `new-watch.html?onboarding=first-watch`. Skip completes onboarding and opens Home. |
| Composer | “What should I keep an eye on?”; “Or paste a URL.”; voice input; “+ Add note”; “Create Watch” | The existing request form handles parsing, clarification, source validation and creation. It has no example-prompt list. Successful first-Watch creation returns to Home with confirmation. |

### Existing examples, in order

| General | Sales & Marketing | Coworking Owner (Monaco) |
| --- | --- | --- |
| When EasyJet releases Christmas flights to London. | A competitor launches a new product. | Changes to Monaco business regulations or employment laws. |
| A property matching your criteria is listed. | Your company is mentioned in the news or on social media. | An office supply or printer consumable is back in stock. |
| Updates to a news story you're following. | A competitor changes their pricing. | A new coworking space opens nearby. |
| An Amazon product drops below your target price. | EasyJet opens Christmas flights to London. | A company announces a new office opening in Monaco. |
| Metallica announces a European tour. | An Amazon product drops below your target price. | EasyJet opens Christmas flights to London. |
| Changes to tax or business regulations. | The euro reaches $1.05 against the US dollar. | The euro reaches $1.05 against the US dollar. |
| A competitor launches a new product. | A concert or event you're interested in is announced. | A concert or event you're interested in is announced. |

French equivalents live alongside the English examples in `onboarding-journeys.js`.
Other shared translations are under `flow3` in the locale files. None are changed.

### Shared behavior and responsive layout

- Audience data and neutral public IDs live in `onboarding-journeys.js`.
  `dashboard.js` renders every card with the same factory. Launch is a relative
  flow URL. Copy Link resolves it against `document.baseURI`, uses the Clipboard
  API (with a textarea fallback), and announces “Copied!” for 1.8 seconds.
- Dashboard grid auto-fits columns with a 20rem minimum and 1.25rem gaps. Adding
  a fourth card retains three columns plus a second row on wide desktop, two
  columns at intermediate widths and one on mobile. Existing dimensions stay intact.
- The introduction has no progress bar and no in-flow Back button. Screen changes
  do not push history. Reload restarts at screen 1 with the audience/language from
  the URL. Browser Back returns to the previous page. Replay intro stores only the
  HTML filename; it already resets to General, and that existing behavior is unchanged.
- Clicking during a reveal completes the current sequence. Reduced-motion mode
  shows the same content without animations. Screen transitions focus the new
  section; existing live regions and language control are reused.
- Desktop uses a centered 480px shell with rounded panels, vertical margins and
  shadows. Mobile fills the viewport. Headings scale responsively. Examples use
  6px square bullets, an independently scrollable middle area, stable scrollbar
  gutter and fixed footer CTA (minimum 56px). Promise/solution content can scroll
  vertically on short screens. No CSS changes are required.

## Template and legal screen mapping

Sales & Marketing is the template because it naturally mixes professional and
personal examples. All three existing audiences actually share this structure.
The legal version keeps its gate, three screens, seven bullets and all buttons.

1. **Promise:** “Keep checking between tasks?” / “Public notices. News. One more source.”
2. **Examples:** “What do you keep checking?” Seven examples cover official property
   company notices, planning/property developments, real-estate regulation, court
   decisions, direct-flight announcements, sporting-event ticket-sale announcements
   and significant company/investment developments. No inventory or price claims.
3. **Solution:** “Important changes can arrive while you’re busy.” / “Tell us what
   to watch.” / “We’ll report meaningful changes, for work or everyday life.”
4. **Existing composer:** `new-watch.html?onboarding=first-watch&flow=4`. Guidance:
   “Describe what you want to know and when it matters. You can also paste a public
   URL.” The accessible inline notice reads: “Watch Assistant monitors publicly
   available information. Do not enter confidential client or case information.”

The new optional configuration remaps only audience-specific translation keys.
The audience travels to the composer in its URL, so refreshing or returning via
browser history retains the notice. English and French are supported. Normal
creation, editing and the three existing first-Watch routes stay unchanged.

## Validation

- Focused DOM tests exercise four cards, all Launch/Copy URLs, the language gate,
  legal screen order and content, safe restart, localized notice, unmodified
  original markup and routes, and absence of automatic Watch creation.
- An integration test submits a legal first-Watch request through the real shared
  form handler with mocked external responses, checks planner → clarification →
  source validation → activation, stored request, empty initial updates and Home
  confirmation. It does not create any account or production data.
- `npm test`, `npm run build`, `node --check` on tracked JavaScript and added
  modules, and `git diff --check` are required validation commands.
- This JavaScript repository configures no separate type checker, lint command,
  credential scanner or personal-data scanner. Existing security/privacy tests
  run as part of the full suite.

### Recorded results

- All **825 tests passed**, with no skipped or failed tests.
- Production build passed; its existing Sass legacy-API deprecation warning remains.
- JavaScript syntax checks and diff whitespace checks passed.
- Before/after rendered comparisons covered all four audiences at 1440 × 900 and
  390 × 844. Legal English/French copy, list scrolling, 6px bullets and 56px CTAs
  were checked. No horizontal overflow was found. The legal list is a little
  longer than Sales & Marketing but retains the identical scroll container.
- Legal Launch, language choice, Copy Link (successful native clipboard write and
  exact URL), all screens, composer, refresh and browser Back passed. Browser Back
  restored the solution screen from its page cache; reload restarted the intro.
- Desktop and mobile browser submissions reached Home's first-Watch confirmation
  using intercepted API fixtures. The public request was preserved, initial
  updates were empty, and local test data was cleared afterward.
- Original audience objects and translations, dashboard and flow HTML/CSS,
  introduction state helpers and Watch creation code were compared directly with
  the base commit and are unchanged. Browser regression checks passed for all three.
- Normal-motion reveal completion, both Skip actions and the 320 × 568 French
  layout also passed.
- No application console errors were observed during the successful flow checks.
  Local submissions logged the expected missing-provider clarification warning
  and used the existing conservative fallback; source/activation responses were
  test fixtures. Live provider coverage remains unverified.

## Manual validation for David

1. Open the preview's `/dashboard.html` on desktop and phone. Check the four cards.
2. On Legal Professionals, press **Copy Link**, check **Copied!**, and paste the
   link into a new tab. It must end in `/flow-3.html?flow=4`.
3. Return to the dashboard and press **Launch** on the same card. Select English.
4. Read screen 1 and press **See how it works**. Clicking during an animation
   completes the reveal first; click the button again if necessary.
5. Read and scroll all seven examples; confirm work, travel, sport and investment
   examples are mixed together. Press **Continue**.
6. Read the solution, then press **Create my first Watch**. Confirm the URL retains
   `onboarding=first-watch&flow=4`, the guidance and confidentiality notice are shown,
   and the normal Watch input is empty.
7. Refresh the composer: the notice must remain. Use browser Back: the legal intro
   must return safely. Refresh the intro: it restarts with the same audience.
8. Switch to French via the globe, including at the composer; check translated copy.
9. To test a real Watch, enter only a public request, such as “Tell me when new
   regulations affecting Monaco real estate are announced.” Submit and follow the
   existing clarification/source-support result. Source support is determined by
   the existing product, not promised by the onboarding examples.
10. Test **Skip intro** and **Skip for now**, then launch General, Sales & Marketing
    and Coworking Owner to confirm their original copy and creation path.

## Product limitations retained

Onboarding examples express monitoring intentions, not guaranteed coverage.
No subscription legal databases, legal advice, confidential processing, live
flight prices, stock quotes or ticket inventory are introduced. The existing
pipeline may ask for clarification or reject a request without a supported public
source. The local environment has no provider credentials; live provider coverage
cannot be established by the mocked integration test.
