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
    detailMessageKey: 'detail.feedUrlMissing',
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
