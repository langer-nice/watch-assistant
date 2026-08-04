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
