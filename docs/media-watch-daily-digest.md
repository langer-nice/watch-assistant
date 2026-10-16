# Daily digest — isolated legacy-first release

DO NOT MERGE YET. Reduce per-article emails to one daily UTC digest per Media/News
Watch. New gated Watches default daily_digest with consent OFF. Existing Watches
are never enrolled automatically: missing policy retains legacy immediate delivery.
Owners may explicitly choose Off/Daily digest/Immediately and consent independently
of monitoring. Pausing/opt-out cancels unsent work; re-enabling excludes old results.

## Scope and dependency map

Base: master 4536b6ac83a491752f209afd3fe4b48e36eb509e.

| Concern | Reused master contract / included adaptation |
| --- | --- |
| Outbox and article identities | Existing media_watch_notifications and canonical article keys |
| Atomic creation/completion | Wrappers around persist_media_watch and complete_scheduled_media_watch_check |
| Authorization | Existing auth.uid owner checks, auth.role service-only claims, RLS |
| Delivery | Existing media-watch-email/config and notification processor; no Preview bypass |
| Schedule | Existing media cron entry point; no new cron or API function |
| New feature | Policy and digest tables, leases, daily uniqueness, routing, EN/FR templates |
| UI | Native shared control, owner RPC, translated feedback, mobile/focus corrections |
| Viewing | Only the proven automatic title-translation caller removal; cached copy remains |
| Structured V1 | DEFERRED: no interpreter, creation, scheduler, notification or upstream migration |
| Other development work | No API consolidation, temporary diagnostics or private credentials |

Structured definitions are unsupported and refused. Reserved p_structured must be
false; it cannot enable Structured delivery. Necessary future Structured support
requires separate upstream review, not silent inclusion in this PR.

## Migration and rollout boundary

Only 20261017120000_media_watch_daily_digest_legacy.sql is included, after all
existing master migrations. New policy/digest tables revoke direct mutation from
application roles, enforce owner reads, and use authenticated preference RPCs and
service-only claims. No existing preferences are seeded or converted.

The development Staging already has a DIFFERENT migration:
20261016150000_media_watch_daily_digest.sql, with overlapping objects and Structured
integrations. Do NOT apply the isolated migration there or mark it applied based
on that old evidence. A separately approved clean master-based validation database
or explicit schema reconciliation is required before any hosted rollout.

## Gates and guarantees

MEDIA_WATCH_DAILY_DIGEST_ENABLED and VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED default
OFF. Existing email-delivery gates remain authoritative. Digest rows cannot enter
the individual-email claim path. Consent and pause are checked again at submission;
per-Watch/day uniqueness covers delayed digests too. Unknown provider outcomes are
terminal, not blindly retried. Templates show at most five safe article links,
conservatively group identical titles, and use no AI.

The native select retains Off/daily/immediate values. Named group, polite atomic
feedback, 44px targets, wrapping and conditional focus restoration incorporate the
five approved local UX corrections. Mobile New Watch is in-flow only when detail
preferences are visible; existing safe-area padding and desktop visibility remain.
The prior local Chrome/native macOS evidence is reused, not represented as hosted
or physical-device verification. No browser testing occurs in this isolation task.

## Validation and follow-up

Run focused digest SQL/worker, frequency/feedback/accessibility, legacy persistence,
cron and immediate-email regressions with NODE_ENV=test and synthetic providers.
Build without .env files. Do not call real Google News, Resend or AI.
Physical iPhone, nonzero safe areas, final fonts and the complete isolated hosted
page remain unverified. Keep all gates OFF until separately approved hosted checks
and migration review pass. No real Watches or preferences are changed by this task.
Automatic Vercel deployment is suppressed for this isolated branch before its push.
