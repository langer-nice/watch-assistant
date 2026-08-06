import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMediaStoryPublisher,
  normalizeMediaStoryUrl,
  parseMediaStoryRequest,
} from './media-story-request.js';

const supported = [
  ['https://www.bbc.com/news/articles/example', 'BBC News'],
  ['https://edition.cnn.com/2026/08/06/world/example', 'CNN'],
  ['https://www.reuters.com/world/europe/example-2026-08-06/', 'Reuters'],
  ['https://www.lemonde.fr/international/article/2026/08/06/example.html', 'Le Monde'],
  ['https://www.franceinfo.fr/monde/example_1234567.html', 'Franceinfo'],
  ['https://www.francetvinfo.fr/monde/example_1234567.html', 'Francetvinfo'],
  ['https://www.theguardian.com/world/2026/aug/06/example', 'The Guardian'],
  ['https://www.nytimes.com/2026/08/06/world/example.html', 'The New York Times'],
  ['https://www.bbc.co.uk/news/world-12345678', 'BBC News'],
  ['https://www.bbc.com/sport/football/articles/example', 'BBC News'],
];

test('reuses the supported publisher lookup for Media Story URL recognition', () => {
  for (const [url, publisher] of supported) {
    assert.deepEqual(parseMediaStoryRequest(url), {
      recognized: true,
      url: normalizeMediaStoryUrl(url),
      publisher,
    });
    assert.equal(getMediaStoryPublisher(url), publisher);
  }
});

test('generic, RSS, homepage, and malformed URLs are not Media Story requests', () => {
  for (const url of [
    'https://example.com/article',
    'https://www.bbc.com/',
    'https://www.bbc.com/rss/news.xml',
    'https://www.lemonde.fr/flux-rss',
    'not a URL',
  ]) {
    assert.equal(parseMediaStoryRequest(url).recognized, false);
  }
});
