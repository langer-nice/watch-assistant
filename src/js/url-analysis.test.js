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
      { label: 'Linden, France', type: 'location' },
      { label: 'Crescent State', type: 'organization' },
      { label: 'Linden Pride vehicle attack', type: 'event' },
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
      { label: 'Sewage contamination', type: 'condition' },
      { label: 'Leptospirosis', type: 'condition' },
      { label: 'Toxic algae', type: 'condition' },
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

test('cloud-gaming fallback rejects headline fragments and classifies central services precisely', () => {
  const result = createSourceDerivedFallback({
    title: 'Amazon gaming boss predicts future where players no longer need consoles',
    description: 'Jeff Gattis says cloud gaming will let players enjoy games without consoles.',
    articleText: [
      'Jeff Gattis leads Amazon gaming.',
      'Jeff Gattis said Amazon Luna is a cloud-gaming service built for players who no longer need consoles.',
      'Amazon Luna is expanding while Google Stadia was a game-streaming platform that closed.',
      'Google Stadia showed the risks facing cloud gaming.',
    ].join(' '),
  }, 'https://example.com/gaming/story');

  assert.deepEqual(result.storyFingerprint, [
    { label: 'Jeff Gattis', type: 'person' },
    { label: 'Amazon Luna', type: 'product_service' },
    { label: 'Google Stadia', type: 'product_service' },
    { label: 'Cloud gaming without consoles', type: 'phenomenon' },
  ]);
  assert.deepEqual(result.storyProfile.locations, []);
  assert.doesNotMatch(
    JSON.stringify(result.storyFingerprint),
    /Amazon gaming boss predicts future|Where players no longer|supporting|Key fact/,
  );
});

test('fallback accepts zero identifiers instead of filling from an unsupported headline', () => {
  const result = createSourceDerivedFallback({
    title: 'Experts discuss concerns where players no longer agree',
  }, 'https://example.com/opinion/story');

  assert.deepEqual(result.storyFingerprint, []);
  assert.deepEqual(result.keywords, []);
  assert.equal(result.storyProfile.concepts.length, 0);
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
    assert.equal(
      result.monitoringScope,
      'Monitor evidence and advice about brain fog during perimenopause.',
    );
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

test('progressive analysis returns local Review data without waiting for one in-flight AI request', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const requestBodies = [];
  let releaseSuggestion;
  const suggestionResponse = new Promise((resolve) => {
    releaseSuggestion = () => resolve({
      ok: true,
      status: 200,
      json: async () => ({
        watchTitle: 'Ukraine missile strike',
        watchingFor: 'Monitor casualty updates, official announcements and air-defence support.',
        description: 'Tracks significant follow-up reporting about the strike.',
        storyFingerprint: [{ label: 'Kyiv', type: 'location' }],
        storyProfile: {
          primaryPeople: [], otherPeople: [], peopleRoles: [],
          locations: ['Kyiv', 'Ukraine'], organizations: [],
          eventTypes: ['Missile strike'], distinctiveFacts: [], aliases: [],
          uncertaintyPhrases: [],
          storySummary: 'A missile strike caused casualties in Ukraine as officials requested additional air-defence support.',
        },
        analysisProvider: 'openai',
        analysisStatus: 'success',
        analysisModel: 'gpt-5.6-luna',
        fallbackReasonCode: null,
        analyzedAt: '2026-08-05T12:00:00.000Z',
        analysisDiagnosticId: 'diagnostic-progressive',
      }),
    });
  });
  globalThis.fetch = async (path, options) => {
    calls.push(path);
    requestBodies.push(JSON.parse(options.body));
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Strike causes casualties as Ukraine requests interceptors',
          description: 'A missile strike caused casualties in Ukraine.',
          articleText: 'A missile strike caused casualties in Ukraine. Officials requested more interceptor systems.',
          siteName: 'BBC News',
          sourceUrl: 'https://www.bbc.com/news/articles/progressive-example',
        }),
      };
    }
    return suggestionResponse;
  };

  try {
    const immediate = await analyseUrl(
      'https://www.bbc.com/news/articles/progressive-example',
      { progressive: true },
    );

    assert.equal(immediate.analysisProvider, 'deterministic');
    assert.ok(immediate.summary);
    assert.ok(immediate.monitoringScope);
    assert.ok(immediate.enhancement instanceof Promise);
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
    assert.equal(
      requestBodies[0].url,
      'https://www.bbc.com/news/articles/progressive-example',
    );
    assert.equal(immediate.source, 'BBC News');
    assert.equal(immediate.sourceUrl, 'https://www.bbc.com/news/articles/progressive-example');
    assert.equal(Object.keys(immediate).includes('enhancement'), false);

    releaseSuggestion();
    const enhanced = await immediate.enhancement;
    assert.equal(enhanced.analysisProvider, 'openai');
    assert.equal(enhanced.analysisDiagnosticId, 'diagnostic-progressive');
    assert.equal(
      enhanced.summary,
      'A missile strike caused casualties in Ukraine as officials requested additional air-defence support.',
    );
    assert.equal(
      enhanced.monitoringScope,
      'Monitor casualty updates, official announcements and air-defence support.',
    );
    assert.ok(enhanced.storyFingerprint.length > 1);
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page-title success plus watch-suggestion 503 keeps the valid local Review unchanged', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const calls = [];
  console.warn = () => {};
  globalThis.fetch = async (path) => {
    calls.push(path);
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Brain fog and four easy ways to help fix it',
          description: 'BBC explains practical ways to manage brain fog.',
          articleText: 'Brain fog can affect concentration. The article describes practical ways to manage it.',
          siteName: 'BBC News',
          sourceUrl: 'https://www.bbc.com/news/articles/c87ydw7xdxvo',
          monitoringSource: {
            url: 'https://feeds.example.com/bbc-story.xml',
            type: 'rss',
            title: 'BBC story monitoring',
            discovery: 'automatic',
          },
        }),
      };
    }
    return {
      ok: false,
      status: 503,
      json: async () => ({
        error: 'AI article analysis was unavailable.',
        analysisProvider: 'openai',
        analysisStatus: 'failed',
        fallbackReasonCode: 'configuration_missing',
      }),
    };
  };

  try {
    const localReview = await analyseUrl(
      'https://www.bbc.com/news/articles/c87ydw7xdxvo',
      { progressive: true },
    );
    const visibleReview = {
      status: localReview.status,
      title: localReview.title,
      summary: localReview.summary,
      monitoringScope: localReview.monitoringScope,
      source: localReview.source,
      sourceUrl: localReview.sourceUrl,
    };

    assert.equal(localReview.status, 'success');
    assert.equal(localReview.title, 'Brain fog and four easy ways to help fix it');
    assert.equal(localReview.source, 'BBC News');
    assert.ok(localReview.summary);
    assert.ok(localReview.monitoringScope);
    assert.equal(await localReview.enhancement, null);
    assert.deepEqual({
      status: localReview.status,
      title: localReview.title,
      summary: localReview.summary,
      monitoringScope: localReview.monitoringScope,
      source: localReview.source,
      sourceUrl: localReview.sourceUrl,
    }, visibleReview);
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
  }
});

test('AI-unavailable political metadata produces a rich local Review without duplicate requests', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const calls = [];
  console.warn = () => {};
  globalThis.fetch = async (path) => {
    calls.push(path);
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: "Abdul El-Sayed's victory sends tremors through Democratic Party",
          description: 'The left-wing candidate won the Democratic nomination in Michigan and will contest the November election.',
          articleText: "Abdul El-Sayed won the Democratic nomination in Michigan. His victory has consequences for the Democratic Party ahead of the November election.",
          siteName: 'BBC News',
          sourceUrl: 'https://www.bbc.com/news/articles/political-fallback',
          monitoringSource: {
            url: 'https://feeds.example.com/bbc-politics.xml',
            type: 'rss',
            title: 'BBC politics monitoring',
            discovery: 'automatic',
          },
        }),
      };
    }
    return {
      ok: false,
      status: 503,
      json: async () => ({
        error: 'AI article analysis was unavailable.',
        analysisProvider: 'openai',
        analysisStatus: 'failed',
        fallbackReasonCode: 'configuration_missing',
      }),
    };
  };

  try {
    const review = await analyseUrl(
      'https://www.bbc.com/news/articles/political-fallback',
      { progressive: true },
    );
    assert.equal(await review.enhancement, null);
    assert.equal(review.status, 'success');
    assert.match(review.summary, /Democratic nomination|November election/);
    assert.deepEqual(review.storyFingerprint, [
      { label: 'Abdul El-Sayed', type: 'person' },
      { label: 'November election', type: 'event' },
      { label: 'Democratic Party', type: 'organization' },
      { label: 'Michigan', type: 'location' },
      { label: 'Left-wing candidate', type: 'phenomenon' },
    ]);
    assert.match(review.monitoringScope, /Abdul El-Sayed/);
    assert.match(review.monitoringScope, /Democratic Party/);
    assert.match(review.monitoringScope, /November election/);
    assert.match(review.monitoringScope, /election and campaign developments/);
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
  }
});

test('a total BBC page failure preserves publisher and original URL without starting AI', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const calls = [];
  console.warn = () => {};
  globalThis.fetch = async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) });
    return {
      ok: false,
      status: 502,
      json: async () => ({ error: 'The article could not be retrieved.' }),
    };
  };

  const sourceUrl = 'https://www.bbc.com/news/articles/unavailable-example?edition=uk';
  try {
    await assert.rejects(
      analyseUrl(sourceUrl, { progressive: true }),
      (error) => {
        assert.deepEqual(error.partialAnalysis, {
          source: 'BBC News',
          sourceName: 'BBC News',
          sourceUrl,
        });
        return true;
      },
    );
    assert.deepEqual(calls, [{
      path: '/api/page-title',
      body: { url: sourceUrl },
    }]);
  } finally {
    console.warn = originalWarn;
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
        pageType: 'article',
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
    assert.ok(result.monitoringScope);
    assert.notEqual(result.monitoringScope, result.summary);
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
  }
});

test('homepage, section, category and search classifications stop before Story extraction', async () => {
  const originalFetch = globalThis.fetch;
  const pageTypes = new Map([
    ['https://www.bbc.com/', ['homepage', 'BBC - Home']],
    ['https://www.bbc.com/news', ['news_section', 'BBC News']],
    ['https://www.bbc.com/sport', ['category_page', 'BBC Sport']],
    ['https://www.bbc.com/search?q=Michigan', ['search_page', 'BBC Search']],
    ['https://edition.cnn.com/', ['homepage', 'CNN']],
    ['https://www.lemonde.fr/', ['homepage', 'Le Monde']],
    ['https://www.franceinfo.fr/', ['homepage', 'France Info']],
  ]);
  const calls = [];
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options.body);
    calls.push({ path, body });
    assert.equal(path, '/api/page-title');
    const [pageType, title] = pageTypes.get(body.url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        title,
        description: 'A collection of unrelated headlines and navigation links.',
        articleText: 'Save Football Daily Scottish. Yaroslavl. Markets. Weather. Culture.',
        siteName: title,
        sourceUrl: body.url,
        pageType,
      }),
    };
  };

  try {
    for (const [url, [pageType]] of pageTypes) {
      const result = await analyseUrl(url, { progressive: true });
      assert.equal(result.status, 'success');
      assert.equal(result.pageType, pageType);
      assert.equal(result.isStory, false);
      assert.equal(result.storyProfile, null);
      assert.deepEqual(result.storyFingerprint, []);
      assert.deepEqual(result.keywords, []);
      assert.equal(result.monitoringScope, '');
      assert.equal('enhancement' in result, false);
    }
    assert.equal(calls.length, pageTypes.size);
    assert.equal(calls.some(({ path }) => path === '/api/watch-suggestion'), false);
    assert.equal(
      (await analyseUrl('https://www.bbc.com/')).summary,
      'This appears to be a news homepage rather than a single news story.',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('classified BBC and Reuters articles retain Story analysis without duplicate requests', async () => {
  const originalFetch = globalThis.fetch;
  const articleUrls = [
    'https://www.bbc.com/news/articles/cp309ng0xq1o',
    'https://www.reuters.com/world/us/example-2026-08-06/',
  ];
  const calls = [];
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options.body);
    calls.push({ path, body });
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Abdul El-Sayed wins a Democratic Senate primary',
          description: 'The candidate won the Democratic nomination.',
          articleText: 'Abdul El-Sayed won the Democratic nomination and will contest the Senate election.',
          author: 'Example Reporter',
          publishedAt: '2026-08-06T08:00:00Z',
          siteName: body.url.includes('reuters.com') ? 'Reuters' : 'BBC News',
          sourceUrl: body.url,
          pageType: 'article',
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        watchTitle: 'Abdul El-Sayed Senate primary victory',
        watchingFor: 'Monitor significant developments in the Senate campaign.',
        description: 'Tracks significant campaign developments.',
        storyFingerprint: [{ label: 'Abdul El-Sayed', type: 'person' }],
        storyProfile: {
          primaryPeople: ['Abdul El-Sayed'], otherPeople: [], peopleRoles: [],
          locations: [], organizations: ['Democratic Party'], eventTypes: ['Senate primary'],
          distinctiveFacts: [], aliases: [], uncertaintyPhrases: [],
          storySummary: 'Abdul El-Sayed won the Democratic nomination in a Senate primary.',
        },
        analysisProvider: 'openai',
        analysisStatus: 'success',
      }),
    };
  };

  try {
    for (const url of articleUrls) {
      const result = await analyseUrl(url);
      assert.equal(result.pageType, 'article');
      assert.equal(result.isStory, true);
      assert.deepEqual(result.storyFingerprint[0], {
        label: 'Abdul El-Sayed',
        type: 'person',
      });
      assert.ok(result.storyProfile);
      assert.ok(result.monitoringScope);
    }
    assert.deepEqual(calls.map(({ path }) => path), [
      '/api/page-title', '/api/watch-suggestion',
      '/api/page-title', '/api/watch-suggestion',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BBC article evidence corrects weak AI entity types before Story Profile creation', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const url = 'https://www.bbc.com/news/articles/black-sea-campaign';
  globalThis.fetch = async (path) => {
    calls.push(path);
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: "In Odesa, no-one is safe from Russia's new Black Sea strike campaign",
          description: 'Russian strikes on Odesa are targeting civilian infrastructure as the campaign against Ukraine expands.',
          articleSubheading: 'Russian attacks are increasingly targeting Ukrainian ports.',
          articleText: 'People in Odesa face repeated Russian strikes. Ukraine says Russia is expanding its Black Sea strike campaign against ports and civilian infrastructure. Yaroslav Petrenko described one damaged building.',
          siteName: 'BBC News',
          sourceUrl: url,
          pageType: 'article',
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        watchTitle: 'Black Sea strike campaign in Odesa',
        watchingFor: 'Follow significant developments in the strike campaign.',
        description: 'Tracks the continuing military campaign around Odesa.',
        storyFingerprint: [
          { label: 'Black Sea', type: 'person' },
          { label: 'Yaroslav, Russia', type: 'location' },
        ],
        storyProfile: {
          primaryPeople: ['Black Sea'], otherPeople: [], peopleRoles: [],
          locations: ['Odesa'], organizations: ['Russia'], eventTypes: [],
          distinctiveFacts: [], aliases: [], uncertaintyPhrases: [],
          phenomena: [], conditions: [], symptoms: [],
          storySummary: 'Russia is expanding a Black Sea strike campaign around Odesa.',
        },
        analysisProvider: 'openai',
        analysisStatus: 'success',
      }),
    };
  };

  try {
    const result = await analyseUrl(url);
    const labels = result.storyFingerprint.map(({ label }) => label);
    assert.ok(labels.includes('Black Sea strike campaign'));
    assert.ok(labels.includes('Odesa'));
    assert.ok(labels.includes('Russian strikes'));
    assert.ok(labels.includes('Civilian infrastructure'));
    assert.equal(result.storyFingerprint.some(({ label, type }) => (
      label === 'Black Sea' && type === 'person'
    )), false);
    assert.equal(labels.some((label) => /Yaroslav/u.test(label)), false);
    assert.deepEqual(result.storyProfile.concepts, result.storyFingerprint);
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BBC Cambridge article replaces malformed possessive identifiers with its Story Profile', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const url = 'https://www.bbc.com/news/articles/cambridge-plagiarism';
  globalThis.fetch = async (path) => {
    calls.push(path);
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Cambridge professor at centre of plagiarism row resigns',
          articleSubheading: 'Professor Jason Arday has left his post after an investigation.',
          description: 'Jason Arday resigned from the University of Cambridge following plagiarism allegations raised by the Good Law Project.',
          articleText: 'Professor Jason Arday has resigned from the University of Cambridge. The resignation follows a plagiarism investigation prompted by the Good Law Project. The university said it reviewed the allegations.',
          siteName: 'BBC News', sourceUrl: url, pageType: 'article',
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        watchTitle: 'Cambridge professor resigns after plagiarism row',
        watchingFor: 'Follow the investigation and consequences of Jason Arday’s resignation.',
        description: 'Tracks significant developments in the Cambridge plagiarism case.',
        storyFingerprint: [
          { label: "BBC's Today", type: 'person' },
          { label: "Arday's", type: 'location' },
        ],
        storyProfile: {
          primaryPeople: ['Jason Arday'], otherPeople: [], peopleRoles: [],
          locations: [], organizations: ['University of Cambridge', 'Good Law Project'],
          eventTypes: ['Plagiarism investigation', 'Resignation'],
          distinctiveFacts: [], aliases: [], uncertaintyPhrases: [],
          storySummary: 'Jason Arday resigned from the University of Cambridge following plagiarism allegations.',
        },
        analysisProvider: 'openai', analysisStatus: 'success',
      }),
    };
  };

  try {
    const result = await analyseUrl(url);
    assert.deepEqual(result.storyFingerprint, [
      { label: 'Jason Arday resignation', type: 'event' },
      { label: 'Jason Arday', type: 'person' },
      { label: 'Plagiarism investigation', type: 'event' },
      { label: 'University of Cambridge', type: 'organization' },
      { label: 'Good Law Project', type: 'organization' },
    ]);
    assert.deepEqual(result.storyProfile.concepts, result.storyFingerprint);
    assert.equal(JSON.stringify(result).includes("BBC's Today"), false);
    assert.equal(JSON.stringify(result).includes("Arday's"), false);
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('English UI analyses original French Le Monde evidence without challenge or stale text', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const url = 'https://www.lemonde.fr/international/article/2026/08/06/en-russie-la-ou-poutine-passe-le-prix-de-l-essence-baisse_6739681_3210.html';
  const articleText = 'À Iaroslavl, le prix de l’essence a baissé avant la visite de Vladimir Poutine.';
  const requestBodies = [];
  globalThis.document = { documentElement: { lang: 'en' } };
  globalThis.fetch = async (path, options) => {
    requestBodies.push({ path, body: JSON.parse(options.body) });
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'En Russie, là où Poutine passe, le prix de l’essence baisse',
          description: 'Une enquête sur les déplacements de Vladimir Poutine et les prix à la pompe.',
          articleText,
          language: 'fr',
          siteName: 'Le Monde',
          sourceUrl: url,
          canonicalUrl: url,
          pageType: 'article',
          conceptSourceFields: ['title', 'description', 'articleText'],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        watchTitle: 'En Russie, le prix de l’essence baisse sur le passage de Poutine',
        watchingFor: 'Follow reporting about fuel-price changes linked to Vladimir Poutine’s regional visits.',
        description: 'Tracks developments in the reported Russian fuel-price pattern.',
        storyFingerprint: [
          { label: 'Vladimir Poutine', type: 'person' },
          { label: 'Prix de l’essence en Russie', type: 'phenomenon' },
        ],
        storyProfile: {
          primaryPeople: ['Vladimir Poutine'], otherPeople: [], peopleRoles: [],
          locations: ['Russie', 'Iaroslavl'], organizations: [], eventTypes: [],
          distinctiveFacts: [], aliases: [], uncertaintyPhrases: [], works: [],
          productsServices: [], events: [], relationships: [],
          phenomena: ['Prix de l’essence en Russie'], conditions: [], symptoms: [],
          storySummary: 'Le prix de l’essence a baissé dans des régions russes avant des visites de Vladimir Poutine.',
        },
        analysisProvider: 'openai',
        analysisStatus: 'success',
      }),
    };
  };

  try {
    const result = await analyseUrl(url);
    const suggestionBody = requestBodies.find(({ path }) => path === '/api/watch-suggestion').body;
    assert.equal(result.source, 'Le Monde');
    assert.match(result.title, /Russie/u);
    assert.match(result.summary, /Vladimir Poutine/u);
    assert.match(result.monitoringScope, /Vladimir Poutine/u);
    assert.deepEqual(result.storyFingerprint.map(({ label }) => label), [
      'Vladimir Poutine', 'Prix de l’essence en Russie',
    ]);
    assert.equal(suggestionBody.title, 'En Russie, là où Poutine passe, le prix de l’essence baisse');
    assert.equal(suggestionBody.articleText, articleText);
    assert.doesNotMatch(JSON.stringify(result), /Client Challenge/);
    assert.deepEqual(requestBodies.map(({ path }) => path), ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('access-limited French article keeps a clean local Review and accepts only supported concept proposals', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const requestBodies = [];
  const url = 'https://www.nicematin.com/faits-divers/une-boulangerie-fermee-a-nice-123456';
  globalThis.fetch = async (path, options) => {
    calls.push(path);
    requestBodies.push({ path, body: JSON.parse(options.body) });
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Une boulangerie visée par une fermeture administrative à Nice',
          articleSubheading: 'La police a contrôlé la boulangerie Azur.',
          description: 'La boulangerie Azur fait l’objet d’une fermeture administrative.',
          articleText: 'La boulangerie Azur, située à Nice, fait l’objet d’une fermeture administrative. La police a constaté plusieurs manquements.',
          siteName: 'Nice-Matin', language: 'fr', pageType: 'article', sourceUrl: url,
          publishedAt: '2026-08-06T08:00:00+02:00', contentAccessLimited: true,
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        concepts: [
          { label: 'Boulangerie Azur', type: 'organization', reason: 'Named business' },
          { label: 'Fermeture administrative', type: 'event', reason: 'Central action' },
          { label: 'Nice', type: 'location', reason: 'Stated location' },
          { label: 'News', type: 'phenomenon', reason: 'Too generic' },
          { label: 'Je m’abonne', type: 'phenomenon', reason: 'Access copy' },
        ],
        confidence: 0.86,
        analysisProvider: 'openai', analysisStatus: 'success', analysisModel: 'gpt-5.6-luna',
      }),
    };
  };

  try {
    const immediate = await analyseUrl(url, { progressive: true });
    const enhanced = await immediate.enhancement;
    const suggestionBody = requestBodies.find(({ path }) => path === '/api/watch-suggestion').body;

    assert.equal(immediate.contentAccessLimited, true);
    assert.equal(enhanced.contentAccessLimited, true);
    assert.equal(enhanced.title, immediate.title);
    assert.match(enhanced.summary, /boulangerie Azur|fermeture administrative/iu);
    assert.doesNotMatch(JSON.stringify(enhanced), /Pourquoi s’abonner|Je m’abonne|publicité|connecte/iu);
    assert.ok(enhanced.storyFingerprint.some(({ label }) => label === 'Boulangerie Azur'));
    assert.ok(enhanced.storyFingerprint.some(({ label }) => label === 'Fermeture administrative'));
    assert.ok(enhanced.storyFingerprint.some(({ label }) => label === 'Nice'));
    assert.equal(enhanced.storyFingerprint.some(({ label }) => label === 'News'), false);
    assert.equal(suggestionBody.author, undefined);
    assert.equal(suggestionBody.publisher, 'Nice-Matin');
    assert.equal(suggestionBody.language, 'fr');
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('semantic concept proposal improves a lifestyle Story without replacing the deterministic Review', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const url = 'https://example.com/health/six-easy-swaps-ultra-processed-foods';
  globalThis.fetch = async (path) => {
    calls.push(path);
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Six easy swaps to help you avoid ultra-processed foods',
          description: 'Nutrition specialists explain dietary advice for healthy eating and public health.',
          articleText: 'Ultra-processed foods are central to the nutrition guidance. The dietary advice recommends healthy eating patterns and discusses public health evidence.',
          siteName: 'Example Health', language: 'en', pageType: 'article', sourceUrl: url,
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        concepts: [
          { label: 'Ultra-processed foods', type: 'phenomenon', reason: 'Central subject' },
          { label: 'Nutrition', type: 'phenomenon', reason: 'Supported domain' },
          { label: 'Dietary advice', type: 'phenomenon', reason: 'Future reporting scope' },
          { label: 'Healthy eating', type: 'phenomenon', reason: 'Supported concept' },
          { label: 'Health', type: 'phenomenon', reason: 'Too broad' },
        ],
        confidence: 0.9,
        analysisProvider: 'openai', analysisStatus: 'success', analysisModel: 'gpt-5.6-luna',
      }),
    };
  };

  try {
    const immediate = await analyseUrl(url, { progressive: true });
    const enhanced = await immediate.enhancement;
    const labels = enhanced.storyFingerprint.map(({ label }) => label);

    assert.equal(enhanced.title, immediate.title);
    assert.equal(enhanced.summary, immediate.summary);
    assert.ok(labels.includes('Ultra-processed foods'));
    assert.ok(labels.includes('Nutrition'));
    assert.ok(labels.includes('Dietary advice'));
    assert.equal(labels.includes('Health'), false);
    assert.equal(labels.some((label) => /Six easy swaps|Avoid ultra-processed foods Six easy/iu.test(label)), false);
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('strong Ivan Toney AI concepts remain authoritative through the final Story Profile', async () => {
  const originalFetch = globalThis.fetch;
  const url = 'https://www.bbc.com/news/articles/cpw9nz7qwyqo';
  globalThis.fetch = async (path) => {
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Footballer Ivan Toney charged with assault at Soho nightclub',
          description: 'The footballer is accused after an incident in central London.',
          articleText: [
            'Ivan Toney has been charged with assault causing actual bodily harm.',
            'The incident happened at a nightclub in Soho.',
            'The footballer previously played at the World Cup and in England’s final.',
            'He will appear at Westminster Magistrates Court.',
          ].join(' '),
          siteName: 'BBC News', language: 'en', pageType: 'article', sourceUrl: url,
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        concepts: [
          { label: 'Ivan Toney assault charge', type: 'event', reason: 'Central reported charge' },
          { label: 'Ivan Toney', type: 'person', reason: 'Named subject' },
          { label: 'Soho nightclub assault case', type: 'event', reason: 'Central legal case' },
        ],
        confidence: 0.98,
        analysisProvider: 'openai',
        analysisStatus: 'success',
        analysisModel: 'gpt-5.6-luna',
      }),
    };
  };

  try {
    const result = await analyseUrl(url);
    assert.deepEqual(result.storyFingerprint, [
      { label: 'Ivan Toney assault charge', type: 'event' },
      { label: 'Ivan Toney', type: 'person' },
      { label: 'Soho nightclub assault case', type: 'event' },
    ]);
    assert.deepEqual(result.storyProfile.concepts, result.storyFingerprint);
    assert.equal(result.storyProfile.primaryPeople[0], 'Ivan Toney');
    assert.equal(result.storyFingerprint.some(({ label }) => label === 'World Cup'), false);
    assert.equal(result.storyFingerprint.some(({ label }) => label === 'England’s final'), false);
    assert.equal(result.storyFingerprint.some(({ label }) => label === 'Footballer Ivan Toney'), false);
    assert.match(result.monitoringScope, /legal and court developments/i);
    assert.doesNotMatch(result.monitoringScope, /competition|World Cup|tournament/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('one authoritative ultra-processed-food concept remains sufficient without padding', async () => {
  const originalFetch = globalThis.fetch;
  const url = 'https://www.bbc.com/future/article/ultra-processed-foods';
  globalThis.fetch = async (path) => {
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Six easy swaps to help you avoid ultra-processed foods',
          description: 'The article examines practical dietary changes and nutrition.',
          articleText: 'Ultra-processed foods are the central subject. Nutrition and health are discussed as supporting context.',
          siteName: 'BBC Future', language: 'en', pageType: 'article', sourceUrl: url,
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        concepts: [
          { label: 'Ultra-processed foods', type: 'phenomenon', reason: 'Central subject' },
        ],
        confidence: 0.96,
        analysisProvider: 'openai', analysisStatus: 'success', analysisModel: 'gpt-5.6-luna',
      }),
    };
  };

  try {
    const result = await analyseUrl(url);
    assert.deepEqual(result.storyFingerprint, [
      { label: 'Ultra-processed foods', type: 'phenomenon' },
    ]);
    assert.deepEqual(result.storyProfile.concepts, result.storyFingerprint);
    assert.equal(result.storyFingerprint.some(({ label }) => /^(?:Food|Health|Nutrition)$/u.test(label)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('low-quality concept proposals leave a stronger deterministic Story Profile unchanged', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const url = 'https://www.bbc.com/news/articles/black-sea-campaign';
  globalThis.fetch = async (path) => {
    calls.push(path);
    if (path === '/api/page-title') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Russian Black Sea strike campaign expands in Odesa',
          description: 'Russian strikes targeted civilian infrastructure in Odesa, Ukraine.',
          articleText: 'The Black Sea strike campaign expanded in Odesa. Russian strikes damaged civilian infrastructure in Ukraine.',
          siteName: 'BBC News', language: 'en', pageType: 'article', sourceUrl: url,
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        concepts: [
          { label: 'News', type: 'phenomenon', reason: 'Generic category' },
          { label: 'London', type: 'location', reason: 'Unsupported place' },
        ],
        confidence: 0.2,
        analysisProvider: 'openai', analysisStatus: 'success', analysisModel: 'gpt-5.6-luna',
      }),
    };
  };

  try {
    const immediate = await analyseUrl(url, { progressive: true });
    const enhanced = await immediate.enhancement;

    assert.deepEqual(enhanced.storyFingerprint, immediate.storyFingerprint);
    assert.equal(enhanced.summary, immediate.summary);
    assert.equal(enhanced.monitoringScope, immediate.monitoringScope);
    assert.deepEqual(calls, ['/api/page-title', '/api/watch-suggestion']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a Le Monde access challenge cannot become the article title or an identifier', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const calls = [];
  const url = 'https://www.lemonde.fr/international/article/2026/08/06/en-russie-la-ou-poutine-passe-le-prix-de-l-essence-baisse_6739681_3210.html';
  globalThis.document = { documentElement: { lang: 'en' } };
  globalThis.fetch = async (path) => {
    calls.push(path);
    return path === '/api/page-title' ? {
      ok: true, status: 200, json: async () => ({
        title: 'En russie la ou poutine passe le prix de l’essence baisse',
        description: '', articleText: '', language: '', siteName: 'Le Monde',
        sourceUrl: url, pageType: 'article', contentAccessLimited: true,
        titleSource: 'url_slug', conceptSourceFields: ['title'],
      }),
    } : {
      ok: false, status: 503, json: async () => ({
        error: 'AI article analysis was unavailable.',
        fallbackReasonCode: 'configuration_missing',
      }),
    };
  };

  try {
    const result = await analyseUrl(url);
    assert.match(result.sourceTitle, /prix de l’essence/iu);
    assert.match(result.summary, /prix de l’essence/iu);
    assert.match(result.monitoringScope, /prix de l’essence/iu);
    assert.deepEqual(result.storyFingerprint, [
      { label: 'Prix de l’essence', type: 'event' },
      { label: 'Russie', type: 'location' },
    ]);
    assert.doesNotMatch(JSON.stringify(result), /Client Challenge/);
    assert.deepEqual(calls, ['/api/page-title']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('French UI preserves English BBC evidence and a later request cannot reuse stale Story data', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const firstUrl = 'https://www.bbc.com/news/articles/first';
  const secondUrl = 'https://www.bbc.com/news/articles/second';
  let currentTitle = '';
  globalThis.document = { documentElement: { lang: 'fr' } };
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options.body);
    if (path === '/api/page-title') {
      currentTitle = body.url === firstUrl ? 'Aurora mission reaches Mars' : 'Ocean telescope begins survey';
      return {
        ok: true, status: 200, json: async () => ({
          title: currentTitle,
          description: `${currentTitle} is described in the supplied BBC report.`,
          articleText: `${currentTitle}. Scientists published the first verified observations.`,
          siteName: 'BBC News', sourceUrl: body.url, pageType: 'article',
        }),
      };
    }
    return {
      ok: true, status: 200, json: async () => ({
        watchTitle: currentTitle,
        watchingFor: `Follow meaningful developments in ${currentTitle}.`,
        description: `Tracks ${currentTitle}.`,
        storyFingerprint: [{ label: currentTitle, type: 'event' }],
        storyProfile: { storySummary: `${currentTitle} is the subject of the supplied report.` },
        analysisProvider: 'openai', analysisStatus: 'success',
      }),
    };
  };

  try {
    const first = await analyseUrl(firstUrl);
    const second = await analyseUrl(secondUrl);
    assert.equal(first.sourceTitle, 'Aurora mission reaches Mars');
    assert.equal(second.sourceTitle, 'Ocean telescope begins survey');
    assert.doesNotMatch(JSON.stringify(second), /Aurora mission/u);
    assert.match(JSON.stringify(second), /Ocean telescope/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
