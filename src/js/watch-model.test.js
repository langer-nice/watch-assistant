import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAnalysisProvenanceMessageKey,
  getMonitoringHealthPresentation,
  migrateWatchModel,
  WATCH_MODEL_VERSION,
} from './watch-model.js';

test('preserves analysis provenance and selects only the Preview diagnostic copy', () => {
  const provenance = {
    analysisProvider: 'deterministic',
    analysisStatus: 'fallback',
    analysisModel: null,
    fallbackReasonCode: 'missing_api_key',
    analyzedAt: '2026-07-27T12:00:00.000Z',
    analysisDiagnosticId: 'diagnostic-1',
  };
  const watch = migrateWatchModel({ id: 'provenance', inputType: 'url', ...provenance }).watch;
  assert.deepEqual(
    Object.fromEntries(Object.keys(provenance).map((key) => [key, watch[key]])),
    provenance,
  );
  assert.equal(getAnalysisProvenanceMessageKey(watch), 'detail.analysisProvenanceFallback');
  assert.equal(getAnalysisProvenanceMessageKey({
    analysisProvider: 'openai', analysisStatus: 'success',
  }), 'detail.analysisProvenanceAi');
  assert.equal(getAnalysisProvenanceMessageKey({}), null);
});

test('normalizes persisted check-attempt state without changing successful history', () => {
  const lastChecked = '2026-07-27T10:00:00.000Z';
  const watch = migrateWatchModel({
    id: 'failed-retry',
    status: 'updated',
    lastChecked,
    lastCheckOutcome: { type: 'matching-items', checkedAt: lastChecked },
    lastCheckAttempt: {
      status: 'failed',
      attemptedAt: '2026-07-27T11:00:00Z',
      code: 'CHECK_FAILED',
      rawMessage: 'sensitive upstream detail',
    },
  }).watch;

  assert.equal(watch.lastChecked, lastChecked);
  assert.equal(watch.lastCheckOutcome.type, 'matching-items');
  assert.equal(watch.status, 'updated');
  assert.deepEqual(watch.lastCheckAttempt, {
    status: 'failed',
    attemptedAt: '2026-07-27T11:00:00.000Z',
    code: 'CHECK_FAILED',
  });
  assert.equal(watch.lastCheckAttempt.rawMessage, undefined);
});

test('migrates a legacy URL Watch without losing manually edited keywords', () => {
  const result = migrateWatchModel({
    id: 'legacy',
    inputType: 'url',
    sourceName: 'BBC News',
    sourceTitle: 'A story',
    sourceUrl: 'https://www.bbc.com/news/articles/example',
    feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    keywords: ['Abdul Ballout', 'Beirut'],
    storyFingerprint: [{ label: 'Beirut', type: 'location' }],
    monitoringConceptsManuallyEdited: true,
    monitoringUpdates: [{ id: 'candidate-1', status: 'unreviewed', detectedAt: '2026-07-26T10:00:00Z' }],
    status: 'watching',
  }).watch;
  assert.equal(result.watchModelVersion, WATCH_MODEL_VERSION);
  assert.equal(result.monitoringSource.url, 'https://feeds.bbci.co.uk/news/world/rss.xml');
  assert.deepEqual(result.storyProfile.userAddedConcepts, ['Abdul Ballout', 'Beirut']);
  assert.deepEqual(result.storyFingerprint, [
    { label: 'Beirut', type: 'location' },
    { label: 'Abdul Ballout', type: 'manual' },
  ]);
  assert.equal(result.candidateUpdates[0].id, 'candidate-1');
  assert.equal(result.unreadUpdateCount, 1);
  assert.equal(result.currentStatus, 'watching');
  assert.equal(result.lastUpdated, '2026-07-26T10:00:00.000Z');
  assert.deepEqual(result.updates.map(({ id, status }) => ({ id, status })), [
    { id: 'candidate-1', status: 'new' },
  ]);
});

test('legacy Update migration preserves data and is idempotent across repeated loads', () => {
  const legacy = {
    id: 'legacy-history',
    title: 'Stored title',
    sourceUrl: 'https://www.example.com/story',
    latestChange: 'A meaningful stored change.',
    latestChangeAt: '2026-07-27T11:00:00Z',
    userNote: 'Never discard this note.',
    status: 'updated',
  };
  const first = migrateWatchModel(legacy).watch;
  const second = migrateWatchModel(first);

  assert.equal(first.userNote, legacy.userNote);
  assert.equal(first.updates.length, 1);
  assert.equal(first.updates[0].summary, legacy.latestChange);
  assert.equal(first.updates[0].sourceDomain, 'example.com');
  assert.equal(first.updates[0].status, 'new');
  assert.equal(first.lastChecked, null);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.watch.updates, first.updates);
});

test('a new Watch with an explicit empty history does not receive a migration Update', () => {
  const watch = migrateWatchModel({
    id: 'new-watch',
    title: 'New Watch',
    status: 'watching',
    currentStatus: 'watching',
    lastChecked: null,
    lastUpdated: null,
    updates: [],
  }).watch;

  assert.deepEqual(watch.updates, []);
  assert.equal(watch.currentStatus, 'watching');
  assert.equal(watch.lastUpdated, null);
});

test('migrates automatic legacy facts to context without touching monitoring state', () => {
  const snapshot = { itemIds: ['old'], checkedAt: '2026-07-26T10:00:00Z' };
  const watch = migrateWatchModel({
    id: 'legacy-fact',
    inputType: 'url',
    storyFingerprint: [
      { label: 'Amazon Luna', type: 'product_service' },
      { label: 'Company announces plans', type: 'supporting' },
    ],
    keywords: ['Amazon Luna', 'Company announces plans'],
    storyProfile: { distinctiveFacts: ['Existing context'] },
    monitoringSnapshot: snapshot,
    candidateUpdates: [{ id: 'candidate-1' }],
  }).watch;

  assert.deepEqual(watch.storyFingerprint, [{ label: 'Amazon Luna', type: 'product_service' }]);
  assert.deepEqual(watch.keywords, ['Amazon Luna']);
  assert.deepEqual(watch.storyProfile.distinctiveFacts, ['Existing context', 'Company announces plans']);
  assert.deepEqual(watch.monitoringSnapshot, snapshot);
  assert.deepEqual(watch.candidateUpdates, [{ id: 'candidate-1' }]);
});

test('read-time migration restricts automatic identifiers without changing monitoring history', () => {
  const snapshot = { itemIds: ['existing'], checkedAt: '2026-07-26T10:00:00Z' };
  const candidateUpdates = [{ id: 'candidate-1', status: 'candidate' }];
  const watch = migrateWatchModel({
    id: 'polluted-automatic-watch',
    inputType: 'url',
    storyFingerprint: [
      { label: 'Brain fog', type: 'symptom' },
      { label: 'Perimenopause', type: 'condition' },
      { label: 'Lifestyle strategies for improving concentration', type: 'phenomenon' },
      { label: 'Becoming one', type: 'phenomenon' },
    ],
    keywords: [
      'Brain fog',
      'Perimenopause',
      'Lifestyle strategies for improving concentration',
      'Becoming one',
    ],
    storyProfile: { storySummary: 'The article explains brain fog during perimenopause.' },
    monitoringSnapshot: snapshot,
    candidateUpdates,
    seenMonitoringItemIds: ['existing'],
    checkHistory: [{ outcome: 'baseline' }],
  }).watch;

  assert.deepEqual(watch.storyFingerprint, [
    { label: 'Brain fog', type: 'symptom' },
    { label: 'Perimenopause', type: 'condition' },
  ]);
  assert.deepEqual(watch.keywords, ['Brain fog', 'Perimenopause']);
  assert.deepEqual(watch.storyProfile.concepts, watch.storyFingerprint);
  assert.deepEqual(watch.monitoringSnapshot, snapshot);
  assert.deepEqual(watch.candidateUpdates, candidateUpdates);
  assert.deepEqual(watch.seenMonitoringItemIds, ['existing']);
  assert.deepEqual(watch.checkHistory, [{ outcome: 'baseline' }]);
});

test('preserves a manually edited legacy fact as a manual identifier', () => {
  const watch = migrateWatchModel({
    id: 'manual-fact',
    inputType: 'url',
    monitoringConceptsManuallyEdited: true,
    storyFingerprint: [{ label: 'My saved phrase', type: 'fact' }],
    keywords: ['My saved phrase'],
  }).watch;

  assert.deepEqual(watch.storyFingerprint, [{ label: 'My saved phrase', type: 'manual' }]);
  assert.deepEqual(watch.storyProfile.distinctiveFacts, []);
});

test('manual additions, renames and removals survive read-time migration exactly', () => {
  const watch = migrateWatchModel({
    id: 'manual-selection',
    inputType: 'url',
    monitoringConceptsManuallyEdited: true,
    storyFingerprint: [
      { label: 'Renamed brain-fog topic', type: 'manual' },
      { label: 'My added identifier', type: 'manual' },
      { label: 'Deliberately deselected', type: 'manual' },
    ],
    keywords: ['Renamed brain-fog topic', 'My added identifier', 'Deliberately deselected'],
    selectedKeywords: ['Renamed brain-fog topic', 'My added identifier'],
    storyProfile: {
      concepts: [
        { label: 'Renamed brain-fog topic', type: 'manual' },
        { label: 'My added identifier', type: 'manual' },
      ],
      conditions: ['Perimenopause'],
      distinctiveFacts: ['Short breaks'],
      storySummary: 'The article explains brain fog during perimenopause.',
      userAddedConcepts: ['My added identifier'],
    },
  }).watch;

  assert.deepEqual(watch.storyFingerprint, [
    { label: 'Renamed brain-fog topic', type: 'manual' },
    { label: 'My added identifier', type: 'manual' },
  ]);
  assert.deepEqual(watch.keywords, ['Renamed brain-fog topic', 'My added identifier']);
  assert.deepEqual(watch.selectedKeywords, watch.keywords);
  assert.equal(watch.storyFingerprint.some(({ label }) => label === 'Deliberately deselected'), false);
  assert.equal(watch.storyProfile.concepts.some(({ label }) => label === 'Perimenopause'), false);
  assert.deepEqual(watch.storyProfile.distinctiveFacts, ['Short breaks']);
});

test('marks an older article Watch without a source as setup-required, not action-required', () => {
  const watch = migrateWatchModel({
    id: 'legacy',
    inputType: 'url',
    sourceUrl: 'https://example.com/story',
    status: 'watching',
  }).watch;
  assert.equal(watch.monitoringStatus.state, 'setup-required');
  assert.equal(watch.monitoringIssueReason, 'no-compatible-source');
  assert.equal(watch.actionRequired, false);
  assert.equal(watch.requiresAttention, false);
  assert.equal(watch.attentionReason, null);
  assert.equal(watch.status, 'watching');
  assert.deepEqual(getMonitoringHealthPresentation(watch), {
    statusKey: 'setupRequired',
  });
});

test('migrates legacy technical attention without losing monitoring history', () => {
  const snapshot = { itemIds: ['a'], checkedAt: '2026-07-26T10:00:00Z' };
  const candidate = { id: 'b', status: 'candidate', detectedAt: '2026-07-26T11:00:00Z' };
  const watch = migrateWatchModel({
    id: 'technical-attention',
    inputType: 'url',
    sourceUrl: 'https://example.com/story',
    feedUrl: 'https://example.com/feed.xml',
    status: 'attention',
    requiresAttention: true,
    attentionReason: 'source-persistently-unavailable',
    monitoringStatus: { state: 'needs-attention', reason: 'source-persistently-unavailable' },
    monitoringSnapshot: snapshot,
    candidateUpdates: [candidate],
  }).watch;
  assert.equal(watch.status, 'watching');
  assert.equal(watch.actionRequired, false);
  assert.equal(watch.requiresAttention, false);
  assert.equal(watch.monitoringStatus.state, 'unavailable');
  assert.deepEqual(watch.monitoringSnapshot, snapshot);
  assert.deepEqual(watch.candidateUpdates, [candidate]);
});

test('preserves a genuine user action independently from monitoring health', () => {
  const watch = migrateWatchModel({
    id: 'book-flight',
    status: 'attention',
    requiresAttention: true,
    attentionReason: 'booking-window-open',
  }).watch;
  assert.equal(watch.actionRequired, true);
  assert.equal(watch.requiresAttention, true);
  assert.equal(watch.userActionReason, 'booking-window-open');
  assert.equal(watch.status, 'attention');
});

test('migrates an inferred legal Watch with monetary damages away from Price', () => {
  const watch = migrateWatchModel({
    id: 'legal-watch',
    inputType: 'url',
    request: 'https://example.com/legal-story',
    sourceTitle: 'Johnson & Johnson lawsuit alleges billions in damages',
    category: 'price',
    categorySource: 'inferred',
    currentSituationKey: 'watchData.pendingSituations.price',
    storyProfile: {
      storySummary: 'A court is considering allegations against Johnson & Johnson, which denies the claims.',
    },
  }).watch;
  assert.equal(watch.category, 'news');
  assert.equal(watch.categorySource, 'inferred');
  assert.equal(watch.currentSituationKey, 'watchData.pendingSituations.news');
});

test('preserves a manually selected category while normalizing its label', () => {
  const watch = migrateWatchModel({
    id: 'manual-category',
    request: 'Notify me if this lawsuit receives a new ruling involving $2bn.',
    category: 'Prix',
    categorySource: 'manual',
  }).watch;
  assert.equal(watch.category, 'price');
  assert.equal(watch.categorySource, 'manual');
});

test('conservatively preserves a legacy category whose provenance was not recorded', () => {
  const watch = migrateWatchModel({
    id: 'legacy-category',
    request: 'A lawsuit involving monetary damages',
    category: 'travel',
  }).watch;
  assert.equal(watch.category, 'travel');
  assert.equal(watch.categorySource, 'manual');
});

test('category and Story Profile migration is idempotent', () => {
  const initial = {
    id: 'idempotent-legal-watch',
    inputType: 'url',
    createdAt: '2026-07-28T10:00:00.000Z',
    request: 'https://example.com/legal-story',
    sourceTitle: 'Court awards damages in a lawsuit',
    category: 'price',
    categorySource: 'inferred',
    currentSituationKey: 'watchData.pendingSituations.price',
    storyFingerprint: [{ label: 'Legal proceedings', type: 'event' }],
    storyProfile: {
      storySummary: 'A court awarded damages in a lawsuit. The defendant denies the allegations, v.',
    },
  };
  const first = migrateWatchModel(initial).watch;
  const second = migrateWatchModel(first);
  assert.deepEqual(second.watch, first);
  assert.equal(second.migrated, false);
});
