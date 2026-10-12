# Solution B Step 4 — opt-in review and secure confirmation

Implementation only. No hosted configuration, deployment, migration, existing
Watch conversion, real AI call, source check, cron invocation or notification
was performed. Scheduled behavior and SQL migrations are unchanged.

## Access and opt-in

The server gate requires **both** `STRUCTURED_WATCH_CREATION_ENABLED=true` and
`STRUCTURED_WATCH_BACKEND_ENABLED=true`, plus a verified Supabase user ID in the
server-only comma-separated `STRUCTURED_WATCH_TEST_USER_IDS` allowlist. All are
unset/disabled by default. `VERCEL_ENV=production` always rejects this flow,
including allowlisted users. Production requires a separately reviewed release.
No public URL parameter, client build flag, checkbox or localStorage setting grants
access. Do not set these flags in hosted environments without separate approval.
Keep the dedicated Step 2 signing secret server-only; no credential fallback.

`GET /api/structured-watches` returns only eligibility after independent verified
user authentication and allowlist authorization. A checkbox appears only for an
eligible account and starts unchecked. Errors or unavailable eligibility leave the
existing creation route unchanged. Every issue/confirm operation repeats the
server check. The existing `/api/plan-watch?mode=interpretation.v1` endpoint now
requires the same gate/authentication before its AI call. Its legacy route remains
unchanged. The gated structured endpoint is mounted in Vercel API and local Vite;
mounting does not enable it. Mounted routes accept Media/News creation only, not updates to
already-persisted definitions; the generic Step 2 backend remains reusable internally.

## Natural input and faithful review

Authorized users may select the opt-in and submit ordinary English/French text,
including `Keep me updated on Jannik Sinner.` or
`Tiens-moi informé des actualités de Jannik Sinner.`, and Gucci equivalents.
The structured branch runs before legacy request parsing or inference. It uses one
interpretation call and deterministic assessment/compilation; supported definitions
are independently revalidated by the issuance server. No Watch exists yet.

The review displays the server-issued approved definition: literal subjects and
all-subject same-article relationships, required topics, optional coverage topics
explicitly labelled as non-filters, exclusions, approved aliases, recurrence when
explicit, original request/language and source limitations. Proper names remain
unchanged, including Dolce & Gabbana. The source remains **GB:en**, regardless of
interface or request language. Matching is literal in titles/excerpts, limited to
20 feed results and non-exhaustive; no comprehensive or real-time promise is made.

Supported examples: one person, one brand, existing identity aliases and approved
same-article co-occurrence/topic/exclusion criteria. Independent OR, open-group
membership and semantic events show specific limitations, with no narrowing or
legacy fallback. Ambiguities show the interpretation's targeted question; users
revise the original text rather than select an invented interpretation. Currency
and official-company structured creation are not offered by this UI. No new
capability, adapter or general persisted-definition editing is introduced.

All new controls, review text, limitations, errors and paused confirmation have
English/French copy. User/model text is inserted with `textContent`, never HTML.
Existing review styles are shared, with wrapping for narrow screens and inline
accessible error feedback.

## Confirmation and state

Issuance binds owner, immutable reviewed definition/source, title, Watch ID,
mutation ID, operation and revision. The token remains only in memory: it is never
stored in a Watch, localStorage, URL, analytics, or logs. Confirmation needs a
separate explicit click and no AI call. The server independently authenticates,
checks access, validates/recompiles, verifies signature/expiry/bindings and invokes
only the existing service-role atomic persistence RPC. No RLS or SQL guard is
weakened and no new migration is required.

Editing, cancelling, language/account changes or editor invalidation discard the
review/plan/token. Changed input requires another interpretation and fresh review;
even input changed and restored while interpretation is pending invalidates that
response. No stale callback can save an edited review. During confirmation,
edit/cancel and repeated confirm clicks are blocked. A recoverable lost response
can be retried explicitly with the **same** Watch/mutation identity and token;
existing durable receipts prevent duplicates. There is no automatic retry.

Successful persistence is accepted only for the authenticated owner's expected
Watch/mutation and paused receipt. The UI says the Watch is saved paused, monitoring
is inactive and no automatic notifications are sent. Opening detail reloads the
server-backed Watch; paused structured creation state has dedicated localized copy,
including after a manual check. No first source check or activation is invoked.
Existing stored definitions remain read-only under the prior protection.

## Verification, remaining prerequisites and rollout

125 focused tests pass, covering gated/default/Production/direct access, verified
allowlist access, EN/FR person/brand review, proper names, conditions/limitations,
clarification, cancellation, stale edits/language/owner, pending-click protection,
AI failure, expiry/tampering/owner binding, mutation recovery, real form integration,
paused saves and no provider checks. The existing confirmation tests exercise
isolated PostgreSQL persistence and rollback with synthetic data. Legacy currency
form/recurrence, company creation, aliases and media query contracts remain covered.
One local build passed. No full suite or browser automation was run.

Ready for **separately approved isolated staging validation**, after approved
application of Steps 1–3's ordered database migrations and server configuration of
the signing secret, test-user allowlist and disabled-by-default gates. No hosted
migration/configuration or enabling is authorized by this implementation. Monitoring
activation and email delivery remain disabled and need separate lifecycle approval.
Rollback disables new creation/issuance while retaining versioned readers and
completion support for persisted definitions. Legacy retirement remains deferred.

## Changed files

- Access/API: `server/structured-creation-access.js`, `server/structured-watch-api.js`,
  `server/plan-watch-api.js`, `api/structured-watches.js`, `vite.config.js`.
- UI/state: `src/js/structured-watch-creation.js`, `src/js/main.js`,
  `src/js/navigation.js`, `src/js/watch-creation-state.js`,
  `src/locales/en.json`, `src/locales/fr.json`, `src/scss/components/_url-review.scss`.
- New tests: `server/structured-creation-access.test.js`,
  `src/js/structured-watch-creation.test.js`, `src/js/structured-creation-form.test.js`.
- Updated gate-dependent tests: `server/structured-watch-api.test.js`,
  `server/structured-watch-persistence.test.js`, `server/watch-interpreter.test.js`.
- Docs: this file, `docs/structured-watch-authorization-v1.md`,
  `docs/structured-media-execution-v1.md`.
