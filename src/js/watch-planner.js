import { isValidSiren, parseCompanyWatchRequest } from './company-watch-request.js';
import { normalizeMediaStoryUrl, parseMediaStoryRequest } from './media-story-request.js';

const PLANNER_ENDPOINT = '/api/plan-watch?scope=migrated_routes';
const STRATEGIES = new Set([
  'media_story', 'official_company', 'structured_source', 'web_search', 'unknown',
]);
const CONNECTORS = new Set(['bodacc', 'media_story', 'rss', 'web_ai', 'rci_monaco', null]);

export class WatchPlannerError extends Error {
  constructor(code = 'PLANNER_UNAVAILABLE') {
    super('The Watch request could not be planned.');
    this.name = 'WatchPlannerError';
    this.code = code;
  }
}

export const normalizeWatchPlan = (value) => {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !STRATEGIES.has(value.strategy)
    || !CONNECTORS.has(value.connector)
    || (value.country !== null && typeof value.country !== 'string')
    || (value.identifier !== null && typeof value.identifier !== 'string')
    || typeof value.confidence !== 'number'
    || !Number.isFinite(value.confidence)
    || typeof value.needsClarification !== 'boolean'
    || (value.clarificationQuestion !== null && typeof value.clarificationQuestion !== 'string')
  ) return null;

  return {
    strategy: value.strategy,
    connector: value.connector,
    country: value.country,
    identifier: value.identifier,
    confidence: value.confidence,
    needsClarification: value.needsClarification,
    clarificationQuestion: value.clarificationQuestion,
  };
};

export const requestWatchPlan = async (
  request,
  { fetchImpl = fetch, signal } = {},
) => {
  let response;
  try {
    response = await fetchImpl(PLANNER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new WatchPlannerError();
  }

  const plan = normalizeWatchPlan(await response.json().catch(() => null));
  if (!response.ok || !plan) throw new WatchPlannerError('INVALID_PLANNER_RESPONSE');
  return plan;
};

export const isFrenchCompanyPlan = (plan) => (
  plan?.strategy === 'official_company'
  && plan.connector === 'bodacc'
  && plan.country === 'FR'
  && isValidSiren(plan.identifier)
);

export const COMPANY_PLAN_ROUTES = Object.freeze({
  REVIEW: 'review',
  GUIDANCE: 'guidance',
  CONTINUE: 'continue',
});

export const getCompanyPlanRoute = (request, plan) => {
  if (isFrenchCompanyPlan(plan)) return COMPANY_PLAN_ROUTES.REVIEW;
  if (parseCompanyWatchRequest(request).recognized) return COMPANY_PLAN_ROUTES.GUIDANCE;
  return COMPANY_PLAN_ROUTES.CONTINUE;
};

export const MEDIA_STORY_PLAN_ROUTES = Object.freeze({
  REVIEW: 'review',
  GUIDANCE: 'guidance',
  CONTINUE: 'continue',
});

export const isMediaStoryPlan = (request, plan) => {
  const normalizedRequest = normalizeMediaStoryUrl(request);
  return plan?.strategy === 'media_story'
    && plan.connector === 'media_story'
    && plan.country === null
    && plan.identifier === normalizedRequest
    && plan.confidence > 0
    && plan.needsClarification === false;
};

export const getMediaStoryPlanRoute = (request, plan) => {
  if (isMediaStoryPlan(request, plan)) return MEDIA_STORY_PLAN_ROUTES.REVIEW;
  if (parseMediaStoryRequest(request).recognized) return MEDIA_STORY_PLAN_ROUTES.GUIDANCE;
  return MEDIA_STORY_PLAN_ROUTES.CONTINUE;
};
