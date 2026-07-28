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

export const MONITORING_CONCEPTS_VERSION = 7;

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
      aliases: typeof value === 'string' || !Array.isArray(value?.aliases)
        ? []
        : value.aliases.map(normalizeWord).filter(Boolean),
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
  const uniqueCandidates = candidates.filter((candidate, index) => {
    const label = normalizeWord(candidate.label);
    return candidates.findIndex((item) => (
      item.type === candidate.type && normalizeWord(item.label) === label
    )) === index;
  });
  const aliasConsolidatedCandidates = uniqueCandidates.filter((candidate, index, concepts) => {
    const label = normalizeWord(candidate.label);
    return !concepts.some((other, otherIndex) => (
      otherIndex !== index
      && other.type === candidate.type
      && other.aliases.includes(label)
      && !candidate.aliases.includes(normalizeWord(other.label))
    ));
  });
  return aliasConsolidatedCandidates
    .slice(0, limit)
    .map(({ label, type }) => ({ label, type }));
};

const isConciseMonitoringIdentifier = (value) => {
  const label = String(typeof value === 'string' ? value : value?.label || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label) return false;
  const type = typeof value === 'string' ? null : value?.type;
  if (!AUTOMATIC_STORY_CONCEPT_TYPES.includes(type)) return false;
  if (
    /^(?:advice|conseils?|recommendations?|recommandations?|tips?|astuces?|how to|comment (?:faire|améliorer|réduire)|ways? to|moyens? de|remember to|pensez à|try |essayez |take |prenez |use |utilisez )\b/i.test(label)
    || /\b(?:strateg(?:y|ies)|stratégies?|routines?|habitudes?)\s+(?:for|to|pour|afin de)\b/i.test(label)
  ) return false;
  if (/^(?:becoming one|devenir (?:un|une))$/i.test(label)) return false;
  if (/^(?:it|this|that|they|one|il|elle|cela|ceci|ça)\b/i.test(label)) return false;
  if (/\b(?:remains? uncertain|is unclear|may vary|reste incertain|demeure incertain|n['’]est pas clair|peut varier)\b/i.test(label)) {
    return false;
  }
  const sentenceBoundaries = label.match(/[.!?](?:\s|$)/g)?.length || 0;
  if (sentenceBoundaries > 1) return false;
  return !(/[.!?]$/.test(label) && /\b(?:because|which|who|while|although|because|car|qui|dont|alors que|bien que)\b/i.test(label));
};

const getTypedConceptSignature = ({ label, type }) => `${type}\u0000${getConceptTokens(label)
  .map(normalizeWord)
  .filter(Boolean)
  .sort()
  .join('\u0000')}`;

export const normalizeAutomaticStoryFingerprint = (
  values,
  limit = DEFAULT_AUTOMATIC_IDENTIFIER_LIMIT,
) => {
  const eligibleValues = (Array.isArray(values) ? values : [])
    .filter(isConciseMonitoringIdentifier);
  const normalized = normalizeStoryFingerprint(eligibleValues, Number.MAX_SAFE_INTEGER);
  const sourceRank = (concept) => eligibleValues.findIndex((candidate) => (
    candidate?.type === concept.type
    && normalizeWord(candidate?.label) === normalizeWord(concept.label)
  ));
  const seenSignatures = new Set();
  return normalized
    .sort((first, second) => sourceRank(first) - sourceRank(second))
    .filter((concept) => {
      const signature = getTypedConceptSignature(concept);
      if (seenSignatures.has(signature)) return false;
      seenSignatures.add(signature);
      return true;
    })
    .slice(0, limit);
};

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
