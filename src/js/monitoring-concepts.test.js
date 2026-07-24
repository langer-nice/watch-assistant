import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMonitoringConcepts,
  normalizeMonitoringConcepts,
  normalizeStoryFingerprint,
} from './monitoring-concepts.js';

test('extracts story phrases without padding URL titles with weak words', () => {
  assert.deepEqual(
    extractMonitoringConcepts(
      "The experience: I hunt for missing hikers in Taiwan's remote mountains",
      8,
    ),
    ['Missing hikers', 'Taiwan', 'Remote mountains'],
  );
});

test('keeps meaningful connected phrases and removes contained concepts', () => {
  assert.deepEqual(
    normalizeMonitoringConcepts([
      'Search and rescue',
      'Missing hikers',
      'Hikers',
      'Remote mountains',
      'Mountains',
      'for',
      'I hunt',
      'Missing hikers',
    ]),
    ['Search and rescue', 'Missing hikers', 'Remote mountains'],
  );
});

test('returns fewer concepts instead of adding generic filler', () => {
  assert.deepEqual(extractMonitoringConcepts('Metallica tickets', 8), ['Metallica tickets']);
});

test('does not retain capitalized stop words from headline title case', () => {
  assert.deepEqual(
    extractMonitoringConcepts('Missing Hikers In Remote Mountains', 8),
    ['Missing Hikers', 'Remote Mountains'],
  );
});

test('orders a Story Fingerprint by identifying strength and preserves complete names', () => {
  assert.deepEqual(
    normalizeStoryFingerprint([
      { label: 'Artificial intelligence', type: 'supporting' },
      { label: 'Court ruling', type: 'event' },
      { label: 'Taylor', type: 'person' },
      { label: 'Monaco', type: 'location' },
      { label: 'OpenAI', type: 'organization' },
      { label: 'Taylor Swift', type: 'person' },
    ]),
    [
      { label: 'Taylor Swift', type: 'person' },
      { label: 'OpenAI', type: 'organization' },
      { label: 'Monaco', type: 'location' },
      { label: 'Court ruling', type: 'event' },
      { label: 'Artificial intelligence', type: 'supporting' },
    ],
  );
});

test('does not remove name particles that resemble stop words from typed people', () => {
  assert.deepEqual(
    normalizeStoryFingerprint([{ label: 'An Rong Xu', type: 'person' }]),
    [{ label: 'An Rong Xu', type: 'person' }],
  );
});
