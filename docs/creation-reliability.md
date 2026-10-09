# Durable creation contract — isolated verification, 8 October 2026

Status: local fix and real local end-to-end verification, **not a release approval**.
Branch: `codex/creation-durable-contract`, based on PR #52 head
`889606fa0a1bbc31498dd040ff8fbca49a638e1b`, which includes PR #53
`d4c184b0b39ffc12b12dc86a2fa6f29e995171e5`.
Neither held branch was edited or pushed. Production alias was independently inspected
at 13:43 UTC: deployment `dpl_CCkhH1wuCA74h3AB2FwgEMQc2Hto`, master
`057cabcc16c50dc251b30c281929bc5ae9fd079e`.

## Changes relative to the dependent base

The base already rejects unsupported media definitions, normalizes currency before
validation, requires `ensureMediaWatchSaved()` before media activation, and retains
failed media creations. This change keeps those gates and the explicit legacy recovery
flow; it does not broaden generic monitoring capabilities or recover existing data.

Additional gaps fixed:

- Creation completion previously continued to success tracking/navigation after a
  caught save/check failure. Confirmation, Home and list classification now distinguish
  local-only, persisted/pending, failed and active states. A readable source is not proof
  of eligibility. Existing Home time filtering and report counts are retained.
- A completed local journal alone previously counted as saved. A confirmed, nondeleted
  server row is now also required. Pending mutations and conflicts retain their existing
  protections and recovery actions.
- Server hydration now carries `monitoring_state`, replacing an obsolete local
  `needs-attention` state after a successful server retry. The local test exposed this
  otherwise contradictory notice after a recovered check.
- Company creation sends and verifies the client UUID. Retries with the same owner,
  SIREN and UUID return the existing record, including an insert-race response; a
  different creation remains an explicit duplicate. Initial baseline persistence
  failure retains the durable attempt and records failure instead of deleting it.
  The editor keeps the attempt UUID for a repeated submission of the same request.
- Detail notices distinguish saved-but-unchecked and failed checks without hiding
  existing email configuration notices. Local timeline entries say the request was
  saved on this device instead of implying a confirmed Watch creation.
- Real local Auth needs HTTP loopback. An explicit development-only opt-in allows
  only loopback HTTP; deployed preview/production and non-loopback HTTP remain
  rejected. Auth verification and owner RLS are not bypassed.

Media/currency validation uses the existing shared `mediaWatchDefinition` and query
validators at creation, serialization and API acceptance. Company creation retains
SIREN validation and owner-scoped repository acceptance. No migration is added.

## Actual isolated environment

- Dedicated Docker project `wa-creation-auth-lab`, directory `/tmp/wa-creation-auth-lab`.
- Supabase CLI 2.120.0, real GoTrue, PostgREST, PostgreSQL 17, Kong, Mailpit.
- Browser/app/API: `http://127.0.0.1:5199`; Auth/PostgREST: `http://127.0.0.1:54321`;
  database port 54322; capture UI 54324. The HTTP API uses the verified Auth JWT and
  public key, not service-role access. Independent SQL reads use the local container.
- All 14 branch migration files were applied in filename order to an **empty local**
  database. This is not a plan to replay migrations on staging or production.
- `public.watches` RLS enabled; `cron.job` absent; no app scheduler runs. The local
  fault harness rejects `/api/cron/*`. Both notification flags are `false`; no Resend
  key is configured. GoTrue SMTP points at the local Mailpit container.
- Local `.env` is ignored, private and not included in Git. No production backup,
  tester record or remote Supabase database was used.

For reproduction, initialize a separate Supabase project with the ports above, disable
Studio/storage/realtime/edge runtime/analytics, and set Auth `site_url` to the app origin.
Use local Mailpit (default inbucket service) and an OTP template containing
`Your code: {{ .Token }}` for confirmation and magic-link email. Apply the branch schema
only to the new empty database, with stop-on-error enabled. Obtain local keys privately
from `supabase status -o json`, never paste them into a report.

The ignored app `.env` needs local `SUPABASE_URL`, `SUPABASE_ANON_KEY`, matching
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_LOCAL_TEST=true`,
`VITE_SUPABASE_LOCAL_TEST=true`, `VITE_AUTH_MODE=otp`, `NODE_ENV=development`, and both
notification flags `false`. No `VERCEL_ENV` or notification transport key.

Run `node node_modules/vite/bin/vite.js --config scripts/creation-lab.config.mjs` from
the isolated checkout. `/tmp/wa-creation-fault` is empty during normal operation;
explicit test modes are `reject-save`, `lose-save-response`, and `reject-check`.
This optional harness is not imported by the deployed app or its build configuration.
`node scripts/verify-creation-local.mjs` tests real local Auth/API/RLS independently of
the browser run. It uses `.test` addresses, captures OTP privately, verifies invalid
OTP rejection, obtains a new independent session, and exercises cross-account denial.

## Observed browser evidence (not mocked Auth or database)

Local synthetic account owner: `0eed3763-3e5b-439f-9a5e-7a0405fc1f27`.
No real person's address was used. Original app context was Codex's browser; second
context was Chrome, initially anonymous, authenticated via its own captured OTP, with
no copied storage or tokens. This is desktop evidence, **not an iPhone retest**.

| Request | Stable ID | Independent SQL and UI outcome |
| --- | --- | --- |
| Tell me when Microsoft is mentioned in the media. | `52ecc5d1-373b-41d9-91cf-49d153152617` | Signed out → original request → actual OTP → review → save → baseline. One owner-matching row, baseline 13:59:18 UTC, Home New, reload and independent Chrome list same ID. |
| Notify me each time GBP > 1.17 EUR. | `bffa8113-d1f3-45b9-9f8e-9199274a6141` | Signed-in form, crossing policy, one owner-matching row, real ECB check at 14:00:02 UTC; 1 GBP ≈ 1.1807 EUR, reference 8 October. Home New, reload and second context same ID, second context shows unread update. |
| Tell me when Tesla is mentioned in the media. | `a24ebd3c-b3aa-4936-b9a2-5a49256540dc` | Failure tests below, then successful baseline at 14:05:53 UTC. One row, same owner/ID through retry, Home, reload and Chrome. |
| Monitor company CEMEX GRANULATS, SIREN 552005969. | `238dad92-e465-478d-a0d2-40d13fec74f1` | Actual company review and create, real BODACC baseline 14:12:09 UTC; one matching-owner row, Home New, reload, independent Chrome same ID. |

Home after these tests: no local report, zero attention, four new items. All Watches
shows the four records separately from examples. Browser checks do not prove scheduled
execution; no scheduler or report generation was needed or invoked in this pass.

The generic requests were explicitly rejected before persistence with the request
retained and an Edit action:

- `Surveiller le développement du concurrent de coworking Example Workspace à New York.`
- `Surveiller les changements de réglementation affectant les espaces de coworking à Monaco.`

These are diagnostic examples, not Aymeric's exact requests. His local records remain
unverified; the general defect is not proof of his individual incident's cause.

Authentication interruption: on an anonymous `localhost` origin, entered the Nvidia
media request, opened sign-in, chose Return to my Watch, and observed the exact request
retained. Retrying sign-in with a real captured OTP restored the Nvidia review. Cancelled
before creating another Watch. This proves same-page interruption/retry, not recovery
of an anonymous draft after closing/reloading the page.

## Controlled failures versus real success

| Scenario | Evidence and result |
| --- | --- |
| Save unavailable | Local middleware 503 on the actual Tesla form POST; independent DB count zero. Request retained, Sync failed / Needs attention / Retry sync. No creation-success banner. |
| Insert committed, response lost | Actual POST completed in PostgreSQL; middleware discarded only the successful HTTP response. UI remained recoverable failure. DB had one Tesla row, revision 1, no check. |
| Retry same mutation | With fault removed, Retry sync confirmed the same ID and revision 1; one row, no duplicate. Remained attention until successful check. |
| Check unavailable after save | Controlled 503; saved row retained, failed check visible, Check now restored. After removing fault, real source check succeeded and server hydration removed stale local failure. |
| Company baseline-persistence failure | Targeted repository test with controlled RPC failure (memory DB); attempt retained, same-ID retry returns it, explicit check establishes baseline. Successful company UI path uses real PostgreSQL. |
| Wrong/invalid OTP | Real local GoTrue rejected invalid OTP; valid captured OTP succeeded. |
| Ownership | Real second account cannot list the first account's row via API or direct PostgREST/RLS; attempted mutation denied. |
| Unknown/unsupported | Browser generic refusal plus real API rejection; no broad-source fallback made active. |

Real integration script passed: Watch `159835b8-d372-41ed-a5ae-237c199ca582`, owner
verified independently, one row/revision on replay, fresh real Auth session retrieval,
cross-account API/RLS denial, unsupported input rejected, zero monitoring notifications.
The script is API integration evidence, distinct from the browser OTP journey above.

Regression coverage includes journal-only false confirmation, pending first check,
failed creation classifications, server reconciliation of stale local failure, company
stable IDs/recoverable activation, and local-only HTTP configuration guards. Existing
PR #52/#53 regression coverage remains intact. Full suite: 1,194 passed, including the server local-HTTP isolation regression. Build and
`git diff --check` passed. Final local audit: both notification tables had zero rows; all eight Mailpit messages
were local Auth OTPs to `.test` recipients. No claimed live currency transition, cron execution, remote
staging validation, mobile validation, or automatic legacy recovery.

## Release and publication constraints

Read-only Vercel project metadata confirmed connected Git integration, production branch
`master`, no explicit Git deployment restriction and no ignored-build command. The
repository has no branch deployment opt-out. A push can automatically create a preview;
therefore no push or draft PR was attempted under the no-deployment instruction.
The local commit is reviewable; publication needs a separately approved no-deployment
path or explicit preview authorization. No deployment settings were changed.

Dependency order remains #53 then #52, followed by review/rebase of this dependent
change. Squash/rebase integration of held PRs requires ancestry/diff reconciliation;
do not merge duplicate histories blindly. Their migration/configuration/release
prerequisites remain, including previously unverified production server association
and effective email settings. This pass does not resolve those production blockers.
No application data repair, local-only Watch recovery or production rollout is implied.

## Review and supervised handoff — 9 October 2026

Reviewed commit `26819bf`; parent `889606f` and ancestry through PR #53 `d4c184b`
confirmed locally. Original test/build logs substantiate the reported 1,194 passes
and build; real Auth/API/RLS evidence is separate from source-assertion tests.

**P1, corrected:** `navigation.js` detail rendering hid Check now for a saved Company
Watch still in `preparing` after baseline failure. `fail_company_watch_check` clears
the check lock and records the error but intentionally leaves that state. The old
`scheduleFirstMonitoringPass` then changed local state based only on elapsed time,
without a successful check. Removed that simulated transition and its creation
countdown fields. Pending/failed saved Watches can explicitly retry; only an actual
in-progress check displays the preparation state. No database migration is needed.

Reproduction: a dedicated local fixture `fc000000-0000-4000-8000-000000000001`, owned
by the existing synthetic account, has `preparing`, null last check and
`DATABASE_ERROR`. With the corrected UI, its detail shows Needs attention, Check
failed, and an enabled Check now. Independent SQL after browser display confirms it
remains preparing/unchecked: displaying it does not activate it. No check was run.
A lifecycle regression covers an expired legacy timer date without changing the
Watch or its attention classification. Existing source-extraction tests only needed
a new renderer boundary after removal of the obsolete function.

After the correction: full suite **1,195 passed**, build and diff checks passed.
This does not replace David's still-pending real journey. No other concrete blocker
was established in the reviewed creation changes. Anonymous draft recovery after
closing/reloading during OTP remains unverified; same-page cancellation/retry was
previously observed. Future scheduled execution and delivery remain untested here.

Laboratory restarted with the existing data. The separate `review-health@example.test`
account passed real OTP capture/verification without creating a Watch. The new
`david-supervised@example.test` account was confirmed absent before handoff. Seven
existing Watches are diagnostic data (including the failed-company fixture), not
David's supervised creation.

Supervised Chrome origin: `http://localhost:5199/new-watch.html`, observed signed out.
Mail capture: `http://127.0.0.1:54324`. Browser and server target local Supabase
`http://127.0.0.1:54321`; both notification flags false, no notification transport
key, no database cron. `/tmp/wa-supervised.config.mjs` adds local-only observation
around the unchanged application middleware: timestamps, route/status, returned
Watch ID/state, and UI request/confirmation/badge/Home IDs. It captures no OTP,
Authorization header, session token or credentials. Evidence stays outside Git at
`/tmp/wa-supervised-evidence.jsonl`; independent read-only SQL observations supplement
it. This instrumentation is not a deployed endpoint and is not application code.

David must enter the request and perform OTP sign-in and final creation himself.
No final Watch or final test account was pre-created. Stop at handoff; coordinate
reload and a separate authenticated context after he signals completion. No push,
merge, deployment, remote migration, held-branch change or tester email is permitted.

### David's actual creation — first observation, 9 October 2026

David confirmed he performed the creation himself. Observed Chrome page and local
instrumentation agree on Watch `fe22544e-ec0a-412e-a134-22f824393824` (Nvidia).
Exact request `Tell me when Nvidia is mentioned in the media` survived the OTP
handoff and is stored in `watch_definition.request` (the top-level legacy `request`
column is null for this media schema). Independent SQL confirms one matching row,
owned by the authenticated supervised test account; no duplicate logical creation.

Recorded UTC sequence: original request 07:17:16.589; restored after sign-in
07:18:06.314; row created 07:18:10.017047; save API 200 at 07:18:10.024;
independent read saw persisted/unchecked row at 07:18:10.736; baseline check
07:18:10.777 and check response 200 at 07:18:10.798; visible creation confirmation
and Watching badge at 07:18:10.933. Thus the database and successful initial check
preceded visible success. Revision 1, no check error, both notification tables empty.
Browser detail explicitly says synced and email disabled, and separates initial
reference articles from new alerts. This proves initial retrieval/activation
eligibility, not future scheduled execution or delivery.

Three optional translation requests returned 502: local OPENAI_API_KEY is absent,
and the translation handler explicitly fails in that case. Original English content
remained visible and persisted; this did not block creation. No configuration changed.
Home, David's browser reload, and an independently authenticated fresh context remain
pending at this observation. They must not be inferred from creation success.

David subsequently confirmed visibility after his own Chrome browser reload, without
another report or check. Read-only browser observation shows Home with the same ID,
Nvidia title, New badge, one new / zero attention / zero updated, and no local report.
UI traces contain the same Home ID both before reload (07:27:44.600 UTC) and after
(07:27:58.767 UTC); authenticated list GETs returned 200. No new check POST appeared
in this interval. The observer briefly sampled a detail heading 'Watch not found'
during navigation; it reads DOM text without visibility checks, so this alone is
not evidence that an error was visibly displayed. Current Home is confirmed visible.
Fresh independently authenticated browser context remains pending.

### Final supervised outcome — 9 October 2026

David confirmed “Nvidia visible en privé” after signing in from a new Chrome private
window, as instructed. This is **user-confirmed private-window observation**, not a
Codex screenshot or independently read private DOM. Chrome's connector could not
find the exact private list tab; broad native-app inspection was rejected by automatic
review because it could expose unrelated tabs. No workaround or broader inspection
was attempted. An exact local-URL lookup was the narrower allowed alternative and
returned no accessible tab.

Independent read-only Auth metadata shows a fresh session for the same supervised
account at 07:30:16.357272 UTC, followed by successful media/company list GETs at
07:30:16.500 / .499. No session tokens were read. Final SQL still returns exactly one
Watch for this account, `fe22544e-ec0a-412e-a134-22f824393824`, revision 1, original
Nvidia request, `monitoring`, baseline at 07:18:10.777 UTC, no error. Both monitoring
notification tables remain empty. The subsequent reload and private session did not
change its check timestamp or create another row.

| Step | Outcome and evidence |
| --- | --- |
| Request → OTP → restored request | Pass: UI traces and exact persisted definition agree. |
| Durable persistence and ownership | Pass: independent SQL, one row, expected synthetic owner. |
| Persistence before visible success | Pass: row/save response and baseline completion precede confirmation. |
| ID reconciliation | Pass for creation, database, detail and Home; private-list title visibility is user-confirmed, its DOM ID was not independently inspected. |
| Home and browser reload | Pass: David's confirmation plus observed Home ID/New badge and traces. |
| Fresh private authentication/retrieval | Pass on David's observation, supported by new same-account Auth session and successful list reads; no copied storage/tokens. |
| Activation | Initial provider retrieval/baseline and eligible persisted state verified. Future cron and email delivery not tested. |
| Duplicates and notifications | One account Watch, zero duplicates, zero notification rows. |

Tested application commit remains `ccfa7aca8ffc052264569d965436a285e9b7bc6b`.
Only this validation document changed afterwards; tests/build were not repeated.
The specific supervised media-creation journey passed. This is not proof of universal
reliability, all browser/network failure scenarios, or production readiness. Local
translation remains unconfigured; no new reliability failure was demonstrated by
this journey. Existing #53/#52 release dependencies, production configuration checks
and release approval remain outstanding. No push, merge, deployment, production
change, tester email or scheduled check was performed. Both PRs remain on hold.
