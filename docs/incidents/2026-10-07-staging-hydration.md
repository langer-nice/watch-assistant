# Staging loading investigation and read compatibility

## Evidence and limits

The reported preview was commit `5e1f13cc0c5d6129d14f1422d745731e3e664a6d`. Staging logs around 6 October 12:00–12:10 UTC show authenticated Company and media GET responses with HTTP 200, including repeated requests. Logs do not identify which request was the iPhone's, prove client receipt/validation, or establish same-account identity. No browser credentials were extracted.

The user's exact staging Watch `58febf62-2adb-4f1e-a6a3-2a5f41a025ff` exists, not deleted, revision 1, created `2026-10-06T11:55:22.587705Z`, first successful check `2026-10-06T11:55:25.198Z`. Its persisted news definition and focused query validate. It belongs to the earlier synthetic account subsequently used by the tester. Its state was inspected read-only; no recovery or check was performed. The user cannot verify the iPhone account through the profile menu. The exact physical-device failure is therefore still unconfirmed.

A separate confirmed defect was found in staging data: PR #52 recurring-currency definitions (`gt`, daily policy and request syntax unsupported by PR #53) fail the client-side *write* validator reused for reads. Mapping the whole response through that validator rejects every media Watch for that account, although the server returns 200. Retrying receives the same definitions and fails again. This reproduces both empty fresh-session lists and stale cached lists with disabled report controls. It is not proof that the tester's original iPhone failure had this cause; the affected pre-existing rows belonged to other accounts.

A synthetic incompatible row temporarily reproduced the failure in the earlier test account. Once that account was identified as the tester's, that task-created, never-checked row was soft-deleted with a backward-readable tombstone. The user's Watch was untouched. Further fixtures use a separate synthetic account. Existing PR #52 rows, functions and schema are unchanged.

## Correction

Readable persisted envelopes are validated separately from editable definitions. Unsupported definitions stay visible, explicitly read-only, with their original criteria/policy/history preserved; compatible rows hydrate normally. No generic conversion or currency feature merge is performed. Invalid response envelopes remain errors, preserving the last valid account snapshot. Unsupported rows cannot be checked, edited, paused or deleted through this client; pending writes for known incompatible rows are not replayed.

The loading notice distinguishes a failed subsystem from available Watches, hides examples during uncertain loading, reports bounded diagnostic error codes, and shows visible retry progress. Explicit retry is read-only and coalesces repeated activation, then either shows the recovered list or leaves an actionable error. Ordinary background reads remain silent. Network/invalid-JSON responses now have stable diagnostic codes. Report generation remains disabled for incomplete hydration and does not run from Retry. Incompatible Watches remain excluded from successful-check/quiet counts.

The earlier Company hydration warning has not been causally tied to the recurring-currency defect, which occurs in the media subsystem. No iOS-specific cause is established. Browser/fixture and physical-device evidence must remain separate.

## Validation

Final test, compatibility and hosted-preview results are recorded in PR #53. Deterministic tests cover mixed-version data, independent Company failure, failure → retry → failure → successful retry, rapid clicks, preserved data/read-only protections, no POST from retry, stale reads after logout, malformed JSON and offline errors. Existing resilience, deferred-navigation, expired-session/account-switch, initial-context, silent-read and query/history suites remain required.

No migration is required. Browser and server preview variables must both target staging and both monitoring email flags remain false. No production access with writes, deployment, merge, notification or check is part of this work.

## User retest

Use the new exact preview URL in PR #53 on both devices. Do not recreate a Watch, clear storage or sign out. Open the existing Watch ID above and All Watches. If loading fails, click Retry once and report the visible diagnostic code, device/browser and approximate time. A same-account check remains necessary if the result is a successful empty account or Watch-not-found; the old immutable preview does not receive this fix.
