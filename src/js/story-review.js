import { normalizeAutomaticStoryFingerprint } from './monitoring-concepts.js';
import { cleanStorySummaryText } from './story-profile.js';
import {
  hasObviousIdentifierTypeConflict,
  hasPositiveIdentifierEvidence,
  rankStoryIdentifiers,
} from './story-identifier-ranking.js';

const comparable = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const isTitleEcho = (value, title) => {
  const normalizedValue = comparable(value);
  const normalizedTitle = comparable(title);
  return !normalizedValue
    || (normalizedTitle && (
      normalizedValue === normalizedTitle
      || normalizedValue === `reporting focuses on ${normalizedTitle}`
    ));
};

const firstArticleSentences = (articleText) => String(articleText || '')
  .replace(/\s+/g, ' ')
  .trim()
  .split(/(?<=[.!?])\s+/u)
  .filter(Boolean)
  .slice(0, 2)
  .join(' ');

export const createStoryOverview = ({
  storySummary,
  title,
  description,
  articleText,
  language = 'en',
} = {}) => {
  for (const candidate of [storySummary, description, firstArticleSentences(articleText)]) {
    const overview = cleanStorySummaryText(candidate);
    if (overview && !isTitleEcho(overview, title)) return overview;
  }
  const cleanTitle = cleanStorySummaryText(title);
  if (cleanTitle) {
    return language === 'fr'
      ? `Les métadonnées disponibles présentent cette actualité sous le titre « ${cleanTitle} », sans fournir de description plus détaillée.`
      : `The available metadata identifies this story as “${cleanTitle}”, but does not provide a fuller description.`;
  }
  return language === 'fr'
    ? 'Cet article présente une actualité en cours, mais la page ne fournit pas assez de détails pour un résumé plus précis.'
    : 'This article introduces a developing story, but the page did not provide enough detail for a more specific overview.';
};

const profileConceptCandidates = (profile = {}) => [
  ...(profile.primaryPeople || []).map((label) => ({ label, type: 'person' })),
  ...(profile.organizations || []).map((label) => ({ label, type: 'organization' })),
  ...(profile.works || []).map((label) => ({ label, type: 'work' })),
  ...(profile.productsServices || []).map((label) => ({ label, type: 'product_service' })),
  ...(profile.locations || []).map((label) => ({ label, type: 'location' })),
  ...(profile.eventTypes || []).map((label) => ({ label, type: 'event' })),
  ...(profile.events || []).map((label) => ({ label, type: 'event' })),
  ...(profile.conditions || []).map((label) => ({ label, type: 'condition' })),
  ...(profile.symptoms || []).map((label) => ({ label, type: 'symptom' })),
  ...(profile.phenomena || []).map((label) => ({ label, type: 'phenomenon' })),
  ...(profile.relationships || []).map((label) => ({ label, type: 'relationship' })),
];

const ORGANIZATION_ENDINGS = '(?:Party|Agency|Association|Committee|Council|Department|Federation|Foundation|Government|Group|Institute|Ministry|Movement|Organization|Organisation|Project|Team|Union|University)';
const NON_PERSON_ENDINGS = new RegExp(`\\b${ORGANIZATION_ENDINGS}$`, 'i');
const GENERIC_CONCEPT = /^(?:article|story|news|update|report|latest|officials?)$/i;

const evidenceText = ({ title, description, articleText } = {}) => (
  [title, description, articleText].filter(Boolean).join(' ')
);

const extractEvidencePeople = (evidence = {}) => {
  const title = String(evidence.title || '');
  const publication = comparable(evidence.siteName || evidence.sourcePublication);
  const personPattern = /\b\p{Lu}[\p{L}\p{M}'’-]+(?:\s+(?:(?:al|da|de|del|di|dos|du|el|la|le|van|von)\s+)?\p{Lu}[\p{L}\p{M}'’-]+){1,3}\b/gu;
  return [...title.matchAll(personPattern)]
    .map((match) => ({
      label: match[0].replace(/[’']s$/i, '').trim(),
      possessive: /[’']s$/i.test(match[0])
        || /^[’']s\b/i.test(title.slice(match.index + match[0].length)),
    }))
    .filter(({ label, possessive }) => (
      possessive
      && !NON_PERSON_ENDINGS.test(label)
      && !/^(?:The|This|That)\b/.test(label)
      && comparable(label) !== publication
    ))
    .map(({ label }) => ({ label, type: 'person' }));
};

const extractEvidenceOrganizations = (evidence = {}) => {
  const source = evidenceText(evidence);
  const publication = comparable(evidence.siteName || evidence.sourcePublication);
  const organizationPattern = new RegExp(
    `\\b((?:\\p{Lu}[\\p{L}\\p{M}'’-]*\\s+){0,4}${ORGANIZATION_ENDINGS})\\b`,
    'gu',
  );
  return [...source.matchAll(organizationPattern)]
    .map((match) => {
      const label = match[1].replace(/^the\s+/i, '').trim();
      const tokens = label.split(/\s+/);
      if (tokens.length % 2 !== 0) return label;
      const midpoint = tokens.length / 2;
      return comparable(tokens.slice(0, midpoint).join(' '))
        === comparable(tokens.slice(midpoint).join(' '))
        ? tokens.slice(0, midpoint).join(' ')
        : label;
    })
    .filter((label) => label && comparable(label) !== publication)
    .map((label) => ({ label, type: 'organization' }));
};

const extractEvidenceEvents = (evidence = {}) => {
  const source = evidenceText(evidence);
  const month = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
  const datedEvent = new RegExp(
    `\\b(${month}|20\\d{2})(?:\\s+[\\p{L}'’-]+){0,2}\\s+(election|contest|vote|race|primary|runoff|final|summit|launch|trial|hearing|mission|tournament|championship)\\b`,
    'giu',
  );
  const describedEvent = /\b((?:presidential|parliamentary|general|primary|runoff|leadership|senate|mayoral|national)\s+(?:election|contest|vote|race))\b/giu;
  return [...source.matchAll(datedEvent), ...source.matchAll(describedEvent)]
    .map((match) => match[0].replace(/\s+/g, ' ').trim())
    .filter((label) => !GENERIC_CONCEPT.test(label))
    .map((label) => ({
      label: `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`,
      type: 'event',
    }));
};

const extractEvidenceTopics = (evidence = {}) => {
  const source = evidenceText(evidence);
  const topicPattern = /\b((?:(?:left|right)[- ]wing|independent|opposition|incumbent|reform|anti[- ]corruption)\s+(?:candidate|campaign|movement|coalition|platform))\b/giu;
  return [...source.matchAll(topicPattern)]
    .map((match) => match[1].replace(/\s+/g, ' ').trim())
    .filter((label) => !GENERIC_CONCEPT.test(label))
    .map((label) => ({
      label: `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`,
      type: 'phenomenon',
    }));
};

export const extractLocalStoryConcepts = (evidence, limit = 6) => (
  normalizeAutomaticStoryFingerprint([
    ...extractEvidencePeople(evidence),
    ...extractEvidenceOrganizations(evidence),
    ...extractEvidenceEvents(evidence),
    ...extractEvidenceTopics(evidence),
  ], limit)
);

export const enrichStoryFingerprint = (
  storyFingerprint,
  profile,
  { analysisProvider, evidence, limit = 6 } = {},
) => {
  const existing = normalizeAutomaticStoryFingerprint(storyFingerprint, limit);
  if (!['deterministic', 'openai'].includes(analysisProvider)) return existing;
  const hasEvidence = Boolean(evidence?.title || evidence?.description || evidence?.articleText);
  const weak = existing.length < 2 || existing.every(({ type }) => type === 'location');
  if (!hasEvidence) {
    return weak
      ? normalizeAutomaticStoryFingerprint([
        ...profileConceptCandidates(profile),
        ...existing,
      ], limit)
      : existing;
  }
  if (
    analysisProvider === 'deterministic'
    && !weak
    && !existing.some(hasObviousIdentifierTypeConflict)
  ) return existing;
  if (
    !weak
    && !existing.some(hasObviousIdentifierTypeConflict)
    && existing.every((candidate) => hasPositiveIdentifierEvidence(candidate, {
      ...evidence,
      subheading: evidence.articleSubheading || '',
      opening: String(evidence.articleText || '').split(/(?<=[.!?])\s+/u).slice(0, 3).join(' '),
    }))
  ) return existing;
  return rankStoryIdentifiers({
    selected: existing.map((candidate) => (
      analysisProvider === 'deterministic'
        ? { ...candidate, validatedByRule: true }
        : candidate
    )),
    profileCandidates: [
      ...profileConceptCandidates(profile),
      ...extractLocalStoryConcepts(evidence, limit).map((candidate) => ({
        ...candidate,
        origin: 'local',
      })),
    ],
    evidence,
    limit,
  });
};

const getScopeDimensions = (profile = {}, evidence = {}, language = 'en') => {
  const source = comparable([
    evidence.title,
    evidence.overview,
    evidence.articleText,
    ...(profile.eventTypes || []),
    ...(profile.organizations || []),
    ...(profile.conditions || []),
    ...(profile.productsServices || []),
  ].filter(Boolean).join(' '));
  const localized = (english, french) => (language === 'fr' ? french : english);
  if (/\b(?:election|campaign|candidate|parliament|senate|government|politic|vote)\b/.test(source)) {
    return [
      localized('election and campaign developments', 'les développements électoraux et de campagne'),
      localized('official decisions and statements', 'les décisions et déclarations officielles'),
      localized('significant political consequences', 'les conséquences politiques importantes'),
    ];
  }
  if (/\b(?:match|tournament|championship|league|team|player|sport|race|final)\b/.test(source)) {
    return [
      localized('results and competition developments', 'les résultats et développements de la compétition'),
      localized('participant or team changes', 'les changements concernant les participants ou les équipes'),
      localized('official decisions', 'les décisions officielles'),
    ];
  }
  if (/\b(?:health|medical|disease|condition|symptom|treatment|clinical|science|research|study)\b/.test(source)) {
    return [
      localized('new evidence and findings', 'les nouvelles données et conclusions'),
      localized('expert guidance', 'les recommandations d’experts'),
      localized('material follow-up developments', 'les développements importants qui suivront'),
    ];
  }
  if (/\b(?:company|business|market|financial|earnings|product|service|acquisition|merger)\b/.test(source)) {
    return [
      localized('business and financial developments', 'les développements économiques et financiers'),
      localized('official announcements', 'les annonces officielles'),
      localized('material product or leadership changes', 'les changements importants de produit ou de direction'),
    ];
  }
  if (/\b(?:film|music|album|series|television|festival|award|entertainment|release)\b/.test(source)) {
    return [
      localized('release and production developments', 'les développements de sortie et de production'),
      localized('official announcements', 'les annonces officielles'),
      localized('awards and significant reception', 'les récompenses et réactions importantes'),
    ];
  }
  const dimensions = [];
  if ((profile.eventTypes || []).length || (profile.events || []).length) {
    dimensions.push(localized('major developments', 'les développements majeurs'));
  }
  if ((profile.organizations || []).length) {
    dimensions.push(localized('official announcements', 'les annonces officielles'));
  }
  if ((profile.primaryPeople || []).length) {
    dimensions.push(localized(
      'significant statements and status changes',
      'les déclarations et changements de situation importants',
    ));
  }
  if ((profile.productsServices || []).length || (profile.works || []).length) {
    dimensions.push(localized(
      'releases and material updates',
      'les sorties et mises à jour importantes',
    ));
  }
  if ((profile.conditions || []).length || (profile.symptoms || []).length) {
    dimensions.push(localized('new evidence and guidance', 'les nouvelles données et recommandations'));
  }
  if (!dimensions.length) {
    dimensions.push(
      localized('major developments', 'les développements majeurs'),
      localized('significant follow-up reporting', 'les informations de suivi importantes'),
    );
  }
  return dimensions.slice(0, 3);
};

const formatList = (values, language) => {
  if (values.length < 2) return values[0] || '';
  const conjunction = language === 'fr' ? ' et ' : ' and ';
  return `${values.slice(0, -1).join(', ')}${conjunction}${values.at(-1)}`;
};

export const createMonitoringScope = ({
  watchingFor,
  profile,
  storyFingerprint,
  title,
  overview,
  articleText,
  language = 'en',
} = {}) => {
  const aiScope = cleanStorySummaryText(watchingFor);
  if (aiScope) return aiScope;

  const normalizedIdentifiers = normalizeAutomaticStoryFingerprint(storyFingerprint, 6);
  const identifiers = [
    ...normalizedIdentifiers.filter(({ type }) => type !== 'location'),
    ...normalizedIdentifiers.filter(({ type }) => type === 'location'),
  ].slice(0, 4).map(({ label }) => label);
  const subject = formatList(identifiers, language) || cleanStorySummaryText(title);
  const dimensions = formatList(getScopeDimensions(profile, {
    title,
    overview,
    articleText,
  }, language), language);
  if (language === 'fr') {
    return subject
      ? `Cette Watch suivra les prochaines informations directement liées à ${subject}, notamment ${dimensions}.`
      : `Cette Watch suivra les prochaines informations pertinentes, notamment ${dimensions}.`;
  }
  return subject
    ? `This Watch will follow future reporting directly related to ${subject}, including ${dimensions}.`
    : `This Watch will follow relevant future reporting, including ${dimensions}.`;
};

export const isDistinctMonitoringScope = (scope, overview, title = '') => {
  const normalizedScope = comparable(scope);
  return Boolean(
    normalizedScope
    && normalizedScope !== comparable(overview)
    && normalizedScope !== comparable(title),
  );
};
