import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  createCheckWatchMiddleware,
  fetchAndNormalizeFeed,
  MAX_EXCERPT_LENGTH,
  MAX_FEED_BYTES,
  MAX_ITEMS,
  parseFeedXml,
} from './check-watch-api.js';
import {
  createPinnedLookup,
  isPublicIpAddress,
  resolvePublicUrl,
  validatePublicUrl,
} from './public-url-security.js';

const fixture = async (name) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const fixedNow = () => new Date('2026-07-26T08:00:00.000Z');

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  end(value = '') {
    this.body = value ? JSON.parse(value) : null;
  },
});

const callMiddleware = async ({ method = 'POST', body, options = {} } = {}) => {
  const request = Readable.from(body === undefined ? [] : [body]);
  request.url = '/api/check-watch';
  request.method = method;
  const response = createResponse();
  await createCheckWatchMiddleware({ lookup: publicLookup, ...options })(
    request,
    response,
    () => assert.fail('The endpoint should have handled the request.'),
  );
  return response;
};

test('parses and normalizes a valid RSS feed', async () => {
  const result = parseFeedXml(await fixture('valid-rss.xml'), {
    sourceUrl: 'https://news.example.com/feed.xml',
  });

  assert.deepEqual(result.source, {
    title: 'Example & World News',
    url: 'https://news.example.com/',
  });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], {
    id: 'story-001',
    title: 'First world & climate update',
    url: 'https://news.example.com/stories/first',
    publishedAt: '2026-07-24T12:30:00.000Z',
    source: 'Example & World News',
    author: 'Alex Example',
    excerpt: 'A detailed summary with safe text.',
  });
  assert.equal(result.items[1].url, 'https://news.example.com/stories/second');
  assert.equal(result.items[1].id, 'https://news.example.com/stories/second');
  assert.equal(result.items[1].publishedAt, null);
  assert.equal(result.items[1].source, 'Partner Desk');
});

test('parses and normalizes a valid Atom feed', async () => {
  const result = parseFeedXml(await fixture('valid-atom.xml'), {
    sourceUrl: 'https://atom.example.com/feed.xml',
  });

  assert.deepEqual(result.source, {
    title: 'Example Atom Feed',
    url: 'https://atom.example.com/',
  });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], {
    id: 'tag:atom.example.com,2026:first',
    title: 'Atom & entry',
    url: 'https://atom.example.com/articles/first',
    publishedAt: '2026-07-25T08:30:00.000Z',
    source: 'Example Atom Feed',
    author: 'Jamie Example',
    excerpt: 'A clean Atom summary.',
  });
  assert.match(result.items[1].id, /^generated:[a-f0-9]{64}$/);
  assert.equal(result.items[1].publishedAt, null);
  assert.equal(
    result.items[1].id,
    parseFeedXml(await fixture('valid-atom.xml'), {
      sourceUrl: 'https://atom.example.com/feed.xml',
    }).items[1].id,
  );
});

test('limits output to 20 items and truncates titles and excerpts', () => {
  const items = Array.from({ length: 25 }, (_, index) => `
    <item>
      <guid>item-${index}</guid>
      <title>${'T'.repeat(350)}</title>
      <description>${'E'.repeat(MAX_EXCERPT_LENGTH + 50)}</description>
    </item>`).join('');
  const result = parseFeedXml(`<rss><channel><title>Large feed</title>${items}</channel></rss>`, {
    sourceUrl: 'https://example.com/feed.xml',
  });
  assert.equal(result.items.length, MAX_ITEMS);
  assert.equal(result.items[0].title.length, 300);
  assert.equal(result.items[0].excerpt.length, MAX_EXCERPT_LENGTH);
});

test('rejects malformed XML, non-feed XML, feeds without items, and doctypes', async () => {
  const malformed = await fixture('malformed.xml');
  const notAFeed = await fixture('not-a-feed.xml');
  const emptyFeed = await fixture('empty-rss.xml');
  assert.throws(() => parseFeedXml(''), /feed is empty/i);
  assert.throws(() => parseFeedXml('<!DOCTYPE rss><rss><channel><item/></channel></rss>'), /not supported/i);
  assert.throws(() => parseFeedXml(malformed), /malformed/i);
  assert.throws(() => parseFeedXml(notAFeed), /not an RSS or Atom feed/i);
  assert.throws(() => parseFeedXml(emptyFeed), /does not contain any items/i);
});

test('classifies public, private, reserved, loopback, link-local, and IPv6 addresses', () => {
  assert.equal(isPublicIpAddress('93.184.216.34'), true);
  assert.equal(isPublicIpAddress('10.0.0.1'), false);
  assert.equal(isPublicIpAddress('127.0.0.1'), false);
  assert.equal(isPublicIpAddress('169.254.1.2'), false);
  assert.equal(isPublicIpAddress('192.0.2.1'), false);
  assert.equal(isPublicIpAddress('::1'), false);
  assert.equal(isPublicIpAddress('fe80::1'), false);
  assert.equal(isPublicIpAddress('2001:db8::1'), false);
  assert.equal(isPublicIpAddress('2606:2800:220:1:248:1893:25c8:1946'), true);
});

test('rejects forbidden protocols, credentials, localhost, local names, and private DNS results', async () => {
  await assert.rejects(validatePublicUrl('file:///etc/passwd', { lookup: publicLookup }), /HTTP and HTTPS/i);
  await assert.rejects(validatePublicUrl('https://user:pass@example.com/feed', { lookup: publicLookup }), /credentials/i);
  await assert.rejects(validatePublicUrl('http://localhost/feed', { lookup: publicLookup }), /Local URLs/i);
  await assert.rejects(validatePublicUrl('http://intranet/feed', { lookup: publicLookup }), /Local URLs/i);
  await assert.rejects(validatePublicUrl('http://printer.local/feed', { lookup: publicLookup }), /Local URLs/i);
  await assert.rejects(validatePublicUrl('http://10.0.0.1/feed'), /public address/i);
  await assert.rejects(validatePublicUrl('https://example.com/feed', {
    lookup: async () => [{ address: '192.168.1.2', family: 4 }],
  }), /public address/i);
});

test('pins connections to the public addresses approved during validation', async () => {
  let resolutionCount = 0;
  const destination = await resolvePublicUrl('https://example.com/feed', {
    lookup: async () => {
      resolutionCount += 1;
      return [{ address: '93.184.216.34', family: 4 }];
    },
  });
  const pinnedLookup = createPinnedLookup(destination.addresses);
  const selected = await new Promise((resolve, reject) => {
    pinnedLookup('example.com', { family: 4 }, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });

  assert.equal(resolutionCount, 1);
  assert.deepEqual(selected, { address: '93.184.216.34', family: 4 });
  assert.throws(
    () => createPinnedLookup([{ address: '127.0.0.1', family: 4 }]),
    /could not be resolved/i,
  );
});

test('revalidates redirects and blocks a redirect to a private address', async () => {
  const fetchImpl = async () => new Response(null, {
    status: 302,
    headers: { location: 'http://127.0.0.1/private-feed' },
  });
  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    fetchImpl,
    lookup: async (hostname) => [{
      address: hostname === '127.0.0.1' ? '127.0.0.1' : '93.184.216.34',
      family: 4,
    }],
  }), /public address/i);

  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { location: 'http://[invalid-address' },
    }),
    lookup: publicLookup,
  }), (error) => error.code === 'INVALID_REDIRECT');
});

test('resolves and validates every public redirect hop', async () => {
  const resolvedHosts = [];
  const requestedUrls = [];
  const xml = await fixture('valid-rss.xml');
  const result = await fetchAndNormalizeFeed('https://example.com/feed', {
    lookup: async (hostname) => {
      resolvedHosts.push(hostname);
      return [{ address: '93.184.216.34', family: 4 }];
    },
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      return requestedUrls.length === 1
        ? new Response(null, {
          status: 302,
          headers: { location: 'https://feeds.example.net/world.xml' },
        })
        : new Response(xml, { headers: { 'content-type': 'application/rss+xml' } });
    },
  });

  assert.deepEqual(resolvedHosts, ['example.com', 'feeds.example.net']);
  assert.deepEqual(requestedUrls, [
    'https://example.com/feed',
    'https://feeds.example.net/world.xml',
  ]);
  assert.equal(result.items.length, 2);
});

test('enforces one total fetch timeout', async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
      once: true,
    });
  });
  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    fetchImpl,
    lookup: publicLookup,
    timeoutMs: 10,
  }), /timed out/i);
});

test('limits redirects and maps upstream network failures', async () => {
  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    lookup: publicLookup,
    maxRedirects: 1,
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { location: 'https://example.com/next' },
    }),
  }), /redirected too many times/i);
  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    lookup: publicLookup,
    fetchImpl: async () => {
      throw new Error('socket failure with server details');
    },
  }), (error) => (
    error.code === 'NETWORK_ERROR'
    && error.clientMessage === 'The feed could not be fetched.'
  ));
});

test('rejects oversized, incompatible, HTML, and empty upstream responses', async () => {
  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    lookup: publicLookup,
    maxFeedBytes: 20,
    fetchImpl: async () => new Response('<rss><channel><item/></channel></rss>', {
      headers: { 'content-type': 'application/rss+xml' },
    }),
  }), /too large/i);
  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    lookup: publicLookup,
    fetchImpl: async () => new Response('binary', {
      headers: { 'content-type': 'application/octet-stream' },
    }),
  }), /not an RSS or Atom feed/i);
  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    lookup: publicLookup,
    fetchImpl: async () => new Response('<html><body>Not a feed</body></html>', {
      headers: { 'content-type': 'text/plain' },
    }),
  }), /not an RSS or Atom feed/i);
  await assert.rejects(fetchAndNormalizeFeed('https://example.com/feed', {
    lookup: publicLookup,
    fetchImpl: async () => new Response('', {
      headers: { 'content-type': 'application/xml' },
    }),
  }), /not an RSS or Atom feed/i);
  assert.ok(MAX_FEED_BYTES >= 1024 * 1024);
});

test('returns a normalized response without making an OpenAI request', async () => {
  const requestedUrls = [];
  const xml = await fixture('valid-rss.xml');
  const result = await fetchAndNormalizeFeed('https://news.example.com/feed.xml', {
    lookup: publicLookup,
    now: fixedNow,
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      return new Response(xml, { headers: { 'content-type': 'application/rss+xml' } });
    },
  });
  assert.equal(result.checkedAt, '2026-07-26T08:00:00.000Z');
  assert.equal(result.items.length, 2);
  assert.deepEqual(requestedUrls, ['https://news.example.com/feed.xml']);
  assert.equal(requestedUrls.some((url) => url.includes('api.openai.com')), false);
});

test('middleware rejects non-POST methods and invalid JSON bodies', async () => {
  const methodResponse = await callMiddleware({ method: 'GET' });
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.allow, 'POST');

  const invalidJsonResponse = await callMiddleware({ body: '{not json' });
  assert.equal(invalidJsonResponse.statusCode, 400);
  assert.deepEqual(invalidJsonResponse.body, {
    code: 'INVALID_JSON',
    error: 'The request body must be valid JSON.',
  });

  const arrayResponse = await callMiddleware({ body: '[]' });
  assert.equal(arrayResponse.statusCode, 400);
  assert.deepEqual(arrayResponse.body, {
    code: 'INVALID_BODY',
    error: 'The request body must be a JSON object.',
  });
});

test('middleware validates sourceUrl and returns generic URL errors', async () => {
  const missingResponse = await callMiddleware({ body: '{}' });
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, {
    code: 'MISSING_SOURCE_URL',
    error: 'sourceUrl is required.',
  });

  const wrongTypeResponse = await callMiddleware({ body: '{"sourceUrl":42}' });
  assert.equal(wrongTypeResponse.statusCode, 400);
  assert.deepEqual(wrongTypeResponse.body, {
    code: 'INVALID_SOURCE_URL',
    error: 'sourceUrl must be a string.',
  });

  const emptyResponse = await callMiddleware({ body: '{"sourceUrl":"   "}' });
  assert.equal(emptyResponse.statusCode, 400);
  assert.deepEqual(emptyResponse.body, {
    code: 'INVALID_SOURCE_URL',
    error: 'sourceUrl is invalid.',
  });

  const forbiddenProtocolResponse = await callMiddleware({
    body: '{"sourceUrl":"file:///etc/passwd"}',
  });
  assert.equal(forbiddenProtocolResponse.statusCode, 400);
  assert.deepEqual(forbiddenProtocolResponse.body, {
    code: 'INVALID_PROTOCOL',
    error: 'sourceUrl is not allowed.',
  });

  const localResponse = await callMiddleware({ body: '{"sourceUrl":"http://localhost/feed"}' });
  assert.equal(localResponse.statusCode, 400);
  assert.deepEqual(localResponse.body, {
    code: 'LOCAL_HOST',
    error: 'sourceUrl is not allowed.',
  });
  assert.equal(JSON.stringify(localResponse.body).includes('127.0.0.1'), false);
});

test('middleware limits request bodies and maps DNS failures safely', async () => {
  const largeResponse = await callMiddleware({ body: `{"sourceUrl":"https://example.com/${'a'.repeat(5000)}"}` });
  assert.equal(largeResponse.statusCode, 413);

  const longUrlResponse = await callMiddleware({
    body: `{"sourceUrl":"https://example.com/${'a'.repeat(2100)}"}`,
  });
  assert.equal(longUrlResponse.statusCode, 400);
  assert.deepEqual(longUrlResponse.body, {
    code: 'INVALID_SOURCE_URL',
    error: 'sourceUrl is invalid.',
  });

  const dnsResponse = await callMiddleware({
    body: '{"sourceUrl":"https://missing.example/feed"}',
    options: {
      lookup: async () => {
        throw new Error('getaddrinfo ENOTFOUND internal-detail');
      },
    },
  });
  assert.equal(dnsResponse.statusCode, 502);
  assert.deepEqual(dnsResponse.body, {
    code: 'DNS_FAILURE',
    error: 'The feed could not be fetched.',
  });
  assert.equal(JSON.stringify(dnsResponse.body).includes('internal-detail'), false);
});

test('middleware exposes safe structured source failure codes without upstream detail', async () => {
  for (const [status, code, error] of [
    [401, 'ACCESS_DENIED', 'The monitoring source denied access.'],
    [403, 'ACCESS_DENIED', 'The monitoring source denied access.'],
    [404, 'SOURCE_NOT_FOUND', 'The monitoring source could not be found.'],
    [410, 'SOURCE_NOT_FOUND', 'The monitoring source could not be found.'],
  ]) {
    const upstreamResponse = await callMiddleware({
      body: '{"sourceUrl":"https://example.com/source"}',
      options: {
        fetchImpl: async () => new Response('private upstream detail', { status }),
      },
    });
    assert.equal(upstreamResponse.statusCode, 502);
    assert.deepEqual(upstreamResponse.body, { code, error });
    assert.equal(JSON.stringify(upstreamResponse.body).includes('private upstream detail'), false);
  }
});
