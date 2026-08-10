import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { migrateWatchModel } from './watch-model.js';

register('./test-support/json-module-loader.js', import.meta.url);
const { createWatchObject } = await import('./navigation.js');

const carolUrl = 'https://www.bbc.com/travel/article/carol-ruckdeschel';
const alexandraUrl = 'https://example.com/politics/alexandra-marvar';

const analysis = ({ title, sourceUrl, overview, monitoringScope, concepts, category }) => ({
  status: 'success',
  pageType: 'article',
  isStory: true,
  title,
  summary: overview,
  monitoringScope,
  source: 'Test News',
  sourceName: 'Test News',
  sourceTitle: title,
  sourceUrl,
  storyFingerprint: concepts,
  storyProfile: {
    storySummary: overview,
    concepts,
    sourceArticle: { publication: 'Test News', title, url: sourceUrl },
  },
  monitoringSource: {
    url: `https://feeds.example.com/${category}.xml`,
    type: 'rss',
    title: 'Test feed',
    discovery: 'automatic',
  },
  analysisProvider: 'openai',
  analysisStatus: 'success',
  analysisModel: 'test-model',
  category,
});

const alexandraScope = 'This Watch will follow future reporting directly related to Alexandra Marvar and America, including election and campaign developments, official decisions and statements and significant political consequences.';

const carolAnalysis = () => analysis({
  title: 'The snake-wrangling 84-year-old who lives on a remote barrier island',
  sourceUrl: carolUrl,
  overview: 'Carol Ruckdeschel has lived off-grid on Cumberland Island while protecting its wildlife.',
  // Reproduces the real split snapshot: enhanced Carol concepts with the earlier byline-led scope.
  monitoringScope: alexandraScope,
  concepts: [
    { label: 'Carol Ruckdeschel', type: 'person' },
    {
      label: 'Carol Ruckdeschel’s conservation and off-grid life on Cumberland Island',
      type: 'relationship',
    },
  ],
  category: 'travel',
});

const alexandraAnalysis = () => analysis({
  title: 'Alexandra Marvar enters campaign in America',
  sourceUrl: alexandraUrl,
  overview: 'Alexandra Marvar entered a political campaign in America.',
  monitoringScope: alexandraScope,
  concepts: [
    { label: 'Alexandra Marvar', type: 'person' },
    { label: 'American election campaign', type: 'event' },
  ],
  category: 'news',
});

const create = (sourceUrl, sourceAnalysis) => createWatchObject(
  sourceUrl,
  '',
  sourceAnalysis,
  {
    storyFingerprint: sourceAnalysis.storyFingerprint,
    keywords: sourceAnalysis.storyFingerprint.map(({ label }) => label),
    selectedKeywords: sourceAnalysis.storyFingerprint.map(({ label }) => label),
    category: sourceAnalysis.category,
    categorySource: 'manual',
  },
);

const assertLifecycleFields = (watch, sourceAnalysis) => {
  assert.equal(watch.title, sourceAnalysis.title);
  assert.equal(watch.sourceUrl, sourceAnalysis.sourceUrl);
  assert.equal(watch.storyProfile.storySummary, sourceAnalysis.storyProfile.storySummary);
  assert.deepEqual(watch.storyProfile.concepts, sourceAnalysis.storyFingerprint);
  assert.equal(watch.analysisProvider, 'openai');
  assert.equal(watch.analysisStatus, 'success');
  assert.equal(watch.analysisModel, 'test-model');
  assert.equal(watch.category, sourceAnalysis.category);
};

const assertIndependent = (firstAnalysis, secondAnalysis) => {
  const first = create(firstAnalysis.sourceUrl, firstAnalysis);
  const second = create(secondAnalysis.sourceUrl, secondAnalysis);
  assert.notEqual(first.id, second.id);
  assert.notStrictEqual(first.storyProfile, firstAnalysis.storyProfile);
  assert.notStrictEqual(second.storyProfile, secondAnalysis.storyProfile);
  assert.notStrictEqual(first.storyProfile, second.storyProfile);

  const normalizedFirst = migrateWatchModel(JSON.parse(JSON.stringify(first))).watch;
  const normalizedSecond = migrateWatchModel(JSON.parse(JSON.stringify(second))).watch;
  assertLifecycleFields(first, firstAnalysis);
  assertLifecycleFields(second, secondAnalysis);
  assertLifecycleFields(normalizedFirst, firstAnalysis);
  assertLifecycleFields(normalizedSecond, secondAnalysis);
  return { first, second, normalizedFirst, normalizedSecond };
};

test('Carol then Alexandra persists and reloads only each Watch’s own Story state', () => {
  const carol = carolAnalysis();
  const alexandra = alexandraAnalysis();
  const { first, second, normalizedFirst, normalizedSecond } = assertIndependent(carol, alexandra);

  assert.match(first.monitoringSummary, /Carol Ruckdeschel|Cumberland Island/);
  assert.doesNotMatch(first.monitoringSummary, /Alexandra Marvar|political consequences/);
  assert.match(second.monitoringSummary, /Alexandra Marvar/);
  assert.deepEqual(normalizedFirst.storyProfile.concepts, carol.storyFingerprint);
  assert.deepEqual(normalizedSecond.storyProfile.concepts, alexandra.storyFingerprint);
  assert.equal(normalizedFirst.monitoringSummary, first.monitoringSummary);
  assert.equal(normalizedSecond.monitoringSummary, second.monitoringSummary);
});

test('Alexandra then Carol remains independent across A to B to A detail/edit reads', () => {
  const alexandra = alexandraAnalysis();
  const carol = carolAnalysis();
  const { first, second, normalizedFirst, normalizedSecond } = assertIndependent(alexandra, carol);
  const persisted = new Map([
    [normalizedFirst.id, normalizedFirst],
    [normalizedSecond.id, normalizedSecond],
  ]);

  const detailA = persisted.get(first.id);
  const detailB = persisted.get(second.id);
  const detailAAgain = persisted.get(first.id);
  assert.match(detailA.monitoringSummary, /Alexandra Marvar/);
  assert.match(detailB.monitoringSummary, /Carol Ruckdeschel|Cumberland Island/);
  assert.doesNotMatch(detailB.monitoringSummary, /Alexandra Marvar|political consequences/);
  assert.deepEqual(detailAAgain.storyProfile.concepts, alexandra.storyFingerprint);
  assert.deepEqual(detailB.storyProfile.concepts, carol.storyFingerprint);

  second.storyProfile.concepts.push({ label: 'Mutated later analysis', type: 'manual' });
  assert.equal(carol.storyProfile.concepts.some(({ label }) => label === 'Mutated later analysis'), false);
  assert.equal(detailB.storyProfile.concepts.some(({ label }) => label === 'Mutated later analysis'), false);
});

test('a late enhancement mutation cannot overwrite an already assembled different Watch', async () => {
  const carol = carolAnalysis();
  const alexandra = alexandraAnalysis();
  const carolWatch = create(carol.sourceUrl, carol);
  let releaseLateEnhancement;
  const lateEnhancement = new Promise((resolve) => {
    releaseLateEnhancement = resolve;
  }).then(() => {
    carol.storyProfile = alexandra.storyProfile;
    carol.storyFingerprint = alexandra.storyFingerprint;
    carol.monitoringScope = alexandra.monitoringScope;
  });

  const alexandraWatch = create(alexandra.sourceUrl, alexandra);
  releaseLateEnhancement();
  await lateEnhancement;

  assert.match(carolWatch.monitoringSummary, /Carol Ruckdeschel|Cumberland Island/);
  assert.deepEqual(carolWatch.storyProfile.concepts, carolAnalysis().storyFingerprint);
  assert.match(alexandraWatch.monitoringSummary, /Alexandra Marvar/);
  assert.deepEqual(alexandraWatch.storyProfile.concepts, alexandra.storyFingerprint);
});
