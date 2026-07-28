import { isUsefulStoryConcept, normalizeStoryFingerprint } from './monitoring-concepts.js';
import { sanitizeMalformedCurrencyText } from './article-content.js';

export const STORY_PROFILE_VERSION = 7;
const MAX_PROFILE_VALUES = 8;

const uniqueStrings = (values, limit = MAX_PROFILE_VALUES) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};

const normalizePeopleRoles = (values, people) => {
  const knownPeople = new Set(people.map((name) => name.toLocaleLowerCase()));
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((item) => ({
      name: String(item?.name || '').replace(/\s+/g, ' ').trim(),
      role: String(item?.role || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter(({ name, role }) => {
      const key = `${name.toLocaleLowerCase()}\u0000${role.toLocaleLowerCase()}`;
      if (!name || !role || !knownPeople.has(name.toLocaleLowerCase()) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
};

const preferPreciseLocations = (values) => uniqueStrings(values).filter((location, index, locations) => (
  !locations.some((candidate, candidateIndex) => (
    candidateIndex !== index
    && candidate.toLocaleLowerCase().startsWith(`${location.toLocaleLowerCase()},`)
  ))
));

const normalizeSupportedLocations = (values, articleText) => {
  const source = String(articleText || '');
  if (!source) return values;
  return (Array.isArray(values) ? values : []).flatMap((value) => {
    const label = String(value || '').replace(/\s+/g, ' ').trim();
    const parts = label.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 2) return label;
    const [place, country] = parts;
    const placePattern = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const countryPattern = country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const explicitRelationship = new RegExp(
      `\\b${placePattern}\\s*,\\s*${countryPattern}\\b|\\b${placePattern}\\b[^.!?]{0,60}\\bin\\s+${countryPattern}\\b`,
      'i',
    ).test(source);
    if (explicitRelationship) return label;
    return parts.filter((part) => new RegExp(
      `\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    ).test(source));
  });
};

const getUncertaintyPhrases = (articleText) => uniqueStrings(
  String(articleText || '')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(?:alleged|allegedly|reported|reportedly|suspected|wanted|accused|likely|possible)\b/i.test(sentence))
    .map((sentence) => sentence.slice(0, 240)),
  4,
);

const cleanSummary = (value) => sanitizeMalformedCurrencyText(value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 360);

export const normalizeStorySummary = (value, sourceTitle = '') => {
  const summary = cleanSummary(value);
  const isComplete = summary.length >= 20
    && !/\b(?:likely|possibly|probably|allegedly|reportedly|suspected|possible)$/i.test(summary);
  if (isComplete) return /[.!?]$/.test(summary) ? summary : `${summary}.`;
  const title = cleanSummary(sourceTitle).replace(/[.!?]+$/g, '');
  return title ? `Reporting focuses on “${title}”.` : '';
};

const preserveFingerprintOrder = (sourceValues, normalizedValues) => {
  const source = Array.isArray(sourceValues) ? sourceValues : [];
  const key = (concept) => `${concept?.type}\u0000${String(concept?.label || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()}`;
  const sourceKeys = source.map(key);
  return [...normalizedValues].sort((first, second) => {
    const firstIndex = sourceKeys.indexOf(key(first));
    const secondIndex = sourceKeys.indexOf(key(second));
    return (firstIndex < 0 ? source.length : firstIndex)
      - (secondIndex < 0 ? source.length : secondIndex);
  });
};

export const createStoryProfile = ({
  storyFingerprint,
  profile = {},
  articleText = '',
  sourcePublication = '',
  sourceTitle = '',
  sourceUrl = '',
  publishedAt = null,
  extractedAt = new Date().toISOString(),
} = {}) => {
  const publicationKey = String(sourcePublication || '').trim().toLocaleLowerCase();
  const profileValues = (values, type) => uniqueStrings(values).filter((label) => (
    label.toLocaleLowerCase() !== publicationKey && isUsefulStoryConcept(label, type)
  ));
  const normalizedFingerprint = preserveFingerprintOrder(
    storyFingerprint,
    normalizeStoryFingerprint(storyFingerprint, MAX_PROFILE_VALUES),
  );
  const locationNormalizedFingerprint = normalizedFingerprint.flatMap((concept) => (
    concept.type === 'location'
      ? normalizeSupportedLocations([concept.label], articleText).map((label) => ({ label, type: 'location' }))
      : concept
  ));
  const concepts = preserveFingerprintOrder(
    locationNormalizedFingerprint,
    normalizeStoryFingerprint(locationNormalizedFingerprint, MAX_PROFILE_VALUES),
  )
    .filter(({ label }) => label.toLocaleLowerCase() !== publicationKey);
  const typed = (type) => concepts.filter((concept) => concept.type === type).map(({ label }) => label);
  const profilePeople = profileValues(profile.primaryPeople, 'person');
  const fingerprintPeople = typed('person');
  const hasExplicitPrimaryPeople = Array.isArray(profile.primaryPeople);
  const primaryPeople = hasExplicitPrimaryPeople
    ? profilePeople.slice(0, 4)
    : fingerprintPeople.slice(0, 1);
  const otherPeople = uniqueStrings([
    ...profileValues(profile.otherPeople, 'person'),
    ...(hasExplicitPrimaryPeople
      ? []
      : fingerprintPeople.filter((person) => !primaryPeople.includes(person))),
  ], 6);
  const people = [...primaryPeople, ...otherPeople];
  const hasExplicitUncertainty = Array.isArray(profile.uncertaintyPhrases);

  return {
    version: STORY_PROFILE_VERSION,
    storySummary: normalizeStorySummary(profile.storySummary, sourceTitle),
    primaryPeople,
    otherPeople,
    peopleRoles: normalizePeopleRoles(profile.peopleRoles, people),
    locations: preferPreciseLocations(normalizeSupportedLocations([
      ...profileValues(profile.locations, 'location'),
      ...typed('location'),
    ], articleText)),
    organizations: uniqueStrings([...profileValues(profile.organizations, 'organization'), ...typed('organization')]),
    eventTypes: uniqueStrings([...profileValues(profile.eventTypes, 'event'), ...typed('event')]),
    works: uniqueStrings(profileValues(profile.works, 'work')),
    productsServices: uniqueStrings(profileValues(profile.productsServices, 'product_service')),
    events: uniqueStrings(profileValues(profile.events, 'event')),
    relationships: uniqueStrings(profileValues(profile.relationships, 'relationship')),
    phenomena: uniqueStrings(profileValues(profile.phenomena, 'phenomenon')),
    conditions: uniqueStrings(profileValues(profile.conditions, 'condition')),
    symptoms: uniqueStrings(profileValues(profile.symptoms, 'symptom')),
    distinctiveFacts: uniqueStrings(profileValues(profile.distinctiveFacts, 'contextual')),
    aliases: uniqueStrings(profile.aliases).filter((label) => label.toLocaleLowerCase() !== publicationKey),
    uncertaintyPhrases: uniqueStrings(hasExplicitUncertainty
      ? profile.uncertaintyPhrases
      : getUncertaintyPhrases(articleText), 4),
    concepts,
    userAddedConcepts: uniqueStrings(profile.userAddedConcepts),
    sourceArticle: {
      publication: String(sourcePublication || '').trim() || null,
      title: String(sourceTitle || '').trim() || null,
      url: String(sourceUrl || '').trim() || null,
      publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt))
        ? new Date(publishedAt).toISOString()
        : null,
    },
    extractedAt: !Number.isNaN(Date.parse(extractedAt))
      ? new Date(extractedAt).toISOString()
      : new Date().toISOString(),
  };
};

export const getStoryProfileIdentifiers = (profile) => (
  Array.isArray(profile?.concepts)
    ? profile.concepts.map(({ label, type }) => ({ label, type }))
    : []
);

export const getStoryProfileConcepts = (profile) => (
  getStoryProfileIdentifiers(profile).map(({ label }) => label)
);

export const synchronizeStoryProfile = (profile, storyFingerprint, userAddedConcepts = []) => {
  const concepts = normalizeStoryFingerprint(storyFingerprint, MAX_PROFILE_VALUES);
  const byType = (type) => concepts.filter((item) => item.type === type).map(({ label }) => label);
  return createStoryProfile({
    storyFingerprint,
    profile: {
      primaryPeople: byType('person').slice(0, 1),
      otherPeople: byType('person').slice(1),
      locations: byType('location'),
      organizations: byType('organization'),
      eventTypes: byType('event'),
      works: profile?.works,
      productsServices: profile?.productsServices,
      events: profile?.events,
      relationships: profile?.relationships,
      phenomena: profile?.phenomena,
      conditions: profile?.conditions,
      symptoms: profile?.symptoms,
      distinctiveFacts: profile?.distinctiveFacts,
      aliases: profile?.aliases,
      peopleRoles: profile?.peopleRoles,
      uncertaintyPhrases: profile?.uncertaintyPhrases,
      storySummary: profile?.storySummary,
      userAddedConcepts,
    },
    sourcePublication: profile?.sourceArticle?.publication,
    sourceTitle: profile?.sourceArticle?.title,
    sourceUrl: profile?.sourceArticle?.url,
    publishedAt: profile?.sourceArticle?.publishedAt,
    extractedAt: profile?.extractedAt,
  });
};
