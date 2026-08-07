const normalizeIntentText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase();

const getCompanyIntent = (request) => {
  const text = normalizeIntentText(request);
  const monitoringIntent = /\b(?:monitor\w*|track\w*|watch\w*|follow\w*|surveill\w*|suis|suivre|suivi|veille\w*)\b/u;
  const companySubject = /\b(?:bodacc|siren|siret|compan(?:y|ies)|business(?:es)?|corporation|entreprise\w*|societe\w*)\b/u;
  return {
    monitoring: monitoringIntent.test(text),
    explicitCompany: companySubject.test(text),
    containsUrl: /(?:https?:\/\/|www\.)\S+/iu.test(String(request || '')),
  };
};

export const normalizeSiren = (value) => String(value || '').replace(/[\s\u00a0\u202f]+/gu, '');

export const isValidSiren = (value) => {
  const siren = normalizeSiren(value);
  if (!/^\d{9}$/.test(siren)) return false;
  const checksum = [...siren].reduce((sum, digit, index) => {
    let valueAtIndex = Number(digit);
    if ((siren.length - index) % 2 === 0) {
      valueAtIndex *= 2;
      if (valueAtIndex > 9) valueAtIndex -= 9;
    }
    return sum + valueAtIndex;
  }, 0);
  return checksum % 10 === 0;
};

const extractNumericGroups = (request) => (
  String(request || '').match(/\d(?:[\s\u00a0\u202f]*\d)*/gu) || []
).map(normalizeSiren).filter(Boolean);

const GENERIC_COMPANY_REQUEST_WORDS = new Set([
  'announcement', 'announcements', 'annonce', 'annonces', 'bodacc', 'business', 'company',
  'corporation', 'entreprise', 'for', 'la', 'le', 'les', 'pour', 'siren', 'societe', 'the',
  'update', 'updates',
]);

export const extractCompanyNameFromRequest = (request, siren) => {
  if (!isValidSiren(siren)) return null;
  let candidate = String(request || '').replace(/\d(?:[\s\u00a0\u202f]*\d)*/gu, (value) => (
    normalizeSiren(value) === normalizeSiren(siren) ? ' ' : value
  ));
  candidate = candidate
    .replace(/\bSIREN\b/giu, ' ')
    .replace(/^\s*(?:monitor\w*|track\w*|watch\w*|follow\w*|surveill\w*|suis|suivre|veille\w*)\b/iu, ' ')
    .replace(/^\s*(?:(?:the|a)\s+)?(?:company|business|corporation)\b/iu, ' ')
    .replace(/^\s*(?:(?:l['’]\s*|la\s+|une\s+))?(?:entreprise|soci[eé]t[eé])\b/iu, ' ')
    .replace(/^[\s:;,.-]+|[\s:;,.-]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!candidate || !/\p{L}/u.test(candidate)) return null;

  const words = normalizeIntentText(candidate)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length && words.every((word) => GENERIC_COMPANY_REQUEST_WORDS.has(word))
    ? null
    : candidate.slice(0, 200);
};

const isLikelyCompanyNameLookup = (request, siren) => {
  const companyName = extractCompanyNameFromRequest(request, siren);
  if (!companyName) return false;
  const words = companyName.match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length || words.length > 12) return false;

  const hasLowerCase = (word) => /\p{Ll}/u.test(word);
  const startsWithUpperCase = (word) => /^\p{Lu}/u.test(word);
  const lowercaseJoiners = new Set(['and', 'de', 'des', 'du', 'et', 'of']);
  if (words.length === 1) return !hasLowerCase(words[0]);
  return words.every((word) => (
    !hasLowerCase(word)
    || startsWithUpperCase(word)
    || lowercaseJoiners.has(normalizeIntentText(word))
  ));
};

export const parseCompanyWatchRequest = (request) => {
  const intent = getCompanyIntent(request);
  if (intent.containsUrl) {
    return { recognized: false, valid: false, siren: null, companyName: null, reason: null };
  }

  const numericGroups = extractNumericGroups(request);
  const sirenCandidates = [...new Set(numericGroups.filter((value) => /^\d{9}$/.test(value)))];
  const hasValidSiren = sirenCandidates.some(isValidSiren);
  const standaloneSiren = sirenCandidates.length === 1
    && normalizeSiren(request) === sirenCandidates[0]
    && hasValidSiren;
  const namedCompanyLookup = sirenCandidates.length === 1
    && hasValidSiren
    && isLikelyCompanyNameLookup(request, sirenCandidates[0]);
  const inferredCompanyMonitoring = intent.monitoring
    || standaloneSiren
    || namedCompanyLookup
    || (intent.explicitCompany && hasValidSiren);
  if (!inferredCompanyMonitoring) {
    return { recognized: false, valid: false, siren: null, companyName: null, reason: null };
  }
  if (!intent.explicitCompany && !hasValidSiren) {
    return { recognized: false, valid: false, siren: null, companyName: null, reason: null };
  }
  if (sirenCandidates.length > 1) {
    return {
      recognized: true, valid: false, siren: null, companyName: null, reason: 'multiple_sirens',
    };
  }
  if (sirenCandidates.length === 1) {
    const [siren] = sirenCandidates;
    return isValidSiren(siren)
      ? {
        recognized: true,
        valid: true,
        siren,
        companyName: extractCompanyNameFromRequest(request, siren),
        reason: null,
      }
      : {
        recognized: true, valid: false, siren: null, companyName: null, reason: 'invalid_checksum',
      };
  }
  if (numericGroups.some((value) => /^\d{14}$/.test(value))) {
    return { recognized: true, valid: false, siren: null, companyName: null, reason: 'siret_only' };
  }
  return {
    recognized: true,
    valid: false,
    siren: null,
    companyName: null,
    reason: numericGroups.length ? 'invalid_length' : 'missing_siren',
  };
};

export const createBodaccMonitoringSource = (siren) => {
  if (!isValidSiren(siren)) return null;
  return {
    type: 'bodacc',
    provider: 'dila',
    siren: normalizeSiren(siren),
    title: 'BODACC',
    discovery: 'official-company',
  };
};
