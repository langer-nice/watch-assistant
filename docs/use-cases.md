# Use Cases

This document captures real-world reasons people would use Watch Assistant.

The goal is not to define features, but to understand what users want to know without repeatedly checking.

---

## News

- Tell me when a trial reaches a verdict.
- Tell me when a suspect is officially identified in case X.
- Notify me when a government announces a decision.
- Tell me when an investigation has a major development.

## Travel

- Notify me when EasyJet releases Christmas flights.
- Notify me when flight prices fall below my target price.
- Tell me when Eurostar tickets become available.
- Notify me when a visa is approved.

## Shopping

- Notify me when a product is back in stock.
- Tell me when Amazon drops below my target price.
- Notify me when a product is discontinued.

### Local shopping promotions

Allow users to create watches for promotions in nearby physical stores.

Example:

> Remind me when a supermarket near me has a sale on cookware.

Future capabilities may include:

- supermarkets near the user’s location;
- selected retailers only;
- product categories such as cookware, frying pans and kitchen appliances;
- specific brands such as Tefal and Le Creuset;
- minimum discount thresholds;
- weekly catalogues and promotional flyers;
- retailer websites.

Goal: expand Watch Assistant beyond news monitoring into everyday practical life by notifying users when local shopping opportunities match their interests.

## Entertainment

- Notify me when Metallica announces a new tour.
- Notify me when Metallica concert tickets go on sale.
- Tell me when additional concert dates are released.

## Finance

- Show me a morning dashboard summarising multiple stock markets and portfolio performance.
- Alert me when an unusual transaction appears on my bank account.
- Notify me when my account balance falls below a threshold.
- Tell me when a dividend is paid.
- Notify me when a large invoice is overdue.

## Email

- Tell me when an important email requires my attention in Gmail or Outlook.
- Notify me if a client hasn't replied after 7 days.
- Tell me when a specific person emails me.

## Property

- Notify me when a property matching my criteria appears.
- Tell me when the asking price changes.
- Tell me when planning permission is approved.

## Work

- Tell me when GitHub CI fails.
- Notify me when a deployment completes.
- Tell me when a document changes.

## Personal

- Give me a daily briefing showing only what deserves my attention across all connected sources.
- Tell me when registrations open.
- Notify me when passport renewal is required.
- Tell me when tax deadlines are approaching.

---

## Future Ideas

(Add new ideas here before categorising them.)

---

## Product Observations and Open Questions

These notes describe product opportunities and questions, not confirmed features unless stated otherwise.

### Priority 1 — Core Product Intelligence

#### AI-generated Story Fingerprint

- For URL-based watches, AI should analyse the source and generate the tracking definition automatically.
- A Story Fingerprint should identify a story through people, organisations, precise locations, the main event and relationships between entities.
- It should avoid generic standalone keywords such as “Sweden”, “murder” or “violence”, which can match unrelated stories.
- It should recognise the same story across different headlines and wording.
- Open question: should the fingerprint remain hidden, or can the user review and edit it before confirming the watch?

#### AI refinement of user requests

- When a request is long, unclear or awkward, AI could suggest a clearer title or instruction.
- Show the original input alongside the suggestion.
- Let the user choose **Keep my original wording** or **Use the suggested version**.
- The aim is to improve watch titles, lists and notifications without replacing the user’s intent automatically.

#### Importance filtering

- The assistant must judge whether a detected change is important enough to interrupt the user.
- Matching events should not automatically enter the briefing.
- For example, ignore a minor social-profile change but surface an official book announcement.
- Reliable importance filtering is central to preventing notification noise.

#### “Why today?”

- Watch Detail could explain in one sentence why a watch appears in today’s briefing.
- Examples include a newly published flight schedule, release-date announcement, court verdict or price crossing a target.

### Priority 2 — New Watch Flow

#### Voice and unified input

- Add microphone input to the main New Watch field so dictation and typing feel equally supported.
- One intelligent input should accept free text, voice transcription and pasted URLs without requiring a mode selection.
- The application should detect URLs and natural-language requests automatically.

#### URL paste issue

- The prototype does not currently handle pasted URLs correctly; treat this as a high-priority MVP issue.
- Expected flow: detect the URL, analyse the page, generate a title and summary, then generate a Story Fingerprint in a later iteration.

#### Start Watching validation

- Review whether a fixed minimum character count is the right rule for enabling **Start Watching**.
- A future intelligent check could enable submission when it detects a usable intent.

#### Optional reason

- Consider changing **Why are you following this?** from a single-line input to a compact multiline textarea with microphone input.
- Keep it optional and visually secondary.
- Never copy the main request into this field automatically.

### Priority 3 — Home and Briefing

#### Briefing freshness

- Show the last briefing or refresh time as well as the date, for example **Updated at 14:32** or **Tue 14 Jul · 14:32**.
- The timestamp should make the briefing’s freshness explicit.

#### Scannable summary

- Explore a more compact alternative to the current summary sentence.
- A scan-friendly treatment could show counts such as **42 checked**, **1 needs attention**, **2 updated** and **39 unchanged**.

#### Summary and report separation

- Strengthen the visual distinction between the global briefing summary and individual reports.
- Possible treatments include spacing, a divider, a subtle background change or clearer hierarchy.

#### Landing and introduction page

- Consider an introductory page for first-time users and demonstrations.
- Lead with **Tell us what matters. We’ll tell you when it matters.** and support it with **You stop checking. We’ll keep watching.**
- Explain the product in under 15 seconds with five or six examples across categories and a simplified briefing preview.
- Suggested primary action: **Start watching**.

#### Product naming

- The product still needs a name to sit above the existing proposition.
- Open branding task: should the name be descriptive or brand-like?

### Priority 4 — Watch Detail

#### Recommendation prominence

- Explore stronger hierarchy, a small icon or subtle contrast for recommendations.
- Avoid implying urgency unless immediate action is genuinely required.

#### Colour consistency

- Review whether blue links, green categories and red urgency styling make the page feel too multicoloured.
- Consider a more harmonious palette while retaining semantic meaning.

#### Watch management

- Consider a **Manage Watch** section with **Pause watch**, **Resume watch** and **Delete watch**.
- Pause should be more prominent than Delete, and deletion should require confirmation.
- Open question: should deletion also remove watch history?

#### Check now

- Consider an immediate **Check now** action with a temporary **Checking…** state.
- After checking, update **Last checked**, show **No changes** when appropriate, or update the watch when a change is found.
- Open question: is a cooldown needed to manage abuse or API limits?

#### Timestamp terminology

- Keep **Last checked** visible at all times.
- Replace ambiguous **Last updated** wording with **Latest change**, shown only after a meaningful change.
- A new watch might show **Last checked: Today · 14:32**; a changed watch could also show **Latest change: 3 weeks ago**.

#### Why I’m following this

- Show this section only when the user explicitly provides a personal reason.
- Do not repeat the request or invent content; hide the section when empty.

### Priority 5 — Connected Sources and Future Phases

#### Public sources

- The MVP should focus on public sources that do not require personal account access, such as public websites, news, product prices, flight availability, concerts, books and RSS feeds.
- The goal is to prove the core monitoring experience before introducing sensitive integrations.

#### Connected sources

- Later phases could support Gmail, Outlook, Google Calendar, GitHub, Slack, Teams and bank accounts through Open Banking.
- These integrations require permissions, trust and account-connection flows.

#### Guided source connection

- Ask users to connect a source only when a watch needs it; they should not need to understand OAuth, APIs or PSD2.
- Connect each source once and reuse it across watches.
- A future **Connected Sources** page could show services, permissions, dependent watches and disconnect controls.

#### Permission education and trust

- Before requesting sensitive access, explain why it is needed, permitted and restricted actions, provider-managed authentication and revocation.
- Banking explanations should state clearly that access is read-only and cannot move money, make payments or change the account.
- Treat this trust experience as Phase 2 rather than MVP scope.

#### Technical architecture

- Monitoring should run server-side rather than continuously on the user’s phone.
- The device should receive notifications and display results, avoiding unnecessary battery, processor and data use.
- Expected future costs include server-side checks, APIs, AI processing and storage.

## Current Product Phases

### Phase 1 — Prove the idea

Public web sources and a strong watch creation / briefing experience.

### Phase 2 — Connected sources

Personal services requiring permissions and trust flows.

### Phase 3 — Intelligent assistant

A broader assistant that monitors multiple connected sources and decides what deserves attention.
