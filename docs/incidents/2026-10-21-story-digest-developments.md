# Source-grounded story developments in Staging digests

The previous fix retained source excerpts but still made the reader identify the change. This correction adds a concise “What changed — as reported” / “Ce qui a changé — selon les sources” section for supported, explicitly reported story events. Scope: the existing gated Staging legacy digest worker only. Production, Structured, Home, monitoring/discovery/date filtering, capture, baselines, notification records, consent and cron tasks are unchanged.

## Real Limoges demonstration, not a resend

The four actual October 21 digest members remain in `server/test-support/fixtures/limoges-digest-20261021.json`. The original monitored story contains Limoges and the city-hall fire. The Le Monde-headed feed item contains the exact source excerpt “Un homme soupçonné d'être impliqué dans l'incendie de l'hôtel de ville de Limoges le 17 octobre interpellé en Haute-Vienne”. The full excerpt also attributes this arrest headline to franceinfo. No separate franceinfo link or publication time is invented: the captured article title, Google News link, publisher metadata and full excerpt are retained. The actual sent email remains unchanged; its title-only omission was established in the previous incident report.

Running the new extractor against those real four articles and the existing October 18 initial baseline yields one statement:

- French: **Un suspect a été interpellé.**
- English: **A suspect was arrested.**

The original Watch title supplies story context. The statement appears before the original article heading, supporting exact quotation and links. It makes no claim about custody, charges, guilt, identity, motives or when the arrest occurred. Publication date remains article metadata, never an inferred event date.

Local demonstrations (HTML files only, no provider submission):

- [French](../evidence/limoges-story-development-fr.html)
- [English](../evidence/limoges-story-development-en.html)

## Small reusable boundary

The local extractor recognizes explicit singular-person arrest/release frames and explicitly named reopening/closure/resignation frames in French/English. Proper names stay unchanged; finite action wording is translated through fixed templates. It uses the existing story-relevance matcher on the same evidence span, not just on a surrounding roundup. Speculation, negation, denial, questions, future/desired actions and ambiguous frames fall back to sourced articles. This is deliberately not a general semantic event classifier. Unrecognized developments retain the existing article/excerpt presentation.

Before rendering a claimed story digest, read-only owner-and-Watch-scoped queries obtain the stored original story, initial baseline articles and up to 100 previously sent notification articles. No schema or record writes are added. Missing/incomplete history (including more than 100 sent articles) falls back to excerpts rather than claiming novelty. Previously known actor/action frames do not become a new development just because an article has a new publisher or title. Anonymous actor identity is treated conservatively: “person” and “suspect” cannot create separate new arrests. A potentially distinct event without adequate identity evidence remains article-only.

Exact equivalent evidence is grouped into one development with every original source link. Different anonymous arrest reports are not merged without proof; ambiguous same-action groups fall back instead of producing duplicate development statements. Existing article notifications are neither suppressed nor rewritten. The daily digest still describes the number of newly captured articles, which is distinct from its new-development section. The existing send idempotency, begin/finish boundary and morning window remain unchanged.

No AI transport, credential, API call or new service is included in this implementation. Automatic approval review rejected a proposed live paid AI demonstration; that command did not execute. It was replaced with the local extractor, and no paid call or indirect AI execution was made.

## Focused verification

`NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' node --no-maglev --test server/story-digest-developments.test.js`

Seven tests pass with all external networking blocked: real Limoges bilingual statement and source retention; unrelated/speculative/denied/negated/questioned/unsupported fallback; exact duplicate grouping and ambiguous distinct-report fallback; previously known/reworded arrest suppression; other-story bridge reopening and English input; owner-scoped context reads and incomplete-history fallback; integration with the existing Staging worker and fake sender, with Production rejected. Previous interpretation, monitoring, scheduler and delivery suites were not rerun. No real emails or fake hosted events were created.

Single authorized Staging deployment: pending.
