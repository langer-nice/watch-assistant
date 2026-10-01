import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { buildCheckSQL, manifest, releaseSQL } from './prepare-currency-migration.mjs';

// Explicit invocation only. No alternate host/project or implicit apply mode.
const args = process.argv.slice(2);
const mode = args.shift();
if (!['--preflight', '--inspect', '--verify', '--apply'].includes(mode)) throw new Error('Choose --preflight, --inspect, --verify, or --apply');
const options = {};
while (args.length) {
  const key = args.shift(); const value = args.shift();
  if (!['--ca', '--approved-head'].includes(key) || !value || options[key]) throw new Error('Invalid arguments');
  options[key] = value;
}
if (!options['--ca']) throw new Error('Provide --ca with the official Supabase CA certificate path');
if ((statSync(`${homedir()}/.pgpass`).mode & 0o777) !== 0o600) throw new Error('.pgpass must have mode 0600');
if (mode === '--apply') {
  const approved = options['--approved-head'];
  if (!/^[a-f0-9]{40}$/.test(approved || '')) throw new Error('Apply requires the full newly approved head');
  if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== approved
    || execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
    throw new Error('Checkout must be clean and exactly at the approved head');
  }
}
const env = { ...process.env, PGSSLMODE: 'verify-full', PGSSLROOTCERT: resolve(options['--ca']),
  PGPASSFILE: `${homedir()}/.pgpass`, PGCONNECT_TIMEOUT: '10',
  PGOPTIONS: mode === '--apply' ? '' : '-c default_transaction_read_only=on' };
delete env.PGPASSWORD;
delete env.PGSERVICE;
delete env.PGHOSTADDR;
const sql = mode === '--apply' ? releaseSQL : mode === '--inspect'
  ? readFileSync(new URL('../supabase/tests/currency-release-readonly.sql', import.meta.url), 'utf8')
  : buildCheckSQL(mode === '--preflight' ? manifest.before.md5 : manifest.after.md5);
// The fixed verified TLS endpoint + project-qualified login pin the production identity.
execFileSync(process.env.PSQL_PATH || 'psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1',
  '--host=aws-1-eu-west-3.pooler.supabase.com', '--port=5432',
  `--username=postgres.${manifest.projectRef}`, '--dbname=postgres'], {
  input: sql, env, stdio: ['pipe', 'inherit', 'inherit'],
});
