import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activateWatchMonitoring,
  applyFeedCheckResult,
  createWatchCheckController,
  matchFeedItemToWatch,
  MonitoringCheckError,
  requestCompanyCheck,
  requestFeedCheck,
} from './watch-monitoring.js';
import {
  createExistingCompanyEditAnalysis,
  getPreservedCompanyEditChanges,
} from './company-watch-edit.js';

const SIREN = '552005969';
const CHECKED_AT = '2026-08-04T08:00:00.000Z';
const BODACC_SOURCE = {
  type: 'bodacc',
  provider: 'dila',
  siren: SIREN,
  title: 'BODACC',
  discovery: 'official-company',
};

const bodaccItem = (id, title = `Announcement ${id}`) => ({
  id,
  sirens: [SIREN],
  title,
  url: `https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:${id}`,
  publishedAt: '2026-08-04T00:00:00.000Z',
  source: 'BODACC',
  author: 'Greffe du Tribunal de Commerce',
  excerpt: `Official publication ${id}`,
});

const bodaccResponse = (ids, checkedAt = CHECKED_AT) => ({
  source: { title: 'BODACC', url: 'https://www.bodacc.fr/' },
  checkedAt,
  items: ids.map((id) => bodaccItem(id)),
});

const createCompanyController = ({ initialWatch, responses = [], requestCompany } = {}) => {
  let watch = initialWatch || {
    id: 'company-watch',
    inputType: 'company',
    status: 'watching',
    monitoringState: 'preparing',
    monitoringSource: BODACC_SOURCE,
  };
  const companyRequests = [];
  const controller = createWatchCheckController({
    getWatch: () => watch,
    saveWatch: (_id, changes) => {
      watch = { ...watch, ...changes };
      return watch;
    },
    requestCheck: async () => { throw new Error('RSS request must not be used'); },
    requestCompany: requestCompany || (async (siren) => {
      companyRequests.push(siren);
      return responses.shift();
    }),
    now: () => new Date(CHECKED_AT),
  });
  return {
    controller,
    companyRequests,
    getWatch: () => watch,
    saveWatch: (_id, changes) => {
      watch = { ...watch, ...changes };
      return watch;
    },
  };
};

test('company and RSS requests dispatch to their dedicated endpoints', async () => {
  const requests = [];
  const fetchImpl = async (path, options) => {
    requests.push({ path, options });
    return { ok: true, json: async () => bodaccResponse([]) };
  };

  await requestCompanyCheck(SIREN, { fetchImpl });
  await requestFeedCheck('https://example.com/feed.xml', { fetchImpl });

  assert.equal(requests[0].path, '/api/check-company');
  assert.deepEqual(JSON.parse(requests[0].options.body), { siren: SIREN });
  assert.equal(requests[1].path, '/api/check-watch');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    sourceUrl: 'https://example.com/feed.xml',
  });
});

test('company checks accept only normalized directory identity for the requested SIREN', async () => {
  const result = await requestCompanyCheck(SIREN, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        ...bodaccResponse([]),
        company: {
          siren: SIREN,
          officialName: 'OFFICIAL COMPANY',
          administrativeStatus: 'active',
          rawStatus: 'A',
          source: 'recherche-entreprises',
        },
      }),
    }),
  });

  assert.deepEqual(result.company, {
    siren: SIREN,
    officialName: 'OFFICIAL COMPANY',
    administrativeStatus: 'active',
    rawStatus: 'A',
    source: 'recherche-entreprises',
  });
});

test('BODACC activation creates a baseline and repeated checks add exactly one stable Update', async () => {
  const lifecycle = createCompanyController({
    responses: [
      bodaccResponse(['A']),
      bodaccResponse(['A'], '2026-08-04T09:00:00.000Z'),
      bodaccResponse(['B', 'A'], '2026-08-04T10:00:00.000Z'),
      bodaccResponse(['B', 'A'], '2026-08-04T11:00:00.000Z'),
    ],
  });

  const activation = await activateWatchMonitoring('company-watch', {
    checkController: lifecycle.controller,
    saveWatch: lifecycle.saveWatch,
  });
  assert.equal(activation.outcome, 'baseline');
  assert.deepEqual(lifecycle.getWatch().monitoringSnapshot.itemIds, ['A']);
  assert.deepEqual(lifecycle.getWatch().updates || [], []);
  assert.deepEqual(lifecycle.companyRequests, [SIREN]);

  assert.equal((await lifecycle.controller.check('company-watch')).outcome, 'no-new-items');
  const changed = await lifecycle.controller.check('company-watch');
  assert.equal(changed.outcome, 'matching-items');
  assert.deepEqual(changed.matchedItems.map(({ id }) => id), ['B']);
  assert.deepEqual(lifecycle.getWatch().updates.map(({ id }) => id), ['B']);

  assert.equal((await lifecycle.controller.check('company-watch')).outcome, 'no-new-items');
  assert.deepEqual(lifecycle.getWatch().updates.map(({ id }) => id), ['B']);
  assert.deepEqual(lifecycle.companyRequests, [SIREN, SIREN, SIREN, SIREN]);
});

test('Check Now still uses BODACC after a same-SIREN Company edit', async () => {
  const beforeEdit = {
    id: 'edited-company-watch',
    inputType: 'company',
    request: `Monitor company ${SIREN}`,
    title: 'EXAMPLE COMPANY',
    company: { siren: SIREN, name: 'EXAMPLE COMPANY', status: 'active' },
    monitoringSource: BODACC_SOURCE,
    monitoringSnapshot: { itemIds: ['A'], items: [bodaccItem('A')], checkedAt: CHECKED_AT },
    seenMonitoringItemIds: ['A'],
    updates: [],
  };
  const editedWatch = {
    ...beforeEdit,
    request: `Watch ${SIREN}`,
    monitoringSource: null,
    ...getPreservedCompanyEditChanges(
      beforeEdit,
      createExistingCompanyEditAnalysis(beforeEdit),
    ),
  };
  const lifecycle = createCompanyController({
    initialWatch: editedWatch,
    responses: [
      bodaccResponse(['A']),
      bodaccResponse(['B', 'A'], '2026-08-04T09:00:00.000Z'),
      bodaccResponse(['B', 'A'], '2026-08-04T10:00:00.000Z'),
    ],
  });

  assert.equal(
    (await lifecycle.controller.check('edited-company-watch')).outcome,
    'no-new-items',
  );
  const result = await lifecycle.controller.check('edited-company-watch');
  assert.equal(result.outcome, 'matching-items');
  assert.deepEqual(lifecycle.getWatch().updates.map(({ id }) => id), ['B']);
  assert.equal(
    (await lifecycle.controller.check('edited-company-watch')).outcome,
    'no-new-items',
  );
  assert.deepEqual(lifecycle.companyRequests, [SIREN, SIREN, SIREN]);
  assert.deepEqual(lifecycle.getWatch().updates.map(({ id }) => id), ['B']);
});

test('an empty BODACC baseline detects the first later announcement', async () => {
  const lifecycle = createCompanyController({
    responses: [bodaccResponse([]), bodaccResponse(['FIRST'])],
  });

  assert.equal((await lifecycle.controller.check('company-watch')).outcome, 'baseline');
  assert.deepEqual(lifecycle.getWatch().monitoringSnapshot.itemIds, []);
  assert.equal((await lifecycle.controller.check('company-watch')).outcome, 'matching-items');
  assert.deepEqual(lifecycle.getWatch().updates.map(({ id }) => id), ['FIRST']);
});

test('distinct BODACC IDs published on the same date are both retained', async () => {
  const lifecycle = createCompanyController({
    responses: [bodaccResponse([]), bodaccResponse(['SAME-DATE-1', 'SAME-DATE-2'])],
  });

  await lifecycle.controller.check('company-watch');
  const result = await lifecycle.controller.check('company-watch');
  assert.deepEqual(result.matchedItems.map(({ id }) => id), ['SAME-DATE-1', 'SAME-DATE-2']);
  assert.deepEqual(
    lifecycle.getWatch().updates.map(({ id }) => id),
    ['SAME-DATE-1', 'SAME-DATE-2'],
  );
});

test('a BODACC business event survives normalization without changing ID deduplication', () => {
  const watch = {
    id: 'company-watch',
    monitoringSource: BODACC_SOURCE,
    monitoringSnapshot: { itemIds: [] },
  };
  const classifiedItem = {
    ...bodaccItem('CAPITAL'),
    eventType: 'capital_increase',
  };
  const first = applyFeedCheckResult(watch, {
    ...bodaccResponse([]),
    items: [classifiedItem],
  }, { trustedSourceType: 'bodacc' });

  assert.equal(first.matchedItems[0].eventType, 'capital_increase');
  assert.deepEqual(first.changes.monitoringSnapshot.items[0].sirens, [SIREN]);
  assert.equal(first.changes.updates[0].rawMonitoringResult.eventType, 'capital_increase');
  assert.deepEqual(first.changes.updates[0].rawMonitoringResult.sirens, [SIREN]);
  const repeated = applyFeedCheckResult(
    { ...watch, ...first.changes },
    { ...bodaccResponse([]), items: [classifiedItem] },
    { trustedSourceType: 'bodacc' },
  );
  assert.equal(repeated.outcome, 'no-new-items');
  assert.deepEqual(repeated.changes.updates.map(({ id }) => id), ['CAPITAL']);
});

test('a later BODACC event updates company.status without changing Update history', async () => {
  const initialWatch = {
    id: 'company-watch',
    inputType: 'company',
    company: { siren: SIREN, name: 'EXAMPLE', status: 'active' },
    monitoringSource: BODACC_SOURCE,
  };
  const created = { ...bodaccItem('CREATED'), eventType: 'company_created' };
  const liquidation = { ...bodaccItem('LIQUIDATION'), eventType: 'judicial_liquidation' };
  const struckOff = { ...bodaccItem('STRUCK-OFF'), eventType: 'company_struck_off' };
  const lifecycle = createCompanyController({
    initialWatch,
    responses: [
      { ...bodaccResponse([]), items: [created] },
      { ...bodaccResponse([], '2026-08-04T09:00:00.000Z'), items: [liquidation, created] },
      { ...bodaccResponse([], '2026-08-04T10:00:00.000Z'), items: [struckOff, liquidation, created] },
    ],
  });

  await lifecycle.controller.check('company-watch');
  assert.equal(lifecycle.getWatch().company.status, 'active');
  await lifecycle.controller.check('company-watch');
  assert.equal(lifecycle.getWatch().company.status, 'judicial_liquidation');
  assert.deepEqual(lifecycle.getWatch().updates.map(({ id }) => id), ['LIQUIDATION']);
  await lifecycle.controller.check('company-watch');
  assert.equal(lifecycle.getWatch().company.status, 'struck_off');
  assert.deepEqual(
    lifecycle.getWatch().updates.map(({ id }) => id),
    ['LIQUIDATION', 'STRUCK-OFF'],
  );
});

test('the first BODACC baseline fills an empty company name from the existing item title', async () => {
  const initialWatch = {
    id: 'company-watch',
    inputType: 'company',
    title: `Company SIREN ${SIREN}`,
    company: { siren: SIREN, name: null },
    monitoringSource: BODACC_SOURCE,
  };
  const response = {
    ...bodaccResponse([]),
    items: [{
      ...bodaccItem('OFFICIAL'),
      title: 'Modifications diverses · OFFICIAL COMPANY NAME',
    }],
  };
  const lifecycle = createCompanyController({ initialWatch, responses: [response] });
  const result = await lifecycle.controller.check('company-watch');

  assert.equal(result.outcome, 'baseline');
  assert.deepEqual(lifecycle.getWatch().company, {
    siren: SIREN,
    name: 'OFFICIAL COMPANY NAME',
    status: 'unknown',
  });
  assert.equal(lifecycle.getWatch().title, 'OFFICIAL COMPANY NAME');
  assert.deepEqual(lifecycle.getWatch().monitoringSnapshot.itemIds, ['OFFICIAL']);
  assert.deepEqual(lifecycle.getWatch().updates || [], []);
});

test('BODACC enrichment preserves an existing user-supplied company name', () => {
  const result = applyFeedCheckResult({
    id: 'company-watch',
    inputType: 'company',
    title: 'LE GARIBALDI',
    company: { siren: SIREN, name: 'LE GARIBALDI' },
    monitoringSource: BODACC_SOURCE,
  }, {
    ...bodaccResponse([]),
    items: [{
      ...bodaccItem('OFFICIAL'),
      title: 'Modifications diverses · DIFFERENT OFFICIAL NAME',
    }],
  }, { trustedSourceType: 'bodacc' });

  assert.deepEqual(result.changes.company, {
    siren: SIREN,
    name: 'LE GARIBALDI',
    status: 'unknown',
  });
  assert.equal('title' in result.changes, false);
  assert.deepEqual(result.changes.monitoringSnapshot.itemIds, ['OFFICIAL']);
});

test('official directory identity takes priority while BODACC remains the monitoring source', () => {
  const result = applyFeedCheckResult({
    id: 'company-watch',
    inputType: 'company',
    title: 'User supplied name',
    company: {
      siren: SIREN,
      name: 'User supplied name',
      administrativeStatus: 'unknown',
      status: 'unknown',
    },
    monitoringSource: BODACC_SOURCE,
  }, {
    ...bodaccResponse([]),
    company: {
      siren: SIREN,
      officialName: 'OFFICIAL COMPANY',
      administrativeStatus: 'ceased',
      rawStatus: 'C',
      source: 'recherche-entreprises',
    },
  }, { trustedSourceType: 'bodacc' });

  assert.equal(result.changes.title, 'OFFICIAL COMPANY');
  assert.deepEqual(result.changes.company, {
    siren: SIREN,
    name: 'OFFICIAL COMPANY',
    administrativeStatus: 'ceased',
    status: 'unknown',
  });
  assert.equal(result.changes.monitoringSnapshot.source.title, 'BODACC');
});

test('BODACC enrichment replaces a generic name stored inside company.name', () => {
  const result = applyFeedCheckResult({
    id: 'company-watch',
    inputType: 'company',
    title: `Company SIREN ${SIREN}`,
    company: { siren: SIREN, name: `Company SIREN ${SIREN}` },
    monitoringSource: BODACC_SOURCE,
  }, {
    ...bodaccResponse([]),
    items: [{
      ...bodaccItem('OFFICIAL'),
      title: 'Modifications diverses · OFFICIAL COMPANY NAME',
    }],
  }, { trustedSourceType: 'bodacc' });

  assert.equal(result.changes.company.name, 'OFFICIAL COMPANY NAME');
  assert.equal(result.changes.title, 'OFFICIAL COMPANY NAME');
});

test('BODACC bypass requires a validated source and the dedicated trusted request path', () => {
  const watch = {
    id: 'company-watch',
    monitoringSource: BODACC_SOURCE,
    monitoringSnapshot: { itemIds: [] },
  };
  const unrelated = bodaccItem('UNRELATED', 'Text with no narrative Watch identifiers');

  assert.equal(matchFeedItemToWatch(unrelated, watch).matched, false);
  assert.equal(matchFeedItemToWatch(unrelated, watch, { trustedSourceType: 'bodacc' }).matched, true);
  assert.equal(applyFeedCheckResult(watch, {
    ...bodaccResponse([]), items: [unrelated],
  }).outcome, 'no-matching-items');

  const trusted = applyFeedCheckResult(watch, {
    ...bodaccResponse([]), items: [unrelated],
  }, { trustedSourceType: 'bodacc' });
  assert.equal(trusted.outcome, 'matching-items');
  const repeated = applyFeedCheckResult(
    { ...watch, ...trusted.changes },
    { ...bodaccResponse([]), items: [unrelated] },
    { trustedSourceType: 'bodacc' },
  );
  assert.equal(repeated.outcome, 'no-new-items');
  assert.deepEqual(repeated.changes.updates.map(({ id }) => id), ['UNRELATED']);
});

test('forged or incomplete BODACC sources fail safely without making a request', async () => {
  for (const monitoringSource of [
    { ...BODACC_SOURCE, provider: 'other' },
    { ...BODACC_SOURCE, siren: '552 005 969' },
    { ...BODACC_SOURCE, siren: '123' },
    { ...BODACC_SOURCE, discovery: 'manual' },
    { type: 'bodacc' },
  ]) {
    let requestCount = 0;
    const lifecycle = createCompanyController({
      initialWatch: {
        id: 'forged-company-watch',
        monitoringSource,
        monitoringSnapshot: { itemIds: ['existing'] },
      },
      requestCompany: async () => {
        requestCount += 1;
        return bodaccResponse([]);
      },
    });

    await assert.rejects(
      lifecycle.controller.check('forged-company-watch'),
      (error) => error instanceof MonitoringCheckError
        && error.code === 'INVALID_MONITORING_SOURCE',
    );
    assert.equal(requestCount, 0);
    assert.deepEqual(lifecycle.getWatch().monitoringSnapshot.itemIds, ['existing']);
    assert.deepEqual(lifecycle.getWatch().updates || [], []);
  }
});

test('company HTTP failures use the existing failure state and preserve the baseline', async () => {
  for (const { status, code } of [
    { status: 400, code: 'INVALID_SIREN' },
    { status: 502, code: 'UPSTREAM_ERROR' },
    { status: 504, code: 'TIMEOUT' },
  ]) {
    const baseline = { itemIds: ['existing'], items: [bodaccItem('existing')], checkedAt: CHECKED_AT };
    const lifecycle = createCompanyController({
      initialWatch: {
        id: `failure-${status}`,
        monitoringSource: BODACC_SOURCE,
        monitoringSnapshot: baseline,
      },
      requestCompany: (siren) => requestCompanyCheck(siren, {
        fetchImpl: async () => ({
          ok: false,
          status,
          json: async () => ({ code, error: 'private upstream detail' }),
        }),
      }),
    });

    await assert.rejects(
      lifecycle.controller.check(`failure-${status}`),
      (error) => error.code === code && !error.message.includes('private upstream detail'),
    );
    assert.deepEqual(lifecycle.getWatch().monitoringSnapshot, baseline);
    assert.equal(lifecycle.getWatch().lastCheckAttempt.code, code);
    assert.deepEqual(lifecycle.getWatch().updates || [], []);
  }
});

test('malformed and network company responses fail safely', async () => {
  await assert.rejects(requestCompanyCheck(SIREN, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ source: {}, items: null }) }),
  }), (error) => error.code === 'INVALID_RESPONSE');

  await assert.rejects(requestCompanyCheck(SIREN, {
    fetchImpl: async () => { throw new Error('private network detail'); },
  }), (error) => error.code === 'CHECK_FAILED' && !error.message.includes('private network detail'));
});
