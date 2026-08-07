import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompanyDirectoryError,
  createCompanyDirectoryUrl,
  fetchCompanyIdentity,
  normalizeAdministrativeStatus,
  normalizeCompanyDirectoryResponse,
} from './company-directory-api.js';

const SIREN = '905266524';
const responseBody = (overrides = {}) => ({
  results: [{
    siren: SIREN,
    nom_complet: 'EXAMPLE COMPANY',
    nom_raison_sociale: 'EXAMPLE COMPANY SAS',
    etat_administratif: 'A',
    ...overrides,
  }],
  total_results: 1,
});

test('looks up a SIREN through the official Recherche d’Entreprises endpoint', async () => {
  const requests = [];
  const result = await fetchCompanyIdentity(SIREN, {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(responseBody()));
    },
  });

  assert.equal(createCompanyDirectoryUrl(SIREN).href, `https://recherche-entreprises.api.gouv.fr/search?q=${SIREN}`);
  assert.equal(requests[0].url.href, createCompanyDirectoryUrl(SIREN).href);
  assert.equal(requests[0].options.method, 'GET');
  assert.deepEqual(result, {
    siren: SIREN,
    officialName: 'EXAMPLE COMPANY',
    administrativeStatus: 'active',
    rawStatus: 'A',
    source: 'recherche-entreprises',
  });
});

test('maps active and ceased administrative states without inferring other statuses', () => {
  assert.deepEqual(normalizeAdministrativeStatus('A'), {
    administrativeStatus: 'active', rawStatus: 'A',
  });
  assert.deepEqual(normalizeAdministrativeStatus('C'), {
    administrativeStatus: 'ceased', rawStatus: 'C',
  });
  assert.deepEqual(normalizeAdministrativeStatus('liquidation'), {
    administrativeStatus: 'unknown', rawStatus: 'LIQUIDATION',
  });
});

test('normalizes a ceased company and preserves the official raw status', () => {
  assert.equal(
    normalizeCompanyDirectoryResponse(responseBody({ etat_administratif: 'C' }), SIREN)
      .administrativeStatus,
    'ceased',
  );
});

test('returns null when the requested company is missing', () => {
  assert.equal(normalizeCompanyDirectoryResponse({ results: [] }, SIREN), null);
  assert.equal(normalizeCompanyDirectoryResponse(responseBody({ siren: '552005969' }), SIREN), null);
});

test('rejects malformed directory responses', () => {
  for (const value of [null, {}, { results: null }]) {
    assert.throws(
      () => normalizeCompanyDirectoryResponse(value, SIREN),
      (error) => error instanceof CompanyDirectoryError && error.code === 'MALFORMED_RESPONSE',
    );
  }
});

test('times out a stalled directory request', async () => {
  await assert.rejects(fetchCompanyIdentity(SIREN, {
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
    timeoutMs: 5,
  }), (error) => error instanceof CompanyDirectoryError && error.code === 'TIMEOUT');
});

test('maps connector HTTP and network failures to safe structured errors', async () => {
  await assert.rejects(fetchCompanyIdentity(SIREN, {
    fetchImpl: async () => new Response('private detail', { status: 503 }),
  }), (error) => error instanceof CompanyDirectoryError && error.code === 'UPSTREAM_ERROR');
  await assert.rejects(fetchCompanyIdentity(SIREN, {
    fetchImpl: async () => { throw new Error('private network detail'); },
  }), (error) => (
    error instanceof CompanyDirectoryError
    && error.code === 'NETWORK_ERROR'
    && !error.message.includes('private')
  ));
});
