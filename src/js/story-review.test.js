import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMonitoringScope,
  createStoryOverview,
  enrichStoryFingerprint,
  extractLocalStoryConcepts,
  isDistinctMonitoringScope,
} from './story-review.js';

const politicalEvidence = {
  title: "Abdul El-Sayed's victory sends tremors through Democratic Party",
  description: 'The left-wing candidate won the Democratic nomination in Michigan and will contest the November election.',
  articleText: "Abdul El-Sayed won the Democratic nomination in Michigan. His victory has consequences for the Democratic Party ahead of the November election.",
  siteName: 'BBC News',
};

test('reuses a useful AI overview instead of repeating the article title', () => {
  const title = 'Russian strike kills 21 as Ukraine calls for interceptors';
  const aiSummary = 'Russian missile strikes killed at least 21 people in Ukraine. Ukrainian officials renewed calls for additional interceptor systems.';

  assert.equal(createStoryOverview({ storySummary: aiSummary, title }), aiSummary);
  assert.notEqual(createStoryOverview({ storySummary: aiSummary, title }), `${title}.`);
});

test('local overview falls back to source evidence and rejects title-echo boilerplate', () => {
  const title = 'Russian strike kills 21 as Ukraine calls for interceptors';
  const description = 'Missile strikes caused casualties across Ukraine, while officials requested additional air-defence support.';
  const overview = createStoryOverview({
    storySummary: `Reporting focuses on “${title}”.`,
    title,
    description,
  });

  assert.equal(overview, description);
  assert.doesNotMatch(overview, /Reporting focuses on/);
});

test('title-only metadata produces a cautious overview and monitoring scope', () => {
  const title = 'BBC title-only report about a developing event';
  const overview = createStoryOverview({ title });
  const scope = createMonitoringScope({ title, profile: {}, storyFingerprint: [] });

  assert.match(overview, /available metadata/i);
  assert.match(overview, /BBC title-only report/);
  assert.match(scope, /BBC title-only report/);
  assert.match(scope, /future reporting/i);
  assert.notEqual(scope, overview);
});

test('reuses AI monitoring scope and generates a category-aware local fallback', () => {
  const aiScope = 'Monitor casualty updates, official announcements and changes to air-defence support for Ukraine.';
  assert.equal(createMonitoringScope({ watchingFor: aiScope }), aiScope);

  const localScope = createMonitoringScope({
    profile: {
      organizations: ['Example Space Agency'],
      eventTypes: ['Lunar mission'],
      productsServices: ['Odyssey lander'],
    },
    storyFingerprint: [
      { label: 'Example Space Agency', type: 'organization' },
      { label: 'Odyssey lander', type: 'product_service' },
    ],
  });
  assert.match(localScope, /Example Space Agency/);
  assert.match(localScope, /major developments/);
  assert.match(localScope, /official announcements/);
  assert.match(localScope, /releases and material updates/);
  assert.equal(isDistinctMonitoringScope(localScope, 'The mission launched successfully.'), true);
});

test('weak AI-only location identifiers are enriched from the existing AI profile', () => {
  const identifiers = enrichStoryFingerprint([
    { label: 'Kyiv', type: 'location' },
  ], {
    locations: ['Kyiv', 'Ukraine', 'Russia'],
    productsServices: ['Interceptor systems'],
    eventTypes: ['Russian strike', 'Missile attack', 'Air defence operations'],
  }, { analysisProvider: 'openai' });

  assert.ok(identifiers.length > 1);
  assert.ok(identifiers.length <= 6);
  for (const label of ['Kyiv', 'Ukraine', 'Russia', 'Interceptor systems']) {
    assert.ok(identifiers.some((identifier) => identifier.label === label));
  }
  assert.ok(identifiers.some(({ label }) => label === 'Russian strike'));
  assert.equal(new Set(identifiers.map(({ label }) => label.toLocaleLowerCase())).size, identifiers.length);
});

test('strong AI identifiers and deterministic fallback identifiers remain unchanged', () => {
  const strong = [
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ];
  assert.deepEqual(enrichStoryFingerprint(strong, {
    locations: ['London'],
  }, { analysisProvider: 'openai' }), strong);
  assert.deepEqual(enrichStoryFingerprint(strong, {
    organizations: ['Unrelated organization'],
  }, { analysisProvider: 'deterministic' }), strong);
});

test('local political evidence yields several typed identifiers without inventing unsupported facts', () => {
  const identifiers = extractLocalStoryConcepts(politicalEvidence);

  assert.deepEqual(identifiers, [
    { label: 'Abdul El-Sayed', type: 'person' },
    { label: 'Democratic Party', type: 'organization' },
    { label: 'November election', type: 'event' },
    { label: 'Left-wing candidate', type: 'phenomenon' },
  ]);
  assert.equal(identifiers.some(({ label }) => /president|White House|Congress/i.test(label)), false);
});

test('a deterministic one-location set is enriched, deduplicated and capped from local evidence', () => {
  const identifiers = enrichStoryFingerprint([
    { label: 'Michigan', type: 'location' },
    { label: 'MICHIGAN', type: 'location' },
  ], {
    locations: ['Michigan'],
  }, {
    analysisProvider: 'deterministic',
    evidence: {
      ...politicalEvidence,
      articleText: `${politicalEvidence.articleText} Democratic Party Democratic Party November election.`,
    },
    limit: 5,
  });

  assert.deepEqual(identifiers, [
    { label: 'Abdul El-Sayed', type: 'person' },
    { label: 'Democratic Party', type: 'organization' },
    { label: 'November election', type: 'event' },
    { label: 'Michigan', type: 'location' },
    { label: 'Left-wing candidate', type: 'phenomenon' },
  ]);
  assert.equal(new Set(identifiers.map(({ label }) => label.toLocaleLowerCase())).size, 5);
});

test('strong AI identifiers are not replaced or padded by local evidence', () => {
  const strong = [
    { label: 'Abdul El-Sayed', type: 'person' },
    { label: 'Democratic Party', type: 'organization' },
    { label: 'November election', type: 'event' },
  ];
  assert.deepEqual(enrichStoryFingerprint(strong, {
    locations: ['Michigan'],
  }, {
    analysisProvider: 'openai',
    evidence: politicalEvidence,
  }), strong);
});

test('local monitoring scope represents the political story instead of only its location', () => {
  const identifiers = enrichStoryFingerprint([
    { label: 'Michigan', type: 'location' },
  ], { locations: ['Michigan'] }, {
    analysisProvider: 'deterministic',
    evidence: politicalEvidence,
    limit: 5,
  });
  const scope = createMonitoringScope({
    profile: {
      primaryPeople: ['Abdul El-Sayed'],
      organizations: ['Democratic Party'],
      locations: ['Michigan'],
      eventTypes: ['November election'],
    },
    storyFingerprint: identifiers,
    title: politicalEvidence.title,
    overview: politicalEvidence.description,
    articleText: politicalEvidence.articleText,
  });

  assert.match(scope, /Abdul El-Sayed/);
  assert.match(scope, /Democratic Party/);
  assert.match(scope, /November election/);
  assert.match(scope, /election and campaign developments/);
  assert.notEqual(scope, 'This Watch will follow future reporting directly related to Michigan, including major developments and significant follow-up reporting.');
});

test('local monitoring scope adapts to a non-political sports story', () => {
  const scope = createMonitoringScope({
    profile: {
      organizations: ['Harbour Athletics'],
      eventTypes: ['National championship final'],
    },
    storyFingerprint: [
      { label: 'Harbour Athletics', type: 'organization' },
      { label: 'National championship final', type: 'event' },
    ],
    title: 'Harbour Athletics reaches national championship final',
    overview: 'The team qualified for the national championship final after a close semi-final.',
  });

  assert.match(scope, /Harbour Athletics/);
  assert.match(scope, /results and competition developments/);
  assert.doesNotMatch(scope, /election|campaign/i);
});
