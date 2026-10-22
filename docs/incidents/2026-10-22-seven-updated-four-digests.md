# October 22: seven Updated Watches, four delivered digests, stale Morning Brief

Targeted Staging inspection at 09:53:59 Europe/Paris. The user explicitly identified the seven Home entries below. Read-only SQL inspected their Watch/consent/notification/digest records; the four exact provider IDs were inspected in Resend and all show Delivered. No monitoring/report action, email submission, consent change, hosted write, cron modification or Production access was performed.

Times below are Europe/Paris (UTC+02:00). “First proven capture” refers to the currently displayed stored update, not proof of first-ever discovery: the compact seen-article ledger has no per-identity timestamps. Home membership is confirmed by the user's seven-name list; the browser report and read acknowledgements are local, and are not inferred from the nine server-side `current_status=updated` rows.

| Watch | First proven capture / publication | Updated on Home | Email consent/frequency | Daily digest eligible before 08:15 | Delivered email | Explanation |
| --- | --- | --- | --- | --- | --- | --- |
| Royal Caribbean Cruises media mentions — legacy; `33c7cade-2c3e-401b-b015-ca0364338d96` | Capture 22/10 09:30:14; publication 21/01/2026 09:00 | Yes, user-confirmed | No explicit daily policy. Legacy policy reader defaults to enabled/immediate; this is not an explicit daily opt-in. | No | No Staging digest | Latest update captured after the morning send; this legacy Watch is outside the three-UUID Staging daily adapter. No daily notification or digest exists. The displayed article itself is old, not proof of a new current development. |
| Bitcoin media mentions — legacy; `8e01b729-3e64-4c4f-b074-6a98ad2802e2` | Capture 22/10 09:30:20; publication 21/10 21:30:24 | Yes, user-confirmed | No explicit daily policy; same legacy immediate default | No | No Staging digest | Captured after 08:15; outside the scoped legacy daily adapter. No daily notification or digest. Neither this nor the previous row is described as consent OFF. |
| Limoges — legacy; `57a011cd-7686-4b21-a5f1-64a164de2568` | Latest capture 21/10 21:00:47; publication 21/10 12:42:13. First member of the sent batch queued 21/10 11:00:50. | Yes, user-confirmed | ON, daily_digest | Yes | 22/10 08:15:22, nine articles | Daily batch was durable before the morning send and all nine members are sent. Latest 09:30 check has no matching new items; Updated can remain until read. |
| Gucci — Structured; `ce6b5705-c383-4a77-a695-31e14b2986f8` | Capture 22/10 09:30:28; publication 21/10 23:30:13 | Yes, user-confirmed | Structured consent OFF; no daily policy | No | No | Explicit consent is false. New matching information in Home does not authorize an email. |
| Real Madrid — Structured; `9b3fabff-9a85-4991-abd0-62b6365d45f6` | Latest capture 22/10 09:30:39; latest publication 22/10 08:22:40. Sent batch captured 21/10 09:30:44. | Yes, user-confirmed | ON, daily_digest | Yes, for the previous durable batch; no for the later 09:30 discoveries | 22/10 08:00:52, nine articles | Earlier batch delivered; 13 additional notification members created at 09:30:39 remain pending, with no claim/submission/digest assignment. |
| Royal Caribbean Group — Structured; `c86223f3-c4cc-42a9-b7a1-420eb8a75dac` | Capture 21/10 09:30:46; publication 20/10 22:44 | Yes, user-confirmed | ON, daily_digest | Yes | 22/10 08:00:53, one article | Previously unseen stored update delivered today; today's 09:30 check has no matching new items. An unread Updated badge does not mean a new article today. |
| Jannik Sinner — Structured; `672a8533-c48f-4dd4-aab4-2064f0eb6702` | Latest capture 22/10 09:30:44; publication 21/10 14:02:33. Sent batch captured 21/10 09:30:51. | Yes, user-confirmed | ON, daily_digest | Yes, for the previous durable batch; no for the later 09:30 discovery | 22/10 08:00:51, four articles | Earlier batch delivered; one additional notification created at 09:30:44 remains pending, unclaimed and unsubmitted. |

The latest successful checks for these seven Watches are respectively 09:30:14, 09:30:20, 09:30:23, 09:30:28, 09:30:39, 09:30:41 and 09:30:44 on October 22. No last-check errors are recorded. The four daily digests contain 23 sent article members. The remaining 14 pending members were first durably captured after 08:15 and remain available for the next eligible daily send, subject to unchanged consent/state. Article publication before 08:15 alone does not establish discovery before 08:15. No missing eligible pre-window daily notification was found among the seven. The four delivered Staging digests correctly correspond to the four daily-consented Watches with durable eligible batches; this does not establish that every legacy immediate-mode email path is supported on Staging.

Exact Resend provider IDs:
- Limoges: `01a1623f-f8e2-7955-a1a8-8c1bbd7ef1f6` (Sent/Delivered 08:15).
- Sinner: `01a16232-ad39-7c03-bcd1-1e4fd9c81612` (Sent/Delivered 08:00).
- Real Madrid: `01a16232-b375-7c1f-9d35-e1ac3e462c44` (Sent/Delivered 08:00).
- Royal Caribbean Group: `01a16232-b78f-7dc8-aac8-4fd6ac94006e` (Sent/Delivered 08:00).

## Separate proven notification defect: early Structured submission

The hourly `scope=structured-media` handler calls `structuredNotificationProcessor`; the existing morning-window gate permits 08:00–08:30. Consequently, its 08:00 monitoring invocation sends Structured batches 15 minutes before the agreed dedicated 08:15 job. This explains the actual three 08:00 deliveries, not the 4/7 count.

Repository-only correction: remove delivery from that controlled Staging monitoring route. Keep both monitoring runners; the existing authenticated email-only route continues to process Structured and legacy batches at its existing 08:15 schedule. No SQL, policy, sender, digest membership, idempotency or cron configuration changes. Production's normal route is untouched.

Two focused offline tests pass:
`NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' node --no-maglev --test server/staging-digest-route-timing.test.js`
They verify hourly checks never call either sender/processor (08:00 and 08:15), and the dedicated email route still processes both types without monitoring. No previous suites or live endpoints were rerun. Correction prepared locally; not deployed.

## Morning Brief: missing feature, not a report-loading regression

`generateReport` in `src/js/report-service.js` is invoked by the Home button. It runs the existing check controller for each eligible Watch, then `saveReport` persists the report to account-scoped browser localStorage (`watchAssistant.reports.v2.account.<owner>`). `getReports` sorts by completedAt descending; `getLatestReport` and `getHomeReport` read that latest local snapshot. Report-change/storage/visibility handlers re-render it. `selectHomeReport` deliberately keeps the saved snapshot separate from newer server hydration. There is no implemented server report store, report-read API or automatic server report generator. The inspected cron scopes monitor and/or deliver notifications, not reports.

Therefore yesterday's saved report remained until the user generated a new one. No already-available newer server report was found that a safe loader-only correction could expose. The exact old local snapshot was not independently read; the observed stale date comes from the user, and the persistence mechanism establishes its cause. Automatic Morning Brief remains an agreed but unimplemented requirement.

Manual generation is not a read-only redraw: it performs fresh monitoring checks. It can discover new article identities and atomically create eligible notification rows. The 14 post-08:15 pending rows are direct evidence that this path preserves newly captured eligible articles. Local report provenance/read state is separate from outbox claims, consent and sent status. Home viewing/refreshing does not consume pending notifications; opening an Updated Watch changes its local read presentation, not the notification rows. No baseline reset, historical replay, new preference or notification submission was performed here.

## Exact minimum implementation, not activated

1. Add a private account-scoped persistent report store in the existing Staging Supabase database, with explicit grants/owner RLS and a service-only write boundary. Store the existing report-v2 shape plus automatic/manual provenance; retain manual report history and permit only one automatic report per owner/Paris day.
2. After the existing 08:00 hourly monitoring completes, compose a report from the already durable active-Watch results and save it before 08:15. Preserve per-Watch checkedAt/status so an old or failed check is not represented as fresh. No new collection, paid AI, credentials, scheduler or cron-job.org change is needed.
3. Have authenticated Home load the latest owner report, retaining the current New/Updated/read rules and the manual Generate Report action. Manual generation saves through the same report boundary; outbox eligibility and read acknowledgements remain separate.

This requires a database migration and the associated server/UI persistence path. Per this task's instructions, implementation/activation stops before those changes; it is not represented as a Home-refresh fix or as delivered automation. A separate explicit authorization is needed for the report-store migration/activation. No deployment was attempted in this investigation.
