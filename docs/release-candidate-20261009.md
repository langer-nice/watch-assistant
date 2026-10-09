# Release candidate preparation — 9 October 2026

**Ready for code review; BLOCKED for a staging push/deployment with the current
candidate-branch configuration. Not production-ready.** No remote changes authorized.

## Immutable inputs and local assembly

Isolated checkout: `/private/tmp/watch-assistant-release-candidate`.
Candidate branch: `codex/release-candidate-20261009`. The preparation commit containing
this document identifies the candidate (obtain full SHA with `git rev-parse HEAD`).
Parent: `099ca4a3dc347c5f9c2485dd0b8f654ae9cde1d6`.
Production/master base: `057cabcc16c50dc251b30c281929bc5ae9fd079e`.
Application code tested: `ccfa7aca8ffc052264569d965436a285e9b7bc6b`.

Read-only GitHub checks on 9 October confirm both PRs OPEN and unchanged:

- #53 `d4c184b0b39ffc12b12dc86a2fa6f29e995171e5`, `codex/media-provider-query`.
- #52 `889606fa0a1bbc31498dd040ff8fbca49a638e1b`, `codex/recurring-alert-policies`.
- Both PR bases remain `057cabcc`. #53 is an ancestor of #52; #52 is an ancestor
  of the reliability branch. No cherry-pick, merge or conflict resolution was needed.
- `63ea8025621af02a0132f01c3505835d8cdeb255` adds supervised-test documentation.
  `099ca4a` adds documentation and an opt-in local scheduled-email harness; it does
  not change deployed application code. The later production-email audit existed
  as an uncommitted documentation change and is included in this candidate.
- Original reliability branch and its working documentation remain preserved.
  Application/API/server/schema/build-input diff between ccfa7ac and candidate is
  empty. This preparation changes documentation only, not behavior or migrations.

Included: #53 query validation, persistence barrier, explicit recovery, compatibility
isolation, truthful Home/historical results/loading feedback; #52 recurring currency
policies, operators, daily dedup/history and truthful sync; durable creation/activation
failures, confirmed server-row requirement, company stable IDs and removal of fake
timer-based activation. No new generic monitoring capability or queue redesign.

Current production inspected 9 October 11:23:19 UTC: alias still resolves to
`dpl_CCkhH1wuCA74h3AB2FwgEMQc2Hto`, Production/master, SHA `057cabcc`.
The email audit establishes production records, not exact historical invocation
attribution or delivery validation of this candidate.

## Configuration preflight — 11:25–11:26 UTC

Inspection used ordinary authorized GETs, safe project/role comparisons, and skipped
write-only Secrets. No values were changed or exposed. "Present" is not "valid".

| Item | Existing #52 Preview | New candidate Preview, if pushed now | Production |
| --- | --- | --- | --- |
| Browser URL/key project | Staging, correct anon role | **URL is production**; inherited key write-only/unverified | Production, correct anon role |
| Server URL/anon/service key | Staging, matching expected roles | URL/anon inherited write-only; service key absent | Write-only, association unverified |
| Auth mode | `otp` | Absent → application defaults to magic-link | `otp` |
| Media/company email flags | Exact `false` / `false` | Absent / absent → effective gates false | Write-only; effective values unverified |
| Resend/sender/app email URL | Absent | Absent | Key present/unverified; sender present; app URL matches production HTTPS origin |
| Cron secret | Absent | Absent | Present, value/matching authorization unverified |
| Local HTTP opt-ins | Absent | Absent | Absent |

The verified staging settings are overrides for **codex/recurring-alert-policies**.
They do not apply to a new branch. GitHub integration is active, production branch is
master, ignored-build command is null, and no explicit Git deployment restriction
was returned. No repository deployment opt-out exists. A push may immediately build
and deploy a Preview. Never push this candidate until all eight branch overrides
below have been approved, installed privately and reverified.

Required candidate-only Preview overrides (no environment-default/Production edit):

1. `SUPABASE_URL` → `https://tseexvbwhrtofcsrvcqc.supabase.co`.
2. `VITE_SUPABASE_URL` → same staging URL.
3. `SUPABASE_ANON_KEY` → authorized staging anon credential.
4. `VITE_SUPABASE_ANON_KEY` → corresponding staging anon credential.
5. `SUPABASE_SERVICE_ROLE_KEY` → authorized staging service-role credential, server only.
6. `VITE_AUTH_MODE` → exact `otp`.
7. `MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED` → exact `false`.
8. `WATCH_EMAIL_NOTIFICATIONS_ENABLED` → exact `false`.

Keep Resend/sender/cron configuration absent for the shared staging Preview. Do not
inject `VERCEL_ENV=production`, enable local HTTP flags, or reuse production secrets.
No transport recipient allowlist exists in the application: the dispatcher addresses
the verified Auth owner. Disabled gates prevent monitoring email in Preview; Auth OTP
is a separate transport and must only target the dedicated test inbox after approval.

Browser configuration comes from VITE variables; server authentication uses the server
URL/anon key, and cron/service operations use the server URL/service key. There is no
browser-to-server fallback. Local HTTP exceptions require explicit development-only
conditions. Auth verifies the user server-side and uses owner-scoped RLS. OTP mode
omits a magic-link redirect, verifies the code on the original page and must resume
the retained request. Current staging `/auth/v1/settings` returned HTTP 200, email
Auth enabled, signup enabled, autoconfirm false. Prior staging code-only templates
and OTP journeys are recorded in #52; this pass did not re-read the private Auth
redirect allowlist, SMTP settings or templates. Their current exact state remains a
pre-deployment verification item, not a reason to send an OTP during preparation.

Email gates require exact `true`, VERCEL_ENV production and NODE_ENV not test, plus
valid provider/sender/HTTPS app config. No override in candidate vercel.json. Neither
historical media delivery nor unchanged configuration timestamps establishes company
email enablement or all credentials for the next production deployment. Preserve
those unknowns; do not replace Secrets to make them readable.

## Schema and integration order

Production read-only catalog (31 public functions plus Watch triggers/constraints,
registry and migration-table metadata) exactly matches the prior release catalog.
No Supabase migration registry is present. Required new wrapper/history features are
not installed there. This is scoped catalog equality, not a new full backup or RLS audit.

Staging PostgREST OpenAPI GET returned 200 and exposes watches, currency_watch_events,
persist_media_watch, complete_currency_watch_check, complete_scheduled_media_watch_check,
valid_feed_definition and both v1/local-recovery wrappers. Currency history exposes
watch_id/user_id/id/detected_at/article/evaluation. Prior 8 October evidence records
the reviewed staging ACL correction: anon none, authenticated SELECT, service_role
SELECT+INSERT, RLS on; all nine then-existing events preserved. These are not fresh
SQL grant/function-body proofs. No direct staging SQL connection was available in
this pass; exact current function bodies, effective inherited/PUBLIC grants and RLS
must be reverified read-only before hosted creation. Do not replay the correction.

The durable-creation fix adds **no migration**. Eventual production application order:

1. #53 `20261005160000_media_query_history.sql`.
2. #53 `20261006100000_local_media_recovery.sql`.
3. #52 `20261004120000_currency_alert_policies.sql` (despite its older filename).
4. #52 `20261004150000_currency_strict_comparison.sql`.

Use only missing, reviewed transactions after matching actual catalog prerequisites;
never global db push or filename-order replay on an existing DB. Check feed validator
wrapper chain, text-query revision/baseline triggers, local-creation preservation,
currency invalidation/completion, history owner RLS, grants and PostgREST relationship.
Currency strict comparison asserts the installed function text before rewriting it.
New-table default privileges may require the reviewed targeted correction if actual
state shows excess grants; do not assume either need or absence. Existing isolated
restoration/order/failure rehearsals remain evidence, not permission to apply SQL.

Eventual Git order: review/release #53, then reconcile #52 against released master and
review its currency-only delta; finally review/reconcile the durable-creation change.
The complete candidate can be reviewed/tested on staging before these merges. If #53
or #52 is squash-merged/rebased, compare resulting trees/patches and transplant only
missing changes onto actual master in a fresh local branch. Do not replay ancestors
or merge duplicate histories. Revalidate material reconciliations. Keep held published
branches unchanged until separately authorized. A single candidate merge would combine
all three releases and requires a new explicit release decision, not this preparation.

## Queue capacity — global aggregate, read-only

Snapshot: **9 October 11:24:48.233945 UTC** (13:24:48 Paris).

- Global media: 506 rows = 293 sent, 195 failed, **18 pending**. All 18 pending belong
  to David, across two Watches. Thus the earlier scoped 18 equals today's global count,
  established by this query rather than assumed. No account identities/content of
  other users were retrieved. Company outbox: zero rows/pending.
- Oldest pending: 9 October 06:35:34.754186 UTC; age **4h49m13s** at inspection.
  All pending have zero attempts and no submission boundary.
- Failed rows: 75 EMAIL_PROVIDER_ERROR and 120 WATCH_CHANGED. No failed_at audit
  column was queried; historical queue exits cannot be reconstructed exactly.
- Separate cap of 25 per company processor invocation and 25 per media processor
  invocation, **global**, not per account/Watch. Media orders created_at, watch_id,
  article_position, id; claim rules can skip ineligible rows. Company orders created_at.
- Successful persisted sends form one short ~06:35 UTC burst on each of 13 days,
  27 September–9 October. Nine of these days have exactly 25 media sends. This measures
  observed persisted output, not invocation count: empty/failed/overlapping executions
  and automatic versus manual origins are invisible without logs.

| UTC day | New media notifications | Persisted successful sends |
| --- | ---: | ---: |
| 2 Oct | 26 | 25 |
| 3 Oct | 23 | 25 |
| 4 Oct | 21 | 25 |
| 5 Oct | 10 | 10 |
| 6 Oct | 22 | 22 |
| 7 Oct | 24 | 24 |
| 8 Oct | 29 | 25 |
| 9 Oct, partial to inspection | 39 | 25 |

Seven complete UTC days 2–8 October: 155 arrivals (22.14/day), 156 successful sends
(22.29/day). Sends can drain earlier arrivals; ten 4 October arrivals are currently
failed. These output rates are **not** a computed guaranteed daily capacity.
For 5–8 October the retained rows show 85 arrivals versus 81 sends; the four Bitcoin
rows created on the 8th were sent first on the 9th, about 24 hours later. Then 39 new
arrivals minus 25 sends increases that recent retained-work balance by 14 to 18.
This supports recent backlog accumulation after quieter days, not indefinite growth
or stability. Deleted/history-rewritten records and failure transition dates limit
full historical reconstruction.

Oldest-first selection resists starvation by newer arrivals, but a large account can
delay others; no fairness quota exists. The Watch-check batch also has its own 50-row
limit. Failed notifications are terminal, including retryable provider errors; uncertain
submissions are not blindly resent. No backlog-draining/retry action is proposed.

**Decision:** not a blocker to isolated staging validation and no justified immediate
limit change. It is a production freshness/capacity acceptance item: near-daily batch
saturation and an observed ~24h queue delay cannot be presented as prompt delivery.
Before pilot release approval, agree the acceptable latency and inspect several normal
runs (completion logs, queue count/age, failures, provider rate limits). If growing age
violates that target, propose the smallest bounded additional dispatch/batch adjustment
with load/rate-limit/deadline/fairness tests; do not choose a new limit from one snapshot.

## Existing local-only requests

No automatic upload/recovery of unowned legacy Watches. Unsupported requests remain
on their original device with an explicit automatic-monitoring-unconfigured notice,
not confirmed Watching. A supported text request can offer “Review automatic monitoring”
then an explicit query confirmation and “Activate this news Watch”. Ownership and
server absence are checked again. Original local ID/date/history are preserved; local
results/seen IDs are not uploaded as a server baseline. The first server check creates
a new baseline without alerting on existing articles. Unsupported requests must be
edited into a supported request; unknown version/policy remains read-only.

Already owner-bound, supported pending journal work can retry on authenticated
initialization/online/storage events. That is normal authorized synchronization,
not adoption of unowned legacy data. Failures retain local data and truthful status;
a completed journal alone is not durable success without the server row. Inspect
these cases separately. This code review does not prove or recover Aymeric's records,
which remain on the original device until a separately supervised recovery.

## Executable staging acceptance plan (future authorization required)

### A. Scope/configuration gates before any push

1. Record `git rev-parse HEAD`, clean tracked worktree, base, held PR heads and candidate
   code-tree equality to ccfa7ac. Approve this exact candidate and its branch-specific
   configuration changes. Install/re-read the eight overrides above privately.
2. Obtain fresh read-only staging catalog/grant/RLS comparison against the candidate
   and existing rehearsal. Stop for drift; prepare any missing targeted SQL separately.
   No migration is currently proposed for already-migrated staging merely because a
   new code branch is deployed.
3. Confirm dedicated test mailbox/account authorization and the current OTP template,
   SMTP operation and exact-origin behavior. Never copy production accounts/data/keys.
4. Only after those gates, authorize one push of the exact preparation SHA to
   `refs/heads/codex/release-candidate-20261009` (automatic Preview expected). Do not
   push master, #52 or #53. Inspect deployment SHA, target=Preview, effective scopes
   and browser bundle association before loading/signing in; do not trust only a URL.

Example command, **not executed** and conditional on that approval:

```sh
git push origin HEAD:refs/heads/codex/release-candidate-20261009
```

### B. Hosted UI/API/DB flow, only newly created isolated test IDs

Approval must cover test Auth OTP, account/fixture creation, initialization sync,
individual checks and report generation; none is authorized by this preparation.
Use the dedicated test inbox/account, never personal Gmail or existing tester Watches.
Create a run manifest of newly created IDs/owner privately; all subsequent writes must
be limited to that manifest. Record deployment/time/request outcome without tokens.

| Test | Execution and pass criterion | Existing evidence / remaining work |
| --- | --- | --- |
| Signed-out media creation | Fresh browser, enter recognizable media request, real OTP on same Preview; exact request resumes; one stable UUID under verified owner; DB persistence precedes success/activation | Real local Nvidia journey passed on ccfa7ac; hosted candidate untested |
| Home/status | New/saved/pending/failed/active and compatibility reasons truthful; no report → explicit no-report message; historical result/source dates separate | Local + held-PR coverage; repeat only candidate-specific hosted path |
| Reload/fresh context | Reload first context; independently authenticate second browser/context with no copied tokens/storage; same ID/owner/history; no duplicate creation | Local and held #52 evidence; candidate hosted required |
| Report | Generate only test account report; visible loading, success/error and recovered controls; compatible successful checks counted, incompatible skipped; reload retains timestamp locally; second context has no copied report | Held-PR physical Chrome-on-iPhone flow passed; not proof for new candidate |
| Unsupported | Submit unsupported text; request retained, no active server Watch, explicit explanation; unknown-policy synthetic fixture remains incompatible/read-only | Local rejection passed; staging fixture creation needs approval |
| Save/activation failure | Isolated browser network interception denies save, or drops successful response after confirmed commit; same-ID retry, one row; deny initial check after save, preserve durable row and explicit retry/status | Local fault harness passed; use only test-context interception, not a hosted diagnostic endpoint |
| Auth interruption | Cancel OTP then resume; no premature success. Separately record whether full-page reload preserves anonymous draft; this remains unverified | Same-page local cancellation passed; do not claim full draft durability |
| Legacy local-only | Seed only a clearly synthetic browser-local fixture with no owner; reload does not silently upload/delete/activate; explicit review/confirm creates same-ID supported row and fresh baseline; unsupported stays local | Code/regressions, not recovery of real users |
| Baseline/dedup | Newly created test Watch establishes baseline without notification; repeat same observation creates no duplicate event; observe real retrieval separately from controlled feed transitions | Local 0→1→0 captured-email harness passed; deterministic staging fixture feed must be explicitly scoped/reviewed |
| Currency | Create crossing and changed-matching policies through form; save before activation; targeted real ECB retrieval/history and second-session hydration; same reference date dedup; strict > and >= at boundary in controlled tests | Real ECB checks/held #52 hydration + local deterministic transitions passed; no live daily-transition claim |
| Company | Supported SIREN, stable client UUID, owner-scoped persistence, actual BODACC baseline; same-ID retry after failed response; other-owner reads denied | Real local company path + repository failure tests; hosted candidate required |

Read DB evidence via read-only sessions after each authorized write. Preserve existing
records; no clearing journals, force-sync, bulk repair or transferring ownership. Any
unexpected owner/ID, premature success, cross-account access, hidden failure or false
active label is a stop condition. Do not work around it by recreating the Watch.

### C. Real scheduled execution and external delivery are separate gates

The candidate cron endpoint is Bearer-CRON_SECRET protected, has no user/Watch selector,
and traverses eligible accounts. **Do not invoke it against shared staging**, which
contains existing tester records. Vercel native crons run only on Production-target
deployments, not Preview; setting a secret on Preview does not create a scheduled run.
Source: https://vercel.com/docs/cron-jobs and
https://vercel.com/kb/guide/troubleshooting-vercel-cron-jobs .

For candidate-native scheduled validation, separately approve a dedicated Vercel test
project plus an empty hosted test database containing only synthetic accounts/fixtures.
No production data/credentials; do not reuse the shared staging database for this step.
Its Vercel environment would be named Production **only inside the isolated test
project**, with a distinct URL, DB, CRON_SECRET and both monitoring flags false.
Apply the reviewed schema to that empty database after isolation verification, deploy
the exact candidate, then wait for its ordinary configured run. Capture request time,
deployment, completion runId and outcomes within the available retention window;
correlate owner/ID, check result, revision/history and baseline/seen ledger. Observe a
repeat scheduled run for dedup. Manual scoped execution is supplementary, never proof
of actual native scheduling. This requires separate resources/schedule/deployment/write
authorization and is not an immediate action proposed for the shared Preview.

Disabled email gates mean that scheduled processing does not prove notification enqueue
or delivery. Controlled external monitoring email additionally requires its own explicit
approval: isolated DB/account set, approved recipient inbox only, dedicated provider
credentials/sender, correct test app URL, bounded fixtures and enabled gates confined
to that isolated project. Capture provider acceptance/delivery plus actual inbox receipt;
repeat observation sends zero additional messages. No production email settings change.
The existing local 0→1→0 Mailpit test remains local evidence until that test is authorized.

## Acceptance, rollback and approval boundaries

Staging acceptance requires exact revision/configuration isolation, fresh schema check,
owner/stable-ID persistence before success, truthful failure/compatibility/recovery,
reload and independent hydration, compatible reports, no unintended writes/emails,
and the explicitly scoped scheduled evidence above if scheduled validation is required.
A Preview UI pass alone cannot satisfy that final gate. Production approval separately
requires current server/gate assurance, backup freshness/catalog drift, reviewed targeted
migration order and latency acceptance. The October 9 emails do not waive these gates.

Before remote writes, retain reviewed schema/data/configuration evidence and a private
backup/recovery plan appropriate to the test environment. On a hosted test failure:
stop test actions and preserve evidence/fixtures; propose a forward correction. Do not
restore a whole shared database or erase other users' activity. Any disabling of a
new dedicated scheduler or reverting branch configuration/deployment must be included
explicitly in that later test authorization. There is no deployed candidate to roll
back during this preparation.

Migration rollback differs from code rollback. Before new-format writes, verify the
old app's compatibility with additive schema before considering a code rollback.
After new criteria/recovery metadata/recurring definitions exist, old clients can
remove criteria, reject metadata or mishandle policies; preserve current definitions,
revisions, history, baselines, seen ledgers, journals and outboxes. Prefer fix-forward;
do not blindly promote 057cabcc, undo wrappers, rebaseline Watches or restore a database
snapshot that discards unrelated activity. Production rollback is separately authorized.

## Validation performed for this preparation

No code or integration conflict changed, so no fabricated patch or repeated full suite.
Verified existing `/tmp/wa-review-tests.log`: **1,195 passed, 0 failed**; existing
`/tmp/wa-review-build.log`: build successful. These substantiate ccfa7ac application
code, not a new hosted candidate test. Existing 23 focused email/outbox tests and the
local scheduled harness are documented in creation-reliability.md. Application tree
comparison to ccfa7ac is empty; doc diff check and local harness syntax checks pass.
No tests invoking remote endpoints or local scheduled harness were rerun.

**Next approval package:** candidate-only eight Preview overrides; fresh read-only
staging schema/auth preflight; then one approved candidate push creating a Preview and
phase-B synthetic OTP/UI/check/report tests. No shared cron, external monitoring email,
production release or held-branch changes in that package. Phase C needs separate
isolation/resource/scheduler approval. Do not execute a partial package before its
configuration gates are satisfied.

No push, merge, deployment, hosted check, retry, email, remote data/configuration or
schedule change occurred. Both held PRs and the original reliability branch remain
unchanged. Documentation-only candidate preparation is committed locally.

## Authorized Preview attempt — 9 October 2026, blocked before push

Prepared SHA remains c622167442bc850f306a5cd4ebfaf670ff9cf3d0. The user authorized
candidate-only Preview configuration, then push/deploy only after isolation, and
synthetic tests afterward. Application code/dependencies remain unchanged.

Securely retrieved the eight exact staging override values from the existing #52
Preview scope; verified URL/project claims, key roles, OTP and false notification
flags without printing credentials. The candidate had no overrides. Retained a
private metadata/rollback snapshot under `/tmp/rc-preview-config-private` (not Git).
Vercel rejected the candidate-only bulk creation with HTTP 400:

> Branch "codex/release-candidate-20261009" not found in the connected Git repository.

A diagnostic resubmission returned the same explicit requirement after confirming no
partial entries. Final metadata comparison is identical to the pre-attempt snapshot:
zero candidate overrides; no shared defaults, held-branch or Production settings changed.
This is a Vercel API validation rejection, not an automatic approval-review rejection.
No push/deployment was attempted, respecting the explicit isolation-before-push gate.
The candidate branch remains absent remotely; held #52/#53 remote heads are unchanged.

### Additional staging schema evidence

Read-only SQL through the authorized dashboard for tseexvbwhrtofcsrvcqc inspected
all 34 public function hashes, security-definer/search_path settings and ACLs. Compared
with an empty local PGlite schema assembled from the candidate migrations: 33 hashes
match exactly. The sole raw hash difference is complete_currency_watch_check:
staging d0d06bb04d07c43ee97408a0acf9a3aa, local a22f5260736b1e20ecbde8b6674a55d4.
An exported definition comparison proves the difference consists only of two missing
comment lines; code is identical after removing comments/whitespace. No function
migration is justified by that discrepancy. Service-only completion/notification
functions and authenticated persistence/validator ACLs match the intended roles.
No function, trigger or row was changed; all executed SQL used BEGIN READ ONLY/ROLLBACK.

Current table-level effective grants, complete RLS/trigger verification and private
Auth templates/redirect configuration are still unfinished. Browser export completed,
but the subsequent browser-control session detached; native SQL editor input did not
reliably replace the query, so no unverified query was executed as a workaround.
Earlier ACL/OTP evidence remains historical, not a substitute for these current gates.
No real tester records, credentials or OTPs were read. No synthetic account/session,
Watch, report, initial check, cron or notification test was started.

### Narrow proposed sequencing exception — not executed

Vercel's documented branch-only git.deploymentEnabled switch provides a safe bootstrap
route (https://vercel.com/docs/project-configuration/git-configuration). The reviewable
local `candidate-bootstrap-proposal.patch` adds exactly:

```json
"git": {
  "deploymentEnabled": {
    "codex/release-candidate-20261009": false
  }
}
```

This is a proposal, not an applied change to vercel.json or remote configuration.
It affects only the candidate branch; unspecified branches retain their default.
Request explicit authorization to amend the original ordering as follows:

1. Commit this branch-only no-auto-deployment guard and push only the candidate branch
   to register its existence, **before** environment isolation, with deployment disabled.
2. Verify no deployment occurred, install the eight candidate Preview overrides, and
   verify staging association/disabled flags plus the remaining schema/Auth gates.
3. Remove that guard in a new candidate commit only after isolation is established,
   push to trigger the authorized Preview, verify exact revision and run the authorized
   synthetic checks. No force push or held-branch change.

The original instruction says not to push before isolation, so this bootstrap push
is not presumed authorized merely because it is designed to suppress deployment.
Do not alter project-wide defaults, disconnect Git integration, or push c622167 with
unsafe inherited values. David's final supervised creation remains pending: no ready
Preview URL exists yet and no creation/reload instructions are issued prematurely.

## Authorized bootstrap — 9 October 2026

David explicitly authorized the branch-only bootstrap exception. At 11:50 UTC the
project still used GitHub/master, without an ignored-build command or competing
Git deployment override. Current Vercel documentation confirms an exact branch false
rule disables commit deployments, with unspecified branches unaffected. The applied
vercel.json contains only the exact candidate rule and no competing true pattern.
The remote candidate branch returned 404 before this first push. Application code,
held branches and all other vercel.json settings remain unchanged. Deployment stays
blocked until eight candidate-only settings and staging Auth/RLS gates are verified.

### Bootstrap and isolation observed — 11:52–12:02 UTC

Protected bootstrap commit: 4e24d44a837bed81d1ef18f2fd2f24ab3ac11c41. Only the
candidate branch was pushed. Vercel lists by branch and SHA returned zero deployments
immediately and again after configuration/readiness inspection; no cancellation needed.
The eight exact candidate/Preview overrides were created and individually re-read:
all five Supabase settings match staging (anon/service roles verified), OTP is `otp`,
both email strings are `false`. All unrelated environment metadata matched the private
before snapshot. Private rollback metadata remains outside Git. No shared defaults changed.

Current read-only staging SQL exported 33 catalog rows and a 27-row effective privilege
matrix. All nine public tables have RLS enabled. Watch/profile CRUD policies enforce
Auth ownership on both USING and WITH CHECK; snapshot ownership and parent ownership
checks are present. Currency history permits authenticated owner SELECT and service
SELECT+INSERT only; anon has no table rights. Effective checks include inherited/PUBLIC
rights. Authenticated and anon are neither superusers nor BYPASSRLS; service is BYPASSRLS
as expected. All nine public triggers match the candidate's intended behavior. Prior
34-function comparison remains valid (one comment-only difference).

Legacy privilege limitation: authenticated still has TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
on profiles, watches and company_watch_snapshots; service_role has those rights on the
other eight tables. These are existing grants left by the older migrations (which do
not revoke them), not introduced by the candidate. RLS is not protection for TRUNCATE.
No app route/public RPC exposes arbitrary SQL or TRUNCATE in the inspected code/functions;
normal PostgREST row operations remain owner-scoped. This does not block isolated normal
UI tests, but it is explicitly NOT a least-privilege certification and needs separate
hardening review before a broad release. No privilege changes or destructive probe made.

Auth URL configuration still points to the older staging branch (three allowlisted
variants). Both sign-in and signup templates contain only .Token and instructions to
stay on the original page; no ConfirmationURL/SiteURL/RedirectTo links. Candidate OTP
mode omits emailRedirectTo and verifies on the same origin. Therefore no callback URL
or shared Auth change is required for this OTP-only test. No OTP has yet been sent;
actual delivery is a hosted acceptance test, not inferred from configuration.

Candidate application/schema/build inputs still match tested ccfa7ac. Existing 1,195
passing tests/build are reused; temporary vercel.json guard syntax/diff checks passed.
Isolation gates for scoped UI testing are satisfied; remove only the temporary guard
next. All hosted candidate acceptance results remain pending until observed.
