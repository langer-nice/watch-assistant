# Limoges: captured arrest information omitted from delivered email

Scope: existing Staging Watch `57a011cd-7686-4b21-a5f1-64a164de2568`, October 20–21 only. No monitoring checks, paid AI calls, SQL changes, email submissions, preference changes or historical replay. Cron remains 08:15 Europe/Paris.

## Proven timeline (Europe/Paris, UTC+02:00)

| Evidence | Timestamp |
| --- | --- |
| Arrest-bearing feed item publication (`article.publishedAt`) | October 20, 11:30:18 |
| Captured matching update (`media_last_change_detected_at`) | October 21, 08:00:49.973 |
| Durable notification creation | October 21, 08:00:50.082507 |
| Digest claim | October 21, 08:15:21.829144 |
| Provider submission started | October 21, 08:15:22.596682 |
| Digest and four members marked sent | October 21, 08:15:22.979742 |
| Latest subsequent snapshot, corresponding to the user's manual report | October 21, 09:30:35.807 |

The captured item is headed “A Limoges, l’hôtel de ville incendié en marge des manifestations « n’est pas encore sauvé » - Le Monde.fr”. Its stored Google News excerpt also contains “Un homme soupçonné d'être impliqué dans l'incendie de l'hôtel de ville de Limoges le 17 octobre interpellé en Haute-Vienne franceinfo”. That sentence refers to a related report inside the feed excerpt, not the Le Monde headline. The feed item's publication timestamp is proven; the original franceinfo arrest report's own publication timestamp is not separately recorded. There is no timestamped seen-article history proving an earlier first discovery. The 08:00 capture and queue are durable evidence before the 08:15 send, not an inference from publication alone.

Digest `f0038dce-73d4-4a90-9331-a982174a9831` contains exactly four sent notification members, including arrest-bearing notification `f509897f-fd51-4b14-abfb-8e60aab5fa4f`. Its provider ID is `01a15d19-9f34-7a2f-9fab-2a02c5bb5093`. Read-only inspection of that exact email in the authenticated Resend dashboard confirms Sent and Delivered at 08:15 and four headings. Neither its HTML preview nor its Plain Text contains the arrest sentence. The article is included; the arrest information is not. No duplicate exclusion or digest-selection failure explains this incident.

**Root cause: presentation.** `renderMediaWatchDigest` renders title/source/date/link but drops every stored summary. The only explicit arrest statement was in that summary. It therefore appeared in the application's stored update but not in the delivered email. This is explanation D (selected article presented without its relevant context).

The source matcher checks story relevance through location/event concepts and title/excerpt evidence; novelty is article identity. It does not classify or rank an arrest versus repeated fire coverage as semantic events. No unsupported event classifier is introduced to fix this demonstrated information loss.

At inspection (09:39 Paris), all four notifications were sent and none remained pending. The arrest-bearing article is durably retained as sent, not queued for another morning. Re-queuing it would be a prohibited historical replay. Subsequent no-new-item checks did not remove those records. Future genuinely new accepted articles retain the existing durable outbox pathway.

## Minimal correction

An optional renderer argument includes escaped, bounded (1,200 characters) source excerpts in HTML and plain text. Only the existing gated Staging legacy digest worker enables it, so Production and the Structured worker retain their default output. The excerpts are labelled as source excerpts, not AI conclusions. Subject, links, ordering, membership, consent checks, morning window and idempotency stay unchanged. No data is rewritten and the already-delivered email cannot change.

Morning Brief is a saved account-scoped browser report (`report-storage.js`, `selectHomeReport`). Server hydration deliberately does not regenerate report snapshots or completed-check counts. Generation is explicitly bound to the Home report button. Yesterday's saved report remaining until manual generation is current designed behavior, separate from the proven email omission. Eight report updates do not imply eight newly eligible email envelopes. No Home redesign or unrelated Watch investigation was undertaken.

## Focused verification

`NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' node --no-maglev --test server/limoges-digest-presentation.test.js`

Four tests pass: real four-article fixture in EN and FR reproduces omission with default rendering and exposes the arrest with the fix; escaping/bounds/default compatibility; gated Staging worker passes the real summaries to a fake sender and rejects Production. No hosted test data or email is created.

Deployment: pending the single authorized Staging release.
