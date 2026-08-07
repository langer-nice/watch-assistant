import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BODACC_PAGE_LIMIT,
  BodaccError,
  classifyBodaccBusinessEvent,
  createBodaccRequestUrl,
  fetchBodaccAnnouncements,
  normalizeBodaccAnnouncement,
  normalizeSiren,
} from './bodacc-api.js';

const VALID_SIREN = '552005969';
const CHECKED_AT = '2026-08-04T08:00:00.000Z';

const announcement = (overrides = {}) => ({
  id: 'B202600693010',
  dateparution: '2026-04-10',
  familleavis: 'modification',
  familleavis_lib: 'Modifications diverses',
  commercant: 'CEMEX GRANULATS',
  tribunal: 'Greffe du Tribunal de Commerce de Créteil',
  modificationsgenerales: JSON.stringify({
    descriptif: 'Modification survenue sur le capital.',
  }),
  url_complete: 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B202600693010',
  ...overrides,
});

const jsonResponse = (body, { status = 200 } = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('normalizes a valid SIREN and constructs an exact first-page request', () => {
  assert.equal(normalizeSiren('552 005 969'), VALID_SIREN);
  assert.equal(normalizeSiren(552005969), VALID_SIREN);

  const url = createBodaccRequestUrl('552 005 969');
  assert.equal(url.origin, 'https://bodacc-datadila.opendatasoft.com');
  assert.equal(
    url.pathname,
    '/api/explore/v2.1/catalog/datasets/annonces-commerciales/records',
  );
  assert.equal(url.searchParams.get('refine'), `registre:"${VALID_SIREN}"`);
  assert.equal(url.searchParams.get('order_by'), 'dateparution desc,id desc');
  assert.equal(url.searchParams.get('limit'), String(BODACC_PAGE_LIMIT));
  assert.equal(url.searchParams.get('offset'), '0');
});

test('rejects malformed and checksum-invalid SIRENs with a structured error', () => {
  for (const value of ['', '12345678', '1234567890', 'abcdefghi', '123456789', null]) {
    assert.throws(() => normalizeSiren(value), (error) => {
      assert.ok(error instanceof BodaccError);
      assert.equal(error.code, 'INVALID_SIREN');
      assert.equal(error.statusCode, 400);
      assert.deepEqual(error.toJSON(), {
        code: 'INVALID_SIREN',
        error: error.clientMessage,
      });
      return true;
    });
  }
});

test('normalizes a valid BODACC response into the monitoring item format', async () => {
  let requestedUrl;
  let requestedOptions;
  const result = await fetchBodaccAnnouncements(VALID_SIREN, {
    now: () => new Date(CHECKED_AT),
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return jsonResponse({ total_count: 1, results: [announcement()] });
    },
  });

  assert.equal(requestedUrl.searchParams.get('refine'), `registre:"${VALID_SIREN}"`);
  assert.equal(requestedOptions.method, 'GET');
  assert.equal(requestedOptions.redirect, 'error');
  assert.equal(requestedOptions.headers.Accept, 'application/json');
  assert.deepEqual(result, {
    source: { title: 'BODACC', url: 'https://www.bodacc.fr/' },
    checkedAt: CHECKED_AT,
    items: [{
      id: 'B202600693010',
      sirens: [],
      eventType: 'unknown_change',
      title: 'Modifications diverses · CEMEX GRANULATS',
      url: 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B202600693010',
      publishedAt: '2026-04-10T00:00:00.000Z',
      source: 'BODACC',
      author: 'Greffe du Tribunal de Commerce de Créteil',
      excerpt: 'Modification survenue sur le capital.',
    }],
  });
});

test('returns a successful empty monitoring result when BODACC has no announcements', async () => {
  const result = await fetchBodaccAnnouncements(VALID_SIREN, {
    now: () => new Date(CHECKED_AT),
    fetchImpl: async () => jsonResponse({ total_count: 0, results: [] }),
  });

  assert.equal(result.checkedAt, CHECKED_AT);
  assert.deepEqual(result.items, []);
});

test('rejects malformed JSON and malformed response structures safely', async (context) => {
  await context.test('invalid JSON', async () => {
    await assert.rejects(fetchBodaccAnnouncements(VALID_SIREN, {
      fetchImpl: async () => new Response('{not-json', { status: 200 }),
    }), (error) => error instanceof BodaccError
      && error.code === 'MALFORMED_RESPONSE'
      && error.statusCode === 502);
  });

  for (const body of [
    null,
    {},
    { total_count: 0 },
    { total_count: -1, results: [] },
    { total_count: 1, results: {} },
    { total_count: 1, results: [{ dateparution: '2026-04-10' }] },
  ]) {
    await context.test(`invalid structure: ${JSON.stringify(body)}`, async () => {
      await assert.rejects(fetchBodaccAnnouncements(VALID_SIREN, {
        fetchImpl: async () => jsonResponse(body),
      }), (error) => error instanceof BodaccError && error.code === 'MALFORMED_RESPONSE');
    });
  }
});

test('times out a stalled BODACC request with a structured error', async () => {
  await assert.rejects(fetchBodaccAnnouncements(VALID_SIREN, {
    timeoutMs: 5,
    fetchImpl: async () => new Promise(() => {}),
  }), (error) => {
    assert.ok(error instanceof BodaccError);
    assert.equal(error.code, 'TIMEOUT');
    assert.equal(error.statusCode, 504);
    assert.deepEqual(error.toJSON(), {
      code: 'TIMEOUT',
      error: 'The BODACC request timed out.',
    });
    return true;
  });
});

test('maps an upstream HTTP failure without exposing its response body', async () => {
  await assert.rejects(fetchBodaccAnnouncements(VALID_SIREN, {
    fetchImpl: async () => new Response('private upstream detail', { status: 503 }),
  }), (error) => {
    assert.ok(error instanceof BodaccError);
    assert.equal(error.code, 'UPSTREAM_ERROR');
    assert.equal(error.statusCode, 502);
    assert.doesNotMatch(error.clientMessage, /private upstream detail/);
    return true;
  });
});

test('normalizes category-specific details defensively and rejects invalid records', () => {
  assert.deepEqual(normalizeBodaccAnnouncement(announcement({
    id: 'C202601399890',
    dateparution: '2026-07-24',
    familleavis_lib: 'Dépôts des comptes',
    commercant: 'Example &amp; Company',
    tribunal: null,
    modificationsgenerales: null,
    depot: '{"typeDepot":"Comptes annuels et rapports","dateCloture":"2025-12-31"}',
    url_complete: 'https://unofficial.example/announcement',
  })), {
    id: 'C202601399890',
    sirens: [],
    eventType: 'accounts_filed',
    title: 'Dépôts des comptes · Example & Company',
    url: null,
    publishedAt: '2026-07-24T00:00:00.000Z',
    source: 'BODACC',
    author: null,
    excerpt: 'Comptes annuels et rapports · clôture 2025-12-31',
  });

  assert.throws(
    () => normalizeBodaccAnnouncement(announcement({ id: null })),
    (error) => error instanceof BodaccError && error.code === 'MALFORMED_RESPONSE',
  );
});

test('normalizes the official registry SIRENs used to verify publication ownership', () => {
  assert.deepEqual(normalizeBodaccAnnouncement(announcement({
    registre: ['905329314', '905 329 314'],
  })).sirens, ['905329314']);
});

test('classifies official BODACC fields into conservative business events', () => {
  const cases = [
    ['company_created', {
      familleavis: 'creation',
      acte: { creation: { categorieCreation: 'Immatriculation d’une personne morale' } },
    }],
    ['company_dissolved', {
      familleavis: 'modification',
      modificationsgenerales: { descriptif: 'Dissolution de la société.' },
    }],
    ['director_change', {
      familleavis: 'modification',
      modificationsgenerales: { descriptif: 'Modification survenue sur l’administration.' },
    }],
    ['capital_increase', {
      familleavis: 'modification',
      modificationsgenerales: { descriptif: 'Modification du capital : augmentation.' },
    }],
    ['capital_reduction', {
      familleavis: 'modification',
      modificationsgenerales: { descriptif: 'Réduction du capital social.' },
    }],
    ['accounts_filed', {
      familleavis: 'dpc',
      depot: { typeDepot: 'Comptes annuels et rapports' },
    }],
    ['registered_office_change', {
      familleavis: 'modification',
      modificationsgenerales: { descriptif: 'Transfert du siège social.' },
    }],
    ['judicial_liquidation', {
      familleavis: 'collective',
      jugement: {
        famille: 'Jugement d’ouverture',
        nature: 'Jugement d’ouverture de liquidation judiciaire',
      },
    }],
    ['receivership', {
      familleavis: 'collective',
      jugement: {
        famille: 'Jugement d’ouverture',
        nature: 'Jugement d’ouverture d’une procédure de redressement judiciaire',
      },
    }],
    ['judicial_proceedings', {
      familleavis: 'collective',
      jugement: {
        famille: 'Jugement d’ouverture',
        nature: 'Jugement d’ouverture d’une procédure de sauvegarde',
      },
    }],
    ['business_sale', {
      familleavis: 'vente',
      acte: { vente: { categorieVente: 'Achat d’un établissement principal' } },
    }],
    ['company_struck_off', {
      familleavis: 'radiation',
      radiationaurcs: { commentaire: 'Radiation d’office' },
    }],
    ['unknown_change', {
      familleavis: 'modification',
      modificationsgenerales: { descriptif: 'Modification survenue sur l’activité.' },
    }],
  ];

  for (const [eventType, fields] of cases) {
    assert.equal(classifyBodaccBusinessEvent(fields), eventType);
    assert.equal(normalizeBodaccAnnouncement(announcement(fields)).eventType, eventType);
  }
});

test('does not choose one ordinary event when an announcement contains several', () => {
  assert.equal(classifyBodaccBusinessEvent({
    familleavis: 'modification',
    modificationsgenerales: {
      descriptif: 'Transfert du siège social et modification de l’administration.',
    },
  }), 'unknown_change');
});

test('does not describe a plan or closure judgement as a newly opened proceeding', () => {
  for (const jugement of [
    {
      famille: 'Extrait de jugement',
      nature: 'Jugement de plan de redressement',
      complementJugement: 'Jugement arrêtant le plan de redressement judiciaire.',
    },
    {
      famille: 'Jugement de clôture',
      nature: 'Jugement de clôture pour insuffisance d’actif',
      complementJugement: 'Clôture de la procédure de liquidation judiciaire.',
    },
  ]) {
    assert.equal(classifyBodaccBusinessEvent({
      familleavis: 'collective',
      jugement,
    }), 'unknown_change');
  }
});
