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
