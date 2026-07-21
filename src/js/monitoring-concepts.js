const STOP_WORDS = new Set([
  'a', 'about', 'after', 'again', 'alert', 'also', 'an', 'and', 'anything', 'are',
  'at', 'available', 'be', 'become', 'becomes', 'below', 'by', 'can', 'change',
  'changes', 'could', 'drop', 'drops', 'fall', 'falls', 'find', 'for', 'from',
  'get', 'gets', 'go', 'goes', 'have', 'in', 'into', 'is', 'it', 'its', 'keep',
  'know', 'latest', 'less', 'let', 'look', 'looking', 'me', 'meaningful', 'monitor',
  'monitoring', 'need', 'new', 'notify', 'of', 'on', 'open', 'opened', 'opens',
  'or', 'please', 'reach', 'reaches', 'show', 'something', 'tell', 'than', 'that',
  'the', 'this', 'to', 'under', 'update', 'updated', 'us', 'want', 'watch', 'when',
  'will', 'with', 'would', 'your',
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

const PHRASE_CONNECTORS = new Set(['de', 'of']);

export const MONITORING_CONCEPTS_VERSION = 1;

const normalizeWord = (value) => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/^['’.-]+|['’.-]+$/g, '');

const formatConcept = (tokens) => {
  const label = tokens
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
  if (!label) return '';
  return `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`;
};

export const extractMonitoringConcepts = (value, limit = 4) => {
  const source = String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return [];

  const tokenPattern = /[€$£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|\$|£)?|[\p{L}][\p{L}\p{N}]*/gu;
  const matches = [...source.matchAll(tokenPattern)];
  const concepts = [];
  let phrase = [];
  let previousEnd = 0;

  const addPhrase = () => {
    const concept = formatConcept(phrase);
    phrase = [];
    if (!concept) return;
    const normalized = normalizeWord(concept);
    if (!normalized || concepts.some((item) => normalizeWord(item) === normalized)) return;
    concepts.push(concept);
  };

  matches.forEach((match) => {
    const token = match[0].trim();
    const normalized = normalizeWord(token);
    const gap = source.slice(previousEnd, match.index);
    const startsNewPhrase = /[,;:!?()[\]{}|/\\]/.test(gap);
    const continuesProperName = phrase.length > 0
      && /^\p{Lu}/u.test(token)
      && phrase.every((part) => /^\p{Lu}/u.test(part));
    const continuesPhrase = phrase.length > 0 && PHRASE_CONNECTORS.has(normalized);
    const isStopWord = STOP_WORDS.has(normalized) && !continuesProperName && !continuesPhrase;
    if (startsNewPhrase || isStopWord) addPhrase();

    if (!isStopWord) {
      phrase.push(token);
      if (phrase.length === 5) addPhrase();
    }
    previousEnd = match.index + match[0].length;
  });
  addPhrase();

  return concepts.slice(0, limit);
};
