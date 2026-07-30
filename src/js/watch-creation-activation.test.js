import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Watch creation persists, activates monitoring, then navigates', async () => {
  const navigation = await read('./navigation.js');
  const completion = navigation.match(
    /const completeWatchCreation = async \(watch\) => \{[\s\S]*?const finishModalTransition/,
  )?.[0] || '';
  const addIndex = completion.indexOf('addWatch(watch)');
  const activationIndex = completion.indexOf('await activateWatchMonitoring(watch.id');
  const detailNavigationIndex = completion.indexOf('getCreatedWatchDetailHref(watch.id)');

  assert.ok(addIndex >= 0 && addIndex < activationIndex);
  assert.ok(activationIndex < detailNavigationIndex);
  assert.equal((completion.match(/addWatch\(watch\)/g) || []).length, 1);
  assert.match(completion, /deleteWatch\(watch\.id\)/);
  assert.match(navigation, /await completeWatchCreation\(watch\)/);
  assert.match(navigation, /await completeWatchCreation\(createWatchObject\(/);
});

test('Watch Detail presents active monitoring without baseline terminology', async () => {
  const [navigation, english, french] = await Promise.all([
    read('./navigation.js'),
    read('../locales/en.json'),
    read('../locales/fr.json'),
  ]);
  const en = JSON.parse(english);
  const fr = JSON.parse(french);

  assert.match(en.detail.createdCopy, /Monitoring is active/);
  assert.match(en.detail.createdCopy, /automatically/);
  assert.match(fr.detail.createdCopy, /surveillance est active/);
  assert.equal(Object.hasOwn(en.detail, 'baselineCreated'), false);
  assert.equal(Object.hasOwn(fr.detail, 'baselineCreated'), false);
  assert.doesNotMatch(`${english}\n${french}`, /baseline|référence de surveillance/i);
  assert.doesNotMatch(navigation, /detail\.baselineCreated/);
});

test('Check Now removes only its drop shadow', async () => {
  const styles = await read('../scss/pages/_watch-detail.scss');
  const buttonRule = styles.match(/\.watch-fact-check__button \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(buttonRule, /box-shadow:\s*none/);
  assert.match(buttonRule, /min-height:\s*2\.25rem/);
  assert.match(buttonRule, /padding:\s*0 var\(--space-sm\)/);
  assert.match(buttonRule, /border-radius:\s*var\(--radius-input\)/);
});
