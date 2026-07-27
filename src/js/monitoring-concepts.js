const STOP_WORDS = new Set([
  'a', 'about', 'after', 'again', 'alert', 'also', 'an', 'and', 'anything', 'are',
  'at', 'available', 'be', 'become', 'becomes', 'below', 'by', 'can', 'change',
  'changes', 'could', 'drop', 'drops', 'fall', 'falls', 'find', 'for', 'from',
  'experience', 'get', 'gets', 'go', 'goes', 'has', 'have', 'he', 'her', 'hers',
  'him', 'his', 'hunt', 'i', 'in', 'into', 'is', 'it', 'its', 'keep',
  'know', 'latest', 'less', 'let', 'look', 'looking', 'me', 'meaningful', 'monitor',
  'monitoring', 'need', 'new', 'notify', 'of', 'on', 'open', 'opened', 'opens',
  'or', 'our', 'ours', 'please', 'reach', 'reaches', 'reporting', 'she', 'show',
  'something', 'story', 'tell', 'than', 'that', 'their', 'theirs', 'them', 'they',
  'the', 'this', 'to', 'under', 'update', 'updated', 'us', 'want', 'watch', 'when',
  'we', 'will', 'with', 'would', 'you', 'your', 'yours',
  'a', 'au', 'aux', 'avec', 'avertir', 'avertis', 'avertissez', 'baisse',
  'baissent', 'ce', 'ces', 'cette', 'change', 'changent', 'chercher', 'd', 'dans',
  'de', 'des', 'dites', 'du', 'en', 'est', 'et', 'etre', 'faites', 'il', 'je',
  'changements', 'courant', 'important', 'importants', 'l', 'la', 'le', 'les',
  'lorsque', 'ma', 'me', 'mes', 'moi', 'moins', 'mon',
  'nouveau', 'nouveaux', 'nouvelle', 'nouvelles', 'nous', 'ouvre', 'ouvrent',
  'ou', 'passe', 'passent', 'peut', 'pour', 'prevenez', 'previens', 'quand',
  'que', 'qui', 'rechercher', 'sera', 'sont', 'sous', 'sur', 'surveille',
  'surveiller', 'tenir', 'tenez', 'trouve', 'trouver', 'tu', 'un', 'une', 'votre',
  'vous',
]);

const PHRASE_CONNECTORS = new Set(['and', 'de', 'et', 'of']);

export const MONITORING_CONCEPTS_VERSION = 6;

export const DEFAULT_AUTOMATIC_IDENTIFIER_LIMIT = 5;

export const STORY_CONCEPT_TYPES = Object.freeze([
  'person',
  'organization',
  'work',
  'product_service',
  'location',
  'event',
  'condition',
  'symptom',
  'phenomenon',
  'relationship',
  'manual',
]);

export const AUTOMATIC_STORY_CONCEPT_TYPES = Object.freeze(
  STORY_CONCEPT_TYPES.filter((type) => type !== 'manual'),
);

const STORY_CONCEPT_PRIORITY = new Map(
  STORY_CONCEPT_TYPES.map((type, index) => [type, index]),
);

const normalizeWord = (value) => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/^['’.-]+|['’.-]+$/g, '');

export const isUsefulStoryConcept = (label, type = 'contextual') => {
  const value = String(label || '').replace(/\s+/g, ' ').trim();
  if (!value) return false;
  if (/^(?:official|officials|source|sources|spokes(?:person|man|woman))\s+(?:says?|said|claims?|claimed)$/i.test(value)) {
    return false;
  }
  if (/^[\p{Lu}][\p{L}'’-]+\s+(?:citizen|national|resident|official)$/u.test(value)) {
    return false;
  }
  if (/\b(?:likely|possibly|probably|allegedly|reportedly|suspected|possible)$/i.test(value)) {
    return false;
  }
  if (/\b(?:carried out|took place|has happened|occurred|officials? (?:say|said))$/i.test(value)) {
    return false;
  }
  if (type === 'person' && /\b(?:agency|department|images|media|network|news|office|press|studios?)$/i.test(value)) {
    return false;
  }
  if (type === 'event' && value.split(/\s+/).length < 2) return false;
  return true;
};

const formatConcept = (tokens) => {
  const label = tokens
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
  if (!label) return '';
  return `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`;
};

const getConceptTokens = (value) => (
  String(value || '').match(/[€$£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|\$|£)?|[\p{L}][\p{L}\p{N}'’.-]*/gu) || []
);

const cleanConcepts = (value) => {
  const tokens = getConceptTokens(value);
  const concepts = [];
  let phrase = [];
  const addPhrase = () => {
    const concept = formatConcept(phrase);
    phrase = [];
    if (concept) concepts.push(concept);
  };

  tokens.forEach((token, index) => {
    const possessiveMatch = token.match(/^(.+?)[’']s$/iu);
    if (possessiveMatch) {
      addPhrase();
      concepts.push(formatConcept([possessiveMatch[1]]));
      return;
    }

    const normalized = normalizeWord(token);
    if (!STOP_WORDS.has(normalized)) {
      phrase.push(token);
      return;
    }

    const hasFollowingContent = tokens
      .slice(index + 1)
      .some((candidate) => !STOP_WORDS.has(normalizeWord(candidate)));
    if (PHRASE_CONNECTORS.has(normalized) && phrase.length && hasFollowingContent) {
      phrase.push(token);
      return;
    }
    addPhrase();
  });
  addPhrase();
  return concepts.filter(Boolean);
};

export const normalizeMonitoringConcepts = (values, limit = 8) => {
  const uniqueConcepts = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    cleanConcepts(value).forEach((concept) => {
      const normalized = normalizeWord(concept);
      if (!normalized || uniqueConcepts.some((item) => normalizeWord(item) === normalized)) return;
      uniqueConcepts.push(concept);
    });
  });

  return uniqueConcepts
    .filter((concept, index, concepts) => {
      const tokens = getConceptTokens(concept).map(normalizeWord);
      return !concepts.some((candidate, candidateIndex) => {
        if (candidateIndex === index) return false;
        const candidateTokens = getConceptTokens(candidate).map(normalizeWord);
        return candidateTokens.length > tokens.length
          && tokens.every((token) => candidateTokens.includes(token));
      });
    })
    .slice(0, limit);
};

export const normalizeStoryFingerprint = (values, limit = 8) => {
  const candidates = (Array.isArray(values) ? values : [])
    .map((value, index) => ({
      label: typeof value === 'string' ? value : value?.label,
      type: typeof value === 'string'
        ? 'manual'
        : STORY_CONCEPT_PRIORITY.has(value?.type) ? value.type : null,
      index,
    }))
    .filter((candidate) => candidate.type && isUsefulStoryConcept(candidate.label, candidate.type))
    .flatMap((candidate) => {
      const preservesSemanticPhrase = [
        'location', 'event', 'condition', 'symptom', 'phenomenon', 'relationship', 'manual',
      ].includes(candidate.type);
      const preservedPhrase = preservesSemanticPhrase
        ? String(candidate.label || '').replace(/\s+/g, ' ').replace(/[.;:!?]+$/g, '').trim()
        : '';
      const labels = preservesSemanticPhrase
        ? [preservedPhrase].filter(Boolean)
        : ['person', 'organization', 'work', 'product_service'].includes(candidate.type)
          ? [formatConcept(getConceptTokens(candidate.label))].filter(Boolean)
          : normalizeMonitoringConcepts([candidate.label], limit);
      return labels.map((label) => ({ ...candidate, label }));
    })
    .sort((first, second) => (
      STORY_CONCEPT_PRIORITY.get(first.type) - STORY_CONCEPT_PRIORITY.get(second.type)
      || first.index - second.index
    ));
  const uniqueCandidates = candidates.filter((candidate, index) => (
    candidates.findIndex((item) => normalizeWord(item.label) === normalizeWord(candidate.label))
      === index
  ));
  return uniqueCandidates
    .filter((concept, index, concepts) => {
      const tokens = getConceptTokens(concept.label).map(normalizeWord);
      return !concepts.some((candidate, candidateIndex) => {
        if (candidateIndex === index) return false;
        const candidateTokens = getConceptTokens(candidate.label).map(normalizeWord);
        return candidateTokens.length > tokens.length
          && tokens.every((token) => candidateTokens.includes(token));
      });
    })
    .slice(0, limit)
    .map(({ label, type }) => ({ label, type }));
};

const isConciseMonitoringIdentifier = (value) => {
  const label = String(typeof value === 'string' ? value : value?.label || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label || label.length > 100) return false;
  const wordCount = getConceptTokens(label).length;
  const type = typeof value === 'string' ? null : value?.type;
  if (!AUTOMATIC_STORY_CONCEPT_TYPES.includes(type)) return false;
  const maximumWords = type === 'relationship' ? 12 : ['event', 'phenomenon'].includes(type) ? 10 : 8;
  if (wordCount === 0 || wordCount > maximumWords) return false;
  const sentenceBoundaries = label.match(/[.!?](?:\s|$)/g)?.length || 0;
  if (sentenceBoundaries > 1) return false;
  return !(wordCount > 4 && /[.!?]$/.test(label));
};

export const normalizeAutomaticStoryFingerprint = (
  values,
  limit = DEFAULT_AUTOMATIC_IDENTIFIER_LIMIT,
) => normalizeStoryFingerprint(
  (Array.isArray(values) ? values : [])
    .filter(isConciseMonitoringIdentifier),
  Number.MAX_SAFE_INTEGER,
).slice(0, limit);

export const extractMonitoringConcepts = (value, limit = 4) => {
  const source = String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return [];

  const tokenPattern = /[€$£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|\$|£)?|[\p{L}][\p{L}\p{N}'’.-]*/gu;
  const matches = [...source.matchAll(tokenPattern)];
  const concepts = [];
  let phrase = [];
  let previousEnd = 0;

  const addPhrase = () => {
    const concept = formatConcept(phrase);
    phrase = [];
    if (!concept) return;
    const normalized = normalizeWord(concept);
    if (concept) concepts.push(concept);
  };

  matches.forEach((match) => {
    const token = match[0].trim();
    const possessiveMatch = token.match(/^(.+?)[’']s$/iu);
    const normalized = normalizeWord(possessiveMatch?.[1] || token);
    const gap = source.slice(previousEnd, match.index);
    const startsNewPhrase = /[,;:!?()[\]{}|/\\]/.test(gap);
    if (possessiveMatch) {
      addPhrase();
      phrase.push(possessiveMatch[1]);
      addPhrase();
      previousEnd = match.index + match[0].length;
      return;
    }
    const continuesPhrase = phrase.length > 0 && PHRASE_CONNECTORS.has(normalized);
    const isStopWord = STOP_WORDS.has(normalized) && !continuesPhrase;
    if (startsNewPhrase || isStopWord) addPhrase();

    if (!isStopWord) {
      phrase.push(token);
      if (phrase.length === 5) addPhrase();
    }
    previousEnd = match.index + match[0].length;
  });
  addPhrase();

  return normalizeMonitoringConcepts(concepts, limit);
};
