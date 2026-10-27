# Microsoft evidence uniqueness occurrence diagnostic

27 October 2026. Diagnostic enrichment only; no functional fix.

## Scope and implementation

Baseline Production merge: `6d2cf8aac0768e33c42d507ab26a69830fadbe43`.

Files in this patch: `src/js/watch-interpretation.js`, `server/structured-validation-diagnostic.test.js`, and this report. Existing unrelated untracked reports are excluded and unchanged.

`reconstructInterpretation` → `locate` now calls its local `uniqueQuoteDiagnostic` only after the original `start < 0 || source.indexOf(text, start + 1) >= 0` predicate rejects. The original condition, evaluation order, offsets, schema, error code/status/reason/message, interpreter prompt/model/parser, and HTTP/UI contracts are unchanged. No other rejection predicate was modified.

New safe actual fields: `quoteLength`, `contextPresent`, `contextLength`, `quoteOccurrenceCount`, `contextOccurrenceCount`, `quoteSearchScope`, `contextFoundExactlyOnce`, `quoteFoundExactlyOnce`.

Lengths use JavaScript UTF-16 code units. Counts use exact case-sensitive indexOf, advancing one code unit to include overlaps. Quote count refers to the request when context is null and to the context string otherwise. Context count always refers to the original request. With no context, contextLength/contextOccurrenceCount/contextFoundExactlyOnce are null (not applicable). On rejection both relationships are counted, including a quote within a context absent from the request, without changing the original short-circuit rejection. This permits detecting multiple invalid relationships. The schema already requires nonempty quote/context strings before this helper can run.

No previews are needed or logged. No request, quote/context content, full model output, arbitrary model key, credential or token is added to logs. The existing private diagnostic registry/server warning gate remains unchanged. No environment/config/schema/data/cron/email/legacy/shadow change is included.

## Verification

- Focused diagnostic tests: **26/26 PASS** (including existing 17 and 9 additions).
- Directly affected existing interpreter/diagnostic tests: **57/57 PASS**.
- Combined: **83/83 PASS**.
- New coverage: valid unique quote with no failure diagnostic; missing quote (0); duplicated quote (>1); missing context (0); duplicated context (>1); multiple invalid relationships; quote repeated within unique context; unique context disambiguating globally repeated quote; overlapping occurrence counts; server warning propagation with no HTTP changes or evidence leakage.
- Baseline comparison: **180/180 identical accepted values or original error contracts**, including **170 preserved rejections**, across existing synthetic Microsoft/consumer fixtures and quote/context mutations. Only diagnostic metadata is excluded from comparison.
- Build: **PASS**, Vite 168 modules. Existing Sass deprecation/bundle-size warnings only.
- Diff whitespace: **PASS**.
- No broad unrelated suite or external model invocation performed for tests.

## Deployment and authorized single retry

Pending deployment through the existing dedicated PR → master → automatic Vercel Git Production workflow. No direct CLI deploy or configuration change.

Instrumentation commit, Production merge/deployment/READY time and the one authorized review result will be recorded here after completion. No retry has occurred during preparation. No functional fix is authorized or implemented.
