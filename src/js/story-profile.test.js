import assert from 'node:assert/strict';
import test from 'node:test';
import { createStoryProfile, synchronizeStoryProfile } from './story-profile.js';

test('builds a bounded structured profile, prioritises the central person, and rejects weak concepts', () => {
  const profile = createStoryProfile({
    storyFingerprint: [
      { label: 'Abdul Ballout', type: 'person' },
      { label: 'BBC News', type: 'organization' },
      { label: 'Official says', type: 'supporting' },
      { label: 'German citizen', type: 'supporting' },
      { label: 'Berlin Pride van ramming likely', type: 'event' },
      { label: 'Islamist terror attack carried out', type: 'supporting' },
      { label: 'Deportation proceedings', type: 'event' },
      { label: 'Beirut airport detention', type: 'supporting' },
    ],
    profile: {
      version: 2,
      storySummary: 'Police are searching for Abdul Ballout after an attack in Beirut; his alleged role remains unconfirmed.',
      primaryPeople: ['Abdul Ballout'],
      otherPeople: ['Maya Haddad'],
      peopleRoles: [{ name: 'Maya Haddad', role: 'witness' }],
      locations: ['Beirut'],
      organizations: ['BBC News'],
      distinctiveFacts: ['Allegedly detained at Beirut airport'],
    },
    articleText: 'Abdul Ballout was reportedly detained. He is suspected of an offence, which he denies.',
    sourcePublication: 'BBC News',
    sourceTitle: 'German citizen held in Beirut',
    sourceUrl: 'https://www.bbc.com/news/articles/example',
    extractedAt: '2026-07-26T10:00:00.000Z',
  });
  assert.deepEqual(profile.primaryPeople, ['Abdul Ballout']);
  assert.deepEqual(profile.otherPeople, ['Maya Haddad']);
  assert.deepEqual(profile.peopleRoles, [{ name: 'Maya Haddad', role: 'witness' }]);
  assert.equal(
    profile.storySummary,
    'Police are searching for Abdul Ballout after an attack in Beirut; his alleged role remains unconfirmed.',
  );
  assert.equal(profile.organizations.includes('BBC News'), false);
  assert.equal(profile.concepts.some(({ label }) => label === 'Maya Haddad'), false);
  assert.equal(profile.concepts.some(({ label }) => label === 'Official says'), false);
  assert.equal(profile.concepts.some(({ label }) => label === 'German citizen'), false);
  assert.equal(profile.concepts.some(({ label }) => label === 'Berlin Pride van ramming likely'), false);
  assert.equal(profile.concepts.some(({ label }) => label === 'Islamist terror attack carried out'), false);
  assert.match(profile.uncertaintyPhrases.join(' '), /reportedly|suspected/i);
});

test('preserves user-added concepts while synchronising edited typed concepts', () => {
  const profile = synchronizeStoryProfile({
    storySummary: 'Abdul Ballout is the central person in reporting about a detention in Beirut.',
    peopleRoles: [{ name: 'Abdul Ballout', role: 'subject' }],
    sourceArticle: { publication: 'Example News', title: 'Story', url: 'https://example.com/story' },
  }, [
    { label: 'Abdul Ballout', type: 'person' },
    { label: 'Beirut detention', type: 'event' },
  ], ['Abdul Ballout']);
  assert.deepEqual(profile.primaryPeople, ['Abdul Ballout']);
  assert.deepEqual(profile.eventTypes, ['Beirut detention']);
  assert.deepEqual(profile.userAddedConcepts, ['Abdul Ballout']);
  assert.deepEqual(profile.peopleRoles, [{ name: 'Abdul Ballout', role: 'subject' }]);
  assert.equal(
    profile.storySummary,
    'Abdul Ballout is the central person in reporting about a detention in Beirut.',
  );
});

test('replaces a clipped generated summary with a complete natural fallback', () => {
  const profile = createStoryProfile({
    storyFingerprint: [{ label: 'Berlin Pride van attack', type: 'event' }],
    profile: { storySummary: 'Berlin Pride van ramming likely' },
    sourceTitle: 'Berlin Pride van attack',
  });

  assert.equal(profile.storySummary, 'Reporting focuses on “Berlin Pride van attack”.');
});

test('upgrades version 2 profiles, prefers precise locations, and removes normalized duplicates', () => {
  const profile = createStoryProfile({
    storyFingerprint: [
      { label: 'Berlin', type: 'location' },
      { label: 'Berlin, Germany', type: 'location' },
    ],
    profile: {
      version: 2,
      primaryPeople: ['Amira Diop'],
      locations: ['Berlin', 'Berlin, Germany'],
      distinctiveFacts: ['Official assessment: suspected motive', 'official assessment suspected motive'],
      uncertaintyPhrases: ['Police reported a possible link', 'police reported a possible link.'],
      userAddedConcepts: ['Manual identifier'],
    },
    sourceTitle: 'Investigation update',
  });

  assert.equal(profile.version, 3);
  assert.deepEqual(profile.locations, ['Berlin, Germany']);
  assert.deepEqual(profile.distinctiveFacts, ['Official assessment: suspected motive']);
  assert.deepEqual(profile.uncertaintyPhrases, ['Police reported a possible link']);
  assert.deepEqual(profile.userAddedConcepts, ['Manual identifier']);
});
