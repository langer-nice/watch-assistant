# Currency threshold detection: investigation and validation

Investigated 1 October 2026. Fix is based on `origin/master` at `aeb09ef6`.
No production Watch was modified, deleted, checked, or used to send a test notification.

## Confirmed repository cause and request path

The existing engine did not evaluate exchange rates. `discoverTextMonitoringSource`
turned text requests into Google News RSS searches. The manual controller sent only
`sourceUrl` to `/api/check-watch`, which fetched articles. `applyFeedCheckResult`
compared unseen article identities and story concepts; its first successful check
stored a baseline and emitted no updates. It had no exchange-rate provider, exact
rate, currency pair, or numeric threshold decision.

Editing in `completeWatchUpdate` updates the request, title, Story Overview and
text-derived `structuredCriteria` through `updateWatch` and browser account storage.
The old generic price extractor did not recognize “1.17 to the euro” as a currency
condition. Changing these display fields therefore could not turn an RSS check into
a rate comparison. A source unchanged by the edit could also retain its RSS baseline.
The old manual controller applied a response captured before an edit without a
revision check. These are confirmed code defects, not evidence that this particular
production evaluator retained 1.70.

Before this fix, only media mentions/URL stories qualified for the media persistence
adapter; ordinary text thresholds could remain local-only. The existing authenticated
media API, revision protocol, cron and notification outbox now also accept a bounded
currency definition. The internal database type remains `media_news` for compatibility;
`monitoring_source.type = currency` selects the structured rate path instead of RSS.

## Production evidence limits

The original Watch was not unambiguously identified in an authenticated production
record or browser. Vercel's connected project lookup rejected both documented
argument shapes because the connector's `idOrName` and workspace `projectId` schemas
conflicted. Consequently there is no verified record of its 09:41–09:45 UTC check:
provider, precise rate, observation time, retrieval outcome and evaluated threshold
are unknown. No claim is made that the Google headline proves the condition was met,
or that the deployed application is fixed.

A separate, read-only smoke check of the **new** ECB adapter at
`2026-10-01T10:53:39.294Z` returned `0.85463 GBP per EUR`, dated `2026-09-30`.
The shared evaluator explicitly inverted it to approximately `1.170097001041 EUR
per GBP` and evaluated `>= 1.17` as true using exact rational comparison. This was
public-provider validation, not an invocation of the production Watch.

## Behavior and provider policy

- Recognizes bounded GBP/EUR “reaches”, “hits” and `>=` conditions (including the
  reported sentence and French “livre atteint”), in either pair direction. Decimal
  points and commas normalize to the same positive decimal string. Other currencies,
  comparison operators and free-form financial conditions are outside this patch.
- Request text is authoritative. Creation, edit, local model migration and authenticated
  synchronization derive the same normalized base, quote, `gte` operator and target.
  Relevant changes replace a UUID condition revision, clear obsolete evaluations and
  rearm detection. Cosmetic decimal spelling changes do not rearm it.
- Fetches the official [ECB daily XML](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml)
  directly, without an API key or new environment variable. The [ECB documentation](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
  describes daily reference rates, normally published around 16:00 CET on working
  days, excluding TARGET closing days. They are not live market quotes or Google's rate.
- Preserves the provider decimal and observation **date**; ECB's daily feed does not
  give a precise intraday observation timestamp. Retrieval time is recorded separately.
  The UI displays the date, source, pair, observed value, target and outcome. Reciprocal
  displays are truncated to 12 decimal places and marked approximate; comparison uses
  exact integer cross multiplication, never that display value.
- Freshness policy: the latest TARGET publication day is required after 18:00
  Europe/Berlin (two-hour publication grace). Before that, the preceding publication
  day is acceptable. Weekends, New Year, Good Friday, Easter Monday, May Day, Christmas
  and Boxing Day are excluded. Future/invalid dates, missing pairs, malformed/nonpositive
  values, oversized or unsafe XML, timeouts and provider errors fail verification.
- Both manual checks and the existing scheduled runner use `applyCurrencyCheckResult`.
  A satisfied first check creates an update immediately. A false result displays the
  observed rate and target. Failed verification displays an error and does not advance
  the successful Last Checked time.
- One event per condition revision, even after repeated checks or a dip and rebound.
  Historical events remain in history. A relevant edit permits one new event for the
  new condition; old in-flight successes/failures cannot overwrite the edited Watch.
  Server completion uses the existing revision and snapshot compare-and-swap checks.
- Manual checks retain the existing no-email convention. The scheduled runner can
  enqueue one notification per condition, using the existing opt-in media email gate,
  delivery claims and idempotency rules. No live emails are used in tests. Existing
  scheduling remains `0 6 * * *` (06:00 UTC), through the company cron's media runner.

## Validation

**Final results:** `npm test` passed 1,116 tests; `npm run build` passed;
`git diff --check` passed. English and French Chromium flows passed with zero
uncaught page errors; the deliberately injected HTTP 502 is the verification-failure
case. The build emits the pre-existing Sass legacy-JS-API deprecation warning.

`npm test` exercises numeric boundaries (including values that display as 1.17),
first satisfied checks, comma input, inversion, provider failures, freshness,
repeat detection, in-flight edits, the authenticated PostgreSQL persistence path,
manual/scheduled deduplication, cross-device edits, RLS and generic non-currency Watches.
The endpoint test uses the actual middleware and a controlled ECB response.

The PostgreSQL integration uses PGlite and all migrations, with synthetic accounts and
an injected notification processor. It checks the persisted 1.70 → 1.17 edit, exact
1.17 detection, one outbox record, edit rearming, obsolete completion rejection,
hydration and translated email rendering. No real Resend transport is invoked.

Browser validation uses the real Vite UI, synthetic authentication, the actual check
middleware and a controlled ECB XML fixture. It edits 1.70 to 1.17, saves, checks,
asserts displayed rate/source/date/target, repeats without duplicate updates, then
checks below-target and explicit verification-failure displays in English and French.

Reproduce in two terminals (Playwright and a browser must be available):

```sh
node src/js/test-support/currency-browser.mjs
```

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BROWSER_EXECUTABLE=/path/to/chrome node src/js/test-support/currency-browser-check.mjs
TEST_LANGUAGE=fr PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BROWSER_EXECUTABLE=/path/to/chrome node src/js/test-support/currency-browser-check.mjs
```

The harness blocks remote browser traffic and uses no production credentials. It is
not wired into Vite's normal configuration or production API routes. Screenshots go
to `/tmp/currency-ui-en.png` and `/tmp/currency-ui-fr.png`.

## Deployment requirements and existing-Watch verification

Apply `20261001120000_currency_threshold_watches.sql` before deploying the application.
The API selects the new evaluation column; deploying it without the migration would
make media synchronization unavailable. Existing Supabase server configuration and
cron setup remain required. Email still requires the existing media notification
configuration; no currency-specific secret is needed. Neither migration nor app was
deployed during this investigation.

After an authorized deployment:

1. Sign in to the original account and open the original Watch. Confirm its ID and
   request are the intended “The pound reaches 1.17 to the euro”. Keep that Watch.
2. Reload to migrate the browser model. Confirm Story Overview states **1 GBP ≥ 1.17
   EUR**, using the daily ECB reference rate. If the Watch is local-only, select the
   existing **Sync this Watch** action and wait for the saved confirmation to enable
   scheduling; a manual check remains possible locally.
3. Click **Check now**. Inspect the `/api/check-watch` response: the request must carry
   `currencyRequest`, criteria must be GBP/EUR, `gte`, `1.17`, and observation must
   contain the exact ECB EUR/GBP decimal and date plus separate `checkedAt`.
4. Verify the displayed result against that exact response, explicitly inverting the
   provider quote. Below 1.17 must show “Target not reached”; equal/above must show
   “Target reached”. An unavailable or unacceptable stale rate must show a check failure.
   Do not infer the answer from Google's rounded headline.
5. Repeat Check now and reload. The condition must have one update, not duplicates.
   Leave the original request intact. Use an isolated fixture for threshold-edit and
   failure testing rather than altering the production reproduction unnecessarily.
6. If automatic monitoring/email is enabled, let its normal scheduled run occur.
   Confirm at most one notification for this condition revision. Do not manually
   trigger the production cron or a test email solely for validation.
