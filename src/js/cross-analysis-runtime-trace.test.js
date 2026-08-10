import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { migrateWatchModel } from './watch-model.js';

register('./test-support/json-module-loader.js', import.meta.url);
const { createWatchObject } = await import('./navigation.js');
const { analyseUrl } = await import('./url-analysis.js');

const fixtures = {
  A: {
    url: 'https://www.bbc.com/travel/article/20260612-the-snake-rearing-84-year-old-who-lives-on-a-remote-barrier-island',
    title: 'The snake-rearing 84-year-old who lives on a remote barrier island',
    description: 'Alexandra Marvar profiles naturalist Carol Ruckdeschel on Cumberland Island in America.',
    articleText: 'Carol Ruckdeschel rears snakes and lives off-grid on Cumberland Island. Alexandra Marvar reports on her conservation work in America.',
    rawConcepts: [
      { label: 'Alexandra Marvar', type: 'person' },
      { label: 'America', type: 'location' },
    ],
  },
  B: {
    url: 'https://www.bbc.com/news/articles/c1e1vg0gjl5o',
    title: 'US strikes deal to pay German firm RWE to abandon offshore wind projects',
    description: 'RWE agreed to abandon US offshore wind projects under the Trump administration.',
    articleText: 'RWE agreed to abandon offshore wind projects. Louisiana projects and President Donald Trump’s Department of the Interior are discussed in the same article.',
    rawConcepts: [
      { label: 'Louisiana', type: 'location' },
      { label: 'President Donald Trump’s Department', type: 'organization' },
    ],
  },
  C: {
    url: 'https://www.bbc.com/news/articles/cpw9nz7qwyqo',
    title: 'Footballer Ivan Toney charged with assault at Soho nightclub',
    description: 'Ivan Toney was charged following an incident at a Soho nightclub.',
    articleText: 'Ivan Toney faces an assault charge arising from an incident at a Soho nightclub.',
    rawConcepts: [
      { label: 'Ivan Toney', type: 'person' },
      {
        label: 'Ivan Toney’s assault charge arising from a Soho nightclub incident',
        type: 'event',
      },
    ],
  },
};

const findFixture = (field, value) => Object.values(fixtures)
  .find((fixture) => fixture[field] === value);

const withFetchTrace = async (run) => {
  const originalFetch = globalThis.fetch;
  const trace = [];
  globalThis.fetch = async (path, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    if (path === '/api/page-title') {
      const fixture = findFixture('url', body.url);
      assert.ok(fixture, `unknown page-title URL: ${body.url}`);
      trace.push({ stage: 'page-title-request', url: body.url });
      trace.push({ stage: 'page-title-response', url: fixture.url, title: fixture.title });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: fixture.title,
          description: fixture.description,
          articleText: fixture.articleText,
          siteName: fixture.url.includes('/travel/') ? 'BBC Travel' : 'BBC News',
          sourceUrl: fixture.url,
          pageType: 'article',
        }),
      };
    }
    if (path === '/api/watch-suggestion') {
      const fixture = findFixture('title', body.title);
      assert.ok(fixture, `unknown suggestion title: ${body.title}`);
      trace.push({
        stage: 'suggestion-request',
        title: body.title,
        articleText: body.articleText,
      });
      trace.push({
        stage: 'suggestion-response',
        title: body.title,
        concepts: fixture.rawConcepts,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          concepts: fixture.rawConcepts.map((concept) => ({
            ...concept,
            reason: 'Returned for this request’s own trusted evidence.',
          })),
          confidence: 0.98,
          analysisProvider: 'openai',
          analysisStatus: 'success',
          analysisModel: 'gpt-5.6-luna',
        }),
      };
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  try {
    return await run(trace);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const runOrder = (order) => withFetchTrace(async (requestTrace) => {
  const persisted = new Map();
  const lifecycle = [];
  for (const key of order) {
    const fixture = fixtures[key];
    const analysis = await analyseUrl(fixture.url);
    const watch = createWatchObject(fixture.url, '', analysis, {
      storyFingerprint: analysis.storyFingerprint,
      keywords: analysis.keywords,
      selectedKeywords: analysis.keywords,
    });
    const reloaded = migrateWatchModel(JSON.parse(JSON.stringify(watch))).watch;
    persisted.set(reloaded.id, reloaded);
    lifecycle.push({
      key,
      submittedUrl: fixture.url,
      resolvedAnalysis: analysis,
      reviewTitle: analysis.title,
      reviewConcepts: analysis.storyFingerprint,
      monitoringScope: analysis.monitoringScope,
      beforePersistence: watch,
      persistedId: reloaded.id,
      persistedUrl: reloaded.sourceUrl,
      persistedProfile: reloaded.storyProfile,
      persistedScope: reloaded.monitoringSummary,
      normalizedWatch: reloaded,
      detailWatch: persisted.get(reloaded.id),
      editConcepts: persisted.get(reloaded.id).storyProfile.concepts,
    });
  }
  return { requestTrace, lifecycle, persisted };
});

for (const order of [['A', 'B', 'C'], ['C', 'B', 'A'], ['A', 'B', 'A'], ['B', 'A', 'B']]) {
  test(`sequential runtime trace keeps request identity for ${order.join(' → ')}`, async () => {
    const { requestTrace, lifecycle } = await runOrder(order);
    assert.deepEqual(
      requestTrace.filter(({ stage }) => stage === 'page-title-request').map(({ url }) => url),
      order.map((key) => fixtures[key].url),
    );
    assert.deepEqual(
      requestTrace.filter(({ stage }) => stage === 'suggestion-response')
        .map(({ concepts }) => concepts),
      order.map((key) => fixtures[key].rawConcepts),
    );
    lifecycle.forEach((entry, index) => {
      const fixture = fixtures[order[index]];
      assert.equal(entry.resolvedAnalysis.sourceUrl, fixture.url);
      assert.equal(entry.reviewTitle, fixture.title);
      fixture.rawConcepts.forEach(({ label }) => assert.ok(
        entry.reviewConcepts.some((concept) => concept.label === label),
        `${order[index]} missing its own raw concept ${label}`,
      ));
      assert.equal(entry.beforePersistence.sourceUrl, fixture.url);
      assert.equal(entry.persistedUrl, fixture.url);
      assert.equal(entry.normalizedWatch.id, entry.persistedId);
      assert.equal(entry.detailWatch.id, entry.persistedId);
      assert.deepEqual(entry.editConcepts, entry.persistedProfile.concepts);
    });
  });
}

test('persisted Story objects and metadata remain reference-independent across Watches', async () => {
  const { lifecycle } = await runOrder(['A', 'B', 'C']);
  for (let index = 0; index < lifecycle.length; index += 1) {
    for (let other = index + 1; other < lifecycle.length; other += 1) {
      assert.notStrictEqual(
        lifecycle[index].normalizedWatch.storyProfile,
        lifecycle[other].normalizedWatch.storyProfile,
      );
      assert.notStrictEqual(
        lifecycle[index].normalizedWatch.storyProfile.concepts,
        lifecycle[other].normalizedWatch.storyProfile.concepts,
      );
    }
  }
  const before = JSON.stringify(lifecycle[0].normalizedWatch);
  lifecycle[1].normalizedWatch.storyProfile.concepts.push({ label: 'Mutation', type: 'manual' });
  lifecycle[1].normalizedWatch.analysisProvider = 'mutated';
  assert.equal(JSON.stringify(lifecycle[0].normalizedWatch), before);
});

test('reload, detail navigation, Edit cancel/save and Check Now preserve Watch identity', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([
    ['watchAssistant.demoDataVersion', 'home-report-v1'],
    ['watchAssistant.htmlEntityDecodeVersion', '1'],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
  try {
    const { lifecycle } = await runOrder(['A', 'B', 'C']);
    const { addWatch, getStoredWatches, getWatchById, updateWatch } = await import('./watch-storage.js');
    lifecycle.forEach(({ normalizedWatch }) => addWatch(normalizedWatch));

    const reloaded = JSON.parse(JSON.stringify(getStoredWatches()));
    assert.equal(reloaded.length, 3);
    for (const entry of lifecycle) {
      const selected = getWatchById(entry.persistedId);
      assert.equal(selected.id, entry.persistedId);
      assert.equal(selected.sourceUrl, entry.persistedUrl);
      assert.deepEqual(selected.storyProfile.concepts, entry.persistedProfile.concepts);
      assert.equal(selected.monitoringSummary, entry.persistedScope);
    }

    const carolId = lifecycle[0].persistedId;
    const rweId = lifecycle[1].persistedId;
    const carolBeforeEdits = JSON.stringify(getWatchById(carolId));
    const rweBeforeCancel = JSON.stringify(getWatchById(rweId));
    // Edit → Cancel performs no storage write.
    assert.equal(JSON.stringify(getWatchById(rweId)), rweBeforeCancel);
    const rwe = getWatchById(rweId);
    updateWatch(rweId, {
      whyFollowing: 'Saved independently',
      storyProfile: JSON.parse(JSON.stringify(rwe.storyProfile)),
      storyFingerprint: JSON.parse(JSON.stringify(rwe.storyFingerprint)),
    });
    assert.equal(getWatchById(rweId).whyFollowing, 'Saved independently');
    assert.equal(JSON.stringify(getWatchById(carolId)), carolBeforeEdits);

    updateWatch(rweId, {
      lastChecked: '2026-08-10T12:00:00.000Z',
      monitoringSnapshot: { itemIds: [], items: [], checkedAt: '2026-08-10T12:00:00.000Z' },
    });
    assert.equal(getWatchById(rweId).sourceUrl, fixtures.B.url);
    assert.equal(JSON.stringify(getWatchById(carolId)), carolBeforeEdits);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  }
});
