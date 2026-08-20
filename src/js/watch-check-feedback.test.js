import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('manual Check Now uses explicit singular, plural, and quiet feedback', async () => {
  const english = JSON.parse(await readFile(new URL('../locales/en.json', import.meta.url), 'utf8'));

  assert.equal(english.detail.newItemsFound.one, '{count} new update found.');
  assert.equal(english.detail.newItemsFound.other, '{count} new updates found.');
  assert.equal(english.detail.noNewUpdates, 'No new updates found.');
  assert.equal(english.detail.noMatchingUpdates, 'No new updates found.');
});

test('manual Check Now acknowledges exactly the developments displayed by its result', async () => {
  const navigation = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const handler = navigation.match(/checkNowEl\.onclick = async \(\) => \{[\s\S]*?^    \};/m)?.[0] || '';

  assert.match(handler, /const result = await watchCheckController\.check\(watch\.id\)/);
  assert.match(handler, /result\.matchedItems\.map\(\(\{ id \}\) => id\)/);
  assert.match(handler, /markUpdatesAsRead\(watch\.id, displayedUpdateIds\)/);
  assert.match(handler, /refreshLatestReport\(\{ watches: getWatches\(\) \}\)/);
});
