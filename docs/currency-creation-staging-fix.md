# Currency creation follow-up for PR #52

## Diagnosis

The original review deployment and PR head were both
`c27655460ac36ff7f89e4017206fe13eaef5259d`. Browser and server URL/key project
references were rechecked against staging `tseexvbwhrtofcsrvcqc`; OTP mode is
on and both monitoring email flags remain false.

The currency parser accepted only a narrow “pound reaches … euro” grammar and
always emitted `gte`. Both the user's French request and the reported
reformulation returned null. The planner/source resolver consequently treated
them as news searches, not ECB currency conditions. The AI suggestion could
also discard “the rate changes”; policy selection existed only in the detail
view, and new Watches defaulted to the legacy once policy.

The existing hosted page displayed the reported unsupported result and the
lossy reformulation. Replaying the exact original request instead created an
incorrect news-feed Watch, proving the routing defect independently of source
availability. That staging reproduction (`f1fb9e0b-37b9-4b9a-9c51-4a951288a75a`)
was immediately paused. No claim is made about the historic news fetch's exact
upstream failure: the old catch path mapped all source failures to unsupported.
No ECB request is made by currency source discovery; the failure was not proof
that ECB GBP/EUR support was unavailable.

## Correction

- Shared deterministic FR/EN parsing retains currency direction, decimal comma
  or point, and `gt` versus `gte`. Conflicting conditions and unsupported currency
  instructions require clarification instead of falling through to news.
- The original request remains authoritative and is persisted verbatim (outer
  whitespace aside). Recognized currency requests bypass AI reformulation.
- Before creation, a confirmation shows the original, exact comparison and daily
  ECB cadence. Explicit recurring-change wording selects `daily`; otherwise a
  concise choice is required. The user can select once, crossing or daily.
- Strict comparisons are evaluated with exact rational arithmetic in JavaScript
  and independently recomputed in PostgreSQL, including inverse currency pairs.
  Display rounding cannot contradict the decision.
- Source transport/service failures now show a retryable unavailable state,
  separately from unsupported source/condition errors.
- Existing Watch policies are never inferred or changed during normalization.
  Event identity, immutable timestamps, revision checks and owner isolation remain.

## Migration and validation

`20261004150000_currency_strict_comparison.sql` updates only the validator and
currency completion routines after checking the expected previous definitions.
It preserves grants, existing definitions and history. Apply after the original
PR #52 recurring-policy migration. **Production must remain untouched.**

Local validation: **1,157 tests pass**, no skips/failures; production build passes.
Coverage includes original/reformulated requests, EN/FR names and codes,
comma/point decimals, strict equality boundaries and reciprocals, ambiguous
instructions, pre-creation policy confirmation, original wording preservation,
existing policy preservation, and PostgreSQL strict daily sequences with repeated
observations, immutable events, policy changes and account isolation.
Provider-sequence tests use controlled fixtures, not live market rates.

The migration was applied through the verified staging project's SQL editor;
readback confirmed both strict validation and strict server evaluation. Production
was not migrated.

Real staging with controlled provider fixtures: the named synthetic Watch
`b9e7e9f3-fab4-4f3c-af86-e0dd03e4fc17` persisted the exact original request,
`gt`, and `daily`. Rates `[1.17, 1.18, 1.18, 1.16, 1.19]` produced event counts
`[0, 1, 0, 0, 1]`; every repeated check was silent. Two immutable events and zero
outbox rows were verified. This Watch belongs to a synthetic test account and
was paused afterward. These are fixtures, not live market observations.
Reproduction script: `scripts/validate-currency-creation-staging.mjs` (staging
reference and disabled-email guards; refuses duplicate fixture creation).

## Hosted authenticated validation completed

On the stable PR branch preview, the user entered the OTP directly in the page.
The exact original French request was submitted with a visible staging-test note.
The review displayed `1 GBP > 1,17 EUR`, daily ECB cadence, and the selected daily
changed-rate policy. Confirmation created exactly one currency test Watch:
`7c198734-e1f6-49aa-b038-e18136307e99`.

An independent read of that staging row confirmed the unchanged original request,
`GBP` → `EUR`, target `1.17`, operator `gt`, policy `daily`, and ECB source. The
hosted detail view and a full reload retained these settings and authentication.
The live provider returned its 2026-10-02 publication (EUR/GBP `0.85033`), displayed
as approximately 1.1760 EUR/GBP after inversion; this was a real hosted observation,
not one of the fixture rates above.

Two explicit hosted manual checks succeeded. Server reads showed evaluation time
advancing from `2026-10-04T12:24:51.427Z` to `2026-10-04T12:26:15.149Z`, with the
same single event and original detection time `2026-10-04T12:24:34.421Z`. The
notification outbox for the test Watch stayed empty. Manual checks intentionally
do not enqueue email; both staging monitoring-email flags also remain disabled.

A separate hosted confirmation-only test of “Notify me when GBP reaches 1.17 EUR”
showed `≥` and required a policy choice, with creation disabled until selection.
Selecting threshold crossing enabled creation and changed the explanation. That
review was canceled without creating another Watch.

No code/token was read or extracted. The PR remains open, production has not been
migrated or deployed, and its Watches were not touched. Unsupported or ambiguous
currency grammar still asks for clarification; only GBP/EUR and EUR/GBP daily ECB
conditions are supported, not live prices or arbitrary currency pairs.
