import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the first onboarding screen exposes an accessible Skip intro Home link only there', async () => {
  const [html, english, french, styles] = await Promise.all([
    read('../../flow-3.html'),
    read('../locales/en.json'),
    read('../locales/fr.json'),
    read('../scss/pages/_flow-3.scss'),
  ]);
  const firstScreen = html.match(
    /data-flow-3-screen="0"[\s\S]*?<\/section>/,
  )?.[0] || '';
  const secondScreen = html.match(
    /data-flow-3-screen="1"[\s\S]*?<\/section>/,
  )?.[0] || '';

  assert.match(firstScreen, /<a class="flow-3__skip" data-onboarding-skip href="index\.html" data-i18n="flow3\.skipIntro"><\/a>/);
  assert.doesNotMatch(secondScreen, /data-onboarding-skip/);
  assert.equal(JSON.parse(english).flow3.skipIntro, 'Skip intro');
  assert.ok(JSON.parse(french).flow3.skipIntro);
  assert.match(styles, /\.flow-3__skip:hover,\s*\n\.flow-3__skip:focus-visible/);
});

test('Skip intro uses existing completion and Home navigation while Continue remains unchanged', async () => {
  const [html, flowScript] = await Promise.all([
    read('../../flow-3.html'),
    read('./flow-3.js'),
  ]);
  const examplesScreen = html.match(
    /data-flow-3-screen="1"[\s\S]*?<\/section>/,
  )?.[0] || '';

  assert.match(examplesScreen, /class="button button--secondary flow-3__continue flow-3__reveal"[^>]*data-flow-3-next/);
  assert.match(flowScript, /event\.target\.closest\('\[data-onboarding-skip\]'\)[\s\S]*?skipOnboarding\(\)/);
  assert.match(flowScript, /event\.target\.closest\('\[data-flow-3-next\]'\)[\s\S]*?showScreen\(activeScreenIndex \+ 1\)/);
});
