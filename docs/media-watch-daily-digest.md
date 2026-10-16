# Media/News daily digest V1 (local, disabled by default)

## Release and compatibility

`MEDIA_WATCH_DAILY_DIGEST_ENABLED=true` selects the new transactional creation
wrappers and shared digest processor. It is absent/false by default. The migration
is local only; apply it before enabling the gate in any future approved environment.
No user rows are backfilled. Existing Watches, old creation retries, sent emails,
cancelled intents, Company and Currency retain their contracts. The old immediate
worker remains available; its SQL claim refuses daily/off records. The exact
Structured Staging selector still works for eligible immediate records and cannot
claim a digest member or fall back to another notification.

New eligible Media/News creations default to `daily_digest` **with consent OFF**.
Setting a default frequency is not email permission. Existing Structured boolean
consent is still mandatory; its setter synchronizes an enrolled policy. New legacy
Watches require an explicit owner preference before they can email. Unenrolled
legacy Watches retain the existing production/global notification contract.

## Durable model and periods

Individual matching articles still enter `media_watch_notifications`, after the
existing matcher, baseline suppression and persistent identity checks. Each row
captures `delivery_mode`; nullable `digest_id` is its unique durable membership.
No rows are moved to an unrelated second article queue. `media_watch_digests` is
only the shared envelope/claim ledger. Its unique `(watch_id, period)` constraint
prevents concurrent duplicate intents; Watch locks protect preparation and consent.
Preparation freezes membership. Later observations wait for the next digest;
preparing an envelope never marks its articles sent.

V1 uses **UTC calendar days** and the first authorized invocation at/after
`MEDIA_WATCH_DIGEST_SEND_HOUR_UTC` (integer 0–23, default 8). The current profile
schema has a timezone field defaulting to UTC, but this change has no verified
user-selected timezone contract. It deliberately does not infer one from locale,
IP or browser. Reliable per-user timezone/send-time preferences are a follow-up.
The SQL clock is authoritative; clients cannot supply the day or force due time.
There is no new cron or endpoint. Existing authenticated cron processing can run
this worker; actual scheduling cadence and hosted activation need separate approval.
No invocation means no promised delivery time. A delayed prepared envelope keeps
its original period; a second unique constraint and a locked boundary check allow
**at most one provider submission per Watch per actual UTC day**, even if several
periods are pending. Empty matches never prepare a digest. Delayed pending articles
remain durable, not an in-memory batch.

## Delivery and failures

Existing server configuration, Resend transport, confirmed Auth recipient,
localization, deadlines and trusted application origin are reused. Production
continues to exclude Structured delivery. The existing independent exact-project,
branch, Preview, owner and recipient gates authorize Structured Staging delivery.
No secret is added. Neither email consent nor frequency activates monitoring.

A digest claim can recover an expired pre-submission lease; concurrent claims have
one winner. Consent and Watch state are rechecked under the Watch lock at the
submission boundary. The envelope and member articles record that boundary before
the single sender call. Completion marks only those members sent. The Resend
idempotency key derives from Watch/day, independently of article count.

Provider failures follow the current worker's **terminal** policy, including errors
labelled retryable: preserve failed members and diagnostics; do not automatically
resend. A lost provider response or lost completion leaves a durable submission
boundary and prevents reclaim/resubmission. It may remain `submitting` for later
read-only reconciliation. No promise of external exactly-once delivery is made.
Intent uniqueness, attempt limits, provider acceptance and inbox receipt are
separate claims. Failed/unresolved records require a separately designed recovery
policy, not automatic copying into another digest.

## Preferences and lifecycle

Owner-authenticated RPCs:

- `get_media_watch_email_policy(watch_id)` returns effective stored frequency and
  consent. Unenrolled Watches report the preserved `legacy` immediate contract.
- `set_media_watch_email_policy(watch_id, mode, enabled)` accepts `daily_digest`,
  `immediate` or `off`, with a separate explicit consent boolean (`off` requires
  false). It rejects other owners, Company and Currency. No direct table writes.

No-op preference saves do not cancel a digest. Actual frequency/consent changes
cancel unsent members and prepared/claimed envelopes, preserve sent/history rows,
and establish a fresh eligibility cutoff. Off observations stay in monitoring
history; re-enabling does not resurrect old members or enqueue a backlog.
Pause/delete/definition change cancels unsent work. Resume preserves baseline and
identity history; previously cancelled members remain terminal. Already begun
external submissions cannot be recalled; such races retain their audit boundary.
Global transport-off maintenance preserves pending daily members while preserving
the old immediate maintenance behavior. Monitoring enqueue wrappers independently
recognize enrolled consented policies when transport gates are off, without
altering the old Watch enqueue contract.

The shared frequency UI is implemented in the existing Watch detail settings.
`VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED=true` explicitly enables it; absent/false
preserves the existing Structured boolean UI and does not introduce legacy controls.
For a future release, apply the migration first and coordinate this browser gate
with server `MEDIA_WATCH_DAILY_DIGEST_ENABLED`. No gate is enabled by this change.
If the owner RPC is unavailable, denied or returns an unknown policy version, the
new control stays hidden/disabled; it never falls back to an implicit opt-in.

The frequency select offers Off / Daily digest / Immediately, localized in EN/FR.
An independent checkbox explicitly permits emails. Selecting a frequency alone
never checks it or grants consent. Selecting Off withdraws consent; checking consent
from Off chooses the daily default. An existing immediate preference is displayed
as-is, without a save on load or translation. An unchecked consent state is clearly
labelled inactive even when the stored frequency is daily. The UTC fallback is shown
without promising a delivery time. Owner RPC reads populate controls after every
reload; failed/contradictory saves restore both confirmed values. Busy controls
prevent overlapping writes; account changes and page teardown scrub the UI and
ignore stale responses. No localStorage or monitoring mutation is involved.

## Content and local validation

EN/FR templates reuse the existing font/color conventions, sender and safe internal
links. They display the digest date, total new relevant article count, at most five
prominent article links, publishers/dates, all-results link and authenticated
per-Watch email-settings link. HTML is escaped and URLs must be credential-free
HTTPS. No summaries are fabricated and no AI calls occur. Only exact normalized
titles are grouped; all distinct identities remain persisted. Fuzzy clustering
and relevance-matcher changes are intentionally excluded.

Focused PGlite tests exercise the real migrations, completion/claim/boundary RPCs,
19-to-1 delivery, owner/RLS/ACL checks, consent, pause, no backlog, UTC boundaries,
delayed periods, concurrency, failure uncertainty, legacy compatibility and the
real worker with a synthetic sender. Existing focused email, scheduler, API,
Company/Currency outbox and exact-selector regressions are reused/run separately.
No real network, monitoring source, email, hosted migration or deployment is used.

Next: review this local migration and focused test evidence; review the shared
frequency UI and paired feature gates; then separately approve an isolated Staging
migration and gate-off compatibility verification. Any hosted activation or real
email test remains separate. Existing users require explicit preference changes
or a separately authorized migration, never a global conversion.

### Local mobile and keyboard finish (2026-10-16)

The shared preference keeps its native select and existing Off/daily/immediate
RPC values. Labels/selects provide at least 44px touch targets and wrap within the
page. On detail pages with visible Media/News preferences, the mobile New Watch
action is in normal flow, retaining its existing safe-area padding. Other pages,
hidden controls and desktop action visibility keep their existing rules.
The group is named; feedback stays polite/atomic. Saving marks the group busy;
when disabling a native control blurs it, completion restores its focus only if
focus remains on the document body. Owner changes and later user focus win.

Local Chrome geometry uses actual compiled SCSS and markup at 320/375/430/1280px,
FR/EN, with synthetic legacy/Structured RPC policies. Native macOS keyboard input
verifies Space, arrows, Enter, Tab, focus restoration and the owner-RPC parameter
contract. This is not a hosted persistence or physical-device test. iPhone safe
areas, production fonts and the complete hosted page still require confirmation.

Next, with separate authorization: commit/push only these UX files, deploy a
Git-pinned disabled Staging Preview, enable only the branch UI gate, reuse the two
existing paused/consent-OFF fixtures, check full-page mobile/keyboard behavior,
restore preferences and gate, deploy disabled and contain the enabled Preview.
Backend digest, scheduler and email gates stay disabled throughout. No part of
that publication plan is executed by this local task.

### Structured Staging integration finish

The existing `/api/structured-watches` endpoint now exposes authenticated,
owner/revision-bound activation and pause through the existing service-only SQL RPC.
Activation requires the scoped scheduler gate; pausing remains possible when it is
off. The detail UI uses a separate owner-bound control and refreshes server state
without changing definitions, consent, frequency or legacy controls. Interval: daily.
The authenticated `scope=structured-media` cron path now also calls the existing
notification processor when the digest gate is on; delivery retains every existing
owner/recipient/environment/email gate. No new endpoint, cron or migration is added.
A deterministic full-SQL test connects activation, baseline, 19 new matched articles,
one durable digest, one mock submission, deduplication and independent pause/opt-out.

Operational limit: Vercel native cron only runs on Production deployments. The
existing Hobby project supports daily native cron, not hourly. The Staging Preview
therefore needs a separately provisioned authenticated recurring caller of the
existing scoped endpoint. No external scheduler, account, secret or security bypass
is created speculatively; Production cron is untouched. Keep live execution and
email gates off until that operational configuration is explicitly established.
