import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Edit Watch feed URL is inside an accessible collapsed disclosure', async () => {
  const html = await read('../../new-watch.html');
  assert.match(html, /id="watchAdvancedToggle"[\s\S]*type="button"[\s\S]*aria-expanded="false"[\s\S]*aria-controls="watchAdvancedPanel"/);
  assert.match(html, /id="watchAdvancedPanel" hidden[\s\S]*id="watchFeedUrlInput"/);
  assert.match(html, /id="watchFeedUrlInput"[\s\S]*pattern="https\?:\/\/\.\*"/);
});

test('disclosure behavior expands saved manual feeds and never clears on collapse', async () => {
  const source = await read('./navigation.js');
  assert.match(source, /setAdvancedSettingsExpanded\(hasStoredCustomFeed\)/);
  assert.match(source, /monitoringSource\?\.discovery === 'manual'/);
  assert.match(source, /setAttribute\('aria-expanded', String\(expanded\)\)/);
  assert.doesNotMatch(source, /setAdvancedSettingsExpanded[\s\S]{0,500}feedUrlInputEl\.value\s*=\s*''/);
});

test('advanced styles remain width-safe for narrow viewports', async () => {
  const styles = await read('../scss/pages/_new-watch.scss');
  assert.match(styles, /\.watch-advanced \{[\s\S]*min-width: 0/);
  assert.match(styles, /\.watch-advanced__toggle \{[\s\S]*width: 100%/);
  assert.match(styles, /\.watch-monitoring-source input \{[\s\S]*width: 100%/);
});
