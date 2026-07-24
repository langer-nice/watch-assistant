import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPageMetadata,
  extractPageTitle,
  generateWatchSuggestion,
} from './url-watch-api.js';

const guardianUrl = 'https://www.theguardian.com/lifeandstyle/2026/jul/24/experience-i-hunt-missing-hikers-remote-mountains-taiwan';

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
  assert.equal(metadata.sourceUrl, guardianUrl);
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
    assert.match(request.instructions, /Build a Story Fingerprint/);
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
                { label: 'Remote mountains', type: 'supporting' },
                { label: 'Petr Novotny', type: 'person' },
                { label: 'Hikers', type: 'event' },
                { label: 'Missing hikers', type: 'event' },
                { label: 'Search operation', type: 'event' },
                { label: 'Taiwan', type: 'location' },
              ],
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
    ['Petr Novotny', 'Taiwan', 'Missing hikers', 'Search operation', 'Remote mountains'],
  );
  assert.deepEqual(
    suggestion.storyFingerprint,
    [
      { label: 'Petr Novotny', type: 'person' },
      { label: 'Taiwan', type: 'location' },
      { label: 'Missing hikers', type: 'event' },
      { label: 'Search operation', type: 'event' },
      { label: 'Remote mountains', type: 'supporting' },
    ],
  );
});
