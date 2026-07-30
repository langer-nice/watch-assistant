import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('final URL confirmation binds one handler to each stable action across rerenders', async () => {
  const [html, navigation] = await Promise.all([
    read('../../new-watch.html'),
    read('./navigation.js'),
  ]);

  for (const id of ['urlReviewCreate', 'urlReviewEdit', 'urlReviewCancel']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.equal((navigation.match(/reviewCreate\?\.addEventListener\('click'/g) || []).length, 1);
  assert.equal((navigation.match(/reviewEdit\?\.addEventListener\('click'/g) || []).length, 1);
  assert.equal((navigation.match(/reviewCancel\?\.addEventListener\('click'/g) || []).length, 1);

  const showReview = navigation.match(/const showReview = \(analysis\) => \{[\s\S]*?const startUrlAnalysis/)?.[0] || '';
  assert.match(showReview, /pendingAnalysis = analysis/);
  assert.match(showReview, /review\.hidden = false/);
  assert.doesNotMatch(showReview, /replaceChildren|innerHTML|addEventListener/);
});

test('Create preflights source support before disabling actions and persists once when supported', async () => {
  const navigation = await read('./navigation.js');
  const createHandler = navigation.match(
    /reviewCreate\?\.addEventListener\('click',[\s\S]*?reviewCancel\?\.addEventListener/,
  )?.[0] || '';
  const unsupportedIndex = createHandler.indexOf('!createOptions.feedUrl && !analysis.monitoringSource');
  const creationIndex = createHandler.indexOf('creationInProgress = true');
  const disableIndex = createHandler.indexOf('control.disabled = true');

  assert.ok(unsupportedIndex >= 0 && unsupportedIndex < creationIndex && creationIndex < disableIndex);
  assert.match(createHandler, /resetUrlFlow\(\{ clearInput: false \}\)/);
  assert.match(createHandler, /watchError\.textContent = t\('newWatch\.monitoringSourceUnsupported'\)/);
  assert.match(createHandler, /input\?\.focus\(\)/);
  assert.equal((createHandler.match(/completeWatchCreation\(createWatchObject\(/g) || []).length, 1);
  assert.match(createHandler, /completeWatchUpdate\(pendingRequest, pendingWhyFollowing, analysis\)/);
});

test('Edit preserves review values and Cancel exits through the validated reset flow', async () => {
  const navigation = await read('./navigation.js');
  const editHandler = navigation.match(
    /reviewEdit\?\.addEventListener\('click',[\s\S]*?reviewSummary\?\.addEventListener/,
  )?.[0] || '';
  const cancelHandler = navigation.match(
    /reviewCancel\?\.addEventListener\('click',[\s\S]*?analysisCancel\?\.addEventListener/,
  )?.[0] || '';

  assert.match(editHandler, /setReviewEditing\(!review\?\.classList\.contains\('is-editing'\)\)/);
  assert.doesNotMatch(editHandler, /reviewTitle\.value|reviewSummary\.value|resetUrlFlow/);
  assert.match(cancelHandler, /resetUrlFlow\(\{ clearInput: true, trackCancellation: true \}\)/);
});

test('mobile confirmation actions remain clickable and width-safe at 500px and below', async () => {
  const [html, styles] = await Promise.all([
    read('../../new-watch.html'),
    read('../scss/components/_url-review.scss'),
  ]);
  const actions = html.match(/<div class="url-review__actions">[\s\S]*?<\/div>/)?.[0] || '';

  assert.match(actions, /id="urlReviewCreate"[^>]*type="button"/);
  assert.match(actions, /id="urlReviewEdit"[^>]*type="button"/);
  assert.match(actions, /id="urlReviewCancel"[^>]*type="button"/);
  assert.match(styles, /\.url-review__actions\s*\{[\s\S]*?grid-template-columns:\s*1fr 1fr/);
  assert.match(styles, /\.url-review__actions \.button\s*\{[\s\S]*?width:\s*100%/);
  assert.match(styles, /#urlReviewCreate\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.doesNotMatch(styles, /\.url-review(?:__actions)?[^}]*pointer-events:\s*none/);
  assert.doesNotMatch(styles, /\.url-review(?:__actions)?[^}]*min-width:\s*(?:[5-9]\d{2}|\d{4,})px/);
});
