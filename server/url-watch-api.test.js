import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  ArticleAnalysisError,
  createUrlWatchMiddleware,
  discoverMonitoringSource,
  extractFeedCandidates,
  extractPageMetadata,
  extractPageTitle,
  fetchPageMetadata,
  generateWatchSuggestion,
  MAX_ARTICLE_TEXT_LENGTH,
} from './url-watch-api.js';

const perimenopauseArticleText = [
  'Brain fog can affect memory and concentration during perimenopause.',
  'The article recommends regular physical activity, a consistent sleep routine, a balanced diet, and stress-management exercises.',
].join(' ');

const perimenopauseStructuredSuggestion = {
  watchTitle: 'Brain fog during perimenopause',
  watchingFor: 'Monitor new evidence and advice about brain fog during perimenopause.',
  storyFingerprint: [
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ],
  storyProfile: {
    primaryPeople: [],
    otherPeople: [],
    peopleRoles: [],
    locations: [],
    organizations: [],
    eventTypes: ['Brain fog during perimenopause'],
    distinctiveFacts: [
      'Regular physical activity',
      'Consistent sleep routine',
      'Balanced diet',
      'Stress-management exercises',
    ],
    aliases: [],
    uncertaintyPhrases: [],
    storySummary: 'The article explains why brain fog can occur during perimenopause and presents four practical measures that may help improve memory and concentration.',
  },
  description: 'Tracks evidence and practical advice about brain fog during perimenopause.',
};

const createOpenAiResponse = (suggestion = perimenopauseStructuredSuggestion) => ({
  ok: true,
  status: 200,
  json: async () => ({
    output: [{ content: [{ type: 'output_text', text: JSON.stringify(suggestion) }] }],
  }),
});

const invokeSuggestionRoute = async ({ apiKey = 'test-key', fetchImpl, ...middlewareOptions }) => {
  const request = Readable.from([JSON.stringify({
    title: 'Brain fog and four easy ways to help fix it',
    description: 'Why memory and concentration can change during perimenopause.',
    articleText: perimenopauseArticleText,
    slug: 'brain-fog-four-easy-ways-help-fix-it',
  })]);
  request.method = 'POST';
  request.url = '/api/watch-suggestion';
  const headers = {};
  let responseBody = '';
  const response = {
    setHeader: (name, value) => { headers[name] = value; },
    end: (value) => { responseBody = value; },
  };
  await createUrlWatchMiddleware({ apiKey, model: 'gpt-5.6-luna', fetchImpl, ...middlewareOptions })(
    request,
    response,
    () => {},
  );
  return { status: response.statusCode, headers, body: JSON.parse(responseBody) };
};

const guardianUrl = 'https://www.theguardian.com/lifeandstyle/2026/jul/24/experience-i-hunt-missing-hikers-remote-mountains-taiwan';

test('discovers RSS and Atom alternates, resolves relative URLs, and prefers RSS deterministically', async () => {
  const html = `<head>
    <link rel="alternate" type="application/atom+xml" href="/atom.xml" title="Atom">
    <link rel="alternate stylesheet" type="application/rss+xml; charset=utf-8" href="../news.rss" title="RSS">
  </head>`;
  assert.deepEqual(
    extractFeedCandidates(html, 'https://news.example.com/world/story'),
    [
      {
        url: 'https://news.example.com/news.rss',
        type: 'application/rss+xml',
        title: 'RSS',
        index: 1,
      },
      {
        url: 'https://news.example.com/atom.xml',
        type: 'application/atom+xml',
        title: 'Atom',
        index: 0,
      },
    ],
  );
  const monitoringSource = await discoverMonitoringSource(
    html,
    'https://news.example.com/world/story',
    { validateUrl: async (url) => new URL(url) },
  );
  assert.deepEqual(monitoringSource, {
    url: 'https://news.example.com/news.rss',
    type: 'rss',
    title: 'RSS',
    discovery: 'html-alternate',
  });
});

test('returns no feed when none is advertised and skips forbidden candidates', async () => {
  assert.equal(await discoverMonitoringSource(
    '<head><title>No feed</title></head>',
    'https://example.com/story',
  ), null);
  const validated = [];
  const result = await discoverMonitoringSource(
    `<link rel="alternate" type="application/rss+xml" href="http://127.0.0.1/feed">
     <link rel="alternate" type="application/atom+xml" href="/public.atom">`,
    'https://example.com/story',
    {
      validateUrl: async (url) => {
        validated.push(url);
        if (url.includes('127.0.0.1')) throw new Error('forbidden');
        return new URL(url);
      },
    },
  );
  assert.deepEqual(validated, [
    'http://127.0.0.1/feed',
    'https://example.com/public.atom',
  ]);
  assert.equal(result.url, 'https://example.com/public.atom');
});

test('extracts the strongest available source fields from the Guardian article shape', () => {
  const metadata = extractPageMetadata(`<html><head>
    <meta property="og:title" content="Experience: I hunt for missing hikers in remote mountains">
    <meta property="og:description" content="A search-and-rescue account from Taiwan's mountains.">
    <meta name="author" content="Petr Novotny">
    <script type="application/ld+json">{
      "@type": "Article",
      "headline": "Experience: I hunt for missing hikers in remote mountains",
      "articleBody": "Petr Novotny searches for missing hikers across remote mountains in Taiwan."
    }</script>
  </head><body></body></html>`, guardianUrl);

  assert.equal(metadata.title, 'Experience: I hunt for missing hikers in remote mountains');
  assert.equal(metadata.description, "A search-and-rescue account from Taiwan's mountains.");
  assert.equal(metadata.author, 'Petr Novotny');
  assert.match(metadata.articleText, /Petr Novotny/);
  assert.equal(metadata.articleBodyCount, 1);
  assert.equal(metadata.includedArticleBodyCount, 1);
  assert.equal(metadata.sourceUrl, guardianUrl);
  assert.equal(metadata.pageType, 'article');
});

test('extracts layered BBC metadata without requiring JSON-LD articleBody', () => {
  const sourceUrl = 'https://www.bbc.com/news/articles/c87ydw7xdxvo';
  const metadata = extractPageMetadata(`<html><head>
    <title>HTML title fallback</title>
    <meta name="description" content="HTML description fallback.">
    <meta name="twitter:title" content="Twitter title fallback">
    <meta name="twitter:description" content="Twitter description fallback.">
    <meta property="og:title" content="Brain fog and four easy ways to help fix it">
    <meta property="og:description" content="BBC explains practical ways to manage brain fog.">
    <link rel="canonical" href="/news/articles/c87ydw7xdxvo">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: 'JSON-LD headline fallback',
      description: 'JSON-LD description fallback.',
      publisher: { '@type': 'NewsMediaOrganization', name: 'BBC News' },
      datePublished: '2025-09-14T00:00:00.000Z',
    })}</script>
  </head><body><main>JavaScript shell without an article element.</main></body></html>`, sourceUrl);

  assert.equal(metadata.title, 'JSON-LD headline fallback');
  assert.equal(metadata.description, 'BBC explains practical ways to manage brain fog.');
  assert.equal(metadata.siteName, 'BBC News');
  assert.equal(metadata.publishedAt, '2025-09-14T00:00:00.000Z');
  assert.equal(metadata.canonicalUrl, sourceUrl);
  assert.equal(metadata.sourceUrl, sourceUrl);
  assert.equal(metadata.extractionMethod, 'metadata_only');
  assert.equal(metadata.pageType, 'article');
});

test('classifies a navigation-heavy BBC homepage before its article-card text can become a Story', () => {
  const metadata = extractPageMetadata(`<html><head>
    <title>BBC - Home</title>
    <meta property="og:title" content="BBC - Home">
    <meta property="og:site_name" content="BBC">
  </head><body>
    <nav>${Array.from({ length: 10 }, (_, index) => `<a href="/section-${index}">Section ${index}</a>`).join('')}</nav>
    <h1>Top stories</h1><h2>Football Daily</h2><h2>World news</h2><h2>Travel</h2>
    <article>Save Football Daily Scottish coverage and unrelated navigation.</article>
    <article>Reporting from Yaroslavl appears in a separate homepage card.</article>
  </body></html>`, 'https://www.bbc.com/');

  assert.equal(metadata.pageType, 'homepage');
  assert.equal(metadata.articleBodyCount, 0);
  assert.equal(metadata.articleText, '');
});

test('uses JSON-LD before HTML metadata and recognizes BBC from the URL as a last resort', () => {
  const jsonLd = extractPageMetadata(`<html><head>
    <title>HTML title fallback</title>
    <meta name="description" content="HTML description fallback.">
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'NewsArticle',
      headline: 'JSON-LD headline',
      description: 'JSON-LD description.',
      publisher: { name: 'BBC News' },
    })}</script>
  </head></html>`, 'https://www.bbc.com/news/articles/json-ld');
  assert.equal(jsonLd.title, 'JSON-LD headline');
  assert.equal(jsonLd.description, 'JSON-LD description.');
  assert.equal(jsonLd.siteName, 'BBC News');

  const titleOnly = extractPageMetadata(
    '<html><head><title>BBC title-only report</title></head></html>',
    'https://www.bbc.com/sport/articles/title-only',
  );
  assert.equal(titleOnly.title, 'BBC title-only report');
  assert.equal(titleOnly.description, '');
  assert.equal(titleOnly.siteName, 'BBC News');
});

test('uses only editorial article evidence and excludes related-content modules', () => {
  const metadata = extractPageMetadata(`<html lang="en"><head>
    <meta property="og:title" content="Open Graph fallback title">
    <meta name="description" content="The verified article description.">
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'NewsArticle',
      headline: 'Verified JSON-LD headline',
      articleBody: 'The verified article body concerns the Aurora research mission.',
    })}</script>
  </head><body>
    <article><h1>Unrelated rendered headline</h1><p>Rendered duplicate.</p></article>
    <aside aria-label="Most Read"><article>Celebrity Quiz</article></aside>
    <section class="related-stories"><article>Apple Crisp</article></section>
  </body></html>`, 'https://www.bbc.com/news/articles/verified');

  assert.equal(metadata.title, 'Verified JSON-LD headline');
  assert.equal(metadata.description, 'The verified article description.');
  assert.equal(metadata.articleText, 'The verified article body concerns the Aurora research mission.');
  assert.equal(metadata.language, 'en');
  assert.deepEqual(metadata.jsonLdTypes, ['NewsArticle']);
  assert.doesNotMatch(JSON.stringify(metadata), /Celebrity Quiz|Apple Crisp/);
});

test('selects the primary HTML article and removes recommendations nested inside it', () => {
  const metadata = extractPageMetadata(`<html><head>
    <meta property="og:type" content="article">
    <meta property="og:title" content="Primary investigation">
  </head><body>
    <article class="story-body">
      <h1>Primary investigation</h1>
      <p>The investigation follows the Atlas programme and its scientific findings.</p>
      <p>Researchers published evidence from the mission.</p>
      <section class="more-on-this-topic"><h2>More on this topic</h2><p>Celebrity Quiz</p></section>
    </article>
    <article class="recommended-card"><h2>Apple Crisp</h2></article>
  </body></html>`, 'https://example.com/reports/atlas');

  assert.match(metadata.articleText, /Atlas programme/);
  assert.doesNotMatch(metadata.articleText, /Celebrity Quiz|Apple Crisp|More on this topic/);
  assert.equal(metadata.articleBodyCount, 1);
});

test('replaces a publisher access challenge with article URL evidence', () => {
  const url = 'https://www.lemonde.fr/international/article/2026/08/06/en-russie-la-ou-poutine-passe-le-prix-de-l-essence-baisse_6739681_3210.html';
  const metadata = extractPageMetadata('<html lang="en"><head><title>Client Challenge</title></head></html>', url);

  assert.equal(metadata.pageType, 'article');
  assert.equal(metadata.contentAccessLimited, true);
  assert.equal(metadata.titleSource, 'url_slug');
  assert.match(metadata.title, /^En russie la ou poutine passe le prix de l’essence baisse$/iu);
  assert.doesNotMatch(JSON.stringify(metadata), /Client Challenge/);
  assert.equal(metadata.description, '');
  assert.equal(metadata.articleText, '');
  assert.equal(metadata.language, '');
});

test('preserves French article metadata and passes only its articleBody to analysis', () => {
  const url = 'https://www.lemonde.fr/international/article/2026/08/06/article_6739681_3210.html';
  const metadata = extractPageMetadata(`<html lang="fr"><head>
    <meta property="og:title" content="Titre Open Graph de secours">
    <meta property="og:description" content="Le prix de l’essence baisse dans les régions visitées par le président russe.">
    <link rel="canonical" href="${url}">
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'NewsArticle',
      headline: 'En Russie, là où Poutine passe, le prix de l’essence baisse',
      description: 'Une enquête sur les déplacements de Vladimir Poutine et les prix à la pompe.',
      datePublished: '2026-08-06T06:00:00+02:00',
      author: { name: 'Marie Dupont' },
      publisher: { name: 'Le Monde' },
      articleBody: 'À Iaroslavl, le prix de l’essence a baissé avant la visite de Vladimir Poutine. L’évolution contraste avec la hausse observée ailleurs en Russie.',
    })}</script>
  </head><body><article>Texte rendu.<aside>Most Read</aside></article></body></html>`, url);

  assert.equal(metadata.title, 'En Russie, là où Poutine passe, le prix de l’essence baisse');
  assert.equal(metadata.language, 'fr');
  assert.equal(metadata.siteName, 'Le Monde');
  assert.equal(metadata.canonicalUrl, url);
  assert.match(metadata.articleText, /À Iaroslavl/);
  assert.doesNotMatch(metadata.articleText, /Texte rendu|Most Read/);
  assert.equal(metadata.extractionMethod, 'json_ld_article_body');
});

test('keeps visible Nice-Matin-like article evidence while removing access and subscription UI', () => {
  const url = 'https://www.nicematin.com/faits-divers/une-boulangerie-fermee-a-nice-123456';
  const metadata = extractPageMetadata(`<html lang="fr"><head>
    <meta property="og:type" content="article">
    <meta property="og:title" content="Une boulangerie visée par une fermeture administrative à Nice">
    <meta property="og:description" content="La police a constaté plusieurs manquements dans la boulangerie Azur.">
    <meta property="article:published_time" content="2026-08-06T08:00:00+02:00">
    <link rel="canonical" href="${url}">
  </head><body><article>
    <h1>Une boulangerie visée par une fermeture administrative à Nice</h1>
    <p>La boulangerie Azur, située à Nice, fait l’objet d’une fermeture administrative.</p>
    <p>La police a constaté plusieurs manquements lors d’un contrôle.</p>
    <section class="subscription-overlay">
      <h2>Pourquoi s’abonner ?</h2><p>Profitez de tous nos articles.</p>
      <button>Je m’abonne</button><button>Je me connecte</button>
      <button>Regarder une publicité</button>
    </section>
    <aside class="journalist-subscription-card">Soutenez notre journaliste en devenant membre.</aside>
  </article></body></html>`, url);

  assert.equal(metadata.pageType, 'article');
  assert.equal(metadata.contentAccessLimited, true);
  assert.equal(metadata.title, 'Une boulangerie visée par une fermeture administrative à Nice');
  assert.match(metadata.articleText, /boulangerie Azur/iu);
  assert.match(metadata.articleText, /fermeture administrative/iu);
  assert.match(metadata.articleText, /police/iu);
  assert.doesNotMatch(
    JSON.stringify(metadata),
    /Pourquoi s’abonner|Je m’abonne|Je me connecte|Regarder une publicité|devenant membre/iu,
  );
});

test('page retrieval preserves the requested BBC URL while recording a validated redirect target', async () => {
  const requestedUrl = 'https://www.bbc.com/news/c87ydw7xdxvo?edition=uk';
  const resolvedUrl = 'https://www.bbc.com/news/articles/c87ydw7xdxvo?edition=uk';
  const validated = [];
  const requested = [];
  const responses = [
    new Response('', { status: 302, headers: { location: resolvedUrl } }),
    new Response('<html><head><meta property="og:title" content="Redirected BBC report"></head></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  ];
  const result = await fetchPageMetadata(requestedUrl, async (url) => {
    requested.push(url.href);
    return responses.shift();
  }, {
    validateUrl: async (url) => {
      const normalized = new URL(url);
      validated.push(normalized.href);
      return normalized;
    },
  });

  assert.deepEqual(validated, [requestedUrl, resolvedUrl]);
  assert.deepEqual(requested, [requestedUrl, resolvedUrl]);
  assert.equal(result.title, 'Redirected BBC report');
  assert.equal(result.siteName, 'BBC News');
  assert.equal(result.sourceUrl, requestedUrl);
  assert.equal(result.resolvedUrl, resolvedUrl);
});

test('extracts ordered distinct live entries from nested JSON-LD arrays and graphs', () => {
  const firstBody = 'Abdul Ballout is named as the suspect in the Berlin attack.';
  const secondBody = 'Officials describe the event as a suspected attack and preserve that attribution.';
  const thirdBody = 'Berlin mayor Kai Wegner thanked police after the operation.';
  const metadata = extractPageMetadata(`<html><head>
    <meta property="og:title" content="Live coverage title">
    <meta property="og:description" content="Live coverage metadata description.">
    <script type="application/ld+json">{
      "@context": "https://schema.org",
      "@graph": [{
        "@type": "LiveBlogPosting",
        "liveBlogUpdate": [
          { "@type": "BlogPosting", "articleBody": ${JSON.stringify(firstBody)} },
          [{ "@type": "NewsArticle", "articleBody": ${JSON.stringify(secondBody)} }],
          { "@type": "BlogPosting", "articleBody": ${JSON.stringify(thirdBody)} },
          { "@type": "BlogPosting", "articleBody": ${JSON.stringify(`  ${firstBody}  `)} }
        ]
      }, {
        "@type": "Product",
        "articleBody": "This unrelated structured object must be ignored."
      }]
    }</script>
    <script type="application/ld+json">{ malformed JSON </script>
  </head><body>
    <article>${firstBody}</article>
  </body></html>`);

  assert.equal(metadata.title, 'Live coverage title');
  assert.equal(metadata.description, 'Live coverage metadata description.');
  assert.equal(metadata.articleBodyCount, 3);
  assert.equal(metadata.includedArticleBodyCount, 3);
  assert.equal(metadata.articleText, [firstBody, secondBody, thirdBody].join('\n\n'));
  assert.doesNotMatch(metadata.articleText, /unrelated structured object/i);
  assert.equal(metadata.articleText.match(/Abdul Ballout/g)?.length, 1);
});

test('classifies a sparse BBC live path as live even when structured metadata is unavailable', () => {
  const metadata = extractPageMetadata(
    '<html><head><title>BBC Live coverage</title></head><body><nav><a href="/news">News</a></nav></body></html>',
    'https://www.bbc.com/news/live/cvgjnz67ymzt',
  );

  assert.equal(metadata.pageType, 'live_page');
  assert.equal(metadata.title, 'BBC Live coverage');
});

test('bounds long live coverage fairly so multiple entries contribute evidence', () => {
  const bodies = [
    `FIRST_ENTRY_EVIDENCE ${'alpha '.repeat(3000)}`,
    `SECOND_ENTRY_EVIDENCE ${'bravo '.repeat(3000)}`,
    `THIRD_ENTRY_EVIDENCE ${'charlie '.repeat(3000)}`,
  ];
  const metadata = extractPageMetadata(`<html><head>
    <title>Long live page</title>
    <meta name="description" content="Description remains separate from bounded article text.">
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'LiveBlogPosting',
      liveBlogUpdate: bodies.map((articleBody) => ({ '@type': 'BlogPosting', articleBody })),
    })}</script>
  </head></html>`);

  assert.equal(metadata.title, 'Long live page');
  assert.equal(metadata.description, 'Description remains separate from bounded article text.');
  assert.equal(metadata.articleBodyCount, 3);
  assert.equal(metadata.includedArticleBodyCount, 3);
  assert.ok(metadata.articleText.length <= MAX_ARTICLE_TEXT_LENGTH);
  assert.match(metadata.articleText, /FIRST_ENTRY_EVIDENCE/);
  assert.match(metadata.articleText, /SECOND_ENTRY_EVIDENCE/);
  assert.match(metadata.articleText, /THIRD_ENTRY_EVIDENCE/);
  assert.doesNotMatch(metadata.articleText, /\w…\w/);
});

test('uses HTML articles only when structured article content is unavailable', () => {
  const metadata = extractPageMetadata(`<html><head>
    <title>Fallback article page</title>
    <script type="application/ld+json">{
      "@type": "NewsArticle",
      "headline": "Fallback article page",
      "articleBody": "Structured article body."
    }</script>
  </head><body>
    <article>Structured article body.</article>
    <article>HTML-only duplicate representation.</article>
  </body></html>`);

  assert.equal(metadata.articleBodyCount, 1);
  assert.equal(metadata.includedArticleBodyCount, 1);
  assert.equal(metadata.articleText, 'Structured article body.');
});

test('uses only the strongest HTML article block when JSON-LD is unusable', () => {
  const metadata = extractPageMetadata(`<html><head><title>HTML live page</title></head><body>
    <script type="application/ld+json">{ broken </script>
    <article><p>First HTML update.</p></article>
    <article><p>Second HTML update.</p></article>
    <article><p> First HTML update. </p></article>
  </body></html>`);

  assert.equal(metadata.articleBodyCount, 1);
  assert.equal(metadata.includedArticleBodyCount, 1);
  assert.equal(metadata.articleText, 'Second HTML update.');
});

test('decodes named HTML entities in an Open Graph title', () => {
  const html = `<head>
    <meta
      property="og:title"
      content="Pendant la canicule du mois de juin, &quot;5 764 d&eacute;c&egrave;s en exc&egrave;s&quot; ont &eacute;t&eacute; recens&eacute;s, selon Sant&eacute; publique France"
    >
    <title>This title should not be used</title>
  </head>`;

  assert.equal(
    extractPageTitle(html),
    'Pendant la canicule du mois de juin, "5 764 décès en excès" ont été recensés, selon Santé publique France',
  );
});

test('decodes named and numeric entities in an HTML title', () => {
  const html = '<head><title>Caf&#233; &amp; thé à Nice, l&#39;été et la fa&ccedil;ade</title></head>';

  assert.equal(extractPageTitle(html), "Café & thé à Nice, l'été et la façade");
});

test('preserves real ampersands and decodes the extracted title only once', () => {
  const html = '<head><title>R&D and literal &amp;copy;</title></head>';

  assert.equal(extractPageTitle(html), 'R&D and literal &copy;');
});

test('normalizes AI concepts into precise phrases without weak or contained terms', async () => {
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.match(request.instructions, /3–6 monitoring concepts/);
    assert.match(request.instructions, /Do not summarize the article/);
    assert.equal(request.text.format.schema.properties.concepts.maxItems, 6);
    assert.equal(request.text.format.schema.properties.concepts.minItems, 0);
    assert.ok(
      request.text.format.schema.properties.concepts.items.properties.type.enum
        .includes('condition'),
    );
    assert.ok(
      request.text.format.schema.properties.concepts.items.properties.type.enum
        .includes('product_service'),
    );
    assert.equal(
      request.text.format.schema.properties.concepts.items.properties.type.enum
        .includes('supporting'),
      false,
    );
    const source = JSON.parse(request.input);
    assert.deepEqual(source, {
      title: 'Experience: I hunt for missing hikers in remote mountains',
      description: "A search-and-rescue account from Taiwan's mountains.",
      articleText: 'Petr Novotny searches for missing hikers across remote mountains in Taiwan.',
      author: 'Petr Novotny',
      slug: 'experience i hunt missing hikers remote mountains taiwan',
    });
    return {
      ok: true,
      json: async () => ({
        output: [{
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              watchTitle: 'Missing hikers in Taiwan',
              watchingFor: 'Monitor updates about the missing hikers in Taiwan.',
              storyFingerprint: [
                { label: 'Petr Novotny', type: 'person' },
                { label: 'Taiwan', type: 'location' },
                { label: 'Missing hikers', type: 'event' },
                { label: 'Search operation', type: 'event' },
              ],
              storyProfile: {
                primaryPeople: ['Petr Novotny'],
                otherPeople: [],
                peopleRoles: [],
                locations: ['Taiwan'],
                organizations: [],
                eventTypes: ['Search operation', 'Missing hikers'],
                distinctiveFacts: ['Remote mountains'],
                aliases: [],
                uncertaintyPhrases: [],
                storySummary: 'Petr Novotny searches for missing hikers in the remote mountains of Taiwan.',
              },
              description: 'Tracks precise developments about the story.',
            }),
          }],
        }],
      }),
    };
  };

  const suggestion = await generateWatchSuggestion({
    title: 'Experience: I hunt for missing hikers in remote mountains',
    description: "A search-and-rescue account from Taiwan's mountains.",
    articleText: 'Petr Novotny searches for missing hikers across remote mountains in Taiwan.',
    author: 'Petr Novotny',
    slug: 'experience i hunt missing hikers remote mountains taiwan',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl,
  });

  assert.deepEqual(
    suggestion.keywords,
    ['Petr Novotny', 'Taiwan', 'Missing hikers', 'Search operation'],
  );
  assert.deepEqual(
    suggestion.storyFingerprint,
    [
      { label: 'Petr Novotny', type: 'person' },
      { label: 'Taiwan', type: 'location' },
      { label: 'Missing hikers', type: 'event' },
      { label: 'Search operation', type: 'event' },
    ],
  );
  assert.deepEqual(suggestion.storyProfile.primaryPeople, ['Petr Novotny']);
});

test('concept proposal input is cleaned and deterministic validation rejects generic, unsupported and access concepts', async () => {
  let suppliedSource;
  const result = await generateWatchSuggestion({
    title: 'Une boulangerie visée par une fermeture administrative à Nice',
    subtitle: 'La police a contrôlé la boulangerie Azur.',
    description: 'La boulangerie Azur fait l’objet d’une fermeture administrative.',
    articleText: [
      'La boulangerie Azur, située à Nice, fait l’objet d’une fermeture administrative.',
      'Pourquoi s’abonner ? Je m’abonne. Regarder une publicité. Je me connecte.',
    ].join('\n\n'),
    publisher: 'Nice-Matin',
    publishedAt: '2026-08-06T08:00:00+02:00',
    language: 'fr',
    deterministicCandidates: [{ label: 'Fermeture administrative', type: 'event' }],
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      suppliedSource = JSON.parse(request.input);
      assert.match(request.instructions, /concept selection only/iu);
      assert.doesNotMatch(request.instructions, /build one structured story profile/iu);
      return createOpenAiResponse({
        concepts: [
          { label: 'Boulangerie Azur', type: 'organization', reason: 'The business named throughout the supplied evidence' },
          { label: 'Fermeture administrative', type: 'event', reason: 'The central administrative action' },
          { label: 'Nice', type: 'location', reason: 'The stated location' },
          { label: 'News', type: 'phenomenon', reason: 'A broad category' },
          { label: 'Pourquoi s’abonner', type: 'phenomenon', reason: 'Access copy' },
          { label: 'Marseille', type: 'location', reason: 'Not supported' },
        ],
        confidence: 0.86,
      });
    },
  });

  assert.doesNotMatch(JSON.stringify(suppliedSource), /Pourquoi s’abonner|Je m’abonne|publicité|connecte/iu);
  assert.deepEqual(result.concepts.map(({ label, type }) => ({ label, type })), [
    { label: 'Boulangerie Azur', type: 'organization' },
    { label: 'Fermeture administrative', type: 'event' },
    { label: 'Nice', type: 'location' },
  ]);
  assert.equal(result.confidence, 0.86);
});

test('the Odyssey contract favors a named work plus one concise non-overlapping event', async () => {
  const odysseySuggestion = {
    watchTitle: 'Leaked copies of The Odyssey circulate on X',
    watchingFor: 'Monitor unauthorized distribution of The Odyssey on X.',
    storyFingerprint: [
      { label: 'The Odyssey', type: 'work' },
      { label: 'Unauthorized release on X', type: 'event' },
    ],
    storyProfile: {
      primaryPeople: [],
      otherPeople: [],
      peopleRoles: [],
      locations: [],
      organizations: ['Universal Studios'],
      eventTypes: ['Unauthorized release'],
      distinctiveFacts: ['Universal Studios sought removal of leaked posts'],
      aliases: [],
      uncertaintyPhrases: [],
      storySummary: 'Copies and clips from The Odyssey circulated on X after the film had already earned $?6.',
    },
    description: 'Tracks unauthorized copies and clips from The Odyssey appearing on X.',
  };
  const suggestion = await generateWatchSuggestion({
    title: 'Leaked copies of Christopher Nolan film appear on X',
    description: 'Universal Studios is seeking removal of posts carrying copies and clips.',
    articleText: 'Unauthorized copies and clips from The Odyssey appeared on X.',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.match(request.instructions, /smallest complementary set/);
      assert.match(request.instructions, /concept selection only/);
      assert.ok(request.text.format.schema.properties.concepts.items.properties.type.enum.includes('work'));
      return createOpenAiResponse(odysseySuggestion);
    },
  });

  assert.deepEqual(suggestion.storyFingerprint, [
    { label: 'The Odyssey', type: 'work' },
    { label: 'Unauthorized release on X', type: 'event' },
  ]);
  assert.doesNotMatch(JSON.stringify(suggestion.storyFingerprint), /Universal Studios takedown|Unauthorized copy of The Odyssey/);
  assert.equal(
    suggestion.storyProfile.storySummary,
    'Copies and clips from The Odyssey circulated on X after the film had already earned an unspecified amount.',
  );
});

test('the server route returns a coherent perimenopause structured result with AI provenance', async () => {
  const result = await invokeSuggestionRoute({ fetchImpl: async () => createOpenAiResponse() });

  assert.equal(result.status, 200);
  assert.equal(result.body.analysisProvider, 'openai');
  assert.equal(result.body.analysisStatus, 'success');
  assert.equal(result.body.analysisModel, 'gpt-5.6-luna');
  assert.equal(result.body.fallbackReasonCode, null);
  assert.match(result.body.analyzedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(result.body.analysisDiagnosticId);
  assert.equal(result.body.storyProfile.storySummary, perimenopauseStructuredSuggestion.storyProfile.storySummary);
  assert.deepEqual(result.body.storyProfile.primaryPeople, []);
  assert.deepEqual(result.body.storyProfile.distinctiveFacts, perimenopauseStructuredSuggestion.storyProfile.distinctiveFacts);
  assert.deepEqual(result.body.storyFingerprint, [
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ]);
  assert.equal(
    result.body.storyFingerprint.some(({ label }) => (
      perimenopauseStructuredSuggestion.storyProfile.distinctiveFacts.includes(label)
    )),
    false,
  );
  assert.doesNotMatch(JSON.stringify(result.body), /Brain fog and four easy|Help fix/);
});

test('repairs an obvious terminal fragment without losing supported attribution', async () => {
  const suggestion = structuredClone(perimenopauseStructuredSuggestion);
  suggestion.storyProfile.storySummary = 'Johnson & Johnson faces a legal claim. J&J denies the allegations, v.';
  const result = await generateWatchSuggestion({
    title: 'Johnson & Johnson legal case',
    articleText: 'Johnson & Johnson faces a legal claim and denies the allegations.',
    apiKey: 'test-key',
    model: 'test-model',
    maxAttempts: 1,
    fetchImpl: async () => createOpenAiResponse(suggestion),
  });
  assert.equal(
    result.storyProfile.storySummary,
    'Johnson & Johnson faces a legal claim. J&J denies the allegations.',
  );
});

test('a valid AI profile with zero identifiers remains a successful analysis', async () => {
  const suggestion = await generateWatchSuggestion({
    title: 'Experts discuss concerns',
    articleText: 'The article contains context but no reliable reusable monitoring identifier.',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async () => createOpenAiResponse({
      ...perimenopauseStructuredSuggestion,
      watchTitle: 'Experts discuss concerns',
      storyFingerprint: [],
      storyProfile: {
        ...perimenopauseStructuredSuggestion.storyProfile,
        storySummary: 'The article discusses concerns without establishing a reliable reusable identifier.',
      },
    }),
  });

  assert.equal(suggestion.analysisStatus, 'success');
  assert.deepEqual(suggestion.storyFingerprint, []);
  assert.deepEqual(suggestion.keywords, []);
});

test('AI recommendations, quoted experts and uncertainty remain outside monitoring identifiers', async () => {
  const suggestion = await generateWatchSuggestion({
    title: 'Brain fog and four easy ways to help fix it',
    description: 'Why memory and concentration can change during perimenopause.',
    articleText: perimenopauseArticleText,
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async () => createOpenAiResponse({
      ...perimenopauseStructuredSuggestion,
      storyFingerprint: [
        { label: 'Perimenopause', type: 'condition' },
        { label: 'Brain fog', type: 'symptom' },
        { label: 'Dr. Tharaka', type: 'person' },
        { label: 'Short breaks', type: 'phenomenon' },
        { label: 'Calendars and reminders', type: 'phenomenon' },
        { label: 'Evidence remains uncertain', type: 'event' },
      ],
      storyProfile: {
        ...perimenopauseStructuredSuggestion.storyProfile,
        primaryPeople: [],
        otherPeople: ['Dr. Tharaka'],
        distinctiveFacts: [
          'Taking short breaks can provide a cognitive reset.',
          'Calendars and reminders may reduce mental load.',
        ],
        uncertaintyPhrases: ['The evidence remains uncertain and may vary between people.'],
      },
    }),
  });

  assert.deepEqual(suggestion.storyFingerprint, [
    { label: 'Perimenopause', type: 'condition' },
    { label: 'Brain fog', type: 'symptom' },
  ]);
  assert.deepEqual(suggestion.keywords, ['Perimenopause', 'Brain fog']);
  assert.deepEqual(suggestion.storyProfile.otherPeople, ['Dr. Tharaka']);
  assert.equal(suggestion.storyProfile.distinctiveFacts.length, 2);
  assert.equal(suggestion.storyProfile.uncertaintyPhrases.length, 1);
});

test('seven reference analyses retain only the smallest supported identifier set', async (t) => {
  const cases = [
    {
      name: 'Abdul Ballout and the Berlin Pride vehicle attack',
      summary: 'Reporting identifies Abdul Ballout as the suspect in the Berlin Pride vehicle attack while the alleged motive remains under investigation.',
      fingerprint: [
        { label: 'Abdul Ballout', type: 'person' },
        { label: 'Berlin, Germany', type: 'location' },
        { label: 'Berlin Pride vehicle attack', type: 'event' },
        { label: 'Kai Wegner', type: 'person' },
        { label: 'Berlin Pride van ramming likely', type: 'event' },
        { label: 'Suspected Islamist motive', type: 'event' },
      ],
      profile: {
        primaryPeople: ['Abdul Ballout'], otherPeople: ['Kai Wegner'],
        locations: ['Berlin, Germany'], events: ['Berlin Pride vehicle attack'],
        uncertaintyPhrases: ['Suspected Islamist motive'],
      },
      expected: [
        { label: 'Abdul Ballout', type: 'person' },
        { label: 'Berlin, Germany', type: 'location' },
        { label: 'Berlin Pride vehicle attack', type: 'event' },
      ],
    },
    {
      name: 'open-water swimming health risks',
      summary: 'The article examines health risks from open-water swimming, including sewage contamination, leptospirosis and toxic algae.',
      fingerprint: [
        { label: 'Open-water swimming', type: 'phenomenon' },
        { label: 'Sewage contamination', type: 'condition' },
        { label: 'Leptospirosis', type: 'condition' },
        { label: 'Toxic algae', type: 'condition' },
        { label: 'Wear a wetsuit', type: 'event' },
      ],
      profile: { phenomena: ['Open-water swimming'], conditions: ['Sewage contamination', 'Leptospirosis', 'Toxic algae'], distinctiveFacts: ['Wear a wetsuit when conditions require it'] },
      expected: [
        { label: 'Open-water swimming', type: 'phenomenon' },
        { label: 'Sewage contamination', type: 'condition' },
        { label: 'Leptospirosis', type: 'condition' },
        { label: 'Toxic algae', type: 'condition' },
      ],
    },
    {
      name: 'Bite of Seattle festival shooting',
      summary: 'Police investigated a shooting during the Bite of Seattle festival at Seattle Center without treating quoted witnesses as story subjects.',
      fingerprint: [
        { label: 'Bite of Seattle festival shooting', type: 'event' },
        { label: 'Seattle Center, Seattle, United States', type: 'location' },
        { label: 'Seattle Police Department', type: 'organization' },
        { label: 'Quoted festival witness', type: 'person' },
      ],
      profile: { primaryPeople: [], otherPeople: ['Quoted festival witness'], locations: ['Seattle Center, Seattle, United States'], organizations: ['Seattle Police Department'], events: ['Bite of Seattle festival shooting'] },
      expected: [
        { label: 'Bite of Seattle festival shooting', type: 'event' },
        { label: 'Seattle Center, Seattle, United States', type: 'location' },
        { label: 'Seattle Police Department', type: 'organization' },
      ],
    },
    {
      name: 'brain fog during perimenopause',
      summary: perimenopauseStructuredSuggestion.storyProfile.storySummary,
      fingerprint: [
        { label: 'Brain fog', type: 'symptom' },
        { label: 'Perimenopause', type: 'condition' },
        { label: 'Short breaks', type: 'phenomenon' },
        { label: 'Cognitive reset', type: 'phenomenon' },
        { label: 'Calendars and reminders', type: 'phenomenon' },
      ],
      profile: { symptoms: ['Brain fog'], conditions: ['Perimenopause'], distinctiveFacts: ['Short breaks can provide a cognitive reset', 'Calendars and reminders can reduce mental load'] },
      expected: [
        { label: 'Brain fog', type: 'symptom' },
        { label: 'Perimenopause', type: 'condition' },
      ],
    },
    {
      name: 'medical tourism in South Korea',
      summary: 'The article reports on medical tourism in South Korea and the services attracting international patients.',
      fingerprint: [
        { label: 'Medical tourism in South Korea', type: 'phenomenon' },
        { label: 'South Korea', type: 'person' },
        { label: 'South Korea', type: 'location' },
        { label: 'Becoming one', type: 'phenomenon' },
      ],
      profile: { primaryPeople: [], locations: ['South Korea'], phenomena: ['Medical tourism in South Korea'] },
      expected: [
        { label: 'Medical tourism in South Korea', type: 'phenomenon' },
        { label: 'South Korea', type: 'location' },
      ],
    },
    {
      name: 'birdwatching among young people',
      summary: 'The article describes growing interest in birdwatching among young people in San Francisco without promoting every quoted motivation.',
      fingerprint: [
        { label: 'Birdwatching among young people', type: 'phenomenon' },
        { label: 'San Francisco', type: 'location' },
        { label: 'A way to disconnect from screens', type: 'phenomenon' },
      ],
      profile: { locations: ['San Francisco'], phenomena: ['Birdwatching among young people'], distinctiveFacts: ['A way to disconnect from screens'] },
      expected: [
        { label: 'Birdwatching among young people', type: 'phenomenon' },
        { label: 'San Francisco', type: 'location' },
      ],
    },
    {
      name: 'US–Saudi conditional civil nuclear agreement',
      summary: 'The United States tied civil nuclear cooperation with Saudi Arabia to Saudi recognition of Israel, preserving the condition rather than presenting an unconditional agreement.',
      fingerprint: [
        { label: 'Saudi Arabia', type: 'location' },
        { label: 'US–Saudi civil nuclear agreement conditional on Saudi recognition of Israel', type: 'relationship' },
        { label: "Etats-Unis conditionnent l'accord", type: 'relationship' },
      ],
      profile: { locations: ['Saudi Arabia'], relationships: ['US–Saudi civil nuclear agreement conditional on Saudi recognition of Israel'], distinctiveFacts: ["Etats-Unis conditionnent l'accord"] },
      expected: [
        { label: 'Saudi Arabia', type: 'location' },
        { label: 'US–Saudi civil nuclear agreement conditional on Saudi recognition of Israel', type: 'relationship' },
      ],
    },
  ];

  for (const reference of cases) {
    await t.test(reference.name, async () => {
      const suggestion = await generateWatchSuggestion({
        title: reference.name,
        articleText: reference.summary,
        apiKey: 'test-key',
        model: 'test-model',
        fetchImpl: async () => createOpenAiResponse({
          watchTitle: reference.name,
          watchingFor: `Monitor ${reference.name}.`,
          description: `Tracks ${reference.name}.`,
          storyFingerprint: reference.fingerprint,
          storyProfile: {
            primaryPeople: [], otherPeople: [], peopleRoles: [], locations: [], organizations: [], eventTypes: [],
            distinctiveFacts: [], aliases: [], uncertaintyPhrases: [], works: [], productsServices: [], events: [],
            relationships: [], phenomena: [], conditions: [], symptoms: [],
            ...reference.profile,
            storySummary: reference.summary,
          },
        }),
      });
      assert.equal(suggestion.storyProfile.storySummary, reference.summary);
      assert.deepEqual(suggestion.storyFingerprint, reference.expected);
      assert.deepEqual(suggestion.keywords, reference.expected.map(({ label }) => label));
      assert.ok(suggestion.storyFingerprint.length >= 2 && suggestion.storyFingerprint.length <= 5);
      assert.equal(suggestion.storyFingerprint.some(({ type }) => ['supporting', 'fact'].includes(type)), false);
    });
  }
});

test('legacy fact output is contextualized instead of becoming an automatic identifier', async () => {
  const suggestion = await generateWatchSuggestion({
    title: 'Company announces plans',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async () => createOpenAiResponse({
      ...perimenopauseStructuredSuggestion,
      storyFingerprint: [{ label: 'Company announces plans', type: 'supporting' }],
      storyProfile: {
        ...perimenopauseStructuredSuggestion.storyProfile,
        distinctiveFacts: [],
      },
    }),
  });

  assert.deepEqual(suggestion.storyFingerprint, []);
  assert.deepEqual(suggestion.storyProfile.distinctiveFacts, ['Company announces plans']);
});

test('structured analysis failures receive stable safe reason codes', async (t) => {
  const cases = [
    {
      name: 'missing API key',
      expected: 'configuration_missing',
      run: () => generateWatchSuggestion({ title: 'Article', model: 'test-model' }),
    },
    {
      name: 'OpenAI HTTP failure',
      expected: 'provider_rate_limited',
      run: () => generateWatchSuggestion({
        title: 'Article', apiKey: 'secret-test-key', model: 'test-model',
        maxAttempts: 1,
        fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'sensitive provider detail' } }) }),
      }),
    },
    {
      name: 'provider authentication failure',
      expected: 'provider_auth_error',
      run: () => generateWatchSuggestion({
        title: 'Article', apiKey: 'secret-test-key', model: 'test-model',
        maxAttempts: 1,
        fetchImpl: async () => ({ ok: false, status: 401 }),
      }),
    },
    {
      name: 'provider network failure',
      expected: 'provider_network_error',
      run: () => generateWatchSuggestion({
        title: 'Article', apiKey: 'secret-test-key', model: 'test-model',
        maxAttempts: 1,
        fetchImpl: async () => { throw new TypeError('network failed'); },
      }),
    },
    {
      name: 'timeout',
      expected: 'provider_timeout',
      run: () => generateWatchSuggestion({
        title: 'Article', apiKey: 'secret-test-key', model: 'test-model',
        maxAttempts: 1,
        fetchImpl: async () => { throw new DOMException('timed out', 'TimeoutError'); },
      }),
    },
    {
      name: 'malformed structured JSON',
      expected: 'provider_json_invalid',
      run: () => generateWatchSuggestion({
        title: 'Article', apiKey: 'secret-test-key', model: 'test-model',
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ output: [{ content: [{ type: 'output_text', text: '{not-json' }] }] }),
        }),
      }),
    },
    {
      name: 'schema validation failure',
      expected: 'application_validation_failed',
      run: () => generateWatchSuggestion({
        title: 'Article', apiKey: 'secret-test-key', model: 'test-model',
        fetchImpl: async () => createOpenAiResponse({ ...perimenopauseStructuredSuggestion, watchTitle: '' }),
      }),
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await assert.rejects(scenario.run, (error) => {
        assert.ok(error instanceof ArticleAnalysisError);
        assert.equal(error.code, scenario.expected);
        assert.doesNotMatch(error.message, /secret-test-key|sensitive provider detail/);
        return true;
      });
    });
  }
});

test('distinguishes incomplete, truncated, refused, missing and malformed provider output', async (t) => {
  const cases = [
    {
      name: 'truncated output',
      expected: 'provider_output_truncated',
      result: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] },
    },
    {
      name: 'other incomplete output',
      expected: 'provider_incomplete',
      result: { status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [] },
    },
    {
      name: 'refusal',
      expected: 'provider_refusal',
      result: { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'not returned' }] }] },
    },
    {
      name: 'missing output',
      expected: 'provider_output_missing',
      result: { status: 'completed', output: [] },
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await assert.rejects(generateWatchSuggestion({
        title: 'Article', apiKey: 'test-key', model: 'test-model', maxAttempts: 1,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => scenario.result }),
      }), (error) => error.code === scenario.expected);
    });
  }
  await assert.rejects(generateWatchSuggestion({
    title: 'Article', apiKey: 'test-key', model: 'test-model', maxAttempts: 1,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('raw body'); } }),
  }), (error) => error.code === 'provider_envelope_invalid');
});

test('reports safe field-level schema and application validation details', async () => {
  await assert.rejects(generateWatchSuggestion({
    title: 'Article', apiKey: 'test-key', model: 'test-model', maxAttempts: 1,
    fetchImpl: async () => createOpenAiResponse({
      watchingFor: 'Monitor this article.',
      storyFingerprint: [],
      storyProfile: { storySummary: 'This summary is long enough to pass semantic validation.' },
      description: 'Tracks this article.',
    }),
  }), (error) => {
    assert.equal(error.code, 'provider_schema_invalid');
    assert.deepEqual(error.validation, {
      stage: 'structured_schema', path: 'watchTitle', rule: 'required',
      description: 'A required top-level field was missing.',
    });
    return true;
  });
  await assert.rejects(generateWatchSuggestion({
    title: 'Article', apiKey: 'test-key', model: 'test-model', maxAttempts: 1,
    fetchImpl: async () => createOpenAiResponse({ ...perimenopauseStructuredSuggestion, description: '' }),
  }), (error) => {
    assert.equal(error.code, 'application_validation_failed');
    assert.equal(error.validation.path, 'description');
    assert.equal(error.validation.rule, 'non_empty');
    return true;
  });
});

test('accepts empty optional categories and Unicode punctuation in a valid structured response', async () => {
  const unicodeSuggestion = {
    ...perimenopauseStructuredSuggestion,
    watchTitle: 'L’expérience d’Anaïs',
    storyFingerprint: [
      { label: 'L’expérience d’Anaïs', type: 'event' },
      { label: 'Brouillard cérébral', type: 'symptom' },
    ],
    storyProfile: {
      storySummary: 'L’expérience d’Anaïs décrit un brouillard cérébral pendant la périménopause.',
      primaryPeople: [], otherPeople: [], peopleRoles: [], locations: [], organizations: [],
      eventTypes: [], distinctiveFacts: [], aliases: [], uncertaintyPhrases: [],
      works: [], productsServices: [], events: [], relationships: [], phenomena: [],
      conditions: [], symptoms: ['Brouillard cérébral'],
    },
  };
  const suggestion = await generateWatchSuggestion({
    title: unicodeSuggestion.watchTitle, apiKey: 'test-key', model: 'test-model',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.max_output_tokens, 600);
      assert.ok(request.text.format.schema.properties.concepts.items.properties.reason);
      return createOpenAiResponse(unicodeSuggestion);
    },
  });
  assert.deepEqual(suggestion.storyFingerprint, unicodeSuggestion.storyFingerprint);
  assert.deepEqual(suggestion.storyProfile.works, []);
});

test('retries one transient failure, reports attempts and preserves successful AI provenance', async () => {
  let calls = 0;
  const delays = [];
  const events = [];
  const suggestion = await generateWatchSuggestion({
    title: 'Article', apiKey: 'test-key', model: 'test-model',
    retryDelayMs: 10, randomImpl: () => 0, sleepImpl: async (delay) => { delays.push(delay); },
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new DOMException('timed out', 'TimeoutError');
      return createOpenAiResponse();
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [10]);
  assert.equal(suggestion.analysisStatus, 'success');
  assert.equal(suggestion.analysisProvider, 'openai');
  assert.deepEqual(events.filter(({ stage }) => stage === 'provider_attempt').map(({ attempt, outcomeCode, retryScheduled }) => ({ attempt, outcomeCode, retryScheduled })), [
    { attempt: 1, outcomeCode: 'provider_timeout', retryScheduled: true },
    { attempt: 2, outcomeCode: 'success', retryScheduled: false },
  ]);
});

test('bounds retries and never retries malformed structured output', async () => {
  let transientCalls = 0;
  await assert.rejects(generateWatchSuggestion({
    title: 'Article', apiKey: 'test-key', model: 'test-model',
    retryDelayMs: 0, randomImpl: () => 0, sleepImpl: async () => {},
    fetchImpl: async () => { transientCalls += 1; throw new TypeError('network'); },
  }), (error) => error.code === 'provider_network_error');
  assert.equal(transientCalls, 2);

  let invalidCalls = 0;
  await assert.rejects(generateWatchSuggestion({
    title: 'Article', apiKey: 'test-key', model: 'test-model',
    fetchImpl: async () => { invalidCalls += 1; return { ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: 'output_text', text: '{bad' }] }] }) }; },
  }), (error) => error.code === 'provider_json_invalid');
  assert.equal(invalidCalls, 1);
});

test('provider timeout aborts the active request and caller abort is not retried', async () => {
  let timeoutSignal;
  await assert.rejects(generateWatchSuggestion({
    title: 'Article', apiKey: 'test-key', model: 'test-model', maxAttempts: 1,
    providerTimeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      timeoutSignal = signal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }), (error) => error.code === 'provider_timeout');
  assert.equal(timeoutSignal.aborted, true);

  const controller = new AbortController();
  let calls = 0;
  const pending = generateWatchSuggestion({
    title: 'Article', apiKey: 'test-key', model: 'test-model', signal: controller.signal,
    retryDelayMs: 0, sleepImpl: async () => {},
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      calls += 1;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  controller.abort(new DOMException('caller left', 'AbortError'));
  await assert.rejects(pending, (error) => error.code === 'provider_request_aborted' && error.aborted);
  assert.equal(calls, 1);
});

test('a server route error returns safe provenance without provider or secret detail', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await invokeSuggestionRoute({
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'provider raw response' } }),
      }),
      maxAttempts: 1,
    });
    assert.equal(result.status, 502);
    assert.equal(result.body.error, 'AI article analysis was unavailable.');
    assert.equal(result.body.analysisProvider, 'openai');
    assert.equal(result.body.analysisStatus, 'failed');
    assert.equal(result.body.analysisModel, null);
    assert.equal(result.body.fallbackReasonCode, 'provider_http_error');
    assert.ok(result.body.analysisDiagnosticId);
    assert.doesNotMatch(JSON.stringify(result.body), /provider raw response|test-key/);
  } finally {
    console.warn = originalWarn;
  }
});

test('the server route reports missing Preview configuration without attempting OpenAI', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  let attempted = false;
  try {
    const result = await invokeSuggestionRoute({
      apiKey: '',
      fetchImpl: async () => { attempted = true; return createOpenAiResponse(); },
    });
    assert.equal(attempted, false);
    assert.equal(result.status, 503);
    assert.equal(result.body.analysisStatus, 'failed');
    assert.equal(result.body.fallbackReasonCode, 'configuration_missing');
  } finally {
    console.warn = originalWarn;
  }
});
