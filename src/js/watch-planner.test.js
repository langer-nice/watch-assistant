import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPANY_PLAN_ROUTES,
  getCompanyPlanRoute,
  isFrenchCompanyPlan,
  normalizeWatchPlan,
  requestWatchPlan,
  WatchPlannerError,
} from './watch-planner.js';

const frenchCompanyPlan = {
  strategy: 'official_company',
  connector: 'bodacc',
  country: 'FR',
  identifier: '905329314',
  confidence: 1,
  needsClarification: false,
  clarificationQuestion: null,
};

test('requests the company-scoped Planner decision without changing the request', async () => {
  const calls = [];
  const plan = await requestWatchPlan('Monitor company SIREN 905329314', {
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      return new Response(JSON.stringify(frenchCompanyPlan));
    },
  });

  assert.deepEqual(plan, frenchCompanyPlan);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/plan-watch?scope=official_company');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    request: 'Monitor company SIREN 905329314',
  });
  assert.equal(calls[0].options.method, 'POST');
});

test('accepts only a complete normalized Planner response', async () => {
  assert.deepEqual(normalizeWatchPlan(frenchCompanyPlan), frenchCompanyPlan);
  assert.equal(normalizeWatchPlan({ ...frenchCompanyPlan, connector: 'other' }), null);
  assert.equal(normalizeWatchPlan({ ...frenchCompanyPlan, identifier: 905329314 }), null);
  assert.equal(normalizeWatchPlan({ ...frenchCompanyPlan, confidence: Number.NaN }), null);
  await assert.rejects(requestWatchPlan('Monitor company', {
    fetchImpl: async () => new Response('{}'),
  }), (error) => (
    error instanceof WatchPlannerError
    && error.code === 'INVALID_PLANNER_RESPONSE'
  ));
});

test('only the exact French BODACC decision enters the migrated Company pipeline', () => {
  assert.equal(isFrenchCompanyPlan(frenchCompanyPlan), true);
  assert.equal(isFrenchCompanyPlan({ ...frenchCompanyPlan, connector: 'rci_monaco' }), false);
  assert.equal(isFrenchCompanyPlan({ ...frenchCompanyPlan, strategy: 'structured_source' }), false);
  assert.equal(isFrenchCompanyPlan({ ...frenchCompanyPlan, country: 'MC' }), false);
  assert.equal(isFrenchCompanyPlan({ ...frenchCompanyPlan, identifier: null }), false);
  assert.equal(isFrenchCompanyPlan({ ...frenchCompanyPlan, identifier: '123456789' }), false);
});

test('unaccepted Company decisions fail safely while non-Company requests keep their old route', () => {
  const companyRequest = 'Monitor company SIREN 905329314';
  const forgedPlans = [
    null,
    { ...frenchCompanyPlan, strategy: 'web_search', connector: 'web_ai' },
    { ...frenchCompanyPlan, connector: 'rci_monaco', country: 'MC' },
    { ...frenchCompanyPlan, country: 'MC' },
    { ...frenchCompanyPlan, identifier: '123456789' },
  ];

  assert.equal(
    getCompanyPlanRoute(companyRequest, frenchCompanyPlan),
    COMPANY_PLAN_ROUTES.REVIEW,
  );
  forgedPlans.forEach((plan) => {
    assert.equal(
      getCompanyPlanRoute(companyRequest, plan),
      COMPANY_PLAN_ROUTES.GUIDANCE,
    );
  });

  for (const request of [
    'Monitor climate policy updates',
    'https://example.com/article',
    'https://example.com/feed.xml',
  ]) {
    assert.equal(getCompanyPlanRoute(request, null), COMPANY_PLAN_ROUTES.CONTINUE);
    assert.equal(
      getCompanyPlanRoute(request, {
        ...frenchCompanyPlan,
        strategy: 'web_search',
        connector: 'web_ai',
        country: null,
        identifier: null,
        confidence: 0.5,
      }),
      COMPANY_PLAN_ROUTES.CONTINUE,
    );
  }
});

test('Monaco and ambiguous Company requests retain guidance and never enter French review', () => {
  const monacoPlan = {
    strategy: 'official_company',
    connector: 'rci_monaco',
    country: 'MC',
    identifier: null,
    confidence: 0.7,
    needsClarification: true,
    clarificationQuestion: 'What is the company name or registration number?',
  };

  assert.equal(
    getCompanyPlanRoute('Monitor Monaco company', monacoPlan),
    COMPANY_PLAN_ROUTES.GUIDANCE,
  );
  assert.equal(
    getCompanyPlanRoute('Monitor company', null),
    COMPANY_PLAN_ROUTES.GUIDANCE,
  );
});
