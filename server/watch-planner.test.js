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

test('plans a valid standalone SIREN identically to sentence-based Company requests', async () => {
  const requests = [
    '905266524',
    'Watch 905266524',
    'Company 905266524',
    'Monitor company 905266524',
  ];
  const plans = await Promise.all(requests.map((request) => planWatch(request, {
    companyOnly: true,
  })));

  plans.forEach((plan) => assert.deepEqual(plan, {
    strategy: 'official_company',
    connector: 'bodacc',
    country: 'FR',
    identifier: '905266524',
    confidence: 1,
    needsClarification: false,
    clarificationQuestion: null,
  }));
});

test('plans a company name plus SIREN without requiring a monitoring verb', async () => {
  const requests = [
    ['CEMEX GRANULATS 552005969', '552005969'],
    ['PALAIS SEGURANE 905329314', '905329314'],
    ['LPM MAX BAREL 905266524', '905266524'],
    ['LE GARIBALDI 849703772', '849703772'],
    ['Watch LE GARIBALDI 849703772', '849703772'],
    ['Monitor PALAIS SEGURANE 905329314', '905329314'],
    ['Surveille CEMEX GRANULATS 552005969', '552005969'],
  ];

  for (const [request, identifier] of requests) {
    assert.deepEqual(await planWatch(request, { companyOnly: true }), {
      strategy: 'official_company',
      connector: 'bodacc',
      country: 'FR',
      identifier,
      confidence: 1,
      needsClarification: false,
      clarificationQuestion: null,
    });
  }
});

test('plans supported Media Story URLs without running source discovery', async () => {
  const requests = [
    'https://www.bbc.com/news/articles/example',
    'https://edition.cnn.com/2026/08/06/world/example',
    'https://www.reuters.com/world/europe/example-2026-08-06/',
    'https://www.lemonde.fr/international/article/2026/08/06/example.html',
    'https://www.franceinfo.fr/monde/example_1234567.html',
  ];

  for (const request of requests) {
    assert.deepEqual(await planWatch(request, {
      companyOnly: true,
      includeMediaStory: true,
      discoverSource: async () => assert.fail('Media planning must not run RSS discovery.'),
    }), {
      strategy: 'media_story',
      connector: 'media_story',
      country: null,
      identifier: request,
      confidence: 0.9,
      needsClarification: false,
      clarificationQuestion: null,
    });
  }
});

test('migration scope leaves RSS and generic URLs on the existing route', async () => {
  for (const request of [
    'https://www.bbc.com/rss/news.xml',
    'https://example.com/article',
  ]) {
    assert.deepEqual(await planWatch(request, {
      companyOnly: true,
      includeMediaStory: true,
      discoverSource: async () => assert.fail('Migration scope must not run RSS discovery.'),
    }), {
      strategy: 'web_search',
      connector: 'web_ai',
      country: null,
      identifier: null,
      confidence: 0.5,
      needsClarification: false,
      clarificationQuestion: null,
    });
  }
});

test('legacy Company-only Planner scope does not claim Media Story URLs', async () => {
  assert.deepEqual(await planWatch('https://www.bbc.com/news/articles/example', {
    companyOnly: true,
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

test('does not plan invalid or random standalone numbers as French companies', async () => {
  for (const request of ['123456789', '905266525', '12345678', '1234567890']) {
    const plan = await planWatch(request, { companyOnly: true });
    assert.equal(plan.strategy, 'web_search');
    assert.equal(plan.connector, 'web_ai');
  }
});

test('does not plan ambiguous identifiers or URL requests as French companies', async () => {
  const requests = [
    'Monitor company SIREN 552005969 and SIREN 732829320',
    'Monitor SIRET 55200596900018',
    'https://example.com/552005969',
    'https://example.com/rss/552005969.xml',
    'https://news.example.com/story/552005969',
  ];

  for (const request of requests) {
    const plan = await planWatch(request, { companyOnly: true });
    assert.notEqual(plan.strategy, 'official_company');
    assert.notEqual(plan.connector, 'bodacc');
  }
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
    planWatch('https://www.bbc.com/news/articles/example'),
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

test('existing RSS, URL, and Watch creation implementations remain in place', async () => {
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
  assert.match(navigation, /requestWatchPlan\(request\)/);
  assert.match(navigation, /requestMonitoringSource\(selectedRequest/);
  assert.match(navigation, /resolveUrlMonitoringSource\(analysis/);
});
