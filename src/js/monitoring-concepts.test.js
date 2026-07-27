import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMonitoringConcepts,
  normalizeAutomaticStoryFingerprint,
  normalizeMonitoringConcepts,
  normalizeStoryFingerprint,
} from './monitoring-concepts.js';

test('automatic identifiers stay concise, non-redundant, and bounded to five', () => {
  assert.deepEqual(normalizeAutomaticStoryFingerprint([
    { label: 'Brain fog', type: 'symptom' },
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
    { label: 'Officials said this possible explanation remains uncertain. It requires more research.', type: 'supporting' },
    { label: 'US–Saudi civil nuclear agreement', type: 'event' },
    { label: 'Saudi recognition of Israel', type: 'relationship' },
    { label: 'Seattle Center, Seattle, United States', type: 'location' },
    { label: 'Three people killed', type: 'supporting' },
  ]), [
    { label: 'Seattle Center, Seattle, United States', type: 'location' },
    { label: 'US–Saudi civil nuclear agreement', type: 'event' },
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
    { label: 'Saudi recognition of Israel', type: 'relationship' },
  ]);
});

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
      { label: 'Amazon Luna', type: 'product_service' },
      { label: 'Court ruling', type: 'event' },
      { label: 'Taylor', type: 'person' },
      { label: 'Monaco', type: 'location' },
      { label: 'OpenAI', type: 'organization' },
      { label: 'Taylor Swift', type: 'person', aliases: ['Taylor'] },
    ]),
    [
      { label: 'Taylor Swift', type: 'person' },
      { label: 'OpenAI', type: 'organization' },
      { label: 'Amazon Luna', type: 'product_service' },
      { label: 'Monaco', type: 'location' },
      { label: 'Court ruling', type: 'event' },
    ],
  );
});

test('preserves distinct typed concepts when labels overlap', () => {
  assert.deepEqual(normalizeAutomaticStoryFingerprint([
    { label: 'Seattle Center', type: 'location' },
    { label: 'Seattle Center shooting', type: 'event' },
    { label: 'Bite of Seattle', type: 'event' },
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ]), [
    { label: 'Seattle Center', type: 'location' },
    { label: 'Seattle Center shooting', type: 'event' },
    { label: 'Bite of Seattle', type: 'event' },
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ]);
});

test('does not deduplicate by substring or across types but consolidates exact typed duplicates', () => {
  assert.deepEqual(normalizeStoryFingerprint([
    { label: 'Central Park', type: 'location' },
    { label: 'Central Park concert', type: 'event' },
    { label: 'Central Park', type: 'event' },
    { label: 'Central Park', type: 'location' },
  ]), [
    { label: 'Central Park', type: 'location' },
    { label: 'Central Park concert', type: 'event' },
    { label: 'Central Park', type: 'event' },
  ]);
});

test('consolidates only explicit same-type aliases and preserves manual identifiers', () => {
  assert.deepEqual(normalizeStoryFingerprint([
    { label: 'The International Business Machines Corporation', type: 'organization', aliases: ['IBM'] },
    { label: 'IBM', type: 'organization' },
    { label: 'IBM', type: 'product_service' },
    { label: 'Keep IBM reporting', type: 'manual' },
  ]), [
    { label: 'The International Business Machines Corporation', type: 'organization' },
    { label: 'IBM', type: 'product_service' },
    { label: 'Keep IBM reporting', type: 'manual' },
  ]);
});

test('does not remove name particles that resemble stop words from typed people', () => {
  assert.deepEqual(
    normalizeStoryFingerprint([{ label: 'An Rong Xu', type: 'person' }]),
    [{ label: 'An Rong Xu', type: 'person' }],
  );
});

test('rejects weak isolated concepts while retaining coherent topics and named hazards', () => {
  assert.deepEqual(normalizeStoryFingerprint([
    { label: 'Booming', type: 'supporting' },
    { label: 'Health', type: 'supporting' },
    { label: 'Sewage', type: 'supporting' },
    { label: 'Open water swimming', type: 'event' },
    { label: 'Sewage contamination', type: 'condition' },
    { label: 'Leptospirosis', type: 'condition' },
    { label: 'Toxic algae', type: 'condition' },
  ]), [
    { label: 'Open water swimming', type: 'event' },
    { label: 'Sewage contamination', type: 'condition' },
    { label: 'Leptospirosis', type: 'condition' },
    { label: 'Toxic algae', type: 'condition' },
  ]);
});

test('drops legacy automatic facts while preserving explicit manual identifiers', () => {
  assert.deepEqual(normalizeStoryFingerprint([
    { label: 'Company announces plans', type: 'supporting' },
    { label: 'Keep my phrase', type: 'manual' },
  ]), [{ label: 'Keep my phrase', type: 'manual' }]);
  assert.deepEqual(normalizeAutomaticStoryFingerprint([
    { label: 'Keep my phrase', type: 'manual' },
  ]), []);
});

test('rejects generic recommendation labels in English and French without weakening conditions', () => {
  assert.deepEqual(normalizeAutomaticStoryFingerprint([
    { label: 'Lifestyle strategies for improving concentration', type: 'phenomenon' },
    { label: 'Daily routines for reducing brain fog', type: 'event' },
    { label: 'Stratégies pour améliorer la concentration', type: 'phenomenon' },
    { label: 'Conseils pour réduire le brouillard mental', type: 'event' },
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ]), [
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ]);
});
