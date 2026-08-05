import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createBodaccMonitoringSource, parseCompanyWatchRequest } from '../src/js/company-watch-request.js';
import { createNewsSearchFeedUrl } from './monitoring-source-api.js';
import { discoverMonitoringSource } from './url-watch-api.js';
import { planWatch } from './watch-planner.js';

const SCHEMA_KEYS = [
  'strategy',
  'connector',
  'country',
  'identifier',
  'confidence',
  'needsClarification',
  'clarificationQuestion',
];

const rssDiscovery = async () => ({
  monitoringSource: {
    url: 'https://example.com/feed.xml',
    type: 'rss',
    title: 'Example feed',
    discovery: 'automatic',
  },
});

const noDiscovery = async () => {
  throw new Error('No supported source');
};

test('plans a valid French company with the existing SIREN detection', async () => {
  assert.deepEqual(await planWatch('Monitor company SIREN 905266524'), {
    strategy: 'official_company',
    connector: 'bodacc',
    country: 'FR',
    identifier: '905266524',
    confidence: 1,
    needsClarification: false,
    clarificationQuestion: null,
  });
});

test('recognizes English and French Monaco company requests without implementing RCI', async () => {
  for (const request of ['Monitor Monaco company', 'Surveille société Monaco']) {
    assert.deepEqual(await planWatch(request), {
      strategy: 'official_company',
      connector: 'rci_monaco',
      country: 'MC',
      identifier: null,
      confidence: 0.7,
      needsClarification: true,
      clarificationQuestion: 'What is the company name or registration number?',
    });
  }
});

test('chooses one RSS strategy when existing discovery finds a structured source', async () => {
  assert.deepEqual(await planWatch('Monitor climate policy updates', {
    discoverSource: rssDiscovery,
  }), {
    strategy: 'structured_source',
    connector: 'rss',
    country: null,
    identifier: null,
    confidence: 0.8,
    needsClarification: false,
    clarificationQuestion: null,
  });
});

test('falls back to one web strategy when existing RSS discovery finds no source', async () => {
  assert.deepEqual(await planWatch('Monitor climate policy updates', {
    discoverSource: noDiscovery,
  }), {
    strategy: 'web_search',
    connector: 'web_ai',
    country: null,
    identifier: null,
    confidence: 0.5,
    needsClarification: false,
    clarificationQuestion: null,
  });
});

test('returns a complete unknown decision for empty and ambiguous company requests', async () => {
  const empty = await planWatch('');
  const ambiguous = await planWatch('Monitor company');

  assert.deepEqual(empty, {
    strategy: 'unknown',
    connector: null,
    country: null,
    identifier: null,
    confidence: 0,
    needsClarification: true,
    clarificationQuestion: 'What would you like to monitor?',
  });
  assert.deepEqual(ambiguous, {
    ...empty,
    clarificationQuestion: 'What is the 9-digit SIREN for this company?',
  });
});

test('every planning outcome has the same stable schema and numeric confidence', async () => {
  const outcomes = await Promise.all([
    planWatch('Monitor company 905266524'),
    planWatch('Monitor Monaco company'),
    planWatch('Monitor energy news', { discoverSource: rssDiscovery }),
    planWatch('Monitor energy news', { discoverSource: noDiscovery }),
    planWatch(null),
  ]);

  outcomes.forEach((outcome) => {
    assert.deepEqual(Object.keys(outcome), SCHEMA_KEYS);
    assert.equal(typeof outcome.confidence, 'number');
    assert.equal(Array.isArray(outcome.strategy), false);
  });
});

test('existing Company, RSS, URL, and Watch creation entry points remain unchanged', async () => {
  const navigation = await readFile(new URL('../src/js/navigation.js', import.meta.url), 'utf8');
  const company = parseCompanyWatchRequest('Monitor company 905266524');
  const source = createBodaccMonitoringSource(company.siren);
  const feedUrl = new URL(createNewsSearchFeedUrl('Climate policy', 'en'));
  const urlSource = await discoverMonitoringSource(
    '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
    'https://example.com/story',
    { validateUrl: async (url) => new URL(url) },
  );

  assert.equal(source.type, 'bodacc');
  assert.equal(source.siren, '905266524');
  assert.equal(feedUrl.pathname, '/rss/search');
  assert.equal(urlSource.url, 'https://example.com/feed.xml');
  assert.doesNotMatch(navigation, /plan-watch|planWatch/);
  assert.match(navigation, /parseCompanyWatchRequest\(request\)/);
  assert.match(navigation, /requestMonitoringSource\(selectedRequest/);
  assert.match(navigation, /resolveUrlMonitoringSource\(analysis/);
});

