import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMonitoringSource,
  requestMonitoringSource,
  resolveUrlMonitoringSource,
} from './watch-source-discovery.js';
import { createWatchCheckController } from './watch-monitoring.js';

test('a normal Watch receives, persists, and reuses an automatically discovered source', async () => {
  const discovered = await requestMonitoringSource('US–Iran strikes BBC News', {
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), {
        request: 'US–Iran strikes BBC News',
        language: 'en',
      });
      return new Response(JSON.stringify({
        monitoringSource: {
          url: 'https://news.google.com/rss/search?q=US-Iran',
          type: 'rss',
          title: 'News search',
          discovery: 'news-search',
        },
      }), { status: 200 });
    },
  });
  let watch = {
    id: 'watch-discovered-source',
    monitoringSource: discovered,
    feedUrl: discovered.url,
    status: 'watching',
  };
  let checkedUrl = '';
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch: (_id, changes) => {
      watch = { ...watch, ...changes };
      return watch;
    },
    requestCheck: async (url) => {
      checkedUrl = url;
      return { checkedAt: '2026-07-30T12:00:00.000Z', items: [] };
    },
  });

  await controller.check(watch.id);
  assert.equal(checkedUrl, discovered.url);
  assert.equal(watch.monitoringSource.discovery, 'news-search');
  assert.equal(watch.lastCheckAttempt.status, 'succeeded');
});

test('empty and malformed discovered source data remains safe', async () => {
  assert.equal(normalizeMonitoringSource(null), null);
  assert.equal(normalizeMonitoringSource({}), null);
  assert.equal(normalizeMonitoringSource({ url: 'file:///tmp/feed' }), null);
  await assert.rejects(requestMonitoringSource('unsupported', {
    fetchImpl: async () => new Response(JSON.stringify({
      code: 'NO_COMPATIBLE_SOURCE',
    }), { status: 422 }),
  }), (error) => error.code === 'NO_COMPATIBLE_SOURCE');
});

test('URL review reuses the webpage-discovered source without a second request', async () => {
  const monitoringSource = {
    url: 'https://example.com/feed.xml',
    type: 'atom',
    title: 'Example updates',
    discovery: 'html-alternate',
  };
  const analysis = await resolveUrlMonitoringSource({
    status: 'success',
    sourceTitle: 'Example article',
    source: 'Example',
    monitoringSource,
  }, {
    fetchImpl: async () => {
      assert.fail('an already validated webpage feed must not trigger fallback discovery');
    },
  });

  assert.deepEqual(analysis.monitoringSource, monitoringSource);
});

test('BBC News analysis receives one validated source before the successful review', async () => {
  const requests = [];
  const analysis = await resolveUrlMonitoringSource({
    status: 'success',
    sourceTitle: 'Brain fog and four easy ways to help fix it',
    source: 'BBC News',
    sourceUrl: 'https://www.bbc.com/news/articles/c87ydw7xdxvo',
    monitoringSource: null,
  }, {
    language: 'en',
    fetchImpl: async (path, options) => {
      requests.push({ path, options });
      return new Response(JSON.stringify({
        monitoringSource: {
          url: 'https://news.google.com/rss/search?q=Brain+fog+BBC+News',
          type: 'rss',
          title: 'Brain fog BBC News - Google News',
          discovery: 'news-search',
        },
      }), { status: 200 });
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/api/monitoring-source');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    request: 'Brain fog and four easy ways to help fix it BBC News',
    language: 'en',
  });
  assert.equal(analysis.sourceUrl, 'https://www.bbc.com/news/articles/c87ydw7xdxvo');
  assert.equal(analysis.monitoringSource.discovery, 'news-search');
  assert.match(analysis.monitoringSource.url, /^https:\/\/news\.google\.com\/rss\/search/);
});

test('aborted URL source discovery does not become an unsupported-source failure', async () => {
  const abortError = new DOMException('The operation was aborted.', 'AbortError');
  await assert.rejects(resolveUrlMonitoringSource({
    sourceTitle: 'BBC article',
    source: 'BBC News',
  }, {
    fetchImpl: async () => { throw abortError; },
  }), (error) => error === abortError);
});
