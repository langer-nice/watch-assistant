import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceDerivedFallback } from './url-analysis.js';

const guardianUrl = 'https://www.theguardian.com/lifeandstyle/2026/jul/24/experience-i-hunt-missing-hikers-remote-mountains-taiwan';

test('builds a source-supported fallback fingerprint for the Guardian acceptance URL', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: 'en' } };
  try {
    const result = createSourceDerivedFallback({
      title: 'Experience: I hunt for missing hikers in remote mountains',
      description: 'A first-person account of search and rescue in Taiwan.',
      author: 'https://www.theguardian.com/profile/chi-hui-lin',
      articleText: [
        'Petr Novotny searches for missing hikers in Taiwan.',
        'Petr Novotny knows remote regions across Taiwan.',
        'Search and rescue operations continue in Taiwan.',
      ].join(' '),
    }, guardianUrl);

    assert.deepEqual(result.storyFingerprint, [
      { label: 'Petr Novotny', type: 'person' },
      { label: 'Taiwan', type: 'location' },
      { label: 'Missing hikers', type: 'event' },
      { label: 'Search operation', type: 'event' },
      { label: 'Remote mountains', type: 'supporting' },
    ]);
    assert.deepEqual(result.keywords, result.storyFingerprint.map(({ label }) => label));
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
