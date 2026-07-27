import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseUrl, createSourceDerivedFallback } from './url-analysis.js';

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

test('topic-led article fallback excludes credits, permits no primary person, and keeps specific risks', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: 'en' } };
  try {
    const result = createSourceDerivedFallback({
      title: 'Open water swimming is booming – but what are the health risks?',
      description: 'More swimmers are taking to lakes and rivers, while doctors warn about illness from contaminated water.',
      author: 'Maya Reporter',
      siteName: 'Example News',
      articleText: [
        'Image source, Getty Images',
        'Image caption, Swimmers enter a river near Sheffield for an organised event.',
        'Photograph: Clara Morgan',
        'Open water swimming has grown rapidly in popularity as more people use lakes and rivers.',
        'Dr Elise Martin said beginners should understand local conditions before entering the water.',
        'Contaminated water can expose swimmers to sewage contamination, leptospirosis and toxic algae.',
        'A separate championship was held in Switzerland last year.',
        'By Maya Reporter, Health correspondent',
        'Related stories',
      ].join('\n\n'),
    }, 'https://example.com/features/swimming-risks');

    assert.deepEqual(result.storyProfile.primaryPeople, []);
    assert.deepEqual(result.storyProfile.otherPeople, []);
    assert.deepEqual(result.storyProfile.locations, ['Sheffield']);
    assert.deepEqual(result.storyProfile.eventTypes, ['Open water swimming']);
    assert.deepEqual(result.storyProfile.distinctiveFacts, [
      'Sewage contamination',
      'Leptospirosis',
      'Toxic algae',
    ]);
    assert.equal(
      result.storyProfile.storySummary,
      'Open water swimming is growing in popularity, while the article reports health risks from contaminated water, including sewage contamination, leptospirosis, and toxic algae.',
    );
    assert.deepEqual(result.storyProfile.concepts, [
      { label: 'Sheffield', type: 'location' },
      { label: 'Open water swimming', type: 'event' },
      { label: 'Sewage contamination', type: 'supporting' },
      { label: 'Leptospirosis', type: 'supporting' },
      { label: 'Toxic algae', type: 'supporting' },
    ]);
    assert.doesNotMatch(
      JSON.stringify(result.storyProfile),
      /Getty Images|Clara Morgan|Maya Reporter|Elise Martin|Booming|"Health"|"Sewage"|Sheffield, Switzerland/,
    );
    assert.notEqual(result.storyProfile.storySummary, `${result.watchTitle}.`);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('an author is eligible only when the article evidence independently makes them central', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: 'en' } };
  try {
    const result = createSourceDerivedFallback({
      title: 'Mara Okafor is leading the coastal rescue operation',
      description: 'Mara Okafor is coordinating teams after severe flooding.',
      author: 'Mara Okafor',
      articleText: [
        'By Mara Okafor',
        'Mara Okafor leads the rescue operation and briefs emergency teams.',
        'Mara Okafor has coordinated work across two coastal districts.',
      ].join('\n\n'),
    }, 'https://example.com/coast/rescue');

    assert.deepEqual(result.storyProfile.primaryPeople, ['Mara Okafor']);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('successful perimenopause AI analysis survives client normalization without fallback fragments', async () => {
  const originalFetch = globalThis.fetch;
  const recommendations = [
    'Regular physical activity',
    'Consistent sleep routine',
    'Balanced diet',
    'Stress-management exercises',
  ];
  const summary = 'The article explains why brain fog can occur during perimenopause and presents four practical measures that may help improve memory and concentration.';
  const articleText = 'Brain fog can affect memory and concentration during perimenopause. The article recommends regular physical activity, a consistent sleep routine, a balanced diet, and stress-management exercises.';
  globalThis.fetch = async (path) => {
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Brain fog and four easy ways to help fix it',
          description: 'Why memory and concentration can change during perimenopause.',
          articleText,
          siteName: 'BBC News',
          sourceUrl: 'https://www.bbc.com/news/articles/perimenopause-example',
          conceptSourceFields: ['title', 'description', 'articleText'],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        watchTitle: 'Brain fog during perimenopause',
        watchingFor: 'Monitor evidence and advice about brain fog during perimenopause.',
        description: 'Tracks evidence and practical advice about brain fog during perimenopause.',
        storyFingerprint: [
          { label: 'Perimenopause', type: 'condition' },
          { label: 'Brain fog', type: 'symptom' },
        ],
        keywords: ['Perimenopause', 'Brain fog'],
        storyProfile: {
          primaryPeople: [], otherPeople: [], peopleRoles: [], locations: [], organizations: [],
          eventTypes: ['Brain fog during perimenopause'],
          distinctiveFacts: recommendations,
          aliases: [], uncertaintyPhrases: [], storySummary: summary,
        },
        analysisProvider: 'openai',
        analysisStatus: 'success',
        analysisModel: 'gpt-5.6-luna',
        fallbackReasonCode: null,
        analyzedAt: '2026-07-27T12:00:00.000Z',
        analysisDiagnosticId: 'diagnostic-perimenopause',
      }),
    };
  };
  try {
    const result = await analyseUrl('https://www.bbc.com/news/articles/perimenopause-example');
    assert.equal(result.analysisProvider, 'openai');
    assert.equal(result.analysisStatus, 'success');
    assert.equal(result.analysisModel, 'gpt-5.6-luna');
    assert.equal(result.summary, summary);
    assert.deepEqual(result.storyProfile.primaryPeople, []);
    assert.deepEqual(result.storyProfile.distinctiveFacts, recommendations);
    assert.deepEqual(result.storyProfile.concepts, [
      { label: 'Perimenopause', type: 'condition' },
      { label: 'Brain fog', type: 'symptom' },
    ]);
    assert.doesNotMatch(
      JSON.stringify({ summary: result.summary, concepts: result.storyProfile.concepts }),
      /Brain fog and four easy|Help fix/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('client fallback records the safe server reason and diagnostic ID', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (path) => path === '/api/page-title'
    ? {
      ok: true,
      status: 200,
      json: async () => ({
        title: 'Open water swimming is booming – but what are the health risks?',
        articleText: 'Open water swimming is growing in popularity while contaminated water creates health risks.',
        sourceUrl: 'https://example.com/story',
      }),
    }
    : {
      ok: false,
      status: 503,
      json: async () => ({
        error: 'AI article analysis was unavailable.',
        fallbackReasonCode: 'missing_api_key',
        analysisDiagnosticId: 'diagnostic-fallback',
      }),
    };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await analyseUrl('https://example.com/story');
    assert.equal(result.analysisProvider, 'deterministic');
    assert.equal(result.analysisStatus, 'fallback');
    assert.equal(result.analysisModel, null);
    assert.equal(result.fallbackReasonCode, 'missing_api_key');
    assert.equal(result.analysisDiagnosticId, 'diagnostic-fallback');
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
  }
});
