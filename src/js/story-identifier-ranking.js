import {
  AUTOMATIC_STORY_CONCEPT_TYPES,
  normalizeAutomaticStoryFingerprint,
} from './monitoring-concepts.js';

const MONTHS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'janvier', 'février', 'mars',
  'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre',
  'décembre',
]);

const COUNTRIES = new Map([
  ['russia', 'Russia'], ['russie', 'Russie'], ['ukraine', 'Ukraine'],
  ['united states', 'United States'], ['united kingdom', 'United Kingdom'],
  ['france', 'France'], ['germany', 'Germany'], ['allemagne', 'Allemagne'],
  ['china', 'China'], ['chine', 'Chine'], ['israel', 'Israel'], ['iran', 'Iran'],
  ['italy', 'Italy'], ['italie', 'Italie'], ['spain', 'Spain'], ['espagne', 'Espagne'],
  ['brazil', 'Brazil'], ['brésil', 'Brésil'], ['bresil', 'Brésil'],
  ['canada', 'Canada'], ['mexico', 'Mexico'], ['mexique', 'Mexique'],
]);

const GEOGRAPHIC_PHRASES = new Set([
  ...COUNTRIES.keys(), 'black sea', 'mer noire', 'red sea', 'mer rouge',
  'middle east', 'moyen orient', 'european union',
]);

const ORGANIZATION_ENDING = /\b(?:party|agency|association|bank|committee|company|corporation|council|court|department|federation|foundation|government|group|institute|ministry|movement|organisation|organization|parliament|police|project|team|union|university)$/iu;
const EVENT_ENDING = /\b(?:administrative closure|attack|attacks|campaign|case|closure|conflict|court case|crisis|disaster|election|fermeture administrative|final|hearing|investigation|law|legislation|merger|mission|operation|primary|programme|program|proceedings|race|resignation|sanctions|strike|strikes|summit|takeover|trial|vote|war)$/iu;
const TOPIC_ENDING = /\b(?:air defence|civilian infrastructure|critical infrastructure|fuel prices?|inflation|missile defence|national security|public health|supply chain)$/iu;
const BYLINE_CONTEXT = /\b(?:author|by|correspondent|journalist|photographer|reporter|reporting by|written by)\b/iu;
const GENERIC_AUTHORITY = /^(?:court|government|ministry|parliament|police)$/iu;
const ROLE_PREFIX = /^(?:(?:dr|footballer|mr|mrs|ms|professor|sir)\.?\s+)+/iu;
const GENERIC_MONITORING_CONCEPT = /^(?:business|entertainment|health|lifestyle|news|politics|science|sport|sports|technology|world)$/iu;
const NON_EDITORIAL_ACCESS_CONCEPT = /(?:already (?:a )?subscriber|access all articles|become a member|continue reading|create (?:an )?account|full access|log ?in|sign ?in|subscribe|subscription|support (?:our )?journalism|unlimited access|unlock (?:this )?(?:article|story)|abonnez-vous|acc[ée]dez [àa] tous (?:les|nos) articles|d[ée]j[àa] abonn[ée]|devenez membre|je (?:me connecte|m['’]abonne)|pourquoi s['’]abonner|profitez de tous nos articles|r[ée]serv[ée] aux abonn[ée]s|regarder une publicit[ée]|soutenez (?:notre|nos) journaliste?s?)/iu;

const normalize = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/gu, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const sentences = (value) => String(value || '')
  .replace(/\s+/gu, ' ')
  .trim()
  .split(/(?<=[.!?])\s+/u)
  .filter(Boolean);

const countMentions = (text, label) => {
  const normalizedText = normalize(text);
  const normalizedLabel = normalize(label);
  if (!normalizedText || !normalizedLabel) return 0;
  const exactCount = [...normalizedText.matchAll(new RegExp(
    `(?:^|\\s)${escapeRegExp(normalizedLabel).replace(/\\ /gu, '\\s+')}(?=\\s|$)`,
    'gu',
  ))].length;
  if (exactCount) return exactCount;
  const meaningfulTokens = normalizedLabel.split(' ').filter((token) => (
    token.length > 2 && !/^(?:and|avec|dans|des|du|for|from|les|the|une|with)$/u.test(token)
  ));
  return meaningfulTokens.length >= 2 && meaningfulTokens.every((token) => (
    new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?=\\s|$)`, 'u').test(normalizedText)
  )) ? 1 : 0;
};

const countExactMentions = (text, label) => {
  const normalizedText = normalize(text);
  const normalizedLabel = normalize(label);
  if (!normalizedText || !normalizedLabel) return 0;
  return [...normalizedText.matchAll(new RegExp(
    `(?:^|\\s)${escapeRegExp(normalizedLabel).replace(/ /gu, '\\s+')}(?=\\s|$)`,
    'gu',
  ))].length;
};

const titleCaseFirst = (value) => {
  const label = String(value || '').replace(/\s+/gu, ' ').trim();
  return label ? `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}` : '';
};

const canonicalOrganizationKey = (label) => {
  const key = normalize(label);
  const university = key.match(/^(.+) university$/u);
  return university ? `university of ${university[1]}` : key;
};

const canonicalizeCandidate = (candidate) => {
  const label = String(candidate?.label || '').replace(/\s+/gu, ' ').trim();
  const tokens = label.split(/\s+/u);
  const midpoint = tokens.length / 2;
  const deduplicatedLabel = Number.isInteger(midpoint)
    && normalize(tokens.slice(0, midpoint).join(' ')) === normalize(tokens.slice(midpoint).join(' '))
    ? tokens.slice(0, midpoint).join(' ')
    : label;
  const canonicalLabel = candidate?.type === 'person'
    ? deduplicatedLabel.replace(ROLE_PREFIX, '').trim()
    : candidate?.type === 'organization'
      ? deduplicatedLabel.replace(/^(?:The|Le|La|Les)\s+/u, '').trim()
      : deduplicatedLabel;
  return {
    ...candidate,
    label: canonicalLabel,
  };
};

const unique = (values) => {
  const result = [];
  const indexes = new Map();
  values.forEach((candidate) => {
    const labelKey = candidate.type === 'organization'
      ? canonicalOrganizationKey(candidate.label)
      : normalize(candidate.label);
    const key = `${labelKey}\u0000${candidate.type}`;
    if (!labelKey) return;
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, result.length);
      result.push(candidate);
      return;
    }
    if (
      candidate.type === 'organization'
      && /^university of\b/iu.test(candidate.label)
      && !/^university of\b/iu.test(result[existingIndex].label)
    ) result[existingIndex] = candidate;
  });
  return result;
};

const correctType = ({ label, type }) => {
  const rawLabel = String(label || '').trim();
  const key = normalize(label);
  if (
    !key
    || MONTHS.has(key)
    || /[’']$/u.test(rawLabel)
    || /[.!?]\s+\p{Lu}/u.test(rawLabel)
    || (['person', 'location'].includes(type) && /[’']s(?:\s|$)/iu.test(rawLabel))
  ) return null;
  if (GEOGRAPHIC_PHRASES.has(key) || COUNTRIES.has(key)) return 'location';
  if (/\bworld cup(?: final)?$/iu.test(label)) return 'event';
  if (ORGANIZATION_ENDING.test(label)) return 'organization';
  if (TOPIC_ENDING.test(label)) return 'phenomenon';
  if (EVENT_ENDING.test(label)) return 'event';
  if (type === 'person' && String(label).trim().split(/\s+/u).length < 2) return null;
  return type;
};

export const hasObviousIdentifierTypeConflict = (candidate) => {
  const corrected = correctType(candidate);
  return !corrected || corrected !== candidate?.type;
};

export const isSafeAutomaticStoryConcept = (candidate) => {
  const normalized = canonicalizeCandidate(candidate);
  return Boolean(
    AUTOMATIC_STORY_CONCEPT_TYPES.includes(normalized?.type)
    && !GENERIC_MONITORING_CONCEPT.test(normalized.label)
    && !NON_EDITORIAL_ACCESS_CONCEPT.test(normalized.label)
    && !hasObviousIdentifierTypeConflict(normalized)
  );
};

const getEvidenceSource = (evidence) => [
  evidence.title,
  evidence.subheading,
  evidence.description,
  evidence.opening,
  evidence.articleText,
].filter(Boolean).join('. ');

const SEMANTIC_EVENT_TERMS = new Map([
  ['case', ['case', 'court', 'hearing', 'proceedings', 'trial']],
  ['charge', ['charge', 'charged', 'charges', 'charging']],
  ['nomination', ['nominate', 'nominated', 'nomination']],
  ['opposition', ['oppose', 'opposed', 'opposes', 'opposition']],
  ['politicisation', ['politicisation', 'politicise', 'politicised', 'politicization', 'politicize', 'politicized']],
  ['resignation', ['resign', 'resigned', 'resignation']],
]);

const SEMANTIC_LABEL_STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'de', 'des', 'du', 'for', 'in', 'of', 'on', 'the', 'to',
]);

const evidenceContainsTerm = (source, term) => {
  const normalizedSource = normalize(source);
  return (SEMANTIC_EVENT_TERMS.get(term) || [term]).some((variant) => (
    new RegExp(`(?:^|\\s)${escapeRegExp(variant)}(?=\\s|$)`, 'u').test(normalizedSource)
  ));
};

const hasSemanticSelectedEvidence = (candidate, evidence) => {
  if (
    candidate?.origin !== 'selected'
    || !['event', 'phenomenon', 'relationship'].includes(candidate?.type)
  ) return false;
  const terms = normalize(candidate.label).split(' ').filter((term) => (
    term.length > 1 && !SEMANTIC_LABEL_STOP_WORDS.has(term)
  ));
  if (terms.length < 2 || !terms.some((term) => SEMANTIC_EVENT_TERMS.has(term))) return false;
  const centralEvidence = [
    evidence.title,
    evidence.subheading,
    evidence.description,
    evidence.opening,
  ].filter(Boolean).join('. ');
  return terms.every((term) => evidenceContainsTerm(centralEvidence, term));
};

const hasPersonEvidence = (candidate, evidence) => {
  const label = String(candidate.label || '').trim();
  if (countExactMentions(evidence.author, label)) return false;
  if (/^[A-Z\d&.-]{2,}(?:\s|$)/u.test(label)) return false;
  const source = getEvidenceSource(evidence);
  const escaped = escapeRegExp(label).replace(/ /gu, '\\s+');
  const roleEvidence = new RegExp(
    `\\b(?:actor|candidate|coach|doctor|dr|minister|player|president|professor|scientist|sir)\\.?\\s+${escaped}\\b`,
    'iu',
  ).test(source);
  const actionEvidence = new RegExp(
    `\\b${escaped}(?:['’]s)?\\s+(?:accused|announced|appointed|died|has|is|said|says|search(?:es|ed)?|told|won|resign(?:ed|s|ing)?)\\b`,
    'iu',
  ).test(source);
  const relationalEvidence = new RegExp(
    `\\b(?:according to|met|named|rencontre avec|visite de)\\s+${escaped}\\b`,
    'iu',
  ).test(source);
  return roleEvidence || actionEvidence || relationalEvidence;
};

const hasOrganizationEvidence = (candidate, evidence) => {
  const label = String(candidate.label || '').trim();
  const exactMentions = countExactMentions(getEvidenceSource(evidence), label);
  if (ORGANIZATION_ENDING.test(label) || /\b(?:bank|university)\s+of\b/iu.test(label)) {
    return exactMentions > 0;
  }
  if (/^[A-Z][A-Z\d&.-]{1,7}$/u.test(label)) return exactMentions > 0;
  return ['profile', 'selected', 'local'].includes(candidate.origin)
    && exactMentions >= 2;
};

const hasLocationEvidence = (candidate, evidence) => {
  const label = String(candidate.label || '').trim();
  const key = normalize(label);
  if (candidate.origin === 'structure') return true;
  if (
    (GEOGRAPHIC_PHRASES.has(key) || COUNTRIES.has(key))
    && countExactMentions(getEvidenceSource(evidence), label) > 0
  ) return true;
  const escaped = escapeRegExp(label).replace(/ /gu, '\\s+');
  return new RegExp(
    `(?:^|\\s)(?:at|across|from|in|near|outside|à|au|aux|dans|depuis|en|près de)\\s+${escaped}(?=\\s|[.,;:!?]|$)`,
    'iu',
  ).test(getEvidenceSource(evidence));
};

export const hasPositiveIdentifierEvidence = (candidate, evidence = {}) => {
  const normalized = canonicalizeCandidate(candidate);
  if (
    GENERIC_MONITORING_CONCEPT.test(normalized.label)
    || NON_EDITORIAL_ACCESS_CONCEPT.test(normalized.label)
  ) return false;
  const type = correctType(normalized);
  if (!type) return false;
  const typed = { ...normalized, type };
  if (type === 'person') return hasPersonEvidence(typed, evidence);
  if (typed.validatedByRule) return true;
  if (type === 'organization') return hasOrganizationEvidence(typed, evidence);
  if (type === 'location') return hasLocationEvidence(typed, evidence);
  if (hasSemanticSelectedEvidence(typed, evidence)) return true;
  if (type === 'event') {
    return typed.origin === 'structure'
      || (EVENT_ENDING.test(typed.label) && countMentions(getEvidenceSource(evidence), typed.label) > 0);
  }
  return countMentions(getEvidenceSource(evidence), typed.label) > 0;
};

const extractEventCompounds = (text, structuralWeight = 0) => {
  const source = String(text || '');
  const compounds = [];
  const patterns = [
    /\b((?:(?:20\d{2}|[\p{Lu}][\p{L}’'-]*|strike|missile|air|military|naval|presidential|parliamentary|senate|criminal|antitrust|corruption|climate|health|election|court|voting|rights|plagiarism)\s+){0,3}(?:campaign|operation|investigation|election|case|trial|mission|programme|program|strikes?(?!\s+campaign)|attacks?|legislation|final|Final))\b/gu,
    /\b((?:Russian|Ukrainian|Israeli|Iranian|American|British|French|German|Chinese|russe|ukrainien(?:ne)?|français(?:e)?)\s+(?:strikes?|attacks?|campaign|operation|invasion|sanctions))\b/giu,
    /\b((?:civilian|critical|energy|transport|military|public)\s+(?:infrastructure|security|defence|defense|facilities))\b/giu,
    /\b((?:hostile|friendly|agreed|proposed|planned|cross-border|international)\s+(?:takeover|merger|deal|acquisition))\b/giu,
  ];
  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      const cleaned = match[1]
        .replace(/^(?:(?:a|an|its|the|this|new|nouveau|nouvelle|une?|Russia['’]s|Ukraine['’]s)\s+)+/iu, '')
        .replace(/\s+/gu, ' ')
        .trim();
      if (cleaned.split(/\s+/u).length >= 2) {
        compounds.push({
          label: titleCaseFirst(cleaned),
          type: TOPIC_ENDING.test(cleaned) ? 'phenomenon' : 'event',
          origin: 'structure',
          structuralWeight,
        });
      }
    }
  });
  if (/\bplagiarism\b[\s\S]{0,80}\b(?:allegations?|inquiry|investigation|row)\b|\b(?:allegations?|inquiry|investigation|row)\b[\s\S]{0,80}\bplagiarism\b/iu.test(source)) {
    compounds.push({
      label: 'Plagiarism investigation', type: 'event', origin: 'structure', structuralWeight,
    });
  }
  if (/\bresign(?:ation|ed|ing|s)?\b/iu.test(source)) {
    const subject = source.match(
      /\b((?:(?:Dr|Mr|Mrs|Ms|Professor|Sir)\.?\s+)?[\p{Lu}][\p{L}\p{M}'’-]+(?:\s+[\p{Lu}][\p{L}\p{M}'’-]+){1,2})\b[^.!?]{0,60}\bresign(?:ed|ing|s)?\b/u,
    )?.[1]?.replace(ROLE_PREFIX, '').trim();
    compounds.push({
      label: subject ? `${subject} resignation` : 'Resignation',
      type: 'event', origin: 'structure', structuralWeight,
    });
  }
  return compounds;
};

const extractDefiningPeople = (evidence) => {
  const source = [evidence.title, evidence.subheading, evidence.description, evidence.opening]
    .filter(Boolean)
    .join('. ');
  const pattern = /\b(?:(?:Dr|Mr|Mrs|Ms|Professor|Sir)\.?\s+)?([\p{Lu}][\p{L}\p{M}'’-]+(?:\s+(?:(?:al|da|de|del|di|dos|du|el|la|le|van|von)\s+)?[\p{Lu}][\p{L}\p{M}'’-]+){1,3})\b/gu;
  return [...source.matchAll(pattern)].map((match) => ({
    label: match[0].replace(ROLE_PREFIX, '').trim(),
    type: 'person',
    origin: 'structure',
  })).filter(({ label }) => (
    !/[’']s(?:\s|$)/iu.test(label)
    && !MONTHS.has(normalize(label).split(' ')[0])
  ));
};

const extractDefiningPlaces = (evidence) => {
  const source = [evidence.title, evidence.description, evidence.opening].filter(Boolean).join(' ');
  const places = [];
  for (const match of source.matchAll(
    /\b(?:at|across|from|in|near|outside|à|au|aux|dans|depuis|en|près de)\s+([\p{Lu}][\p{L}\p{M}'’-]+(?:\s+[\p{Lu}][\p{L}\p{M}'’-]+){0,2})\b/gu,
  )) {
    const label = match[1].replace(/[.,;:!?]+$/gu, '').trim();
    if (
      !/[’']s$/iu.test(label)
      && !MONTHS.has(normalize(label))
      && !/^(?:The|Le|La|Les)$/u.test(label)
    ) {
      places.push({ label, type: 'location', origin: 'structure' });
    }
  }
  for (const [key, display] of COUNTRIES) {
    if (countMentions(source, key)) places.push({ label: display, type: 'location', origin: 'structure' });
  }
  return places;
};

const extractDefiningOrganizations = (evidence) => {
  const source = [evidence.title, evidence.description, evidence.opening].filter(Boolean).join('. ');
  const pattern = /\b((?:University\s+of\s+[\p{Lu}][\p{L}\p{M}'’&-]*(?:\s+[\p{Lu}][\p{L}\p{M}'’&-]*){0,2}|(?:[\p{Lu}][\p{L}\p{M}'’&.-]*\s+){0,5}(?:Party|Agency|Association|Bank|Committee|Company|Corporation|Council|Court|Department|Federation|Foundation|Government|Group|Institute|Ministry|Movement|Organisation|Organization|Parliament|Police|Project|Team|Union|University)))\b/gu;
  return [...source.matchAll(pattern)].map((match) => {
    const rawLabel = match[1].trim().replace(/^(?:The|Le|La|Les)\s+/u, '');
    const tokens = rawLabel.split(/\s+/u);
    const midpoint = tokens.length / 2;
    const label = Number.isInteger(midpoint)
      && normalize(tokens.slice(0, midpoint).join(' ')) === normalize(tokens.slice(midpoint).join(' '))
      ? tokens.slice(0, midpoint).join(' ')
      : rawLabel;
    return { label, type: 'organization', origin: 'structure' };
  }).filter(({ label }) => !GENERIC_AUTHORITY.test(label));
};

export const extractDistinctiveHeadlineConcepts = (evidence = {}) => {
  const title = String(evidence.title || evidence.articleHeadline || '');
  const corroboratingEvidence = [
    evidence.subheading,
    evidence.articleSubheading,
    evidence.description,
    evidence.articleText,
  ].filter(Boolean).join(' ');
  const concepts = [];
  for (const match of title.matchAll(
    /\b([\p{L}][\p{L}\p{M}'’]{2,}[-‑–][\p{L}\p{M}'’]{3,}ing)\b/giu,
  )) {
    const label = titleCaseFirst(match[1]);
    if (countExactMentions(corroboratingEvidence, label) > 0) {
      concepts.push({ label, type: 'phenomenon', origin: 'structure' });
    }
  }
  return unique(concepts).slice(0, 1);
};

const scoreCandidate = (candidate, evidence) => {
  const titleHits = countMentions(evidence.title, candidate.label);
  const subheadingHits = countMentions(evidence.subheading, candidate.label);
  const descriptionHits = countMentions(evidence.description, candidate.label);
  const openingHits = countMentions(evidence.opening, candidate.label);
  const bodyHits = countMentions(evidence.articleText, candidate.label);
  const semanticTitleHit = !titleHits
    && hasSemanticSelectedEvidence(candidate, { ...evidence, subheading: '', description: '', opening: '' });
  const semanticSubheadingHit = !subheadingHits
    && hasSemanticSelectedEvidence(candidate, { ...evidence, title: '', description: '', opening: '' });
  const semanticDescriptionHit = !descriptionHits
    && hasSemanticSelectedEvidence(candidate, { ...evidence, title: '', subheading: '', opening: '' });
  const semanticOpeningHit = !openingHits
    && hasSemanticSelectedEvidence(candidate, { ...evidence, title: '', subheading: '', description: '' });
  const semanticHits = Number(semanticTitleHit) + Number(semanticSubheadingHit)
    + Number(semanticDescriptionHit) + Number(semanticOpeningHit);
  const totalHits = titleHits + subheadingHits + descriptionHits + bodyHits + semanticHits
    || (candidate.structuralWeight ? 1 : 0);
  let score = (titleHits * 12) + (subheadingHits * 9) + (descriptionHits * 7)
    + (openingHits * 5) + Math.min(bodyHits, 3);
  score += (Number(semanticTitleHit) * 12) + (Number(semanticSubheadingHit) * 9)
    + (Number(semanticDescriptionHit) * 7) + (Number(semanticOpeningHit) * 5);
  score += candidate.structuralWeight || 0;
  if (candidate.origin === 'structure') score += 3;
  if (candidate.origin === 'selected') score += 6;
  if (candidate.origin === 'profile') score += 1;
  if (candidate.origin === 'local') score += 4;
  if (candidate.type === 'event') score += 12;
  if (candidate.type === 'event' && candidate.label.split(/\s+/u).length >= 3) score += 4;
  if (candidate.type === 'phenomenon') score += 4;
  if (candidate.type === 'phenomenon' && candidate.label.split(/\s+/u).length >= 3) score += 8;
  if (candidate.type === 'organization' && titleHits + subheadingHits + descriptionHits) score += 2;
  if (!(titleHits + subheadingHits + descriptionHits + openingHits) && bodyHits < 2) score -= 8;
  if (candidate.type === 'person' && openingHits && bodyHits >= 2) score += 10;
  if (candidate.type === 'person' && titleHits) score += 30;
  if (BYLINE_CONTEXT.test(`${evidence.author || ''} ${evidence.opening || ''}`)
    && countMentions(evidence.author, candidate.label)) score -= 20;
  return { ...candidate, score, totalHits, titleHits, openingHits };
};

const isCentralEnough = (candidate) => candidate.score >= 6 && candidate.totalHits > 0;

const removeContainedWeakConcepts = (candidates) => candidates.filter((candidate, index) => (
  !candidates.some((other, otherIndex) => {
    if (index === otherIndex) return false;
    const contained = normalize(other.label).split(' ').length > normalize(candidate.label).split(' ').length
      && normalize(other.label).includes(normalize(candidate.label));
    const genericCase = candidate.type === 'event'
      && /^(?:court|criminal|legal|voting rights) case$/iu.test(candidate.label)
      && other.type === 'event'
      && /case$/iu.test(other.label)
      && other.label.length > candidate.label.length;
    const sameStrikeFamily = candidate.type === 'event'
      && other.type === 'event'
      && /\b(?:attacks?|strikes?)$/iu.test(candidate.label)
      && /\b(?:attacks?|strikes?)$/iu.test(other.label)
      && normalize(candidate.label).split(' ')[0] === normalize(other.label).split(' ')[0];
    const sameOrganization = contained
      && candidate.type === 'organization'
      && other.type === 'organization';
    if (candidate.type === 'person' && other.type === 'event') return false;
    if (!genericCase && !sameOrganization && other.score < candidate.score) return false;
    if (!contained && !genericCase && !sameStrikeFamily) return false;
    if (candidate.type === 'location' && COUNTRIES.has(normalize(candidate.label))) return false;
    return other.type === 'event'
      || other.type === 'phenomenon'
      || sameOrganization;
  })
));

const removeSyntheticOrganizationEvents = (candidates) => candidates.filter((candidate) => {
  if (candidate.origin !== 'structure' || candidate.type !== 'event') return true;
  const candidateLabel = normalize(candidate.label);
  return !candidates.some((organization) => {
    if (organization.type !== 'organization') return false;
    const organizationLabel = normalize(organization.label);
    if (!candidateLabel.startsWith(`${organizationLabel} `)) return false;
    const eventLabel = candidateLabel.slice(organizationLabel.length).trim();
    return candidates.some((event) => (
      event !== candidate
      && event.type === 'event'
      && normalize(event.label) === eventLabel
    ));
  });
});

export const rankStoryIdentifiers = ({
  selected = [],
  profileCandidates = [],
  evidence = {},
  limit = 5,
  includeEvidenceCandidates = true,
} = {}) => {
  const opening = sentences(evidence.articleText).slice(0, 3).join(' ');
  const normalizedEvidence = {
    ...evidence,
    title: evidence.title || evidence.articleHeadline || '',
    subheading: evidence.articleSubheading || '',
    opening,
  };
  const candidates = unique([
    ...selected.map((candidate) => ({ ...candidate, origin: 'selected' })),
    ...profileCandidates.map((candidate) => ({
      ...candidate,
      origin: candidate.origin || 'profile',
    })),
    ...(includeEvidenceCandidates ? [
      ...extractEventCompounds(normalizedEvidence.title, 12),
      ...extractEventCompounds(normalizedEvidence.subheading, 9),
      ...extractEventCompounds(normalizedEvidence.description, 7),
      ...extractEventCompounds(opening, 5),
      ...extractDefiningPeople(normalizedEvidence),
      ...extractDefiningOrganizations(normalizedEvidence),
      ...extractDefiningPlaces(normalizedEvidence),
      ...extractDistinctiveHeadlineConcepts(normalizedEvidence),
    ] : []),
  ].flatMap((rawCandidate) => {
    const candidate = canonicalizeCandidate(rawCandidate);
    const type = correctType(candidate);
    const typedCandidate = canonicalizeCandidate({ ...candidate, type });
    return type && hasPositiveIdentifierEvidence(typedCandidate, normalizedEvidence)
      ? [typedCandidate]
      : [];
  }));
  const scored = removeContainedWeakConcepts(
    removeSyntheticOrganizationEvents(candidates)
      .map((candidate) => scoreCandidate(candidate, normalizedEvidence))
      .filter(isCentralEnough)
      .sort((first, second) => (
        second.score - first.score
        || second.label.split(/\s+/u).length - first.label.split(/\s+/u).length
      )),
  );
  return normalizeAutomaticStoryFingerprint(scored, limit);
};
