# Currency display localization

Display-only follow-up to PR #47; no database migration or monitoring change.

## Confirmed causes and saved data

The PR #47 manual path saves English sourceTitle/summary strings plus structured evaluation under updates[].rawMonitoringResult.currencyEvaluation. Snapshots and monitoringUpdates also retain evaluation fields. Normalized updates previously discarded a top-level currencyEvaluation. Remote hydration projects last_change_* prose and the current currency_evaluation, without event-specific historical evaluations.

Cards, the journey timeline and update history displayed saved prose directly. The current-result panel already used currencySummary, but that helper displayed twelve-place dot decimals and ISO dates. Text Watches can put the original request in storyProfile.storySummary, then present it under Story overview. Equivalent source title/description strings with whitespace/case differences could be repeated.

A production READ ONLY inspection found the cited media Watch definition contained request/category/inputType/mediaMention and no monitoringSummary. At inspection there were no non-null server currency_evaluation values, so the user's local currency event was not directly inspected. Compatibility fixtures use the actual PR #47 serialized shape from its persistence/normalization code and preserve its original English prose. No production rows, sessions or Watch operations were changed.

## Rendering and limits

Locale catalog messages render the structured currency event at display time. Four decimal places are the default; extra precision is used where rounding would contradict the decision. Persisted observations, exact comparison, IDs and deduplication are unchanged. Observation dates are formatted in UTC; history metadata explicitly labels detection time. The overview states that ECB rates are daily references, not live quotes.

An event can use its own structured evaluation, matching snapshot/monitoring data, or the current evaluation only when its check time exactly matches the event's detection time. A later observation must never be substituted for an older event. Legacy events with only prose remain readable in their original language; no arbitrary article parsing or historical data fabrication is used. Original instructions and publisher headlines/excerpts are not translated or rewritten. Existing cached generated-summary translations are used where they correspond to the displayed summary. Language switching does not enqueue currency copy translation.

## Validation

- 1,122 automated tests pass with external network blocked, including exact currency comparison, event/notification deduplication, authenticated persistence, migration and legacy-event display tests.
- Production build and diff check pass (existing Sass warning).
- Local Chrome: FR/EN list, current result, journey and update history; language switching; below-target reciprocal 1.1699998 versus 1.17; original instruction labels; unchanged publisher headline and nonredundant description.
- Fixture diagnostic confirms Watch storage unchanged across language switching. No monitoring, mutation or translation API call attempted in the controlled preview.

Reproduce: `node src/js/test-support/currency-display-preview.mjs`, then open `http://127.0.0.1:5198/watches.html`. This server uses synthetic auth, blocks all API operations except empty list reads, and rejects external fetches. It is not part of production configuration.

After eventual deployment: switch FR/EN while viewing an existing currency Watch in the list and detail/history; confirm localized numbers and observation dates without clicking Check now. Verify the original instruction label, unchanged source headline/excerpt, and no duplicate description. A prose-only old event may remain in its saved language.
