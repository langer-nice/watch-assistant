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

test('deterministic full-article fallback prioritises an explicitly identified central person', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: 'en' } };
  try {
    const result = createSourceDerivedFallback({
      title: 'What we know so far about the Berlin Pride ramming attack',
      description: 'Police are searching for a suspect after a van attack in Berlin.',
      articleText: [
        'A van was driven into a crowd at Berlin Pride in Berlin, Germany.',
        'The suspect has been named by police as 21-year-old Abdul Ballout.',
        'Police launched a manhunt for Abdul Ballout.',
        'Officials say this was likely an Islamist terror attack.',
        'No motive has been confirmed.',
      ].join(' '),
    }, 'https://www.bbc.co.uk/news/articles/example');
    assert.equal(result.storyFingerprint[0].label, 'Abdul Ballout');
    assert.equal(result.storyFingerprint[0].type, 'person');
    assert.equal(
      result.storyProfile.storySummary,
      'Police are searching for Abdul Ballout in connection with the Berlin Pride van attack in Berlin, Germany; officials described the attack as a likely Islamist terror attack.',
    );
    assert.deepEqual(result.storyProfile.eventTypes, ['Berlin Pride van attack']);
    assert.deepEqual(result.storyProfile.locations, ['Berlin, Germany']);
    assert.deepEqual(
      result.storyProfile.distinctiveFacts,
      ['Official assessment: likely Islamist terror attack'],
    );
    assert.deepEqual(
      result.storyProfile.uncertaintyPhrases,
      ['Official assessment: likely Islamist terror attack'],
    );
    assert.equal(result.storyProfile.sourceArticle.publication, 'BBC News');
    assert.equal(
      result.storyProfile.concepts.some(({ label }) => label === 'BBC News'),
      false,
    );
    assert.equal(
      result.storyProfile.concepts.some(({ label }) => label === 'Berlin Pride van ramming likely'),
      false,
    );
    assert.equal(
      result.storyProfile.concepts.some(({ label }) => label === 'Islamist terror attack carried out'),
      false,
    );
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('live-page fallback ranks the subject over witnesses and reacting officials', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: 'en' } };
  try {
    const result = createSourceDerivedFallback({
      title: 'Linden Pride attack suspect shot and killed during police operation - live updates',
      description: 'Police say suspect Omar al Haddad was shot and killed after he rushed at officers in Linden.',
      siteName: 'Example News',
      articleText: [
        'A journalist who witnessed the aftermath of the Pride event described the scene. Mira Costa, who works as a reporter, shared what she saw.',
        'Police earlier launched a manhunt for Omar al Haddad after the attack.',
        "Linden's mayor says apprehending the suspect was a success. Mayor Elena Novak thanked officers.",
        'Police named Omar al Haddad as the suspect after a rented vehicle was rammed into a crowd at Linden Pride in Linden, France.',
        'Officials described the incident as a suspected Islamist terror attack.',
        'Prosecutors say Omar al Haddad allegedly sought to join the Crescent State group. Omar al Haddad had shared Crescent State propaganda.',
        'A victim was robbed at Innsbrucker Platz before the Linden Fire Department witnessed the response.',
      ].join('\n\n'),
    }, 'https://example.com/live/story');

    assert.deepEqual(result.storyProfile.primaryPeople, ['Omar al Haddad']);
    assert.deepEqual(result.storyProfile.otherPeople, ['Mira Costa', 'Elena Novak']);
    assert.deepEqual(result.storyProfile.peopleRoles, [
      { name: 'Omar al Haddad', role: 'suspect' },
      { name: 'Mira Costa', role: 'journalist and witness' },
      { name: 'Elena Novak', role: 'mayor' },
    ]);
    assert.deepEqual(result.storyProfile.locations, ['Linden, France']);
    assert.deepEqual(result.storyProfile.eventTypes, ['Linden Pride vehicle attack']);
    assert.deepEqual(result.storyProfile.organizations, ['Crescent State']);
    assert.deepEqual(result.storyProfile.aliases, []);
    assert.deepEqual(result.storyProfile.uncertaintyPhrases, [
      'Official assessment: suspected Islamist terror attack',
      'Prosecutors alleged Omar al Haddad sought to join Crescent State',
    ]);
    assert.equal(
      result.storyProfile.storySummary,
      'Police say Omar al Haddad, identified as the suspect in the Linden Pride vehicle attack in Linden, France, was shot and killed during a police operation; officials described the attack as a suspected Islamist terror attack.',
    );
    assert.doesNotMatch(result.storyProfile.storySummary, /manhunt|live updates/i);
    assert.deepEqual(result.storyProfile.concepts, [
      { label: 'Omar al Haddad', type: 'person' },
      { label: 'Crescent State', type: 'organization' },
      { label: 'Linden, France', type: 'location' },
      { label: 'Linden Pride vehicle attack', type: 'event' },
      { label: 'Suspected Islamist attack', type: 'supporting' },
    ]);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('person cleanup preserves legitimate particles and does not enrich unsupported countries', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: 'en' } };
  try {
    const result = createSourceDerivedFallback({
      title: 'Ludwig van Beethoven is celebrated in Bonn',
      description: 'A new exhibition about Ludwig van Beethoven has opened in Bonn.',
      articleText: 'Curators say Ludwig van Beethoven is the subject of the exhibition in Bonn.',
    }, 'https://example.com/culture/story');
    assert.deepEqual(result.storyProfile.primaryPeople, ['Ludwig van Beethoven']);
    assert.deepEqual(result.storyProfile.locations, ['Bonn']);
    assert.equal(result.storyProfile.concepts.some(({ label }) => /\bis$/i.test(label)), false);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
