import { parseCompanyWatchRequest } from '../src/js/company-watch-request.js';
import { discoverTextMonitoringSource } from './monitoring-source-api.js';

const UNKNOWN_QUESTION = 'What would you like to monitor?';
const COMPANY_QUESTIONS = {
  invalid_checksum: 'What is the valid 9-digit SIREN for this company?',
  invalid_length: 'What is the valid 9-digit SIREN for this company?',
  missing_siren: 'What is the 9-digit SIREN for this company?',
  multiple_sirens: 'Which single company SIREN would you like to monitor?',
  siret_only: 'What is the 9-digit SIREN for this company?',
};

const normalizeText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase();

export const createPlannerDecision = ({
  strategy = 'unknown',
  connector = null,
  country = null,
  identifier = null,
  confidence = 0,
  needsClarification = true,
  clarificationQuestion = UNKNOWN_QUESTION,
} = {}) => ({
  strategy,
  connector,
  country,
  identifier,
  confidence,
  needsClarification,
  clarificationQuestion,
});

const isMonacoCompanyRequest = (request, companyRequest) => {
  if (!companyRequest.recognized) return false;
  return /\b(?:monaco|monegasq\w*)\b/u.test(normalizeText(request));
};

export const planWatch = async (request, options = {}) => {
  if (typeof request !== 'string' || !request.trim()) return createPlannerDecision();

  const companyRequest = parseCompanyWatchRequest(request);
  if (companyRequest.valid) {
    return createPlannerDecision({
      strategy: 'official_company',
      connector: 'bodacc',
      country: 'FR',
      identifier: companyRequest.siren,
      confidence: 1,
      needsClarification: false,
      clarificationQuestion: null,
    });
  }

  if (isMonacoCompanyRequest(request, companyRequest)) {
    return createPlannerDecision({
      strategy: 'official_company',
      connector: 'rci_monaco',
      country: 'MC',
      identifier: null,
      confidence: 0.7,
      needsClarification: true,
      clarificationQuestion: 'What is the company name or registration number?',
    });
  }

  if (companyRequest.recognized) {
    return createPlannerDecision({
      clarificationQuestion: COMPANY_QUESTIONS[companyRequest.reason]
        || 'What is the valid 9-digit SIREN for this company?',
    });
  }

  try {
    const discoverSource = options.discoverSource || discoverTextMonitoringSource;
    const result = await discoverSource({
      request: request.trim(),
      language: options.language || 'en',
    }, options.discoveryOptions);
    if (result?.monitoringSource) {
      return createPlannerDecision({
        strategy: 'structured_source',
        connector: 'rss',
        confidence: 0.8,
        needsClarification: false,
        clarificationQuestion: null,
      });
    }
  } catch {
    // Discovery failure is a planning outcome, not an error exposed to callers.
  }

  return createPlannerDecision({
    strategy: 'web_search',
    connector: 'web_ai',
    confidence: 0.5,
    needsClarification: false,
    clarificationQuestion: null,
  });
};
