import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { testResources } from './test-support/fixture-resources.js';

test('test workers disable the Maglev compiler that deadlocked PGlite startup', () => {
  assert.ok(process.execArgv.includes('--no-maglev'), 'Run via npm test (or node --no-maglev --test)');
});

test('fixture cleanup runs in reverse order, continues after errors, and is idempotent', async () => {
  let after;
  const resources = testResources({ after: fn => { after = fn; } });
  const released = [];
  resources.defer(() => released.push('database'));
  resources.defer(() => released.push('globals'));
  resources.defer(() => { released.push('store'); throw new Error('cleanup failure'); });
  await assert.rejects(after(), AggregateError);
  assert.deepEqual(released, ['store', 'globals', 'database']);
  await resources.dispose();
  assert.equal(released.length, 3);
});

for (const failure of ['setup SQL', 'assertion']) {
  test(`PGlite closes after ${failure} failure before normal teardown`, async () => {
    let after;
    const resources = testResources({ after: fn => { after = fn; } });
    const db = new PGlite();
    resources.defer(() => db.close());
    try {
      await assert.rejects(async () => {
        if (failure === 'setup SQL') await db.exec('select missing_fixture_column');
        else { await db.exec('select 1'); assert.fail('fixture assertion'); }
      });
    } finally { await after(); }
    assert.equal(db.closed, true);
    await resources.dispose();
  });
}
