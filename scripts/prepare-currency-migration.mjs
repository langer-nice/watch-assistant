import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Preparation only: emits SQL; never opens a database connection.
export const migrationVersion = '20261001120000';
export const migrationName = 'currency_threshold_watches';
export const migration = readFileSync(new URL(`../supabase/migrations/${migrationVersion}_${migrationName}.sql`, import.meta.url), 'utf8');
export const catalogSQL = readFileSync(new URL('./sql/currency-schema-state.sql', import.meta.url), 'utf8').trim();
export const manifest = JSON.parse(readFileSync(new URL('./currency-schema-manifest.json', import.meta.url), 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
export const migrationSha256 = sha256(migration);
if (migrationSha256 !== manifest.migrationSha256
  || sha256(readFileSync(new URL('./sql/currency-schema-state.sql', import.meta.url))) !== manifest.catalogSha256) {
  throw new Error('Reviewed migration/catalog changed: regenerate evidence and obtain approval');
}
export const migrationBody = migration.replace(/^begin;\s*/, '').replace(/\s*commit;\s*$/, '');
export const stateHashSQL = `select md5(state::text) as hash from (${catalogSQL}) catalog`;
const guard = (expected, after, serverMajor = manifest.serverMajor) => {
  if (!Number.isInteger(serverMajor) || serverMajor < 17) throw new Error('Invalid PostgreSQL major version');
  if (!/^[0-9a-f]{32}$/.test(expected) || (after && !/^[0-9a-f]{32}$/.test(after))) throw new Error('Invalid schema digest');
  return `do $guard$ declare actual text; begin
 if current_setting('server_version_num')::integer / 10000 <> ${serverMajor} then
   raise exception 'Unreviewed PostgreSQL major version: stop';
 end if;
 if to_regnamespace('supabase_migrations') is not null then
   raise exception 'Unexpected migration registry namespace: stop and review';
 end if;
 select hash into actual from (${stateHashSQL}) checked;
 ${after ? `if actual = '${after}' then raise exception 'Already applied: verify; do not retry'; end if;` : ''}
 if actual is distinct from '${expected}' then
   raise exception 'Schema capabilities differ from reviewed state: stop (digest %)',actual;
 end if;
end $guard$;`;
};
// Alternate hashes are only for isolated fixtures. The CLI always uses the pinned manifest.
export const buildReleaseSQL = ({ before = manifest.before.md5, after = manifest.after.md5, serverMajor = manifest.serverMajor } = {}) => `-- Target: watch-assistant-pilot / ${manifest.projectRef}; verify connection identity first.
-- Source migration SHA-256: ${migrationSha256}
-- No historical execution claims or CLI migration-history writes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
set local search_path = public, pg_catalog;
lock table public.watches in access exclusive mode;
${guard(before, after, serverMajor)}
${migrationBody}
${guard(after, null, serverMajor)}
notify pgrst, 'reload schema';
commit;
`;
export const buildCheckSQL = (expected) => `begin read only;
set local statement_timeout = '15s';
set local search_path = public, pg_catalog;
${guard(expected)}
${stateHashSQL};
commit;
`;
export const releaseSQL = buildReleaseSQL();
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode && !['--preflight', '--verify'].includes(mode)) throw new Error('Use --preflight, --verify, or no argument to emit migration SQL');
  process.stdout.write(mode ? buildCheckSQL(mode === '--preflight' ? manifest.before.md5 : manifest.after.md5) : releaseSQL);
}
