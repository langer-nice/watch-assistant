import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStoryProfile,
  getStoryProfileIdentifiers,
  synchronizeStoryProfile,
} from './story-profile.js';

test('keeps monitoring identifiers separate from supporting details and uncertainty', () => {
  const profile = createStoryProfile({
    storyFingerprint: [
      { label: 'Perimenopause', type: 'condition' },
      { label: 'Brain fog', type: 'symptom' },
    ],
    profile: {
      primaryPeople: [],
      otherPeople: ['Dr. Tharaka'],
      organizations: ['NHS'],
      eventTypes: ['Brain fog during perimenopause'],
      distinctiveFacts: ['Short breaks', 'Calendars and reminders'],
      uncertaintyPhrases: ['The evidence is still developing and may vary between people.'],
      storySummary: 'The article explains brain fog during perimenopause and practical ways to manage it.',
    },
  });

  assert.deepEqual(getStoryProfileIdentifiers(profile), [
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ]);
  assert.deepEqual(profile.distinctiveFacts, ['Short breaks', 'Calendars and reminders']);
  assert.equal(profile.uncertaintyPhrases.length, 1);
  assert.equal(profile.concepts.some(({ label }) => label === 'Dr. Tharaka'), false);
  assert.equal(profile.concepts.some(({ label }) => label === 'NHS'), false);
});

test('reference article profiles retain only their selected monitoring identifiers', () => {
  const cases = [
    {
      name: 'Berlin Pride vehicle attack',
      fingerprint: [
        { label: 'Abdul Ballout', type: 'person' },
        { label: 'Berlin, Germany', type: 'location' },
        { label: 'Berlin Pride vehicle attack', type: 'event' },
      ],
    },
    {
      name: 'Open-water swimming health risks',
      fingerprint: [
        { label: 'Sewage contamination', type: 'condition' },
        { label: 'Leptospirosis', type: 'condition' },
        { label: 'Toxic algae', type: 'condition' },
        { label: 'Open water swimming', type: 'phenomenon' },
      ],
    },
    {
      name: 'Bite of Seattle festival shooting',
      fingerprint: [
        { label: 'Seattle Police Department', type: 'organization' },
        { label: 'Seattle Center, Seattle, United States', type: 'location' },
        { label: 'Bite of Seattle festival shooting', type: 'event' },
        { label: 'Three people killed', type: 'supporting' },
      ],
    },
    {
      name: 'Brain fog during perimenopause',
      fingerprint: [
        { label: 'Perimenopause', type: 'condition' },
        { label: 'Brain fog', type: 'symptom' },
      ],
    },
    {
      name: 'Medical tourism in South Korea',
      fingerprint: [
        { label: 'South Korea', type: 'location' },
        { label: 'Medical tourism', type: 'phenomenon' },
      ],
    },
    {
      name: 'Birdwatching among young people',
      fingerprint: [
        { label: 'San Francisco', type: 'location' },
        { label: 'Birdwatching among young people', type: 'phenomenon' },
      ],
    },
    {
      name: 'US–Saudi civil nuclear agreement',
      fingerprint: [
        { label: 'United States', type: 'location' },
        { label: 'Saudi Arabia', type: 'location' },
        { label: 'US–Saudi civil nuclear agreement', type: 'event' },
        { label: 'Saudi recognition of Israel', type: 'relationship' },
      ],
    },
  ];

  cases.forEach(({ name, fingerprint }) => {
    const profile = createStoryProfile({
      storyFingerprint: fingerprint,
      profile: {
        primaryPeople: [],
        distinctiveFacts: ['Background explanation that is not selected'],
        uncertaintyPhrases: ['Officials said the outcome remains uncertain.'],
      },
    });
    assert.deepEqual(getStoryProfileIdentifiers(profile), fingerprint, name);
    assert.ok(profile.concepts.length >= 2 && profile.concepts.length <= 5, name);
  });
});

test('profile context cannot restore an identifier deliberately removed by the user', () => {
  const profile = createStoryProfile({
    storyFingerprint: [{ label: 'Brain fog', type: 'symptom' }],
    profile: {
      eventTypes: ['Brain fog during perimenopause'],
      organizations: ['NHS'],
      distinctiveFacts: ['Short breaks'],
    },
  });
  assert.deepEqual(getStoryProfileIdentifiers(profile), [
    { label: 'Brain fog', type: 'symptom' },
  ]);
});

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

  assert.equal(profile.version, 5);
  assert.deepEqual(profile.locations, ['Berlin, Germany']);
  assert.deepEqual(profile.distinctiveFacts, ['Official assessment: suspected motive']);
  assert.deepEqual(profile.uncertaintyPhrases, ['Police reported a possible link']);
  assert.deepEqual(profile.userAddedConcepts, ['Manual identifier']);
});

test('an explicit empty primary-person list is not repopulated from a typed concept', () => {
  const profile = createStoryProfile({
    storyFingerprint: [
      { label: 'Quoted Expert', type: 'person' },
      { label: 'Water safety review', type: 'event' },
    ],
    profile: {
      version: 3,
      primaryPeople: [],
      otherPeople: [],
      storySummary: 'The article reviews health evidence associated with recreational water use.',
    },
  });

  assert.equal(profile.version, 5);
  assert.deepEqual(profile.primaryPeople, []);
  assert.deepEqual(profile.otherPeople, []);
});

test('does not preserve an unsupported city-country association when source text separates the places', () => {
  const profile = createStoryProfile({
    storyFingerprint: [{ label: 'Sheffield, Switzerland', type: 'location' }],
    profile: {
      primaryPeople: [],
      locations: ['Sheffield, Switzerland'],
    },
    articleText: 'Swimmers gathered near Sheffield. A separate championship was held in Switzerland.',
  });

  assert.deepEqual(profile.locations, ['Sheffield', 'Switzerland']);
  assert.equal(profile.concepts.some(({ label }) => label === 'Sheffield, Switzerland'), false);
});
