# Use Cases

This document captures real-world reasons people would use Watch Assistant.

The goal is not to define features, but to understand what users want to know without repeatedly checking.

---
# Notify me when the euro reaches 1.05 US dollars (EUR/USD ≥ 1.05).
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
===============================
===============================
===============================

EDIT BUTTON ON DETAILS PAGZ 


## Product Observations and Open Questions

These notes describe product opportunities and questions, not confirmed features unless stated otherwise.

### Product positioning

Watch Assistant is not just a monitoring tool. Its value is reducing mental load: users tell it once, then stop thinking about it. The assistant remembers, watches and checks on their behalf, closing the open mental loops that otherwise demand repeated attention.

The distinction under exploration is:

> A reminder tells you to do something.
>
> Watch Assistant checks for you.

Messaging explorations include:

- Tell us what matters. We'll tell you when it matters.
- Tell us once. We'll take it from there.
- Tell us once. Then forget about it.
- You don't need to remember to remember.
- We'll keep watching. You don't have to.
- One less thing to think about.

These are positioning explorations, not a final tagline.

### Demo and research guidance

#### Questions after demos

- **What's the first thing you'd ask it to watch for?** Reveals the user's natural use case without constraining them to the examples shown.
- **Can you imagine yourself using this? Why or why not?** Tests personal relevance and surfaces the motivations, doubts or trust barriers behind the answer.
- **Do you know anything that already solves this problem?** Identifies competitors, substitutes and the user's existing mental model for the product.

#### Preferred demo watches

Use these current preferred examples:

- EasyJet Christmas flights;
- Stranger Things Season 6;
- Nice apartment under €350,000.

Together they demonstrate breadth across travel, entertainment and property. Avoid niche technical examples in demos; familiar, varied examples make the product's value easier to understand.

### Priority 1 — Core Product Intelligence

#### AI-generated Story Fingerprint

- For URL-based watches, AI should analyse the source and generate the tracking definition automatically.
- URL import should progressively extract the article title, create a meaningful monitoring title and generate a monitoring summary. Later, it should also generate the Story Fingerprint and keywords.
- A watch title should never simply be the source's domain name.
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

#### Introduction

The introduction should explain the product in under 30 seconds, demonstrate its breadth, inspire users with examples and reduce the blank-page problem. Examples shown in the introduction and in **New Watch** should stay aligned so the product presents one coherent set of possibilities.

#### Voice and unified input
- The application should detect URLs and natural-language requests automatically.


#### Start Watching validation

- Review whether a fixed minimum character count is the right rule for enabling **Start Watching**.
- A future intelligent check could enable submission when it detects a usable intent.

#### Optional reason

- Consider changing **Why are you following this?** from a single-line input to a compact multiline textarea with microphone input.
- Keep it optional and visually secondary.
- Never copy the main request into this field automatically.

### Priority 3 — Home and Briefing

#### Homepage as briefing

The homepage is a briefing, not a dashboard or notification feed. The assistant reports what happened while the user was away, presenting completed work rather than a queue of alerts.

The current wording direction is:

> I completed XX watch checks while you were away.

#### New watch acknowledgement

- A newly created watch should receive a highly visible acknowledgement so creation feels rewarding.
- Use a temporary highlight and **NEW** badge, then let the watch fade naturally into the briefing.
- After the temporary treatment fades, editorial separators should preserve structure without making the item feel permanently exceptional.


#### Scannable summary

- Explore a more compact alternative to the current summary sentence.
- A scan-friendly treatment could show counts such as **42 checked**, **1 needs attention**, **2 updated** and **39 unchanged**.

#### Summary and report separation

- Strengthen the visual distinction between the global briefing summary and individual reports.
- Possible treatments include spacing, a divider, a subtle background change or clearer hierarchy.


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

## Open Questions

- Is **You don't need to remember to remember.** strong enough to become a campaign line?
- Should the product be described as the evolution of reminders?
- Is there a better metaphor than reminders or to-do lists?
- How much of the monitoring process should be visible to users?
- Should Story Fingerprints eventually become visible or remain an internal concept?

## Product Positioning Experiments

These are product observations and future experiments to validate during demos and user testing, not product decisions or requirements.

### Persona-specific introductions

Current onboarding is generic. Explore multiple entry points that lead to the same product but begin with introductions tailored to different audiences.

Possible personas include:

- Monaco freelancers and business owners;
- journalists;
- frequent travellers;
- property buyers;
- sports fans;
- music fans;
- investors.

Each introduction could:

- start with a problem that the audience repeatedly checks;
- demonstrate one or two relevant examples;
- end on the same Home dashboard.

The product would remain identical; only the introduction would change.

Example prompts to test:

- **Freelancer:** “How often do you check for tax or regulatory changes?”
- **Journalist:** “Which stories do you check several times a day?”
- **Traveller:** “Still refreshing airline websites waiting for Christmas flights?”

The objective is to make users immediately think: “This is for me.”

### Demo launcher

Explore a small internal page for demonstrations. This would be a demonstration tool only, not part of the public product.

It could allow the demonstrator to:

- choose a persona;
- launch the corresponding introduction;
- optionally preload relevant example watches;
- generate a shareable URL.

Possible demo personas include:

- coworking owner;
- journalist;
- traveller;
- property search;
- concerts;
- investor.

### Focus on repetitive behaviours

Future interviews should focus less on features and more on discovering repetitive checking behaviours.

Instead of asking:

> “Would you use this?”

Ask:

> “What do you repeatedly check because you’re afraid something has changed?”

The hypothesis is that these repeated behaviours are likely to become the strongest Watch use cases.

### App vs Web

Explore whether the first version should remain a web application rather than becoming a native mobile app. One observation to validate is that many people say they do not want another app on their phone.

Questions to investigate:

- Is a PWA sufficient?
- Can notifications still provide the required experience?
- Does removing installation reduce adoption friction?

No decision has been made.

## Naming Exploration

These observations and questions are inputs for future branding work, not naming recommendations or decisions.

### “Watch” as the product object

The current observation is that **Watch** feels like the correct word for the object users create. Examples include:

- Create a Watch;
- Pause Watch;
- Delete Watch;
- Watch updated.

The noun **Watch** should probably remain in the product vocabulary even if the application name changes. This is a hypothesis to test rather than a settled requirement.

### Questions around the application name

**Watch Assistant** may not immediately communicate the product. Some people may associate “watch” with watches or clocks rather than monitoring.

Explore alternatives while preserving the concept of a Watch. Ideas discussed include:

- Watch;
- Watchr;
- Watcher;
- Watch’r;
- Watch TFM.

There is no recommendation yet.

### Watch TFM

**TFM** could mean **This For Me**, making **Watch TFM** shorthand for **Watch This For Me**. The idea is interesting because it expresses delegation rather than notification.

Open questions:

- Should TFM be explained?
- Should “Watch this for me” become a slogan instead of the product name?
- Does the acronym create unnecessary friction?

No decision has been made.

### Preserve the word “Watch”

One observation became stronger during discussion: the product vocabulary may be more important than the application name.

The goal is for users to naturally say things such as:

- “I created a Watch.”
- “I have ten Watches.”
- “This Watch was updated.”

Future user interviews should test whether this language feels natural and whether users adopt it without prompting.


# ======================
# Onboarding 

👩‍💼 Sales & Marketing

Que vérifiez-vous sans arrêt ?

Les lancements de produits de vos concurrents.
Les mentions de votre entreprise dans la presse ou sur les réseaux.
Les nouveaux appels d'offres dans votre secteur.
Les changements de prix chez vos concurrents.
Les nouvelles campagnes marketing d'une marque.
Les offres d'emploi publiées par vos concurrents.
Les nouvelles tendances de votre marché.

👨‍💻 Développeur
Que vérifiez-vous sans arrêt ?

Une nouvelle version de React, Angular ou Vue.
Une CVE critique concernant une technologie que vous utilisez.
Un nouveau dépôt GitHub intéressant.
Une API qui change.
Une bibliothèque qui passe en version stable.
Les annonces d'OpenAI, Anthropic ou Google AI.
Les discussions Reddit sur votre stack.

📈 Investisseur
L'action Tesla passe sous 250 $.
L'euro atteint 1,05 $.
La BCE modifie ses taux.
Berkshire Hathaway publie ses résultats.
Nvidia annonce ses résultats trimestriels.
Une entreprise entre en procédure de rachat.
Le Bitcoin dépasse un seuil.

🏡 Immobilier
Un bien correspondant à vos critères est mis en vente.
Une baisse de prix sur un bien suivi.
Un nouveau programme immobilier est annoncé.
Une commune modifie son PLU.
Les taux immobiliers évoluent.
Une enchère immobilière est publiée.
Une nouvelle réglementation locative.

✈️ Voyage
EasyJet ouvre les vols de Noël.
Les billets passent sous 150 €.
Une nouvelle ligne Nice–Tokyo est annoncée.
Les formalités d'un pays changent.
Une grève est annoncée.
Une promotion Air France apparaît.
Un hôtel baisse de prix.

Parent
L'école publie une information importante.
Les inscriptions aux activités ouvrent.
Une place se libère dans une activité.
Les résultats d'examen sont publiés.
Une alerte météo concerne l'école.