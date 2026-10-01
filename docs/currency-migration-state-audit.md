# Production migration-state audit — 2026-10-01

Preparation only; no production DDL, history repair, merge, monitoring or notifications. This revision supersedes the release wrapper approved at `f405e015d4eedb59910c3a4916916d54ca374fe0` and requires new execution approval.

## Identity and evidence

Production is Supabase `watch-assistant-pilot`, reference `cztpitujsnzhhenedwjn`, PostgreSQL 17.6. Read-only psql connections used the project-qualified login on `aws-1-eu-west-3.pooler.supabase.com:5432`, database `postgres`, TLS `verify-full` with the official CA and the owner's rotated `.pgpass`. No credentials or user records are included here. The project-ref SQL setting is absent; it is not used as identity proof.

Vercel's production deployment `A1LbogbHNHtRwjFceW1zaUjMZDGL` is Ready/Current, with `watch-assistant-omega.vercel.app` assigned and source `aeb09ef6c7977d8a453b807877a644fd2042fc9e`. GitHub production deployment 6740858258 agrees. PR base is that same commit.

The verified archive completed at 2026-10-01 12:17:43 UTC, size 659083 bytes, SHA-256 `ddc76b71d7523ff1b33b137fa657a9b402a85395eb48620ab04627465cd94ea7`; checksum rechecked. It is stored privately outside Git at `../watch-assistant-backups/production-20261001T121222Z/database-verified.dump`, with `RESTORE.md`. The earlier recovery validation matched 35 public/Auth tables and 51 checks. The socket-only PostgreSQL 17 restore was restarted for this audit. No app, Auth service, cron, SMTP or network extension workers run there. This is verified application/Auth recovery, not a claim of full hosted Supabase recovery. Passwords, external files and platform configuration are not covered. Storage object and Vault secret counts were zero at backup preflight. Refresh and verify the backup before eventual execution if state has changed; never overwrite newer production data with this snapshot.

## Method and findings

`scripts/sql/currency-schema-state.sql` reads definitions, not just names: public tables/columns/types/defaults/constraints/indexes/sequence configuration; function signatures/full bodies/owners/ACLs; triggers; RLS/policies; schema/default/column grants; relevant role attributes/memberships and Auth helpers/user-profile trigger; pgcrypto/uuid-ossp versions. Sequence current values and user data are deliberately excluded from the schema digest. The backup recovery checks separately cover data and sequences. Platform event triggers, all managed Auth internals and external service configuration are outside this release capability digest.

A separate isolated database reconstructed `public` from all eight preceding repository migrations, in order as role `postgres`, retaining the restored Auth dependencies and reproducing the source template/default ACLs. Every intermediate catalog snapshot was retained privately under the backup directory's `history-audit/`. The final reconstruction has 259 catalog entries; production has 260. 258 entries agree exactly. The only differences are a platform helper `public.rls_auto_enable()` and production's extra PUBLIC USAGE on schema `public`, inherited from platform setup. Neither is an effect of a repository migration; neither is removed or widened by this release. The reviewed production fingerprint includes both. No essential prerequisite repair is required.

| Migration | Current effects verified against definitions | Absent / divergent / historical limits |
| --- | --- | --- |
| `20260820120000` foundations | Profiles/Watches columns, PK/FK/checks/indexes, Auth profile trigger and function, RLS/policies/owners/grants | Execution date and original data population unknown |
| `20260821120000` company persistence | Company fields, validation and persistence RPC, snapshots, constraints and permissions | Runtime writes by old RPC executions cannot be inferred |
| `20260830120000` company category | Category type/default `general`, NOT NULL and validated category constraint | Original rows' category backfill at the time cannot be proven; current constraints/default match |
| `20260902120000` automatic company monitoring | Company check history, schedule/revision fields, functions, indexes and ACLs | Historical monitoring executions unknown |
| `20260903120000` service read grants | Exact service-role read privileges on required company data | Historical grant execution unknown |
| `20260911120000` company email | Notification outbox schema, claim/complete/fail functions, constraints/indexes and permissions | Historical deliveries unknown and not tested in production |
| `20260913120000` media email | Media definition/revision/snapshot/outbox fields, validation, triggers, RLS and RPC permissions | Persistence body is intentionally superseded by the next migration |
| `20260925130000` media conflict | Full persistence body and ACL match, including PT409; definition MD5 `c9dfbd9127b543e5bd33ce2764eacc1a` | Matching current body does not prove when SQL ran |
| `20261001120000` currency (pending) | None applied; pre-state matches exactly | Currency column, renamed feed validator, completion/invalidation functions and trigger absent as expected |

There is no `supabase_migrations` namespace or `schema_migrations` table. Managed `auth.schema_migrations` exists and is unrelated. No preceding repository migration contains a standalone data backfill beyond column-default initialization; schema equality cannot establish original row values, function invocations, execution order or timestamps. Current effects match; historical migration execution is **not established**.

## Chosen resolution

Continue the repository's explicit SQL deployment workflow with a reviewed capability guard, without creating or repairing CLI history. The incident runbook and `docs/incidents/2026-09-25-staging-evidence/apply-staging.sql` demonstrate guarded SQL Editor deployment; that staging script wrote a history entry, which does not prove production did. Production presently operates without CLI history. This choice is specific to this verified production state, not a general recommendation to omit migration tracking.

Supabase documents [migration history and deployment](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI/baseline workflows](https://supabase.com/docs/guides/local-development/cli-workflows). Supported `supabase migration repair --status applied <version>` changes tracking records; it does not execute or prove the historical SQL. A future CLI adoption should establish an explicitly audited baseline with supported tooling. It is unnecessary additional production metadata mutation for this release, so no repair command is proposed now. Do not use blanket `db push`, replay old files or hand-create CLI tables.

The replacement guard checks the entire reviewed capability fingerprint before and after the **unchanged** currency SQL in one transaction. It rejects any registry namespace, PostgreSQL major-version drift, absent/partial/incompatible prerequisites, and already-applied state. The table lock prevents concurrent Watch changes during migration; other administrative DDL must not overlap. MD5 is a catalog drift checksum, not an authentication mechanism. SHA-256 pins the catalog SQL and source migration; TLS endpoint/project login and the approved clean Git checkout pin execution identity.

## Isolated validation

- Restored PostgreSQL 17: seven mutations rejected (unexpected registry, partial currency column, absent validator, changed function body, disabled RLS, widened anon grant, missing revision default). Injected failure after DDL rolled back completely. Exact migration passed its postcondition; repeat refused; all 35 public/Auth tables unchanged; synthetic authenticated old-RPC create/edit succeeded inside a rolled-back transaction.
- PGlite automated upgrade test additionally verifies company/feed rows and RLS, old RPC before/after, PT409, completion ACL and failure/repeat behavior. Fixture hashes/version are computed only for isolated tests; production CLI cannot substitute them.
- Production read-only preflight passes `e0711f5aac458d2ef9f5b92a55b900db` (260 entries). Local post-migration state is `a35f36da68175d6562fcc475a2d31d66` (265 entries).
- Full automated suite: 1,117 tests passed with external network blocked; production build passed (existing Sass deprecation warning); `git diff --check` passed.
- Hosted PostgREST cache propagation, live lock/scan time and original Watch behavior remain execution/manual validation limits. No original Watch mutation or check has been performed.

See the [release runbook](currency-threshold-release.md) for exact commands, execution gates and recovery.
