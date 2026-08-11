import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMediaMentionRequest } from './media-mention-request.js';

const cases = [
  ['Tell me when Elon Musk is mentioned in the media.', 'Elon Musk', 'en'],
  ['Let me know whenever SpaceX appears in the news.', 'SpaceX', 'en'],
  ['Notify me when OpenAI Europe is mentioned in the press.', 'OpenAI Europe', 'en'],
  ['Watch for media mentions of David Lang Design Monaco', 'David Lang Design Monaco', 'en'],
  ['Monitor news mentions of Acme Corporation French Riviera', 'Acme Corporation French Riviera', 'en'],
  ['Dis-moi quand Elon Musk est mentionné dans les médias.', 'Elon Musk', 'fr'],
  ['Dis-moi quand Bernard Arnault apparaît dans les médias.', 'Bernard Arnault', 'fr'],
  ['Préviens-moi quand LVMH est mentionné dans la presse.', 'LVMH', 'fr'],
  ["Informe-moi si OpenAI apparaît dans l'actualité.", 'OpenAI', 'fr'],
  ['Surveille les mentions de David Lang Design Monaco dans les médias.', 'David Lang Design Monaco', 'fr'],
];

test('extracts intact subjects from explicit English and French media-mention requests', () => {
  for (const [request, query, language] of cases) {
    assert.deepEqual(parseMediaMentionRequest(request), {
      recognized: true,
      query,
      language,
      subjects: [query],
      matchMode: 'all',
    }, request);
  }
});

test('splits only explicit plural coordinated subjects and preserves co-occurrence intent', () => {
  assert.deepEqual(
    parseMediaMentionRequest('Tell me when Elon Musk and Tesla are mentioned in the media.'),
    {
      recognized: true,
      query: 'Elon Musk and Tesla',
      language: 'en',
      subjects: ['Elon Musk', 'Tesla'],
      matchMode: 'all',
    },
  );
  assert.deepEqual(
    parseMediaMentionRequest('Tell me when Elon Musk & Tesla are mentioned in the media.'),
    {
      recognized: true,
      query: 'Elon Musk & Tesla',
      language: 'en',
      subjects: ['Elon Musk', 'Tesla'],
      matchMode: 'all',
    },
  );
  assert.deepEqual(
    parseMediaMentionRequest('Dis-moi quand Elon Musk et Tesla sont mentionnés dans les médias.'),
    {
      recognized: true,
      query: 'Elon Musk et Tesla',
      language: 'fr',
      subjects: ['Elon Musk', 'Tesla'],
      matchMode: 'all',
    },
  );
});

test('does not split singular organization or possessive names containing conjunction language', () => {
  for (const query of [
    'Research and Development Holdings',
    'Marks and Spencer',
    'Procter and Gamble',
    'Elon Musk\'s Tesla',
  ]) {
    const parsed = parseMediaMentionRequest(`Tell me when ${query} is mentioned in the media.`);
    assert.equal(parsed.query, query);
    assert.deepEqual(parsed.subjects, [query]);
  }
});

test('does not force ambiguous or non-mention requests through subject extraction', () => {
  for (const request of [
    'Tell me when something important happens in AI.',
    'Keep me updated about artificial intelligence.',
    'Monitor technology news.',
    'Tell me when something is mentioned in the media.',
    'Tell me when Elon Musk or Tesla is mentioned in the media.',
    'Tell me when Elon Musk and maybe Tesla are mentioned in the media.',
    'Tell me when they are mentioned in the media.',
  ]) {
    assert.deepEqual(parseMediaMentionRequest(request), {
      recognized: false,
      query: null,
      language: null,
      subjects: [],
      matchMode: null,
    }, request);
  }
});
