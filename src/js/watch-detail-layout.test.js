import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Story Summary uses the standard padded detail-card alignment at all breakpoints', async () => {
  const [html, styles] = await Promise.all([
    readFile(new URL('../../watch-detail.html', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_detail-card.scss', import.meta.url), 'utf8'),
  ]);

  assert.match(
    html,
    /id="watchStorySummary"[^>]*class="[^"]*detail-card__take|class="[^"]*detail-card__take[^"]*"[^>]*id="watchStorySummary"/,
  );
  assert.match(styles, /\.detail-card__take\s*\{[\s\S]*?padding:\s*var\(--space-lg\)/);
  assert.match(styles, /@media \(min-width: 36rem\)[\s\S]*?\.detail-card__primary,[\s\S]*?\.detail-card__take\s*\{[\s\S]*?padding-inline:\s*var\(--space-xl\)/);
  assert.match(
    html,
    /id="watchStorySummary"[\s\S]*?id="watchAnalysisProvenance"[^>]*hidden/,
  );
});

test('Story Identifiers uses one full-width row per selected concept at every width', async () => {
  const [html, styles, navigation, english] = await Promise.all([
    readFile(new URL('../../watch-detail.html', import.meta.url), 'utf8'),
    readFile(new URL('../scss/pages/_watch-detail.scss', import.meta.url), 'utf8'),
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /class="story-concepts__grid" id="watchStoryConceptsList"/);
  assert.match(html, /id="watchStoryConceptsEmpty"[^>]*hidden/);
  assert.match(html, /id="watchStoryConceptsEdit"/);
  assert.match(
    html,
    /class="[^"]*detail-card__take[^"]*story-concepts[^"]*" id="watchStoryConcepts"/,
  );
  assert.match(navigation, /getStoryProfileIdentifiers\(watch\.storyProfile\)/);
  const renderBlock = navigation.match(
    /const storyIdentifiers = getStoryProfileIdentifiers[\s\S]*?if \(storyConceptsEl\)/,
  )?.[0] || '';
  assert.doesNotMatch(renderBlock, /distinctiveFacts|uncertaintyPhrases|otherPeople/);
  assert.match(styles, /\.story-concepts__grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(styles, /\.story-concepts__grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.match(styles, /\.story-concepts__item\s*\{[\s\S]*?width:\s*100%/);
  assert.match(styles, /\.story-concepts__label\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.story-concepts__action\s*\{[\s\S]*?min-height:\s*2\.75rem/);
  assert.match(styles, /\.story-concepts__action:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(styles, /\.story-concepts__edit\s*\{[\s\S]*?min-height:\s*2\.75rem/);
  assert.equal(JSON.parse(english).newWatch.conceptTypes.product_service, 'Product / service');
  assert.equal(JSON.parse(english).newWatch.conceptTypes.supporting, undefined);
  assert.equal(JSON.parse(english).newWatch.conceptTypes.work, 'Named work');
});

test('Watch Detail renders only selected concepts, never detail or uncertainty profile fields', async () => {
  const source = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const rendering = source.match(
    /const storyIdentifiers = getStoryProfileIdentifiers[\s\S]*?if \(storyConceptsEl\)/,
  )?.[0] || '';

  assert.match(rendering, /getStoryProfileIdentifiers\(watch\.storyProfile\)/);
  assert.doesNotMatch(rendering, /distinctiveFacts|uncertaintyPhrases|DETAIL|UNCERTAINTY/);
  assert.match(rendering, /storyIdentifiers\.map/);
  assert.doesNotMatch(rendering, /story-concepts__item--wide|usesWideLayout/);
  assert.match(rendering, /data-story-concept-edit/);
  assert.match(rendering, /detail\.editStoryConcept/);
  assert.match(rendering, /addEventListener\('click', openExistingWatchEditor\)/);
  assert.doesNotMatch(rendering, /storyConceptGroups/);
});

test('URL creation synchronises a manually edited identifier set into the stored Story Profile', async () => {
  const navigation = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const derivation = navigation.match(/const deriveWatchData[\s\S]*?const createWatchObject/)?.[0] || '';
  assert.match(derivation, /options\.monitoringConceptsManuallyEdited === true/);
  assert.match(derivation, /synchronizeStoryProfile\(/);
  assert.match(derivation, /storyProfile,/);
});

test('Watch Detail hides successful AI provenance but presents fallback as a styled warning', async () => {
  const [html, styles, navigation] = await Promise.all([
    readFile(new URL('../../watch-detail.html', import.meta.url), 'utf8'),
    readFile(new URL('../scss/pages/_watch-detail.scss', import.meta.url), 'utf8'),
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /id="watchAnalysisProvenance" role="status" hidden/);
  assert.match(navigation, /messageKey === 'detail\.analysisProvenanceFallback'/);
  assert.doesNotMatch(navigation, /SHOW_ANALYSIS_PROVENANCE/);
  assert.match(styles, /\.detail-card__take \.detail-analysis-provenance\s*\{[\s\S]*?background:\s*var\(--color-attention-tint\)/);
});

test('Watch Detail omits missing-feed technical copy without removing monitoring controls', async () => {
  const [navigation, html, newWatchHtml, english, french] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../../watch-detail.html', import.meta.url), 'utf8'),
    readFile(new URL('../../new-watch.html', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(english, /Automatic monitoring isn.t available for this source/);
  assert.doesNotMatch(french, /surveillance automatique n.est pas disponible pour cette source/i);
  assert.doesNotMatch(navigation, /detail\.feedUrlMissing/);
  assert.match(navigation, /else if \(!hasFeedUrl\) \{[\s\S]*?checkFeedbackEl\.textContent = '';[\s\S]*?checkFeedbackEl\.hidden = true/);
  assert.match(html, /id="watchCheckNow"/);
  assert.match(newWatchHtml, /id="watchAdvancedPanel" hidden[\s\S]*id="watchFeedUrlInput"/);
  assert.match(navigation, /feedUrl:\s*feedUrlInputEl\?\.value \|\| ''/);
});

test('Edit Watch actions use one rounded keyboard focus ring and retain focus elsewhere', async () => {
  const [detailStyles, accessibilityStyles] = await Promise.all([
    readFile(new URL('../scss/pages/_watch-detail.scss', import.meta.url), 'utf8'),
    readFile(new URL('../scss/base/_accessibility.scss', import.meta.url), 'utf8'),
  ]);

  assert.match(detailStyles, /\.watch-edit-sheet__action\s*\{[\s\S]*?border-radius:\s*var\(--radius-input\)/);
  assert.match(detailStyles, /\.watch-edit-sheet__action:not\(:disabled\):focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--color-action\);[\s\S]*?outline-offset:\s*2px/);
  assert.doesNotMatch(
    detailStyles,
    /\.watch-edit-sheet__action:not\(:disabled\):hover,\s*\.watch-edit-sheet__action:not\(:disabled\):focus-visible/,
  );
  assert.match(accessibilityStyles, /:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(detailStyles, /\.story-concepts__action:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(detailStyles, /\.detail-edit-action:hover,\s*\.detail-edit-action:focus-visible/);
});

test('Home summary keeps zero, singular and plural forms in English and French', async () => {
  const [navigation, englishSource, frenchSource] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);
  const english = JSON.parse(englishSource).home;
  const french = JSON.parse(frenchSource).home;

  assert.match(navigation, /count === 1 \? 'one' : 'other'/);
  for (const messages of [english, french]) {
    assert.ok(messages.checkedAway.one.includes('{count}'));
    assert.ok(messages.checkedAway.other.includes('{count}'));
    assert.ok(messages.attentionLabel.one);
    assert.ok(messages.attentionLabel.other);
    assert.ok(messages.updatedLabel.one);
    assert.ok(messages.updatedLabel.other);
    assert.ok(messages.unchangedLabel.one);
    assert.ok(messages.unchangedLabel.other);
  }
});

test('Check now exposes an immediate accessible lifecycle and always restores through finally', async () => {
  const [html, navigation, styles, englishSource, frenchSource] = await Promise.all([
    readFile(new URL('../../watch-detail.html', import.meta.url), 'utf8'),
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../scss/pages/_watch-detail.scss', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);
  const lifecycle = navigation.match(
    /if \(checkNowEl\) \{[\s\S]*?if \(checkFeedbackEl && !detailCheckInProgress\)/,
  )?.[0] || '';
  const english = JSON.parse(englishSource).detail;
  const french = JSON.parse(frenchSource).detail;

  assert.match(html, /watch-fact-check__spinner[^>]*aria-hidden="true"[^>]*hidden/);
  assert.match(html, /id="watchCheckFeedback"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(lifecycle, /detailCheckInProgress = true;[\s\S]*?checkNowEl\.disabled = true;[\s\S]*?setAttribute\('aria-busy', 'true'\)/);
  assert.match(lifecycle, /detail\.checking[\s\S]*?checkSpinnerEl\.hidden = false/);
  assert.match(lifecycle, /detail\.checkingForUpdates/);
  assert.match(lifecycle, /detailCheckInProgress \|\| watchCheckController\.isChecking\(watch\.id\)/);
  assert.match(lifecycle, /try \{[\s\S]*?await waitForVisiblePaint\(\);[\s\S]*?await watchCheckController\.check\(watch\.id\)[\s\S]*?catch \(error\)[\s\S]*?finally \{[\s\S]*?detailCheckInProgress = false;[\s\S]*?renderWatchDetail\(\)/);
  assert.match(styles, /\.watch-fact-check__button\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?flex:\s*0 0 auto/);
  assert.doesNotMatch(styles, /\.watch-fact-check__button\s*\{[^}]*min-width/);
  assert.equal(english.checkFailedStatus, 'Check failed');
  assert.equal(english.checkFailed, 'We couldn’t check for updates. Please try again.');
  assert.equal(french.checkFailedStatus, 'Échec de la vérification');
  assert.equal(french.checkFailed, 'Nous n’avons pas pu vérifier les mises à jour. Réessayez.');
  assert.doesNotMatch(`${english.checkFailed} ${french.checkFailed}`, /RSS|Atom|feed|flux|HTTP|Advanced/i);
});

test('Watch Detail distinguishes never checked, checking, successful outcomes and failed attempts', async () => {
  const navigation = await readFile(new URL('./navigation.js', import.meta.url), 'utf8');
  const stateRendering = navigation.match(
    /const lastAttemptFailed =[\s\S]*?const isPaused = watch\.status === 'paused'/,
  )?.[0] || '';

  assert.match(stateRendering, /detailCheckInProgress[\s\S]*?detail\.checking/);
  assert.match(stateRendering, /lastAttemptFailed \? t\('detail\.checkFailedStatus'\) : t\('detail\.notCheckedYet'\)/);
  assert.match(stateRendering, /outcome === 'baseline'[\s\S]*?detail\.baselineCreated/);
  assert.match(stateRendering, /outcome === 'no-new-items'[\s\S]*?detail\.noNewUpdates/);
  assert.match(stateRendering, /\['matching-items', 'new-items'\]\.includes\(outcome\)[\s\S]*?detail\.newItemsFound/);
  assert.match(stateRendering, /if \(lastAttemptFailed\) \{[\s\S]*?detail\.checkFailed[\s\S]*?dataset\.state = 'error'/);
});
