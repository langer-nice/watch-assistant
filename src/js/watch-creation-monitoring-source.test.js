import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('normal text creation discovers a source and unsupported creation stays visible before persistence', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const plainCreation = source.match(/const savePlainTextWatch[\s\S]*?const renderClarificationActions/)?.[0] || '';
  const urlCreation = source.match(/reviewCreate\?\.addEventListener[\s\S]*?reviewCancel\?\.addEventListener/)?.[0] || '';

  assert.match(plainCreation, /requestMonitoringSource\(selectedRequest/);
  assert.match(plainCreation, /createOptions\.monitoringSource/);
  assert.match(plainCreation, /createCapabilityLimitation[\s\S]*?monitoringCapabilityUnavailable/);
  assert.match(urlCreation, /!createOptions\.feedUrl && !analysis\.monitoringSource/);
  assert.match(urlCreation, /monitoringSourceUnsupported/);
  assert.match(urlCreation, /completeWatchCreation\(createWatchObject/);
  assert.match(source, /createStoryProfile\(\{[\s\S]*?storyFingerprint,[\s\S]*?monitoringSummary \|\| request/);
});
