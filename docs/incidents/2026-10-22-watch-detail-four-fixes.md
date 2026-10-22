# Four targeted Watch Detail corrections — Staging

Base: `099274a`. No migration, Watch mutation, real check, email, scheduler change or paid AI request used.

## Check Now evidence and cause

The supplied Real Madrid screenshot shows a recent successful-check timestamp while the UI remains Checking. The old handler called `refreshLatestReport` before clearing `detailCheckInProgress`. A deterministic local reproduction with an existing manual report and a paused Structured Watch makes this refresh throw `A complete valid report is required` (the report normalizer excludes the paused classification). That exception bypassed the old reset and render. The handler now resets loading first, isolates a report-refresh exception and renders the actual check outcome. Report generation/normalization is not changed.

Read-only runtime logs were inspected for the deployed Preview `dpl_3AB6dgdvHGaFSi1HtbW85y8XtQFn`. The returned window contained successful list reads but did not establish the historical POST/client exception. The cleanup defect is reproduced locally; those logs do not prove the precise exception in the user's earlier browser session.

A second request-lifecycle gap was bounded: legacy feed requests and waiting for stored-Watch synchronization could remain unsettled. Only the Watch Detail Check Now call now opts into a 30-second deadline. It aborts the HTTP request where active, prevents a check POST from starting after an expired synchronization wait, releases single-flight, records an unconfirmed timeout as failure and discards a late response before local result persistence. Normal server completion and notification capture remain untouched. There is no automatic retry. The shared controller's default remains unbounded as before, so Home/manual report generation is not given this new deadline.

## Presentation

Known next-check/interval metadata remains visible. Missing metadata rows are hidden while the independently derived health status stays visible; genuine failures are not replaced by a reassuring status. Consent OFF still overrides frequency. The internal `daily_digest` mode is unchanged; labels are “Morning report · 08:15 Europe/Paris” and “Rapport du matin · 08 h 15, heure de Paris”. The existing settings anchor has a decorative downward SVG using the existing inline icon convention; its target and keyboard behavior remain.

## Focused validation

23 tests passed: success/failure, actual request abort, timeout, duplicate clicks, late-response fencing, usable subsequent check, cleanup despite report failure, known/unknown schedule metadata, consent, exact EN/FR wording, decorative icon and anchor, and existing detail lifecycle. Vite build passed. Local presentation checked at 1024×900 and 390×844 without horizontal overflow. No broad backend suite or real monitoring was run.
