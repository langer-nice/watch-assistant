import assert from 'node:assert/strict';
import test from 'node:test';
import { rankStoryIdentifiers } from './story-identifier-ranking.js';
import { normalizeAutomaticStoryFingerprint } from './monitoring-concepts.js';
import { matchFeedItemToStory } from './watch-monitoring.js';

const labels = (concepts) => concepts.map(({ label }) => label);

test('strong Ivan Toney AI events pass semantic evidence validation without deterministic padding', () => {
  const rawConcepts = [
    { label: 'Ivan Toney assault charge', type: 'event' },
    { label: 'Ivan Toney', type: 'person' },
    { label: 'Soho nightclub assault case', type: 'event' },
  ];
  const normalized = normalizeAutomaticStoryFingerprint(rawConcepts, 6);
  const concepts = rankStoryIdentifiers({
    selected: normalized,
    evidence: {
      title: 'Footballer Ivan Toney charged with assault at Soho nightclub',
      description: 'Ivan Toney was charged with assault causing actual bodily harm after an incident at a Soho nightclub.',
      articleText: 'Ivan Toney has been charged with assault after an incident at a Soho nightclub. He will appear in court. He previously played at the World Cup and in England’s final.',
    },
    limit: 6,
    includeEvidenceCandidates: false,
  });

  assert.deepEqual(normalized, rawConcepts);
  assert.deepEqual(new Set(labels(concepts)), new Set(labels(rawConcepts)));
  assert.equal(concepts.some(({ label }) => label === 'World Cup'), false);
  assert.equal(concepts.some(({ label }) => label === 'England’s final'), false);
});

test('role-prefixed person aliases collapse into the canonical selected person', () => {
  const concepts = rankStoryIdentifiers({
    selected: [
      { label: 'Footballer Ivan Toney', type: 'person' },
      { label: 'Ivan Toney', type: 'person' },
    ],
    evidence: {
      title: 'Footballer Ivan Toney charged with assault',
      articleText: 'Ivan Toney has been charged with assault.',
    },
    includeEvidenceCandidates: false,
  });

  assert.deepEqual(concepts, [{ label: 'Ivan Toney', type: 'person' }]);
});

test('Murkowski and Blanche semantic relationship and nomination concepts remain supported', () => {
  const selected = [
    {
      label: 'Lisa Murkowski’s opposition to Todd Blanche’s attorney general nomination',
      type: 'relationship',
    },
    { label: 'Todd Blanche’s nomination for US attorney general', type: 'event' },
    { label: 'Politicisation of the US Justice Department', type: 'phenomenon' },
  ];
  const concepts = rankStoryIdentifiers({
    selected,
    evidence: {
      title: 'Lisa Murkowski opposes Todd Blanche nomination for US attorney general',
      description: 'Murkowski cited concerns about politicisation of the US Justice Department.',
      articleText: 'Todd Blanche was nominated for US attorney general. Lisa Murkowski opposed the nomination and warned against politicisation of the US Justice Department.',
    },
    includeEvidenceCandidates: false,
    limit: 5,
  });

  assert.deepEqual(new Set(labels(concepts)), new Set(labels(selected)));
});

test('BBC Cambridge plagiarism story rejects possessive fragments and ranks defining concepts', () => {
  const concepts = rankStoryIdentifiers({
    selected: [
      { label: "BBC's Today", type: 'person' },
      { label: "Arday's", type: 'location' },
      { label: 'On Wednesday', type: 'person' },
      { label: 'This Morning', type: 'person' },
      { label: 'Breaking News', type: 'person' },
      { label: 'BBC Today', type: 'person' },
      { label: 'Professor Jason Arday', type: 'person' },
    ],
    profileCandidates: [
      { label: 'Jason Arday', type: 'person' },
      { label: 'University of Cambridge', type: 'organization' },
      { label: 'Cambridge University', type: 'organization' },
      { label: 'Good Law Project', type: 'organization' },
    ],
    evidence: {
      title: 'Cambridge professor at centre of plagiarism row resigns',
      articleSubheading: 'Professor Jason Arday has left his post after an investigation.',
      description: 'Jason Arday resigned from the University of Cambridge following plagiarism allegations raised by the Good Law Project.',
      articleText: [
        'Professor Jason Arday has resigned from the University of Cambridge.',
        'The resignation follows a plagiarism investigation prompted by the Good Law Project.',
        'The university said it had reviewed the allegations.',
        "On Wednesday, a producer from BBC's Today programme discussed the report.",
        'This Morning and Breaking News also covered the announcement.',
      ].join(' '),
    },
  });

  assert.deepEqual(labels(concepts), [
    'Plagiarism investigation', 'Jason Arday resignation', 'Jason Arday',
    'University of Cambridge', 'Good Law Project',
  ]);
  for (const rejected of [
    "BBC's Today", "Arday's", 'On Wednesday', 'This Morning', 'Breaking News', 'BBC Today',
  ]) {
    assert.equal(concepts.some(({ label }) => label === rejected), false);
  }
  assert.equal(concepts.filter(({ label }) => label === 'Jason Arday').length, 1);
  assert.equal(concepts.filter(({ label }) => (
    /^(?:University of Cambridge|Cambridge University)$/u.test(label)
  )).length, 1);
  assert.equal(matchFeedItemToStory({
    title: 'Jason Arday resignation followed Cambridge plagiarism investigation',
    excerpt: 'The University of Cambridge and Good Law Project commented on the case.',
  }, { concepts }).matched, true);
  assert.equal(matchFeedItemToStory({
    title: "BBC's Today programme announces a new presenter",
    excerpt: 'The broadcaster published its autumn radio schedule.',
  }, { concepts }).matched, false);
});

test('BBC military story preserves its defining campaign and rejects incidental entities', () => {
  const concepts = rankStoryIdentifiers({
    selected: [
      { label: 'Black Sea', type: 'person' },
      { label: 'Yaroslav, Russia', type: 'location' },
    ],
    profileCandidates: [
      { label: 'Odesa', type: 'location' },
      { label: 'Ukraine', type: 'event' },
      { label: 'Russia', type: 'organization' },
    ],
    evidence: {
      title: "In Odesa, no-one is safe from Russia's new Black Sea strike campaign",
      articleSubheading: 'Russian attacks are increasingly targeting Ukrainian ports.',
      description: 'Russian strikes on Odesa are targeting civilian infrastructure as the campaign against Ukraine expands.',
      articleText: [
        'People in Odesa face repeated Russian strikes.',
        'Ukraine says Russia is expanding its Black Sea strike campaign against ports and civilian infrastructure.',
        'The port city remains under pressure.',
        'A witness in Yaroslav, Russia described one damaged building.',
      ].join(' '),
    },
    limit: 6,
  });

  assert.deepEqual(labels(concepts), [
    'Black Sea strike campaign', 'Russian strikes', 'Civilian infrastructure',
    'Odesa', 'Russia', 'Ukraine',
  ]);
  assert.deepEqual(concepts.find(({ label }) => label === 'Black Sea strike campaign'), {
    label: 'Black Sea strike campaign', type: 'event',
  });
  assert.deepEqual(concepts.find(({ label }) => label === 'Ukraine'), {
    label: 'Ukraine', type: 'location',
  });
  assert.equal(concepts.some(({ label, type }) => label === 'Black Sea' && type === 'person'), false);
  assert.equal(concepts.some(({ label }) => /Yaroslav/u.test(label)), false);
});

test('CNN political story keeps compound institutions and defining political events', () => {
  const concepts = rankStoryIdentifiers({
    selected: [
      { label: 'US Supreme Court', type: 'person' },
      { label: 'July', type: 'location' },
      { label: 'Voting rights case', type: 'event' },
    ],
    profileCandidates: [{ label: 'Democratic Party', type: 'organization' }],
    evidence: {
      title: 'US Supreme Court takes up voting rights case before Senate election',
      description: 'The Democratic Party says the court case could shape the Senate election.',
      articleText: 'The US Supreme Court will hear the voting rights case. The Democratic Party filed a brief. Reporter July Smith contributed.',
    },
  });

  assert.deepEqual(labels(concepts), [
    'Senate election', 'Voting rights case', 'US Supreme Court', 'Democratic Party',
  ]);
  assert.equal(concepts.find(({ label }) => label === 'US Supreme Court').type, 'organization');
  assert.equal(concepts.some(({ label }) => label === 'July'), false);
});

test('CNN sports story keeps the competition and finalists instead of dates or fragments', () => {
  const concepts = rankStoryIdentifiers({
    selected: [
      { label: 'World Cup', type: 'person' },
      { label: 'July', type: 'location' },
    ],
    profileCandidates: [
      { label: 'Spain', type: 'location' },
      { label: 'Brazil', type: 'location' },
    ],
    evidence: {
      title: 'Spain beat Brazil to win 2030 World Cup Final',
      description: 'Spain defeated Brazil in the 2030 World Cup Final after extra time.',
      articleText: 'Spain won the 2030 World Cup Final against Brazil. The victory secured the championship after a tense final.',
    },
  });

  assert.deepEqual(labels(concepts), ['2030 World Cup Final', 'Spain', 'Brazil']);
  assert.equal(concepts.some(({ label }) => label === 'July'), false);
});

test('Reuters business story prioritises companies and compound transaction concepts', () => {
  const concepts = rankStoryIdentifiers({
    selected: [
      { label: 'Northstar', type: 'organization' },
      { label: 'Helios', type: 'organization' },
      { label: 'Takeover', type: 'event' },
    ],
    evidence: {
      title: 'Northstar agrees $20 billion Helios takeover',
      description: 'The companies announced a cross-border takeover after both boards approved the deal.',
      articleText: 'Northstar will acquire Helios in the cross-border takeover. The merger faces an antitrust investigation. Reporting by Jane Smith.',
      author: 'Jane Smith',
    },
  });

  assert.deepEqual(labels(concepts), [
    'Cross-border takeover', 'Antitrust investigation', 'Northstar', 'Helios',
  ]);
  assert.equal(concepts.some(({ label }) => label === 'Jane Smith'), false);
});

test('Le Monde story preserves French concepts, accents and correct types', () => {
  const concepts = rankStoryIdentifiers({
    selected: [
      { label: 'Vladimir Poutine', type: 'person' },
      { label: 'Russie', type: 'event' },
      { label: 'Juillet', type: 'location' },
    ],
    profileCandidates: [{ label: 'Prix de l’essence en Russie', type: 'phenomenon' }],
    evidence: {
      title: 'En Russie, là où Poutine passe, le prix de l’essence baisse',
      description: 'Une enquête sur les déplacements de Vladimir Poutine et les prix à la pompe.',
      articleText: 'À Iaroslavl, le prix de l’essence a baissé avant la visite de Vladimir Poutine. La tendance contraste avec le reste de la Russie. Par Marie Dupont.',
      author: 'Marie Dupont',
    },
  });

  assert.deepEqual(labels(concepts), [
    'Prix de l’essence en Russie', 'Russie', 'Vladimir Poutine',
  ]);
  assert.equal(concepts.find(({ label }) => label === 'Russie').type, 'location');
  assert.equal(concepts.some(({ label }) => label === 'Juillet' || label === 'Marie Dupont'), false);
});

test('monitoring receives discriminative Story identifiers instead of generic geography', () => {
  const concepts = rankStoryIdentifiers({
    selected: [{ label: 'Black Sea', type: 'person' }],
    profileCandidates: [{ label: 'Odesa', type: 'location' }],
    evidence: {
      title: 'Black Sea strike campaign intensifies in Odesa',
      description: 'Russian strikes continue against civilian infrastructure in Odesa.',
      articleText: 'The Black Sea strike campaign has expanded. Russian strikes damaged civilian infrastructure.',
    },
  });
  const storyProfile = { concepts };
  assert.equal(matchFeedItemToStory({
    title: 'More Russian strikes hit Odesa in Black Sea campaign',
    excerpt: 'Civilian infrastructure was damaged in the latest attacks.',
  }, storyProfile).matched, true);
  assert.equal(matchFeedItemToStory({
    title: 'Black Sea cruises announce summer itineraries',
    excerpt: 'Tour operators published new holiday schedules.',
  }, storyProfile).matched, false);
});
