# Test runtime and PGlite cleanup

Use `npm test -- [node test-runner options] [test files]`. The test script passes
`--no-maglev` to Node and its test workers. This disables one optional V8 JIT tier
only for tests; Vite builds and deployed application runtimes are unchanged.
For a direct invocation use `NODE_ENV=test node --no-maglev --test ...`.

## Confirmed hang on Node 23.7.0 / macOS arm64

On 2026-09-18 the unmodified PR source `84e903363ecc94865716108e692d129027bb38ca`
hung with:

```sh
NODE_ENV=test node --test --test-reporter=spec server/media-watch-persistence.test.js
```

Instrumentation in a temporary copy located the wait at the first `db.exec`,
while PGlite initializes, in the parent test
`authenticated browser persistence → PostgreSQL RLS → scheduled media pipeline`.
No nested subtest or application database transaction had begun. Even an unref'ed
diagnostic interval stopped running: this was not merely an open handle after the
assertions finished.

A native process sample showed the main thread blocked in
`NodePlatform::DrainTasks → TaskQueue::BlockingDrain → uv_cond_wait`. A background
`MaglevCompilationJob` was blocked in `Heap::CollectGarbageFromAnyThread →
CollectionBarrier::AwaitCollectionBackground`, waiting for the main thread.
Neither side could progress, so test cleanup could not execute. Node documents
this class of drain-task deadlock in its
[platform implementation](https://github.com/nodejs/node/blob/main/src/node_platform.cc)
(FIXME 54918). Disabling Maglev let the unchanged test complete all 31 tests
and exit naturally. No sleeps, timeout increases, forced exits or assertion
changes are part of the correction.

This is pre-existing: a temporary archive of master
`fd9298f62216e0dea9e8fd41bf64bb14281cfb30`, using the same installed dependencies,
also stalled. The test file is byte-identical on that master and the PR source
(SHA-256 `56923342f4003d2fd31e7fcd49f374131a6030ed43790fddf35e0c18f32c0c82`).
One master run succeeded before the stalled run, consistent with a native
compilation/GC timing dependency, not a deterministic application transaction.

## Fixture lifecycle

PGlite is in-process WASM: this fixture launches no Postgres server, pool, HTTP
server or child process. Fetch is replaced by an in-process middleware adapter;
no real email or remote database is contacted. Transactions are awaited through
PGlite's transaction callback. The existing zero-delay flush yields are awaited,
and request abort timers are unref'ed by Node; neither explains the native wait.

The test resource stack now registers database cleanup immediately after creation,
before setup SQL. Cleanup disconnects auth/store subscriptions, restores browser
globals, and closes the database in reverse acquisition order. Every cleanup is
attempted even when another throws, and repeated disposal is harmless. Deliberately
held mock responses are released by each subtest's after-hook on assertion failure.

Regression tests check the worker runtime flag, cleanup order/error handling,
idempotence, and real PGlite closure after setup-SQL and assertion failures.
They do not change media persistence, monitoring, authentication or notifications.

## Validation

- Isolated persistence test: three consecutive natural exits, 31/31 each.
- Focused media, notifications, OTP/auth and account isolation: 183/183.
- Final complete suite: 975/975 twice, natural exit status 0, with final summaries
  (5.82 and 5.16 seconds reported by Node). No cancellation, skip or forced exit.
- Production build, 228 JavaScript syntax checks, whitespace and credential/
  personal-data/debugger scans passed. Only the existing Sass deprecation warning.
- No application source, SQL migration, dependency version or deployed
  authentication/email configuration changed.
