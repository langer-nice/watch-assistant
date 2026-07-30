import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  createMonitoringSourceMiddleware,
  createNewsSearchFeedUrl,
  discoverTextMonitoringSource,
} from './monitoring-source-api.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const validFeed = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>US–Iran strikes - Google News</title>
  <link>https://news.google.com/search?q=US-Iran</link>
  <item><guid>one</guid><title>US and Iran exchange strikes - BBC News</title>
  <link>https://example.com/story</link><description>A reported development.</description></item>
</channel></rss>`;

test('builds a deterministic public news-search feed without special-casing story or publication', () => {
  const url = new URL(createNewsSearchFeedUrl('US–Iran strikes BBC News', 'en'));
  assert.equal(url.origin, 'https://news.google.com');
  assert.equal(url.pathname, '/rss/search');
  assert.equal(url.searchParams.get('q'), 'US–Iran strikes BBC News');
  assert.equal(url.searchParams.get('ceid'), 'GB:en');
  assert.throws(() => createNewsSearchFeedUrl(''), /valid Watch request/i);
});

test('discovers and returns a supported source only after the feed is fetched and parsed', async () => {
  const requestedUrls = [];
  const result = await discoverTextMonitoringSource({
    request: 'US–Iran strikes BBC News',
    language: 'en',
  }, {
    lookup: publicLookup,
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      return new Response(validFeed, {
        headers: { 'content-type': 'application/rss+xml' },
      });
    },
  });

  assert.equal(requestedUrls.length, 1);
  assert.equal(result.monitoringSource.url, createNewsSearchFeedUrl('US–Iran strikes BBC News'));
  assert.deepEqual(result.monitoringSource, {
    url: result.monitoringSource.url,
    type: 'rss',
    title: 'US–Iran strikes - Google News',
    discovery: 'news-search',
  });
});

test('unsupported or malformed discovery results fail safely instead of returning a source', async () => {
  await assert.rejects(discoverTextMonitoringSource({ request: 'Unsupported source' }, {
    lookup: publicLookup,
    fetchImpl: async () => new Response('<html>not a feed</html>', {
      headers: { 'content-type': 'text/html' },
    }),
  }), (error) => (
    error.code === 'NO_COMPATIBLE_SOURCE'
    && error.statusCode === 422
    && !error.message.includes('HTML')
  ));
});

test('discovery middleware validates input and exposes no upstream details', async () => {
  const call = async (body) => {
    const request = Readable.from([body]);
    request.method = 'POST';
    request.url = '/api/monitoring-source';
    let responseBody = '';
    const response = {
      setHeader() {},
      end(value) { responseBody = value; },
    };
    await createMonitoringSourceMiddleware({
      lookup: publicLookup,
      fetchImpl: async () => { throw new Error('private upstream detail'); },
    })(request, response);
    return { status: response.statusCode, body: JSON.parse(responseBody) };
  };

  assert.deepEqual(await call('{bad json'), {
    status: 400,
    body: { code: 'INVALID_BODY', error: 'The request must be valid JSON.' },
  });
  assert.deepEqual(await call(JSON.stringify({ request: 'US–Iran strikes' })), {
    status: 422,
    body: {
      code: 'NO_COMPATIBLE_SOURCE',
      error: 'No supported public monitoring source could be found.',
    },
  });
});
