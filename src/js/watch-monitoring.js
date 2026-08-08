import { getStoryProfileIdentifiers } from './story-profile.js';
import { addUpdateToWatch, getUnreadUpdates } from './watch-updates.js';
import { MONITORING_FAILURE_CODES } from './watch-monitoring-errors.js';
import { getCompanyNameEnrichment } from './company-watch-title.js';
import { deriveCompanyStatus } from './company-watch-status.js';
import { normalizeCompanyIdentity } from './company-administrative-status.js';

export const MAX_SNAPSHOT_ITEMS = 20;
export const MAX_SEEN_ITEM_IDS = 200;
export const MAX_MONITORING_UPDATES = 20;

export class MonitoringCheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MonitoringCheckError';
    this.code = code;
  }
}

export const normalizeFeedUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
};

const normalizeItem = (item) => {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
    return null;
  }
  const nullableString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    id: item.id.trim(),
    title: nullableString(item.title),
    url: nullableString(item.url),
    publishedAt: nullableString(item.publishedAt),
    source: nullableString(item.source),
    author: nullableString(item.author),
    excerpt: nullableString(item.excerpt),
    eventType: nullableString(item.eventType),
    sirens: Array.isArray(item.sirens)
      ? [...new Set(item.sirens.filter((siren) => /^\d{9}$/.test(siren)))]
      : [],
  };
};

const uniqueById = (items, limit) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, limit);
};

const getCheckedAt = (value, now) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? now().toISOString() : new Date(parsed).toISOString();
};

const normalizeMatchText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const containsPhrase = (text, phrase) => {
  const normalizedPhrase = normalizeMatchText(phrase);
  return normalizedPhrase && ` ${text} `.includes(` ${normalizedPhrase} `);
};

const MORPHOLOGY_FAMILIES = new Map(Object.entries({
  charged: 'charge',
  charges: 'charge',
  charging: 'charge',
  canceled: 'cancel',
  cancelled: 'cancel',
  canceling: 'cancel',
  cancelling: 'cancel',
  cancellation: 'cancel',
  cancellations: 'cancel',
  conserved: 'conserve',
  conserving: 'conserve',
  conservation: 'conserve',
  developed: 'develop',
  developing: 'develop',
  development: 'develop',
  developments: 'develop',
  nominated: 'nominate',
  nominates: 'nominate',
  nominating: 'nominate',
  nomination: 'nominate',
  nominations: 'nominate',
  opposed: 'oppose',
  opposes: 'oppose',
  opposing: 'oppose',
  opposition: 'oppose',
  politicisation: 'politicise',
  politicization: 'politicise',
  resigned: 'resign',
  resigning: 'resign',
  resignation: 'resign',
  resignations: 'resign',
}));

const canonicalMatchToken = (token) => {
  const mapped = MORPHOLOGY_FAMILIES.get(token);
  if (mapped) return mapped;
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('s') && !/(?:ss|us|is)$/u.test(token)) {
    return token.slice(0, -1);
  }
  return token;
};

const canonicalMatchText = (value) => normalizeMatchText(value)
  .split(' ')
  .filter(Boolean)
  .map(canonicalMatchToken)
  .join(' ');

const containsCanonicalPhrase = (text, phrase) => {
  const normalizedPhrase = canonicalMatchText(phrase);
  return normalizedPhrase && ` ${text} `.includes(` ${normalizedPhrase} `);
};

const FUNCTION_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or',
  's', 'the', 'to', 'with', 'without',
]);
const GENERIC_STORY_WORDS = new Set([
  'agreement', 'case', 'context', 'develop', 'life', 'new', 'project', 'report',
  'story', 'update', 'work',
]);
const ENTITY_ANCHOR_TYPES = new Set(['person', 'organization']);
const CENTRAL_STORY_TYPES = new Set([
  'work', 'product_service', 'condition', 'symptom', 'phenomenon', 'relationship',
  'event', 'manual',
]);

const isUsefulSingleSignal = (token) => (
  token.length >= 5
  && !FUNCTION_WORDS.has(token)
  && !GENERIC_STORY_WORDS.has(token)
);

const getConceptSignals = (label, excludedTokens = new Set()) => {
  const tokens = canonicalMatchText(label).split(' ').filter(Boolean);
  const singles = tokens.filter((token) => (
    !excludedTokens.has(token) && isUsefulSingleSignal(token)
  ));
  const phrases = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const first = tokens[index];
    const second = tokens[index + 1];
    const isCompound = first.length >= 3
      && second.length >= 3
      && !excludedTokens.has(first)
      && !excludedTokens.has(second)
      && !FUNCTION_WORDS.has(first)
      && !FUNCTION_WORDS.has(second)
      && (!GENERIC_STORY_WORDS.has(first) || !GENERIC_STORY_WORDS.has(second));
    if (isCompound) phrases.push(`${first} ${second}`);
  }
  return {
    singles: [...new Set(singles)],
    phrases: [...new Set(phrases)],
  };
};

const getMatchedSignals = (text, { singles, phrases }) => {
  const matchedPhrases = phrases.filter((phrase) => containsPhrase(text, phrase));
  const phraseTokens = new Set(matchedPhrases.flatMap((phrase) => phrase.split(' ')));
  const matchedSingles = singles.filter((token) => (
    !phraseTokens.has(token) && containsPhrase(text, token)
  ));
  return { phrases: matchedPhrases, singles: matchedSingles };
};

const hasStandaloneSemanticEvidence = ({ exact, signals }) => (
  exact
  || signals.phrases.length >= 2
  || (signals.phrases.length >= 1 && signals.singles.length >= 1)
  || signals.singles.length >= 3
);

export const matchFeedItemToStory = (item, storyProfile) => {
  // A byline identifies who wrote a candidate, not what the candidate is about.
  const text = canonicalMatchText([
    item?.title,
    item?.excerpt,
  ].filter(Boolean).join(' '));
  if (!text) return { matched: false, evidence: [] };

  const evidence = [];
  const manuallyAdded = new Set((storyProfile?.userAddedConcepts || []).map(normalizeMatchText));
  const evidenceType = {
    person: { field: 'people', strength: 'strong' },
    organization: { field: 'organizations', strength: 'strong' },
    work: { field: 'works', strength: 'strong' },
    product_service: { field: 'products', strength: 'strong' },
    location: { field: 'locations', strength: 'context' },
    event: { field: 'eventTypes', strength: 'context' },
    condition: { field: 'conditions', strength: 'strong' },
    symptom: { field: 'symptoms', strength: 'strong' },
    phenomenon: { field: 'phenomena', strength: 'strong' },
    relationship: { field: 'relationships', strength: 'strong' },
    manual: { field: 'userAddedConcepts', strength: 'strong' },
  };
  const concepts = getStoryProfileIdentifiers(storyProfile)
    .filter(({ label, type }) => typeof label === 'string' && evidenceType[type]);
  const anchorTokens = new Set(concepts
    .filter(({ type }) => ENTITY_ANCHOR_TYPES.has(type))
    .flatMap(({ label }) => canonicalMatchText(label).split(' ').filter(Boolean)));
  const matchedConcepts = concepts.map(({ label, type }) => {
    const normalized = normalizeMatchText(label);
    const wordCount = normalized.split(' ').filter(Boolean).length;
    const selectedType = manuallyAdded.has(normalized)
      ? { field: 'userAddedConcepts', strength: 'strong' }
      : evidenceType[type];
    const permitsSpecificSingleWord = [
      'location', 'work', 'product_service', 'condition', 'symptom', 'phenomenon', 'relationship',
    ].includes(type);
    const permitsNamedOrganization = type === 'organization' && normalized.length >= 3;
    const isEligiblePhrase = wordCount >= 2
      || permitsNamedOrganization
      || (permitsSpecificSingleWord && normalized.length >= 5);
    const exact = Boolean(isEligiblePhrase && containsCanonicalPhrase(text, label));
    const signals = CENTRAL_STORY_TYPES.has(type)
      ? getMatchedSignals(text, getConceptSignals(label, anchorTokens))
      : { phrases: [], singles: [] };
    if (selectedType && (exact || signals.phrases.length || signals.singles.length)) {
      evidence.push({ ...selectedType, label });
    }
    return {
      exact,
      isAnchor: ENTITY_ANCHOR_TYPES.has(type),
      isCentral: CENTRAL_STORY_TYPES.has(type),
      signals,
    };
  });

  const usefulConceptCount = matchedConcepts.length;
  const exactAnchors = matchedConcepts.filter(({ isAnchor, exact }) => isAnchor && exact);
  const centralConcepts = matchedConcepts.filter(({ isCentral }) => isCentral);
  const hasCorroboratingStorySignal = centralConcepts.some(({ signals }) => (
    signals.phrases.length > 0 || signals.singles.length > 0
  ));
  const hasStandaloneCentralEvidence = centralConcepts.some(hasStandaloneSemanticEvidence);
  const matched = usefulConceptCount === 1
    ? matchedConcepts.some(({ exact, isCentral, signals }) => (
      exact || (isCentral && hasStandaloneSemanticEvidence({ exact, signals }))
    ))
    : hasStandaloneCentralEvidence
      || (exactAnchors.length > 0 && hasCorroboratingStorySignal)
      || (!centralConcepts.length && exactAnchors.length >= 2);
  return {
    matched,
    evidence,
  };
};

const getValidatedBodaccSiren = (source) => (
  source?.type === 'bodacc'
  && source?.provider === 'dila'
  && source?.discovery === 'official-company'
  && typeof source?.siren === 'string'
  && /^\d{9}$/.test(source.siren)
    ? source.siren
    : null
);

export const matchFeedItemToWatch = (item, watch, { trustedSourceType = null } = {}) => {
  const bodaccSiren = getValidatedBodaccSiren(watch?.monitoringSource);
  if (trustedSourceType === 'bodacc' && bodaccSiren) {
    return {
      matched: true,
      evidence: [{
        field: 'monitoringSource',
        strength: 'strong',
        label: `BODACC SIREN ${bodaccSiren}`,
      }],
    };
  }
  return matchFeedItemToStory(item, watch?.storyProfile);
};

export const getMonitoringUpdates = (watch) => (
  Array.isArray(watch?.candidateUpdates || watch?.monitoringUpdates)
    ? (watch.candidateUpdates || watch.monitoringUpdates)
      .filter((item) => ['candidate', 'unreviewed'].includes(item?.status))
    : []
);

export const applyFeedCheckResult = (watch, response, {
  now = () => new Date(),
  trustedSourceType = null,
} = {}) => {
  if (!watch || typeof watch !== 'object') {
    throw new MonitoringCheckError('WATCH_NOT_FOUND', 'The Watch could not be found.');
  }
  if (!response || typeof response !== 'object' || !Array.isArray(response.items)) {
    throw new MonitoringCheckError('INVALID_RESPONSE', 'The monitoring response is invalid.');
  }

  const checkedAt = getCheckedAt(response.checkedAt, now);
  const items = uniqueById(
    response.items.map(normalizeItem).filter(Boolean),
    MAX_SNAPSHOT_ITEMS,
  );
  const currentIds = items.map(({ id }) => id);
  const hasBaseline = Array.isArray(watch.monitoringSnapshot?.itemIds);
  const previouslySeen = new Set([
    ...(Array.isArray(watch.seenMonitoringItemIds) ? watch.seenMonitoringItemIds : []),
    ...(hasBaseline ? watch.monitoringSnapshot.itemIds : []),
    ...(Array.isArray(watch.monitoringUpdates)
      ? watch.monitoringUpdates.map(({ id }) => id)
      : []),
  ].filter(Boolean));
  const unseenItems = hasBaseline
    ? items.filter(({ id }) => !previouslySeen.has(id))
    : [];
  const matchedItems = unseenItems
    .map((item) => ({
      item,
      match: matchFeedItemToWatch(item, watch, { trustedSourceType }),
    }))
    .filter(({ match }) => match.matched);
  const detectedUpdates = matchedItems.map(({ item, match }) => ({
    ...item,
    status: 'candidate',
    detectedAt: checkedAt,
    matchEvidence: match.evidence,
  }));
  const existingUpdates = Array.isArray(watch.candidateUpdates || watch.monitoringUpdates)
    ? (watch.candidateUpdates || watch.monitoringUpdates)
    : [];
  const monitoringUpdates = uniqueById(
    [...detectedUpdates, ...existingUpdates],
    MAX_MONITORING_UPDATES,
  );
  const companyIdentity = trustedSourceType === 'bodacc'
    ? normalizeCompanyIdentity(response.company, getValidatedBodaccSiren(watch.monitoringSource))
    : null;
  const enrichedCompanyName = trustedSourceType === 'bodacc'
    ? companyIdentity?.officialName || getCompanyNameEnrichment(watch, items)
    : null;
  const companyStatus = trustedSourceType === 'bodacc'
    ? deriveCompanyStatus(items, watch.company?.status)
    : null;
  const companyChanged = trustedSourceType === 'bodacc' && (
    Boolean(enrichedCompanyName)
    || watch.company?.status !== companyStatus
    || (
      companyIdentity
      && watch.company?.administrativeStatus !== companyIdentity.administrativeStatus
    )
  );
  const nextCompany = companyChanged
    ? {
      ...watch.company,
      ...(enrichedCompanyName ? { name: enrichedCompanyName } : {}),
      ...(companyIdentity ? {
        administrativeStatus: companyIdentity.administrativeStatus,
      } : {}),
      status: companyStatus,
    }
    : watch.company;
  const watchWithCompany = companyChanged
    ? {
      ...watch,
      ...(enrichedCompanyName ? { title: enrichedCompanyName, titleKey: null } : {}),
      company: nextCompany,
    }
    : watch;
  const watchWithUpdates = detectedUpdates.reduce((updatedWatch, detectedUpdate) => (
    addUpdateToWatch(updatedWatch, {
      id: detectedUpdate.id,
      timestamp: detectedUpdate.detectedAt,
      sourceUrl: detectedUpdate.url,
      sourceTitle: detectedUpdate.title,
      sourceName: detectedUpdate.source,
      summary: detectedUpdate.excerpt || detectedUpdate.title,
      status: 'new',
      rawMonitoringResult: detectedUpdate,
    })
  ), watchWithCompany);
  const seenMonitoringItemIds = [...new Set([
    ...currentIds,
    ...previouslySeen,
  ])].slice(0, MAX_SEEN_ITEM_IDS);
  const outcome = !hasBaseline
    ? 'baseline'
    : !unseenItems.length
      ? 'no-new-items'
      : detectedUpdates.length ? 'matching-items' : 'no-matching-items';
  const diagnostics = {
    returnedItemCount: items.length,
    unseenItemCount: unseenItems.length,
    matchedCandidateCount: detectedUpdates.length,
    storedUpdateCount: monitoringUpdates.length,
  };
  const latestUpdateAt = detectedUpdates.length
    ? checkedAt
    : watch.latestUpdateAt || null;
  const hadMonitoringIssue = ['setup-required', 'unavailable', 'needs-attention']
    .includes(watch.monitoringStatus?.state)
    || Boolean(watch.monitoringIssueReason);
  const actionRequired = watch.actionRequired === true || (
    !hadMonitoringIssue && (watch.requiresAttention === true || watch.status === 'attention')
  );
  const status = actionRequired && watch.status !== 'paused'
    ? 'attention'
    : watch.status === 'attention' && hadMonitoringIssue ? 'watching' : watch.status || 'watching';

  return {
    outcome,
    newItems: unseenItems,
    unseenItems,
    matchedItems: detectedUpdates,
    changes: {
      ...(companyChanged ? {
        ...(enrichedCompanyName ? { title: enrichedCompanyName, titleKey: null } : {}),
        company: nextCompany,
      } : {}),
      monitoringSnapshot: {
        checkedAt,
        source: response.source && typeof response.source === 'object'
          ? {
            title: typeof response.source.title === 'string' ? response.source.title : null,
            url: typeof response.source.url === 'string' ? response.source.url : null,
          }
          : null,
        itemIds: currentIds,
        items,
      },
      seenMonitoringItemIds,
      candidateUpdates: monitoringUpdates,
      monitoringUpdates,
      lastChecked: checkedAt,
      lastCheckedKey: null,
      lastCheckOutcome: {
        type: outcome,
        checkedAt,
        newItemIds: unseenItems.map(({ id }) => id),
        candidateItemIds: detectedUpdates.map(({ id }) => id),
        diagnostics,
      },
      lastCheckResult: {
        type: outcome,
        checkedAt,
        newItemIds: unseenItems.map(({ id }) => id),
        candidateItemIds: detectedUpdates.map(({ id }) => id),
        diagnostics,
      },
      lastCheckAttempt: {
        status: 'succeeded',
        attemptedAt: checkedAt,
        outcome,
      },
      monitoringReviewStatus: detectedUpdates.length ? 'candidate' : watch.monitoringReviewStatus || null,
      unreadUpdateCount: getUnreadUpdates(watchWithUpdates).length,
      latestUpdateAt,
      ...(detectedUpdates.length || Array.isArray(watch.updates) ? {
        currentStatus: ['attention', 'paused', 'completed'].includes(status)
          ? status
          : watchWithUpdates.currentStatus || watch.currentStatus || status,
        lastUpdated: watchWithUpdates.lastUpdated || watch.lastUpdated || null,
        updates: watchWithUpdates.updates || watch.updates || [],
      } : {}),
      monitoringStatus: { state: 'active', reason: null },
      monitoringIssueReason: null,
      monitoringFailure: null,
      actionRequired,
      attentionReason: actionRequired ? watch.attentionReason || null : null,
      requiresAttention: actionRequired,
      status,
    },
  };
};

export const requestFeedCheck = async (feedUrl, { fetchImpl = fetch } = {}) => {
  const normalizedFeedUrl = normalizeFeedUrl(feedUrl);
  if (!normalizedFeedUrl) {
    throw new MonitoringCheckError('MISSING_FEED_URL', 'This Watch needs an RSS or Atom feed URL.');
  }
  let response;
  try {
    response = await fetchImpl('/api/check-watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: normalizedFeedUrl }),
    });
  } catch {
    throw new MonitoringCheckError('CHECK_FAILED', 'The Watch could not be checked.');
  }
  const result = typeof response?.json === 'function'
    ? await response.json().catch(() => null)
    : null;
  if (!response.ok) {
    const code = MONITORING_FAILURE_CODES.includes(result?.code)
      ? result.code
      : 'CHECK_FAILED';
    throw new MonitoringCheckError(code, 'The Watch could not be checked.');
  }
  if (!result || !Array.isArray(result.items)) {
    throw new MonitoringCheckError('INVALID_RESPONSE', 'The monitoring response is invalid.');
  }
  return result;
};

const COMPANY_FAILURE_CODES = new Set([
  ...MONITORING_FAILURE_CODES,
  'INVALID_SIREN',
  'MALFORMED_RESPONSE',
]);

export const requestCompanyCheck = async (siren, { fetchImpl = fetch } = {}) => {
  if (typeof siren !== 'string' || !/^\d{9}$/.test(siren)) {
    throw new MonitoringCheckError(
      'INVALID_MONITORING_SOURCE',
      'This Watch needs a normalized 9-digit SIREN.',
    );
  }
  let response;
  try {
    response = await fetchImpl('/api/check-company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siren }),
    });
  } catch {
    throw new MonitoringCheckError('CHECK_FAILED', 'The Watch could not be checked.');
  }
  const result = typeof response?.json === 'function'
    ? await response.json().catch(() => null)
    : null;
  if (!response?.ok) {
    const code = COMPANY_FAILURE_CODES.has(result?.code)
      ? result.code
      : 'CHECK_FAILED';
    throw new MonitoringCheckError(code, 'The Watch could not be checked.');
  }
  if (!result || !Array.isArray(result.items)) {
    throw new MonitoringCheckError('INVALID_RESPONSE', 'The monitoring response is invalid.');
  }
  const { company: rawCompany, ...monitoringResult } = result;
  const company = normalizeCompanyIdentity(rawCompany, siren);
  return {
    ...monitoringResult,
    ...(company ? { company } : {}),
  };
};

export const createWatchCheckController = ({
  getWatch,
  saveWatch,
  requestCheck = requestFeedCheck,
  requestCompany = requestCompanyCheck,
  now = () => new Date(),
}) => {
  const inFlight = new Map();

  const check = (watchId, { onCheckingChange = () => {} } = {}) => {
    if (inFlight.has(watchId)) return inFlight.get(watchId);

    let resolveOperation;
    let rejectOperation;
    const operation = new Promise((resolve, reject) => {
      resolveOperation = resolve;
      rejectOperation = reject;
    });
    inFlight.set(watchId, operation);

    const run = async () => {
      onCheckingChange(true);
      try {
        const watch = getWatch(watchId);
        if (!watch) {
          throw new MonitoringCheckError('WATCH_NOT_FOUND', 'The Watch could not be found.');
        }
        let response;
        let trustedSourceType = null;
        if (watch.monitoringSource?.type === 'bodacc') {
          const siren = getValidatedBodaccSiren(watch.monitoringSource);
          if (!siren) {
            throw new MonitoringCheckError(
              'INVALID_MONITORING_SOURCE',
              'The BODACC monitoring source is invalid.',
            );
          }
          response = await requestCompany(siren);
          trustedSourceType = 'bodacc';
        } else {
          const feedUrl = normalizeFeedUrl(watch.monitoringSource?.url || watch.feedUrl || '');
          if (!feedUrl) {
            throw new MonitoringCheckError(
              'MISSING_FEED_URL',
              'No monitoring source is configured for this Watch.',
            );
          }
          response = await requestCheck(feedUrl);
        }
        const result = applyFeedCheckResult(watch, response, { now, trustedSourceType });
        const updatedWatch = saveWatch(watchId, result.changes);
        if (import.meta.env?.DEV) {
          console.info('[Watch monitoring] Check completed', {
            watchId,
            outcome: result.outcome,
            ...result.changes.lastCheckResult.diagnostics,
          });
        }
        return { ...result, watch: updatedWatch };
      } catch (error) {
        const currentWatch = getWatch(watchId) || {};
        const code = error instanceof MonitoringCheckError ? error.code : 'CHECK_FAILED';
        const failedAt = now().toISOString();
        if (code === 'MISSING_FEED_URL') {
          saveWatch(watchId, {
            monitoringStatus: { state: 'setup-required', reason: 'no-compatible-source' },
            monitoringIssueReason: 'no-compatible-source',
            lastCheckAttempt: { status: 'failed', attemptedAt: failedAt, code },
          });
        } else {
          const failureCount = Math.min(
            3,
            (Number(currentWatch.monitoringFailure?.consecutiveCount) || 0) + 1,
          );
          const persistent = failureCount >= 3;
          saveWatch(watchId, {
            monitoringFailure: {
              consecutiveCount: failureCount,
              failedAt,
              code,
            },
            lastCheckAttempt: { status: 'failed', attemptedAt: failedAt, code },
            ...(persistent ? {
              monitoringStatus: { state: 'unavailable', reason: 'source-persistently-unavailable' },
              monitoringIssueReason: 'source-persistently-unavailable',
            } : {}),
          });
        }
        throw error;
      } finally {
        onCheckingChange(false);
        inFlight.delete(watchId);
      }
    };

    run().then(resolveOperation, rejectOperation);
    return operation;
  };

  return {
    check,
    isChecking: (watchId) => inFlight.has(watchId),
  };
};

export const activateWatchMonitoring = async (
  watchId,
  { checkController, saveWatch },
) => {
  const result = await checkController.check(watchId);
  const checkedAt = result.changes.lastChecked;
  const watch = saveWatch(watchId, {
    monitoringState: 'monitoring',
    firstCheckCompletedAt: checkedAt,
    firstCheckCompletesAt: null,
  });
  return { ...result, watch };
};
