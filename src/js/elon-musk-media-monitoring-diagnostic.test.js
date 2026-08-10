import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { planWatch } from '../../server/watch-planner.js';
import { createNewsSearchFeedUrl } from '../../server/monitoring-source-api.js';
import {
  extractMonitoringConcepts,
  MONITORING_CONCEPTS_VERSION,
} from './monitoring-concepts.js';
import {
  getMediaMentionConcepts,
  parseMediaMentionRequest,
} from './media-mention-request.js';
import { createLocalEditorialSummary } from './monitoring-summary.js';
import { inferWatchCategory } from './watch-category.js';
import {
  activateWatchMonitoring,
  createWatchCheckController,
  matchFeedItemToWatch,
  MonitoringCheckError,
} from './watch-monitoring.js';
import { getUnsupportedWatchCapability } from './watch-planner.js';
import { requestMonitoringSource } from './watch-source-discovery.js';
import { migrateWatchModel } from './watch-model.js';
import { getVisibleConceptLabels } from './story-fingerprint-migration.js';

register('./test-support/json-module-loader.js', import.meta.url);
const { createWatchObject } = await import('./navigation.js');

const ENGLISH_REQUEST = 'Tell me when Elon Musk is mentioned in the media.';
const FRENCH_REQUEST = 'Dis-moi quand Elon Musk est mentionné dans les médias.';
const WEB_PLAN = {
  strategy: 'web_search',
  connector: 'web_ai',
  country: null,
  identifier: null,
  confidence: 0.5,
  needsClarification: false,
  clarificationQuestion: null,
};

const item = (id, title) => ({
  id,
  title,
  url: `https://publisher.example/${id}`,
  source: 'Fixture News',
  excerpt: title,
});

const createTextWatch = (request, monitoringSource = null) => {
  const mediaMention = parseMediaMentionRequest(request);
  const conceptItems = getMediaMentionConcepts(request)
    || extractMonitoringConcepts(request).map((label) => ({ label, type: 'manual' }));
  const keywords = conceptItems.map(({ label }) => label);
  return createWatchObject(request, '', null, {
    category: inferWatchCategory(request),
    categorySource: 'inferred',
    keywords,
    selectedKeywords: keywords,
    storyFingerprint: conceptItems,
    ...(mediaMention.recognized ? {
      mediaMention: {
        subjects: mediaMention.subjects,
        matchMode: mediaMention.matchMode,
      },
    } : {}),
    monitoringSource,
    monitoringSummary: createLocalEditorialSummary(request),
  });
};

const conceptShape = (watch) => watch.storyProfile.concepts.map(({ label, type }) => ({
  label,
  type,
}));

test('Elon media requests retain generic Planner routing while resolving to News category', async () => {
  for (const request of [ENGLISH_REQUEST, FRENCH_REQUEST]) {
    const plan = await planWatch(request, {
      companyOnly: true,
      includeMediaStory: true,
      discoverSource: async () => assert.fail(
        'The migrated-routes Planner scope does not discover a source for plain text Watches.',
      ),
    });
    assert.deepEqual(plan, WEB_PLAN);
    assert.equal(getUnsupportedWatchCapability(request, plan), null);
    assert.equal(inferWatchCategory(request), 'news');
  }
});

test('media-mention Watch titles use the normalized subject without replacing the request', () => {
  const english = createTextWatch(ENGLISH_REQUEST);
  const french = createTextWatch(FRENCH_REQUEST);
  assert.equal(english.request, ENGLISH_REQUEST);
  assert.equal(english.title, 'Elon Musk media mentions');
  assert.equal(french.request, FRENCH_REQUEST);
  assert.equal(french.title, 'Elon Musk dans les médias');
});

test('explicit single-subject media requests expose only the intact subject concept', () => {
  for (const [request, subject] of [
    [ENGLISH_REQUEST, 'Elon Musk'],
    ['Tell me when Tesla is mentioned in the media.', 'Tesla'],
    ['Dis-moi quand Bernard Arnault est mentionné dans les médias.', 'Bernard Arnault'],
    ['Préviens-moi quand LVMH est mentionné dans la presse.', 'LVMH'],
  ]) {
    const watch = migrateWatchModel(createTextWatch(request)).watch;
    assert.deepEqual(conceptShape(watch), [{ label: subject, type: 'manual' }]);
    assert.deepEqual(watch.keywords, [subject]);
    assert.deepEqual(watch.selectedKeywords, [subject]);
    assert.deepEqual(watch.mediaMention, { subjects: [subject], matchMode: 'all' });
    assert.equal(watch.storyProfile.concepts.some(({ label }) => (
      ['mentioned', 'media'].includes(label.toLocaleLowerCase())
    )), false);
  }
});

test('English and French coordinated media requests persist two concepts with all-subject intent', () => {
  for (const [request, title] of [
    ['Tell me when Elon Musk and Tesla are mentioned in the media.', 'Elon Musk and Tesla media mentions'],
    ['Dis-moi quand Elon Musk et Tesla sont mentionnés dans les médias.', 'Elon Musk et Tesla dans les médias'],
  ]) {
    const watch = migrateWatchModel(createTextWatch(request)).watch;
    assert.equal(watch.request, request);
    assert.equal(watch.title, title);
    assert.deepEqual(conceptShape(watch), [
      { label: 'Elon Musk', type: 'manual' },
      { label: 'Tesla', type: 'manual' },
    ]);
    assert.deepEqual(watch.mediaMention, {
      subjects: ['Elon Musk', 'Tesla'],
      matchMode: 'all',
    });
  }
});

test('coordinated media matching requires every subject in the same item', () => {
  const watch = migrateWatchModel(createTextWatch(
    'Tell me when Elon Musk and Tesla are mentioned in the media.',
  )).watch;
  for (const [candidate, expected] of [
    ['Elon Musk discusses Tesla\'s next generation of vehicles', true],
    ['Elon Musk discusses the future of SpaceX', false],
    ['Tesla announces a new vehicle platform', false],
    ['Tesla board discusses Elon Musk compensation package', true],
    ['Tesla shares rise after quarterly deliveries', false],
  ]) {
    assert.equal(matchFeedItemToWatch(item(candidate, candidate), watch).matched, expected, candidate);
  }
});

test('coordinated media monitoring baselines old items, ignores partial matches, and deduplicates', async () => {
  let watch = migrateWatchModel(createTextWatch(
    'Tell me when Elon Musk and Tesla are mentioned in the media.',
    {
      url: createNewsSearchFeedUrl('Elon Musk and Tesla', 'en'),
      type: 'rss',
      title: 'Elon Musk and Tesla - Google News',
      discovery: 'news-search',
      query: 'Elon Musk and Tesla',
    },
  )).watch;
  const responses = [
    {
      checkedAt: '2026-08-10T13:00:00.000Z',
      items: [item('old-both', 'Elon Musk discusses Tesla production')],
    },
    {
      checkedAt: '2026-08-10T13:01:00.000Z',
      items: [
        item('old-both', 'Elon Musk discusses Tesla production'),
        item('new-partial', 'Tesla expands its European charging network'),
      ],
    },
    {
      checkedAt: '2026-08-10T13:02:00.000Z',
      items: [
        item('old-both', 'Elon Musk discusses Tesla production'),
        item('new-partial', 'Tesla expands its European charging network'),
        item('new-both', 'Tesla board reviews Elon Musk compensation'),
      ],
    },
    {
      checkedAt: '2026-08-10T13:03:00.000Z',
      items: [
        item('old-both', 'Elon Musk discusses Tesla production'),
        item('new-partial', 'Tesla expands its European charging network'),
        item('new-both', 'Tesla board reviews Elon Musk compensation'),
      ],
    },
  ];
  const saveWatch = (_watchId, changes) => {
    watch = { ...watch, ...changes };
    return watch;
  };
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch,
    requestCheck: async () => responses.shift(),
  });

  assert.equal((await activateWatchMonitoring(watch.id, {
    checkController: controller,
    saveWatch,
  })).outcome, 'baseline');
  assert.equal(watch.updates.length, 0);

  const partial = await controller.check(watch.id);
  assert.equal(partial.outcome, 'no-matching-items');
  assert.equal(partial.matchedItems.length, 0);
  assert.equal(watch.updates.length, 0);

  const full = await controller.check(watch.id);
  assert.equal(full.outcome, 'matching-items');
  assert.deepEqual(full.matchedItems.map(({ id }) => id), ['new-both']);
  assert.deepEqual(watch.updates.map(({ id }) => id), ['new-both']);

  const repeat = await controller.check(watch.id);
  assert.equal(repeat.outcome, 'no-new-items');
  assert.deepEqual(watch.updates.map(({ id }) => id), ['new-both']);
});

test('single, multiword, conjunction, and possessive subjects remain literal phrases', () => {
  for (const [request, subject] of [
    ['Tell me when Tesla is mentioned in the media.', 'Tesla'],
    ['Tell me when Bernard Arnault is mentioned in the media.', 'Bernard Arnault'],
    ['Tell me when Marks and Spencer is mentioned in the media.', 'Marks and Spencer'],
    ['Tell me when Research and Development Holdings is mentioned in the media.', 'Research and Development Holdings'],
    ["Tell me when Elon Musk's Tesla is mentioned in the media.", "Elon Musk's Tesla"],
  ]) {
    const watch = migrateWatchModel(createTextWatch(request)).watch;
    assert.deepEqual(watch.mediaMention.subjects, [subject]);
    assert.deepEqual(conceptShape(watch), [{ label: subject, type: 'manual' }]);
    assert.equal(matchFeedItemToWatch(item(subject, `${subject} appears in a report`), watch).matched, true);
  }
});

test('migration repairs generated prompt-fragment concepts without changing the original request', () => {
  const legacy = createTextWatch(ENGLISH_REQUEST);
  legacy.storyFingerprint = [
    { label: 'Elon Musk', type: 'manual' },
    { label: 'Mentioned', type: 'manual' },
    { label: 'Media', type: 'manual' },
  ];
  legacy.storyProfile = {
    ...legacy.storyProfile,
    concepts: legacy.storyFingerprint,
  };
  legacy.keywords = ['Elon Musk', 'Mentioned', 'Media'];
  legacy.selectedKeywords = ['Elon Musk', 'Mentioned', 'Media'];

  const migrated = migrateWatchModel(JSON.parse(JSON.stringify(legacy))).watch;
  assert.equal(migrated.request, ENGLISH_REQUEST);
  assert.deepEqual(conceptShape(migrated), [{ label: 'Elon Musk', type: 'manual' }]);
  assert.deepEqual(migrated.keywords, ['Elon Musk']);
  assert.deepEqual(migrated.selectedKeywords, ['Elon Musk']);
  assert.deepEqual(migrated.mediaMention, { subjects: ['Elon Musk'], matchMode: 'all' });
  assert.deepEqual(
    getVisibleConceptLabels(migrated, MONITORING_CONCEPTS_VERSION),
    ['Elon Musk'],
  );
});

test('plain-text creation bridges web planning to an executable Google News RSS source', async () => {
  const expectedUrl = createNewsSearchFeedUrl('Elon Musk', 'en');
  const discoveryRequests = [];
  const monitoringSource = await requestMonitoringSource(ENGLISH_REQUEST, {
    language: 'en',
    fetchImpl: async (path, options) => {
      discoveryRequests.push({ path, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        monitoringSource: {
          url: expectedUrl,
          type: 'rss',
          title: 'Elon Musk - Google News',
          discovery: 'news-search',
          query: 'Elon Musk',
        },
      }), { status: 200 });
    },
  });
  assert.deepEqual(discoveryRequests, [{
    path: '/api/monitoring-source',
    body: { request: ENGLISH_REQUEST, language: 'en' },
  }]);

  let watch = migrateWatchModel(JSON.parse(JSON.stringify(
    createTextWatch(ENGLISH_REQUEST, monitoringSource),
  ))).watch;
  const checkedUrls = [];
  const responses = [
    {
      checkedAt: '2026-08-10T12:00:00.000Z',
      items: [
        item('baseline-1', 'Elon Musk discusses technology'),
        item('baseline-2', 'Markets react to remarks by Elon Musk'),
      ],
    },
    {
      checkedAt: '2026-08-10T12:01:00.000Z',
      items: [
        item('baseline-1', 'Elon Musk discusses technology'),
        item('baseline-2', 'Markets react to remarks by Elon Musk'),
      ],
    },
    {
      checkedAt: '2026-08-10T12:02:00.000Z',
      items: [
        item('baseline-1', 'Elon Musk discusses technology'),
        item('baseline-2', 'Markets react to remarks by Elon Musk'),
        item('later-1', 'Elon Musk mentioned in a new media report'),
      ],
    },
    {
      checkedAt: '2026-08-10T12:03:00.000Z',
      items: [
        item('baseline-1', 'Elon Musk discusses technology'),
        item('baseline-2', 'Markets react to remarks by Elon Musk'),
        item('later-1', 'Elon Musk mentioned in a new media report'),
        item('unrelated-1', 'A regional weather service publishes its forecast'),
      ],
    },
    {
      checkedAt: '2026-08-10T12:04:00.000Z',
      items: [
        item('baseline-1', 'Elon Musk discusses technology'),
        item('baseline-2', 'Markets react to remarks by Elon Musk'),
        item('later-1', 'Elon Musk mentioned in a new media report'),
        item('unrelated-1', 'A regional weather service publishes its forecast'),
      ],
    },
  ];
  const saveWatch = (_watchId, changes) => {
    watch = { ...watch, ...changes };
    return watch;
  };
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch,
    requestCheck: async (url) => {
      checkedUrls.push(url);
      return responses.shift();
    },
  });

  assert.equal(watch.monitoringSource.discovery, 'news-search');
  assert.equal(watch.monitoringSource.query, 'Elon Musk');
  assert.equal(watch.monitoringSource.url, expectedUrl);
  assert.equal(watch.feedUrl, expectedUrl);
  assert.equal(watch.request, ENGLISH_REQUEST);
  assert.equal(watch.title, 'Elon Musk media mentions');
  assert.equal(watch.category, 'news');
  assert.equal(watch.monitoringStatus.state, 'configured');
  assert.equal('strategy' in watch, false);
  assert.equal('connector' in watch, false);
  assert.equal('query' in watch, false);

  const activation = await activateWatchMonitoring(watch.id, {
    checkController: controller,
    saveWatch,
  });
  assert.equal(activation.outcome, 'baseline');
  assert.equal(watch.monitoringSnapshot.itemIds.length, 2);
  assert.equal(watch.updates.length, 0);
  assert.equal(watch.monitoringState, 'monitoring');

  const immediateCheckNow = await controller.check(watch.id);
  assert.equal(immediateCheckNow.outcome, 'no-new-items');
  assert.equal(immediateCheckNow.changes.lastCheckResult.diagnostics.returnedItemCount, 2);
  assert.equal(immediateCheckNow.unseenItems.length, 0);
  assert.equal(immediateCheckNow.matchedItems.length, 0);
  assert.equal(watch.updates.length, 0);
  assert.equal(watch.monitoringSnapshot.itemIds.length, 2);

  const laterCheckNow = await controller.check(watch.id);
  assert.equal(laterCheckNow.outcome, 'matching-items');
  assert.equal(laterCheckNow.unseenItems.length, 1);
  assert.equal(laterCheckNow.matchedItems.length, 1);
  assert.equal(watch.updates.length, 1);
  assert.equal(watch.updates[0].id, 'later-1');
  assert.equal(watch.monitoringSnapshot.itemIds.length, 3);

  const unrelatedCheckNow = await controller.check(watch.id);
  assert.equal(unrelatedCheckNow.outcome, 'no-matching-items');
  assert.equal(unrelatedCheckNow.unseenItems.length, 1);
  assert.equal(unrelatedCheckNow.matchedItems.length, 0);
  assert.equal(watch.updates.length, 1);
  assert.equal(watch.monitoringSnapshot.itemIds.length, 4);

  const repeatedCheckNow = await controller.check(watch.id);
  assert.equal(repeatedCheckNow.outcome, 'no-new-items');
  assert.equal(repeatedCheckNow.unseenItems.length, 0);
  assert.equal(watch.updates.length, 1);
  assert.deepEqual(checkedUrls, [expectedUrl, expectedUrl, expectedUrl, expectedUrl, expectedUrl]);
});

test('a text Watch without an executable source cannot record a successful no-change check', async () => {
  let watch = createTextWatch(ENGLISH_REQUEST);
  let requestCount = 0;
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch: (_watchId, changes) => {
      watch = { ...watch, ...changes };
      return watch;
    },
    requestCheck: async () => {
      requestCount += 1;
      return { items: [] };
    },
  });

  assert.equal(watch.monitoringSource, null);
  assert.equal(watch.monitoringStatus.state, 'setup-required');
  await assert.rejects(controller.check(watch.id), (error) => (
    error instanceof MonitoringCheckError && error.code === 'MISSING_FEED_URL'
  ));
  assert.equal(requestCount, 0);
  assert.deepEqual(watch.lastCheckAttempt, {
    status: 'failed',
    attemptedAt: watch.lastCheckAttempt.attemptedAt,
    code: 'MISSING_FEED_URL',
  });
  assert.equal(watch.lastCheckOutcome, undefined);
  assert.equal(watch.lastChecked, null);
});
