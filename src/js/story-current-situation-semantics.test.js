import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';
import { getCurrentSituationPresentation } from './watch-update-presentation.js';
import { migrateWatchModel } from './watch-model.js';

register('./test-support/json-module-loader.js', import.meta.url);
const { createWatchObject } = await import('./navigation.js');
const translations = JSON.parse(await readFile(new URL('../locales/en.json', import.meta.url)));
const pendingText = (watch) => {
  const key = watch.currentSituationKey.split('.').at(-1);
  return translations.watchData.pendingSituations[key];
};

const storyAnalysis = ({ title, sourceUrl, overview, concepts }) => ({
  status: 'success',
  pageType: 'article',
  isStory: true,
  title,
  summary: overview,
  monitoringScope: `This Watch will follow future reporting directly related to ${concepts[0].label}, including major developments and significant follow-up reporting.`,
  source: 'BBC',
  sourceName: 'BBC',
  sourceTitle: title,
  sourceUrl,
  storyFingerprint: concepts,
  storyProfile: {
    storySummary: overview,
    concepts,
    sourceArticle: { publication: 'BBC', title, url: sourceUrl },
  },
  monitoringSource: {
    url: 'https://news.google.com/rss/search?q=story',
    type: 'rss',
    title: 'Story feed',
    discovery: 'automatic',
  },
  analysisProvider: 'openai',
  analysisStatus: 'success',
  analysisModel: 'test-model',
});

const createStoryWatch = (sourceAnalysis, category) => createWatchObject(
  sourceAnalysis.sourceUrl,
  '',
  sourceAnalysis,
  {
    category,
    categorySource: 'inferred',
    storyFingerprint: sourceAnalysis.storyFingerprint,
    keywords: sourceAnalysis.storyFingerprint.map(({ label }) => label),
    selectedKeywords: sourceAnalysis.storyFingerprint.map(({ label }) => label),
  },
);

test('editorial Travel Story category cannot select travel availability semantics', () => {
  const analysis = storyAnalysis({
    title: 'The snake-wrangling 84-year-old who lives on a remote barrier island',
    sourceUrl: 'https://www.bbc.com/travel/article/carol-ruckdeschel',
    overview: 'Carol Ruckdeschel lives off-grid while protecting Cumberland Island wildlife.',
    concepts: [{ label: 'Carol Ruckdeschel', type: 'person' }],
  });
  const created = createStoryWatch(analysis, 'travel');
  const persisted = migrateWatchModel(JSON.parse(JSON.stringify(created))).watch;

  assert.equal(persisted.inputType, 'url');
  assert.equal(persisted.isStory, true);
  assert.equal(persisted.category, 'travel');
  assert.deepEqual(persisted.storyProfile.concepts, analysis.storyFingerprint);
  assert.match(persisted.monitoringSummary, /Carol Ruckdeschel/);
  assert.equal(persisted.currentSituationKey, 'watchData.pendingSituations.news');
  assert.equal(
    getCurrentSituationPresentation(persisted, { fallback: pendingText(persisted) }).summary,
    'No major development has been detected yet.',
  );
});

test('genuine travel availability Watch retains its existing pending wording', () => {
  const watch = createWatchObject(
    'Tell me when flights from Nice to London have a new availability or schedule change.',
    '',
    null,
    { category: 'travel', categorySource: 'inferred' },
  );

  assert.equal(watch.inputType, 'text');
  assert.equal(watch.currentSituationKey, 'watchData.pendingSituations.travel');
  assert.equal(
    getCurrentSituationPresentation(watch, { fallback: pendingText(watch) }).summary,
    'No new availability or schedule change has been detected yet.',
  );
});

test('non-travel Ivan Toney Story keeps media-story pending wording', () => {
  const analysis = storyAnalysis({
    title: 'Ivan Toney charged over Soho assault',
    sourceUrl: 'https://www.itv.com/news/ivan-toney-soho-assault',
    overview: 'Ivan Toney was charged after an incident in Soho.',
    concepts: [{ label: 'Ivan Toney', type: 'person' }],
  });
  const watch = createStoryWatch(analysis, 'news');

  assert.equal(watch.isStory, true);
  assert.equal(watch.currentSituationKey, 'watchData.pendingSituations.news');
  assert.equal(
    getCurrentSituationPresentation(watch, { fallback: pendingText(watch) }).summary,
    'No major development has been detected yet.',
  );
});
