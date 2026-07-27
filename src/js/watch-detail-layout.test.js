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

test('Story Identifiers uses the selected concepts in a compact responsive grid', async () => {
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
  assert.match(styles, /@media \(min-width: 36rem\)[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.story-concepts__item dd\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.story-concepts__edit\s*\{[\s\S]*?min-height:\s*2\.75rem/);
  assert.equal(JSON.parse(english).newWatch.conceptTypes.supporting, 'Key fact');
  assert.equal(JSON.parse(english).newWatch.conceptTypes.work, 'Named work');
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
