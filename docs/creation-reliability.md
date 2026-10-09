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

## Controlled scheduled processing and local email — 9 October 2026

**Passed on David's actual local Nvidia Watch**, no substitute and no rewritten
baseline. Application revision `63ea8025621af02a0132f01c3505835d8cdeb255` (application
code identical to `ccfa7ac`). Harness: `scripts/verify-local-scheduled-email.mjs`.
No application transport change was required: its existing injection points suffice.

Preflight independently verified the local API/browser Supabase URL, local Docker
DB, correct confirmed synthetic Auth owner, baseline `2026-10-09T07:18:10.777Z`, 20
recoverable baseline articles, zero outbox records, absent database cron, disabled
application email flags, no external transport key, and no Mailpit relay configuration.
A private before-state copy including the snapshot and seen ledger was retained at
`/tmp/wa-nvidia-scheduled-before.json`; detailed results are at
`/tmp/wa-nvidia-scheduled-result.json`. Neither contains credentials or OTPs.

### Real processing boundary and local-only routing

The actual `createCompanyMonitoringCronHandler` ran with its Bearer authorization
check; an invalid token returned 401 without feed or email calls. Both normal runners
were retained. Because the cron has no Watch-ID scope, a PostgREST client wrapper adds
`id = fe22544e-ec0a-412e-a134-22f824393824` to the real eligible-Watch query and the
same Watch restriction to notification selection. Company selection returned zero,
media selection one. RPCs targeting any other Watch are rejected. Maintenance was
allowed only after verifying there were no other local outbox records. Hash comparison
confirmed all unrelated Watch rows stayed unchanged.

The original source URL/query was not edited. A process-only HTTP adapter routed its
retrieval to an actual loopback RSS server; the real `fetchAndNormalizeFeed` XML parser,
matching, identity generation, stored seen ledger, scheduled persistence RPC, outbox
claims, verified-Auth recipient lookup, renderer and dispatcher all ran. DNS resolution
was supplied deterministically for the original logical source; no public source was
contacted in these runs. All process HTTP destinations were restricted to the exact
local Supabase, Mailpit and temporary fixture origins. There were three actual feed
requests, including the unchanged replay; the harness did not suppress processing.

The exact production notification gate was enabled only in a private function-argument
configuration object (`VERCEL_ENV=production`, media flag true, company flag false),
with a dummy local-only provider key, an allowed sender and an HTTPS `.test` application
base URL. No `.env`, Vercel, browser, database configuration or schedule was changed.
The real `sendWithResend` constructed and submitted its normal payload and idempotency
header through a loopback Resend-compatible adapter, which submitted the rendered
message to Mailpit's real HTTP Send API. This is local capture, not a mocked send
function and not external inbox delivery. See Mailpit's
[Send API documentation](https://mailpit.axllent.org/docs/usage/sending-messages/).
The adapter's idempotency cache was not responsible for repeat suppression: the third
processing pass made **zero** transport requests.

### Runs (Europe/Paris, UTC+02:00)

| Run | Time | Expected additional notifications / emails | Observed | Result |
| --- | --- | --- | --- | --- |
| Replay existing 20 reference articles | 09:42:11.310 | 0 / 0 | 0 / 0 | unchanged; no failures |
| Same feed plus one synthetic Nvidia article | 09:42:11.424 | 1 / 1 | 1 / 1 | changed; one claimed/submitted/sent |
| Identical feed again | 09:42:11.459 | 0 / 0 | 0 / 0 | unchanged; cumulative totals stay 1 / 1 |

The test article is clearly titled `[SYNTHETIC LOCAL TEST] Nvidia scheduled notification`,
source `Local synthetic fixture`, ID `local-nvidia-76cdbee3-b83b-461e-b808-977be0815134`,
URL `https://local-fixture.invalid/nvidia/e6c7ce22-ab91-478d-a234-07d128caf87f`.
Its publication time is after the baseline. These are artificial observations, not
claims about a live Nvidia publication. The normal source settings are unchanged.

Notification `ed3e3058-f8f8-4f8e-997d-92487024adb4` belongs to the correct Watch and
owner, is `sent`, has no error, and records provider message ID
`6NmCDFa55TrEdnP840Jzkd`, matching Mailpit's captured message. `sent` here means local
provider acceptance. Captured text/HTML were checked for Watch name, synthetic headline,
source, 9 October 2026 date, summary, article URL and detail URL with the correct ID.
The `.invalid` article and `.test` app links are deliberately synthetic and do not
assert a reachable production destination. The message remains available at
`http://127.0.0.1:54324/view/6NmCDFa55TrEdnP840Jzkd` while the lab runs.

The baseline timestamp and initial reference JSON remained byte-for-byte equivalent
through all runs. Request, ownership, definition, source and revision were unchanged.
The last-check snapshot, seen ledger, latest result and one notification changed only
through the normal scheduled-processing RPCs. Those synthetic additions are retained
as evidence, not deleted to restore a cosmetically clean state. The temporary HTTP
adapter was closed and process-only routing/configuration disappeared on exit;
application email flags remain false and automatic scheduling remains disabled.

Delivery-failure policy was reviewed separately: failed/uncertain submissions are not
automatically replayed; pending claims and stable idempotency keys guard duplication.
23 focused email/outbox tests passed, including simulated rejection, retryable failure
and uncertain submission scenarios. Those failure tests use controlled doubles and
are not claimed as Mailpit failure observations. Build and diff checks passed. The
previous full application suite was not repeated because application code did not change.

No failure was exposed in this run. This validates the scheduled **processing logic**,
notification persistence, real local message capture and stored-state deduplication.
It does not validate automatic Vercel cron invocation, real external email delivery,
or completeness of future Nvidia news coverage. Production/staging data and tester
accounts were untouched; no real emails, shared cron, push, deployment or merge.
PR #52/#53 remain on hold.


## Read-only audit of David’s real production emails — 9 October 2026

User-supplied Gmail evidence: 24 complete messages received around 08:35 Europe/Paris
(06:35 UTC): 11 Elon Musk, 9 Royal Caribbean, 4 Bitcoin. The truncated Royal preview
is not counted separately. All 24 match distinct production notification records by
Watch ownership, title, publisher and stored publication date. Owner was resolved
privately from the exact known Auth email; no account nickname inference was used.
No staging lookup was necessary. This audit does not validate held/local code.

### Origin and trigger: facts and limits

Production SQL used TLS verification, `default_transaction_read_only=on`, explicit
`BEGIN READ ONLY`, bounded statements and ROLLBACK against `cztpitujsnzhhenedwjn`.
The email records and their owner association are confirmed in that production DB.
The current alias, inspected at 11:15:37 UTC, points to production deployment
`dpl_CCkhH1wuCA74h3AB2FwgEMQc2Hto`, SHA
`057cabcc16c50dc251b30c281929bc5ae9fd079e`, created 4 October 09:50:27.876 UTC.
The latest-production deployment listing shows no later production build; the prior
8 October inspection recorded this same alias/deployment. Thus this is the strongly
supported historical emitter candidate, not a request-level proven attribution.
Neither PR #53, PR #52 nor the local durable-creation laboratory is evidenced as the emitter.

Vercel runtime-log lookup for 9 October 06:00–07:00 UTC explicitly failed because
Hobby retains one hour. It did not return an empty successful search. Project-scoped
activity lookup returned 403 (permission to list events unavailable), so alias/config
change history could not independently close the historical attribution gap.
No retained execution ID, User-Agent, request origin or provider event was available.
`vercel.json` at 057cabcc schedules `/api/cron/company-monitoring` at `0 6 * * *`;
the existing release record documents the flexible hosted window. This supports,
but does not prove, automatic invocation. An authorized manual GET follows the same
Bearer-protected handler. Automatic versus manual versus another authorized process
therefore remains unproven. No cron/check/dispatcher was invoked by this audit.

### Reconciliation

| Watch | Complete pasted messages | Matched sent rows | Additional sent rows on 9 Oct | Newly created pending rows on 9 Oct | Stored baseline UTC |
| --- | ---: | ---: | ---: | ---: | --- |
| Elon Musk | 11 | 11 | 0 | 4 | 13 Sep 19:18:44.616 |
| Royal Caribbean | 9 | 9 | 1 (Lelezard; receipt unverified) | 0 | 4 Oct 09:08:51.040 |
| Bitcoin | 4 | 4 | 0 | 14 | 15 Sep 06:35:33.868 |

Elon Watch `0233a71e-012b-4ab5-9eaa-83eb58b3ecf5`: latest check
9 Oct 06:35:34.339 UTC; matching notification rows created 06:35:34.754186.
Royal Watch `4d387267-a8ee-44e9-a46c-0bb1237b8eb8`: latest check
06:35:34.224; notification rows created 06:35:34.573927.
Bitcoin Watch `e052114d-9ec3-4af0-8d82-9bd27d99b827`: latest check
9 Oct 06:35:35.209, but the four received notifications were already created
**8 Oct 06:35:35.169106 UTC**. They were submitted for their first recorded attempt
on 9 Oct. This is existing queued work, not evidence of retry after an earlier send.
Their exact 8 October check timestamp is no longer available in the current snapshot;
notification creation proves that these articles were observed by that time.
The seen ledger has no first-seen timestamp, and no per-article historical check
log was obtained. Do not equate notification creation with exact first retrieval.

All 25 sent rows have attempt_count=1, a distinct provider_message_id and no last
error. Sends span 06:35:36.754277–06:35:43.951915 UTC, i.e.
08:35:36.754277–08:35:43.951915 Europe/Paris. Gmail confirms receipt only for the
24 pasted messages. No authorized provider-event connection was available: DB
`sent_at` means persisted provider acceptance under the inspected implementation,
not an independently retrieved Resend delivery timestamp. The extra Lelezard row
cannot be equated with the truncated preview without its content/message identity.

Production code `server/media-watch-notifications.js` at 057cabcc selects pending
rows oldest-first, at most 25 per invocation, with concurrency 3. The 25 recorded
sends and 18 remaining new pending rows are consistent with that cap. This does not
prove the earlier invocation’s workload or why the four Bitcoin rows remained
queued on 8 October. No other accounts’ queues were read. Historical failed rows
remain terminal; no replay is inferred from article age.

### Baseline and deduplication

The actual production `complete_scheduled_media_watch_check` definition was read:
it requires an existing baseline, an identity absent from the durable seen ledger,
a matching supplied candidate, and publication after baseline (or unknown publication)
before enqueueing. The first successful snapshot suppresses notifications. All 25
sent articles have stored publication dates strictly after the respective current
baseline. Thus the 5–7 October articles are eligible by date, not evidence of a reset.
Stored publication dates are feed metadata, not a fresh publisher-page date audit.

Baseline snapshot creation times closely match those baseline dates. Initial context
is NULL for the older Elon/Bitcoin snapshots (not an empty successful baseline),
and contains 20 articles for Royal. No complete reset/reactivation audit trail was
available; current snapshots alone cannot prove absence of past administrative resets.

All retained outbox records for these exact three Watches were inspected: 505 rows
(156 Elon, 18 Royal, 331 Bitcoin), spanning 14 September–9 October. There are zero
repeated (Watch, source_article_id) pairs, zero repeated exact article URLs per Watch,
and zero repeated non-null provider IDs. Every notification identity exists in the
current seen ledger. Production has UNIQUE(watch_id,user_id,source_article_id).
The observed 25 sends each have one submission attempt. This supports article-level
nonduplication within this retained scope; it is not a global/external exactly-once claim.

`server/media-article-identity.js` hashes normalized URLs and optional source IDs;
it removes tracking fields/fragments but does not merge stories across publishers.
The stored URLs are Google News RSS article URLs, so different wrappers for the same
publisher story are not proven equivalent by this audit. Multiple publishers’ Trump
medal, Byrne song or Royal earnings stories explain notification noise without proving
repeat sends of one stored article. No semantic grouping or digest exists on this path.
The claim/submission boundary suppresses uncertain abandoned submissions, failed rows
are not selected, and Resend receives a deterministic per-Watch/user/article key.

### Release implications (holds unchanged)

Confirmed: matching production outbox persistence and user-reported real external
receipt of 24 messages. Strong evidence: functioning production media processing and
an enabled media gate during these sends. In the inspected unmodified 057cabcc code,
reaching the real sender requires runtime MEDIA flag exactly `true`, production
VERCEL_ENV, non-test NODE_ENV and valid sender/provider configuration. Because the
invocation identity is missing, this is a code-conditioned inference, not direct
inspection of a write-only stored Secret or proof of next-deployment configuration.
Company notification gate remains unverified; media messages say nothing about it.
Production data association is confirmed for these records; exact server URL/key
configuration of the historical process and next deployment is not independently
verified. No settings were recovered through a protection bypass.

GitHub read-only inspection confirms #53 OPEN at d4c184b0b39ffc12b12dc86a2fa6f29e995171e5
and #52 OPEN at 889606fa0a1bbc31498dd040ff8fbca49a638e1b. Existing successful backup,
restore, migration rehearsal and local/staging/iPhone checks were not repeated.
This audit does not remove the production configuration/release-approval gate.
Before #53: resolve remaining runtime/next-deployment evidence, reassess catalog drift
and backup freshness, then separately approve the guarded query-history migration
followed by local-media-recovery migration and deployment. #52 remains afterward,
with reconciliation against released #53 and targeted currency-policy then strict-
comparison migration verification; no blind historical replay. Separate repair of
Ed Sheeran or recovery of browser-only Watches remains outside release execution.

Smallest next diagnostic step: capture the existing completion summary plus deployment
and request metadata promptly during the next ordinary scheduled run, inside retention,
without invoking it. This may establish trigger and company/media gates; it does not
require another Secret inspection. No automation was created. If historical provider
records become accessible, use only the IDs below to read acceptance/delivery events;
do not retry any notification.

### Per-article evidence appendix

All times below are UTC (add two hours for Europe/Paris on these dates). `Created` is
notification creation, `Claimed` is claim time, `Submitted` is persisted submission
boundary, `Sent` is database completion after provider acceptance. Every listed row
has status `sent`, one attempt and NULL last_error_code. Article URL links and
publication timestamps are exactly the stored feed evidence. Provider IDs are not
provider event lookups. No credentials, account email or Auth user ID are recorded.

#### 24 matched pasted messages
| # | Article / publisher | Publication | Created | Claimed | Submitted | Sent | Provider ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [Trump gives top US science awards to Elon Musk and other tech executives - Al Jazeera](https://news.google.com/rss/articles/CBMiswFBVV95cUxOSG1raXRsVXFFZkdMQUdmY2ozQ0dhNGZkNGFReG50bEV0RmRUX055anYwekhKUkNaN3RsZ25NWGxfdlVsWTVPY09tbmJPZ2NqVzJlZXdYdlQ3WnZiajZrblE4MkswT2RIX3I0QlNtcWVBV2ltcHJvdkpTSWlORzR5NnNBeHlnX3AzSWFBUmVxWEtxOUlkbGxPX2VkUm9ubkFNN2tEZDZWWmxIUG95b2ZlRVRrY9IBuAFBVV95cUxPYVBfeFV3S2hwUnZpUmFGWGRaWVVKamM5UnRpcHFabUQzc01XcGVrdFFjbjhPSmRiQkdScE9USmpIbmVnMFo4bXhEZUF0UW5BZUJIVF9ELXRwTlJiOVpHQUNZQmc1SkVCSkdqZjE2VkdhMUFhUGZHcDl2dFZRUXZXOWN5dFFncW5yNmdMV2dlQmduMkUtcEFnQlhyUlpkUTFDd2k2dlFFamJ6TEcweWpMdGxkUE5pODNk?oc=5) | 2026-10-08 21:15:45.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:40.409832Z | 2026-10-09 06:35:40.83881Z | 2026-10-09 06:35:41.043343Z | `01a11f5f-e5df-7a34-a977-a1fc79586fa0` |
| 2 | [How Elon Musk got back in Trump's orbit after nuclear fallout, insiders reveal: 'Water under the bridge' - Fox News](https://news.google.com/rss/articles/CBMirgFBVV95cUxNR0o5WlFNQm0xVzlHRE1JMGljZGhwb1h3a0xjZ21KdlRnTndwd0h6MU1EMlBsOEZGbzhuVkplbnBnemlhZ3B4ekJ1REp6Sm4tMmc3bWdicXZkTTRYX2hfOU04YjNiYkRRZHlvRG5kTk1XM2VETU9TR1RLNFJfWkhIVVQ5UUdFRG5hTXc0ZXc3X19LWWtVX0lGbG9FcDdyVklaRmtPcHI3VGMyTU5IQUHSAbMBQVVfeXFMT29UWWZIUFdfMU9QYjB4akl0RG5sNWN1eTlyb09LMlNuVmJqVHAyeVZzdHkxbHFFWm5KV2Yyd2dhbHlvYmMxaEdua2F1WE5IOW5KRE9DMFVSWFplSjVJSGptR0t5TTc5WDFncDd0Y0JwaFV1MDZnZ3hlZkdhQVpKNVJ1REs2QVF3dU9FTTFvbUl3SGZ4V1AxMVZ5dFRwaGllTWNicGpmMkdUY3Fhajk3LThPczA?oc=5) | 2026-10-08 16:15:01.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:40.647054Z | 2026-10-09 06:35:40.903491Z | 2026-10-09 06:35:41.108606Z | `01a11f5f-e62d-71e2-af6c-fc3d50040284` |
| 3 | ['Real boss of India?': Elon Musk takes aim at Indian billionaire Ambani as Starlink launch stalls - CNBC](https://news.google.com/rss/articles/CBMidEFVX3lxTE54blh6X19zQlJzVUs3aTItdjNGRHNFVGQ4OUhEWk8xZWhJbXBJNlVHMFN5ZzRJSnhSQTF6Q0xEUFpTNXRQTWdZMnZZU2t0NGRadDdjQ0VZV2s4RmFWS2ZTQ2VqVkFNVU5sdS1KRnMxSVJnby1J0gF6QVVfeXFMTVZVRXBwVVdoakNsdXFYcnhCNjdUOXNBUkh3d3lvNEY4V3pqZkhNSjJzdDU5anpNMW5PUkZGcHRKdHBsYUx3LVZwSFFjakZUcmNyWVd5REhLTVB3TXpITVVsZTF4OFNKZTh0azE3N1hsZjJkQjRMeEpGdXc?oc=5) | 2026-10-09 04:02:13.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:41.240925Z | 2026-10-09 06:35:41.509542Z | 2026-10-09 06:35:41.707359Z | `01a11f5f-e881-78cd-b30f-9cba1626d3b5` |
| 4 | [Donald Trump awards Elon Musk science medal at Washington DC A New Golden Age event - Sky News](https://news.google.com/rss/articles/CBMiuwFBVV95cUxObWIxQmNqVWpjS003djdVNi1zQlBSam5CR0FNT1NsVHhXVVE1YkdzR1EwV09NM2lpLW1WbG1hTkFpU25iYTY3RlRDa3FPUjRKaF9NMXRIM3JNbmdBUGlxTlhjY3YySzJBTzVfaVh1VC1JYVZUUEFyYnpvMTN3Umw5YTFJMDRnMkx3N0JjaS1Wbk44T1B4bDJ5UTg0OW5aUDhfZHlqa2VFQ2RGWVFNTlZ6cWNrTEE1RDAtV1E0?oc=5) | 2026-10-08 16:31:53.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:40.971765Z | 2026-10-09 06:35:41.406823Z | 2026-10-09 06:35:41.603137Z | `01a11f5f-e81a-73e1-a4c2-e78d38961c61` |
| 5 | [Spend Elon Musk’s Money - WIRED](https://news.google.com/rss/articles/CBMiX0FVX3lxTE92VkRLV3VQRDlBRkVMb3VBOTlVQk9TSnlyWl9CQVBxd0tLZEhnbG9SYUxRbE1qLXhSWEJ1VWVFTFFBWWJjbjJjVFRqZHhtcVZtdFRPU2NhTHkzZUhtR0s4?oc=5) | 2026-10-08 11:00:00.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:41.353177Z | 2026-10-09 06:35:41.800425Z | 2026-10-09 06:35:42.179051Z | `01a11f5f-e9a4-7b05-b24b-91b4710871f3` |
| 6 | [David Byrne and Daniel Pemberton Made a Song Using Weird Elon Musk Quotes - Pitchfork](https://news.google.com/rss/articles/CBMipAFBVV95cUxQR29wRXVHRkVCVEZvZ0RTeWpMcmx6ODM3LXlvaUt6UFNjNUt0WlNBd1BIejhHLU9FZ2Y1NUtWXy02aUJMNFZfS29LdGpqZTQ4NU4xc2t4YTJFNEh1V2dJVm1SSHpOMFdfZTNmRkxZbW56eVNRNzZHeDBiRUNPWlByenhBWDMwVEdqT2tqZGZSVE5CY1pHQWczOGMwcnFXOVljR2tybg?oc=5) | 2026-10-08 16:53:33.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:42.006916Z | 2026-10-09 06:35:42.471874Z | 2026-10-09 06:35:42.85279Z | `01a11f5f-ec51-7705-9f00-41ca4f72a6f9` |
| 7 | [Opinion \| Oligarchs like Elon Musk are tightening their grip on the Pentagon - MS NOW](https://news.google.com/rss/articles/CBMigAFBVV95cUxQZVlqRldMczN1VUtFTG5ycTllT1lFSlp0QzZQTVhxZllpWEo3b2hGLUdpT1djQ1N6RjVXSEYxVGZtVnhBTG5qQ3JiM0RZdE0zU3dGWndGckdDckE5d29qYUVDTmNQejBlQzBHNlJOZWZ1SHQ3QVZlM2lNV2ZmU2xKVA?oc=5) | 2026-10-08 22:27:55.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:41.738037Z | 2026-10-09 06:35:42.17102Z | 2026-10-09 06:35:42.36183Z | `01a11f5f-eb19-7828-b530-957edc7f68ac` |
| 8 | [Rock Legend Uses Elon Musk's Own Words Against Him In Humiliating New Song - HuffPost](https://news.google.com/rss/articles/CBMiywFBVV95cUxPRjduUi11ZndFa3JtOE1oUHlMbVpDUjIwZ0hLdFlxcXFUYWZnZWtUN2RNcHhybmV6UlNXMzRVSU9mamdpN2k2X19VZXhfaWdNUXEtb25KaTZrU0hfS1pnRGwyNHd5R0t5TTBsY0E3NWhRdFBKei1GZjVHOGZDZ2doalI4WVU2cFh3ZFRjdTlzbzJZVm9sNWNQR2lvWUp3TXRCYmNHVWxqaWY1U3g4VVFqQXdkN2RMUlc2TnZnMmpyYTlKMmFxODdxS2lMVdIB0AFBVV95cUxQdjZzNUxWaFJZd1d4ZFFsck1lZ0NVYnNkRmlCN1YxUjRtUWJaQmY3MmROc0JSY055VVNCN3EydWozSGZub0NYdHphQUtWWmJja3JpbDVkMjNLc3FIS2VUb3YyV0RDSlFnVXUycU16dUVweTQ0RENQQXF0YkFycXJtYmt3N04xWTNWa1RidmRMdlpLZUN4a0lHbzJfWEJTZzZ5TE8zc0hncUJHSTI1NVZTbWkyT1BfRDZhTExEdzdvb051X0JiYWZQMHJ1X1dOZXds?oc=5) | 2026-10-08 21:03:59.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:42.487515Z | 2026-10-09 06:35:42.945Z | 2026-10-09 06:35:43.149434Z | `01a11f5f-ee1e-7c4a-aeb6-48ae3899efb3` |
| 9 | [David Byrne Turns Elon Musk’s Own Words Into New Song ‘Let Me Sell You a Dream’ - Rolling Stone](https://news.google.com/rss/articles/CBMitAFBVV95cUxOcEtIcXlZaTRMVkx4eW9YZHNxX1BETThlQWtTblFZdkFZRnI2dUp5c3hKVFlzSm9vU1hhbGhwLXRXUGItUmxQUzg1RmhXUWNPU2xaZ0Jna1hnejE0WmczRE5rV0xUTFR0UmJCRjZfZGM2enRtdFZ6S2dfMHNkZmpvTENGSU54WEJtY3QzbVFIeFBDV0o3UlBlZ1VrUHYyZE5HZ3BfVk16ZXZXYUdjZ283MDZxMTc?oc=5) | 2026-10-08 14:17:47.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:42.507874Z | 2026-10-09 06:35:42.793246Z | 2026-10-09 06:35:43.024907Z | `01a11f5f-ed84-7f15-b441-2d84bdc595cc` |
| 10 | [Sask., Alberta premiers reject Elon Musk's call for provinces to separate from Canada - CBC](https://news.google.com/rss/articles/CBMinwFBVV95cUxPNXV3NFRPWG1QamlEYWFMalc5c1RGV1JPdmdnWDA3a2FQZmlaT1I3QXpfY1VGamllNy13eG1rOFRoUEpaMDFFZDNpUFJxaWprWnZNaDZzRUF6SUUzemQyRWFvZ3V1dDFSa1FCSk1oWm1LREo1OTBGNjNkQmMtRUlUV0RqaUM3X2x0aXJQck9XelhrRkdMV2FrbERiM1pOd00?oc=5) | 2026-10-08 17:09:42.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:42.985312Z | 2026-10-09 06:35:43.245667Z | 2026-10-09 06:35:43.442351Z | `01a11f5f-ef47-7bce-8492-fa8b7deb00eb` |
| 11 | [‘No’: Moe shuts down Elon Musk’s calls for Saskatchewan to separate - CTV News](https://news.google.com/rss/articles/CBMipAFBVV95cUxQTGdZcFhyZ0NGZ0RUb29nZkJ1QlpueU9FbUxOQzdKcFJOODFXY2ZwOUJMUjJKcm1HUDJGaTlQemlDN0JORzNNSk05WXpTc0Zna0xycEpmMFQ0d2hLbzFpM0d2LTllTzk5V016TVNvY2lBV3RJMFNyTjY4TWNOOHZBSDJYN01VbUswaGJDV0N6bDMzS0V6NjM0SDJYdzJpLV9uWkJJUA?oc=5) | 2026-10-07 21:30:11.000Z | 2026-10-09 06:35:34.754186Z | 2026-10-09 06:35:43.326301Z | 2026-10-09 06:35:43.762229Z | 2026-10-09 06:35:43.951915Z | `01a11f5f-f14c-79c6-babc-ab9312385adc` |
| 12 | [Royal Caribbean Group To Hold Conference Call On Third Quarter 2026 Earnings - TradingView](https://news.google.com/rss/articles/CBMi3wFBVV95cUxQRFR0b3diV2tRbXpTbzVSMEhfT1JIZmZhdExkOGxkbk8wRHlyOXVVLVZhR3B3UnBXYUdrLUZYanRnUGxKYVZGZ25NZC1pNmxNQktKeVZaTDYwZ2Q1MmNUeXBWeUViTXdZSWJzblRuMjE5NTZBUkNRSlQ4SWFZdEs2dDBZTXp0N2hqQUxUTmZVNzZWSjdTUVNTSDgyTmNfTlUtVGVEUWhDT250dUI0VU9sYVRycm1saWZrZV9wUnlKQUdRZU92aXFzQVpKR1MyYzJuT01ob1dWbElzZ0dhVVVn?oc=5) | 2026-10-08 21:52:26.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:37.316256Z | 2026-10-09 06:35:37.590848Z | 2026-10-09 06:35:37.99579Z | `01a11f5f-d933-747b-9d59-bfac682e0cd1` |
| 13 | [NAHA PORT AUTHORITY, CRUISE PORT NAHA G.K., MSC CRUISES AND ROYAL CARIBBEAN GROUP BEGIN CONSTRUCTION OF NEW CRUISE TERMINAL AT NAHA PORT, OKINAWA – Company Announcement - FT.com - Financial Times](https://news.google.com/rss/articles/CBMimAFBVV95cUxOQWdIeEVGS3hfMTVua3cyZkNfck5pZmx2OTB4LWt3aWFIYXhyanpvdXJQeTFwNkwtRUk0R1gyRkd2eEZBNFBTbmFuX1RVcWphV1ZmclZTd3lVSXV1dDdYQlZJaFdXZWhVODVROV9xNGNQbUpkb19ESEYyWEJhN2hDS3IwN2k3Vy16R1dWNjdtTzZyREN4bFpLbA?oc=5) | 2026-10-05 15:14:00.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:38.036949Z | 2026-10-09 06:35:38.484625Z | 2026-10-09 06:35:38.951547Z | `01a11f5f-dcb1-7a97-9892-c75ddc1fb03b` |
| 14 | [What to Expect From Royal Caribbean Cruises’ Q3 2026 Earnings Report - Yahoo Finance](https://news.google.com/rss/articles/CBMinwFBVV95cUxPa2Y3YmlTTFVLSlh4aFk4cHd4UEh0ek1veVJMZnFobm5QbmViWjdINVktcGQ3ZndCbURfZjhKUE44MEpBSHNrRExBSk9UYmE2TmhBUWtfbnN1VFZwZVBobW84dzRRWmVkbkRiMmd3NEpRRmk5ZVlOdzZlS3NQZGRXMTQ4aURVZDFDVHRLYU5hZVlkSHF4TFRQdVM3QlU0eFk?oc=5) | 2026-10-08 12:47:17.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:37.841337Z | 2026-10-09 06:35:38.316535Z | 2026-10-09 06:35:38.981108Z | `01a11f5f-dc13-70ba-a162-24fcf554f2c8` |
| 15 | [On Oct. 27, Royal Caribbean Group will webcast its third-quarter results discussion. - Stock Titan](https://news.google.com/rss/articles/CBMivgFBVV95cUxNZ2c4ak1saERwTktvRE1tYzF4Vm1NeUNPTkI3ejJSRUdJX0lUY2ltZkdWNDY4azl0dmZ1RVU0S1BxZlRsdUNnaUF0R0FtY2xUN2lZX1VfVDk2M0xQVGh2RHAxZEdkLVJlVnZPdHlJd2pnd0NWOElxTHkzUjJZalA4YmcyQkREYUlGMnV6elktcFgtZ0x6MnhmRFVLXzd3VlN3dGxtbGFvR2FWR2hnMHJ5X2JRd056aThRLTR3aHFR?oc=5) | 2026-10-08 20:30:00.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:38.320462Z | 2026-10-09 06:35:38.974051Z | 2026-10-09 06:35:39.343003Z | `01a11f5f-de9a-757f-a01a-77fb9111dd58` |
| 16 | [Traders Buy High Volume of Royal Caribbean Cruises Put Options (NYSE:RCL) - MarketBeat](https://news.google.com/rss/articles/CBMizgFBVV95cUxNNkJVdjQ1Y0tJTFpEWXg5c2laVGlFWTNuRFh6YUJVZ3lBRTZZQVlzaTRxZVFoSEdkWUdZdEUyaEgxck5sOUhxU3NWdlRnLXZVcHF3VE1ScWs5NWptbTVrRUVTQ3dUQUE2Um9HQXBPS0JHMndQRGM3Rl85SHFjN0o2ODhZWUJJSUNGcWJMN2lQOTRybGY3WF82Tmplek4ta05qVTFPNmx1YWhPdWc2aW5POURGczM3VllobWFGaHJVVThsR3BBNWNiZ08xOGRwUQ?oc=5) | 2026-10-08 16:09:46.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:39.109039Z | 2026-10-09 06:35:39.545417Z | 2026-10-09 06:35:39.744082Z | `01a11f5f-e0d5-73ee-8584-5a875e151314` |
| 17 | [ROYAL CARIBBEAN GROUP TO HOLD CONFERENCE CALL ON THIRD QUARTER 2026 EARNINGS - The Globe and Mail](https://news.google.com/rss/articles/CBMi8gFBVV95cUxNZ3FIM1lrdHEtdEU2WHRucXRzYWNwaGh2cFlZN2pzTjE2RHpYOWlaTmlwazJMNEVvRjVOcmxqSmp5blczLUhCSkxKY1hSOWxvLUQxNFBybFBHSV9ubk9iTjlZcHlaeHJUcEhpYnFVQ2ZrYXFmTjVsUlk5OFd3VkE0ODVMa202OFJMM25oaHNtRG04d1I1cjNsZFBCV3RqeW1lMFVtRWI2NDcxWHN6QkVra0p1dDc4a0FHZklvZDJaTTlWQjFEN2xIWldVdjJmTDgzcldReXRSQ2tUQnhwYWZTemYtR3loZ0x5aDM2NDdYYkxOUQ?oc=5) | 2026-10-08 20:41:09.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:39.484446Z | 2026-10-09 06:35:39.919173Z | 2026-10-09 06:35:40.116218Z | `01a11f5f-e24f-71b4-8606-b934a2c79e93` |
| 18 | [Is Royal Caribbean Cruises (RCL) Still Undervalued Or Is Its Growth Story Priced In? - Simply Wall Street](https://news.google.com/rss/articles/CBMi4gFBVV95cUxQOTktYkU2SkdILUNFSXBMNC1YTEphMzlTU1VUM3ZzRE5Ud0loNGFtaGIxNk15dEoycE5WYU45cWl1YjRyZ3duaUl2N3U4ZDY3YVZvYWNjMVEyNTZNN25IQkFXRDJNLVN2NTl5Y09fYTVuekkxRXBLSzJUaTJONEIyVl9Ndm1sSU9oMWM0UjExUC10aGdfMzhuUmZnQmswU2dyOHBfU2U4OUZ5bWxkWDRnTkMxUGpBUndmYXdNX1Y4dlhQNVljYWdOMHNIWUlibHFWaVU0TWtvdGpDWkVEbXhQWmNn0gHnAUFVX3lxTFBGLUdFTGozZEtkVi0zVllQT0p0aTl3SUV4eU1QdHFTeXU4elNLLUNiMGJfQ3RoLXA2NXRMQ1A0dHhrdGI0WDB2UUd6LXJHcXBHNUROdTVpbHpZMlJUWUlrZ3FobXU4RHZsQThwSmdhZUJfRWRXSk9zLUlyUjFlYnplSXh1LXZJYVRFdkZfVFkzaldIOUdoVFdsYWlNWDh4aGhNb19QTmQ0cHB2VldSVmZoQndPZ09rbkFHUk80ZWhvR1IwY0d1LVJrS3ZiTVJEdk1KSExkRDJaQU4wRUdpa3hyTTFNcW1iOA?oc=5) | 2026-10-06 08:49:34.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:39.261083Z | 2026-10-09 06:35:39.690643Z | 2026-10-09 06:35:39.896723Z | `01a11f5f-e165-754c-8721-2bc47787b64b` |
| 19 | [Royal Caribbean Group: Has the Market Already Priced in the Cruise Recovery? - Yahoo Finance](https://news.google.com/rss/articles/CBMiowFBVV95cUxPeUlLT0lldlhGSlhIeDl5dHo0UVJUZzNfVkdRTmdnSkdwYU9CRlMxSkd5SHM3eUFDZVh3QzBOWU5rR2h2WWRHcDFaVGdmMDV6VGJjRVRVTS05b3l1bEJPbUxfRTZ2ZmlzVDdCM09uUl9RMTlfMmxDQkhIa1FhOXhidEZCbkZJM3dZekVaMy1aV3ptTUQ5SXN6RVRBVlc1WllIbG5v?oc=5) | 2026-10-08 07:02:59.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:39.882758Z | 2026-10-09 06:35:40.146033Z | 2026-10-09 06:35:40.512764Z | `01a11f5f-e32d-7b1f-97de-ccb5422a40f9` |
| 20 | [Royal Caribbean Cruises (RCL) Starts Building New Okinawa Cruise Terminal - Simply Wall Street](https://news.google.com/rss/articles/CBMi4gFBVV95cUxPeHVFcWNBckJNNW5yc3RlQmF0dGlsMUxjcGszQVczS0dUaUUzT3JMZUF4ZXpQNkVMNEFUaGFmNXBOWG5sVmhkN21ySHdmcDhkOWhkaFlFY2xoNmg2c3dSRGFBNWxtVnZUYXZoaFBIMmpiXzFYMnNvSUFkMzhsZnFHQUdSQXprTDZBN3cwcjBDRUJIejNySTdDQ1VZOFdEa0JMZl94Q1VBaU11cWJlRVY1QnpvaWZKZFRaTUNvZkNTb1lwOGxueVExU2JUOGgtcGRHSGluX2dGZXFfYnNTRnMyVlFR0gHnAUFVX3lxTFBJXzBhZUtCYTd5ZjN6SE01Ri1IcjhVYnRfbG4tUm1oVmxENGo2TXMxam5URkl2a3VPaGoxZEQ1ZTJmU1RoVFU3OHgyTm5MSnBNMXBleWZfd2tBRHZFcks3S1ZJaExQN1VzSTBxVFpjdWFXckxsQ3UyZlBZR0pXV0UwSjNkRTIwS2RNSTY4WjRGOUtkVUNsTjZ1RW8wMGdGWE5INVpxS3l4UkY5RFF6MVNEYjdKbVo3RE9jbTdVNW9la3lxZDlrRko4bUFZZWRXSkViX2xXeW1BSnFtQTlOWlhQZUNDcjVDaw?oc=5) | 2026-10-08 06:05:12.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:40.199323Z | 2026-10-09 06:35:40.642871Z | 2026-10-09 06:35:40.845979Z | `01a11f5f-e51e-7b75-a770-3d9c103fc6a4` |
| 21 | [How Much Will $100 of Bitcoin Be Worth in 20 Years? The Math at Three Growth Rates - Yahoo Finance](https://news.google.com/rss/articles/CBMilAFBVV95cUxQZFBRMTFHUmU0LVQxeHN0UUc2UkthTGlJZU1BV0I0WVV2bFI5MEJRZklOM0NqNW5ycDJGRExqdFRmaFk1TXFwZDUxVGJWdHpmajJvdXhHajVNNDlaVmhuNHNFclc3M2ozVXZXQkg3SFZGMGEzVHBPT1JheUR1Wjc4WWJidEl1bW05NTE2cmNMNG1TdzA0?oc=5) | 2026-10-07 14:30:12.000Z | 2026-10-08 06:35:35.169106Z | 2026-10-09 06:35:35.863778Z | 2026-10-09 06:35:36.536675Z | 2026-10-09 06:35:36.75485Z | `01a11f5f-d526-787f-8f3d-e9d585ee689f` |
| 22 | [Which Cryptocurrency Is Most Likely to 10x by 2030: Bitcoin, Ethereum, XRP, or Solana? - Yahoo Finance](https://news.google.com/rss/articles/CBMiogFBVV95cUxNQktvb0FWZG0tUE5saWs2RHh4NUNVSXlUejg2QzdPRG1JMlpZb3VfblFFcnptMjJ3a1lfdWNDZDEtS1pCUnpLWmtLVWNJY05jZExTOVpmSmIzWFFacUw4d09OTnVGeHRKQ0RUbzJEMDVRS1pRMExOZ2U5T1Y5Uzg3LVllM0hURkxHQnpQeGFoeUpyUUY2aEZkc3MtVXBKYVhNZUE?oc=5) | 2026-10-07 12:30:11.000Z | 2026-10-08 06:35:35.169106Z | 2026-10-09 06:35:36.031769Z | 2026-10-09 06:35:36.644759Z | 2026-10-09 06:35:37.003036Z | `01a11f5f-d584-771c-9509-8d906574d907` |
| 23 | [10x Research Forecast Bitcoin Could Fall to $46,000, but What Really Happened? - Yahoo Finance](https://news.google.com/rss/articles/CBMiogFBVV95cUxPTUtsLVlORmV3eGp5cWxWMGY2ekdEbmpDYUdZdWZvQVM3ZDRaMWhORnRMQ1JaZldPcXN4WjRrbDNNWHdaQXA0YWZRdzVwRi1GNFc0Qnc1czRMUDh0aHdrTU9hb3ktaHdFZWNldFU2MDU0VDV3OGQ1Z3pTaFg2eW8tbGRwREMtWmtoQWxHZ3MxVWt6WHN1VzJTUW1mSVU3QmZHQkE?oc=5) | 2026-10-07 21:59:22.000Z | 2026-10-08 06:35:35.169106Z | 2026-10-09 06:35:35.869215Z | 2026-10-09 06:35:36.501628Z | 2026-10-09 06:35:36.754277Z | `01a11f5f-d518-7d95-87ad-9eb5913638a2` |
| 24 | [Robinhood adds $25 million of bitcoin to its balance sheet - CoinDesk](https://news.google.com/rss/articles/CBMitAFBVV95cUxPUG50NFItQnFQdzhYQWc4LUZWMngtVUxUdURFQ1RWUFJfWWxZTW5zVU5BVjl1YnFUaXl1SDlObG10b3dTYlRLNm1nazdtQ3Z6TnIxS181UFVOSVZmNXp3aVNWcVZlbnBsQmNFWmhGNGgwMjBPNTZ6d1RMQVpEbmZIYWtveW5FbGE0bmdCNHpjWjZlcXJaYzhoTnB2UzVCeW5Nb3M1YktpLUZMeUJEWGVNYUI3c0o?oc=5) | 2026-10-07 12:13:10.000Z | 2026-10-08 06:35:35.169106Z | 2026-10-09 06:35:37.054293Z | 2026-10-09 06:35:37.491301Z | 2026-10-09 06:35:37.72264Z | `01a11f5f-d8d1-7deb-8d75-15e362367b25` |


#### One additional database send; receipt unverified
| # | Article / publisher | Publication | Created | Claimed | Submitted | Sent | Provider ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [ROYAL CARIBBEAN GROUP TO HOLD CONFERENCE CALL ON THIRD QUARTER 2026 EARNINGS - Lelezard](https://news.google.com/rss/articles/CBMiwAFBVV95cUxQVnFJMHZoUDRrS0pWTE80SGJ5X3V0Y00tR1U3MUwzeG41YzBIWUkzRG9kTjBhdHFFZFQxX0N3Y2tnZ1BmaXctQ0dnc0hpMTlwZWwtcEcwZE9STFVPSmxPTUpPQjU0SDlDaml0YnAyeF9jY2VIWmpvWE9keHAyODBHT251aHVvSFRreGwxTWg3dFNCb09FWV84OTY4WHpkNlhEZTBsblgySDNjMExrdTNWY2h3SWQ2ajUteDNkUjU4YVQ?oc=5) | 2026-10-09 00:07:19.000Z | 2026-10-09 06:35:34.573927Z | 2026-10-09 06:35:36.889637Z | 2026-10-09 06:35:37.340769Z | 2026-10-09 06:35:37.710347Z | `01a11f5f-d83d-7341-8e10-0ea6cdd81e4f` |

Stored identities and notification row references, in the same order:

- 1: notification `aff60ea1-b282-4c9f-bf18-d98013f22d77`; article `url:093cd388aa4eeebb516e9bbaec5a419580908a58aa4e5cace15c14f9b855712a`.
- 2: notification `9231f6ca-83bf-43ae-98c6-2d3c21bb52a6`; article `url:5eb8d6a33c2726d58abea73a8ea04cd203a5ae2af459e45fccde3e9681750fa2`.
- 3: notification `a1710532-4e81-4d19-bd82-24b028c54e5a`; article `url:edcbd138000e882968da3e889be8cb5bfc324d7c5f857526597fd16f674b2f05`.
- 4: notification `140dd064-73dc-4c13-b589-8fc7d518cfc1`; article `url:2c295db4f6b6ce75c67055807dca86a8cf565c0c8bfe288cbef52180f76a2cde`.
- 5: notification `178730a0-c8d6-4999-88f4-f1e67b05481c`; article `url:f57bc124498f0ee6a34367e1d25e8cae7ee7b16d9383a5bd99ed08039b1cd64e`.
- 6: notification `f3d73d9b-516d-443c-944b-ffbb383f0e12`; article `url:b46b03b76814026c5ae9052fc2f587bb7f8f32f38c278dfae63929ff5878b279`.
- 7: notification `ee8b1c63-ad88-4e52-8645-8b2b538f3188`; article `url:2e941d5f264ec105a49fb74720fbeba74f838f9c90498eab752d601af31ade6c`.
- 8: notification `a10dd48d-4215-4213-9d25-79ebfb39902f`; article `url:68afc70a5223ab2c264519fde9ec5116a4f155e1a837fa6aa5b9fe617fc09538`.
- 9: notification `f8a03ad9-9c6b-494b-ab30-8deea3d2eca5`; article `url:d63fbe68969ddd50a97751581221c520881c00ecd92ba63204ddf7be5f15feec`.
- 10: notification `d7d48001-3bf8-4296-91df-0035b8801c5c`; article `url:d934896c92a392f554c8af9266bc0515cf5228e17a3a332b3c923b9be97e594b`.
- 11: notification `b7d78e5e-ab47-4af5-8ca2-6a4b15e28e8c`; article `url:4e575c58ed2a71e79638a45f378a01434d574bda306680de12a4b24008d92af7`.
- 12: notification `c99711df-8c3e-4908-ab29-a67377d07aef`; article `url:3f4c51450a0964c3287e6c89427cf6820a8b999b9ceb5d57f34b348ef96af076`.
- 13: notification `6fac4796-3dd1-433a-a5da-8a0e3850380a`; article `url:38c26203c5978137cd8136321f6c95433e83661c13103112c578b0b426b12e26`.
- 14: notification `99f71934-f660-4ac6-bb07-407ca0161ed3`; article `url:c3893bb58324cb2b2b3e27d835ee424fddb38c5a8382a6cfd7b264edf81ed118`.
- 15: notification `a5bd13e9-409b-4520-9c78-f1630e09d637`; article `url:eaa0a334d9ba9734db4e6c29f1e467c281fff5cc767436c0fefe6a8b654a8873`.
- 16: notification `6e3c8040-7f6a-4c6e-860f-219a560e4040`; article `url:24ffafd94461e994caf2c602a391693b877319b6bc9a62b661343820c58ef636`.
- 17: notification `3f0db87e-3f9e-4ef9-a2f5-9d2705d803ae`; article `url:bb38b5cf515238045de5ef81c6ef17043e6b02683654fc4476871294d66b6afc`.
- 18: notification `e9d2c99c-c58a-4e1b-be82-7b200ea81c47`; article `url:56615eba37551fc2e1b3b9186160e4b260fc2df11ba65f85696de275b481d095`.
- 19: notification `dcd1a246-cd2d-435f-bfce-af6c64ef826c`; article `url:ee4a55fb1fba6af53d44664af435273fa2a3e3f55ec2c25061937d12b2988c2e`.
- 20: notification `c560d534-95fa-4496-abd0-9362b6d68159`; article `url:19766254e60134c614b868f2ea5095a6bcf979e44320ad1ac104bce835fee04b`.
- 21: notification `22afd009-fc0a-4428-b8ed-50cb539b6f60`; article `url:abb07d60e4d65379968eb14a463e4c08ad4fe1a1a8737b8dfe749c22be514749`.
- 22: notification `44de288c-7d43-40d9-b835-6266b0760975`; article `url:f3648adbac99eabf2495cdef66ff1d42e7d7bf7f0cbaf086597b34356ce38388`.
- 23: notification `2f6097ba-d020-44cc-817d-2de4d6d6d6a3`; article `url:4f776241ff032fc777792c124bb98a53db7a05af570b81e77a17beec698c3745`.
- 24: notification `65bfda62-a934-48ab-9d22-88b77b219cac`; article `url:3443ec5dc6e346f83b290e0a34cb050561482798dcad63f59e18479c00bcd053`.
- 25: notification `eb9df28e-f4a2-4ea6-a9a2-2025b0b3323a`; article `url:d3a3a05d4d8f0ec2317c839b14cf195dfcc1f5afb16be3db4207c4cdd757260f`.

Scope confirmation: documentation only. No production/staging data or configuration changes, no checks, retries, report generation, cron calls or emails. No push, merge or deployment. Both PRs remain on hold.

## Release candidate preparation — 9 October 2026

See [the isolated release candidate and staging plan](release-candidate-20261009.md).
The candidate contains this audit and the existing fixes exactly once. It is blocked
from a staging push until candidate-specific Preview overrides replace inherited
production browser configuration. No application change or release is implied.
