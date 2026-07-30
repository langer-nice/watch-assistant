import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMonitoringSource,
  requestMonitoringSource,
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
