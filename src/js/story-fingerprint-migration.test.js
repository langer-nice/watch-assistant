import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRegeneratedFingerprintChanges,
  getVisibleConceptLabels,
  shouldRegenerateStoryFingerprint,
} from './story-fingerprint-migration.js';

const currentVersion = 3;
const legacyUrlWatch = {
  inputType: 'url',
  monitoringConceptsVersion: 2,
  keywords: ['Missing hikers', 'Remote mountains'],
};

test('regenerates a legacy URL Watch once but not after persistence', () => {
  assert.equal(shouldRegenerateStoryFingerprint(legacyUrlWatch, currentVersion), true);
  const changes = createRegeneratedFingerprintChanges({
    storyFingerprint: [
      { label: 'Petr Novotny', type: 'person' },
      { label: 'Taiwan', type: 'location' },
      { label: 'Missing hikers', type: 'event' },
    ],
    conceptSourceFields: ['title', 'description', 'articleText', 'author'],
  }, currentVersion);
  const regeneratedWatch = { ...legacyUrlWatch, ...changes };

  assert.equal(shouldRegenerateStoryFingerprint(regeneratedWatch, currentVersion), false);
  assert.deepEqual(getVisibleConceptLabels(regeneratedWatch, currentVersion), changes.keywords);
});

test('never overwrites concepts marked as manually edited', () => {
  assert.equal(shouldRegenerateStoryFingerprint({
    ...legacyUrlWatch,
    monitoringConceptsManuallyEdited: true,
  }, currentVersion, { force: true }), false);
});

test('protects legacy flat concepts that differ from their generated baseline', () => {
  assert.equal(shouldRegenerateStoryFingerprint({
    ...legacyUrlWatch,
    keywords: ['My manually chosen concept'],
  }, currentVersion, {
    legacyGeneratedKeywords: ['Missing hikers', 'Remote mountains'],
  }), false);
});

test('treats a mismatch between typed and flat concepts as a manual legacy edit', () => {
  assert.equal(shouldRegenerateStoryFingerprint({
    ...legacyUrlWatch,
    storyFingerprint: [{ label: 'Missing hikers', type: 'event' }],
    keywords: ['My custom concept'],
  }, currentVersion), false);
});

test('allows an explicit force for a current generated URL Watch', () => {
  const watch = {
    ...legacyUrlWatch,
    monitoringConceptsVersion: currentVersion,
    storyFingerprint: [{ label: 'Missing hikers', type: 'event' }],
    keywords: ['Missing hikers'],
  };
  assert.equal(shouldRegenerateStoryFingerprint(watch, currentVersion), false);
  assert.equal(
    shouldRegenerateStoryFingerprint(watch, currentVersion, { force: true }),
    true,
  );
});
